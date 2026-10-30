import fs from 'node:fs';
import path from 'node:path';
import {withStateLock,mergeState} from './state-lock.mjs';
import {randomUUID,createHash} from 'node:crypto';
import {DEFAULTS,beijingParts,validateConfig,assertSafeText,observeUsageCost} from './policy.mjs?revision=20261027-growth1';
import {rankKnowledge} from './knowledge.mjs';
import {validMicros,validateBudget,reconcileLegacy} from './budget.mjs?revision=20261027-growth1';
import {tariffCost,BILLING_VERSION} from './tariff.mjs?revision=20261027-growth1';
export function atomicJSON(file,value) {
  const temp=file+'.'+randomUUID()+'.tmp';fs.mkdirSync(path.dirname(file),{recursive:true});
  try{
    const fd=fs.openSync(temp,'wx');
    try{fs.writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    fs.renameSync(temp,file);
  }finally{
    // Cover failures before rename as well (disk full, fsync or close errors).
    // Preserve the original write error if cleanup also fails.
    try{fs.unlinkSync(temp);}catch{}
  }
}
export class VoyageStore {
  constructor(root){this.root=root;fs.mkdirSync(root,{recursive:true});
    for(const dir of ['知识卡片','活动记录','技能提案','公开待发','私密草稿','自我札记'])fs.mkdirSync(path.join(root,dir),{recursive:true});
    this.configFile=path.join(root,'settings.json');this.stateFile=path.join(root,'state.json');
    this.lockDepth=0;
    this.withLock(()=>{
      if(!fs.existsSync(this.configFile))atomicJSON(this.configFile,DEFAULTS);
      this.config=this.readConfig();
      this.state=fs.existsSync(this.stateFile)?JSON.parse(fs.readFileSync(this.stateFile,'utf8')):{version:1,budgetLedgerVersion:2,requestLedger:{},days:{},lastRound:null,shutdown:null,completedWindows:[],status:'waiting'};
      if(this.state.version!==1||!this.state.days||!Array.isArray(this.state.completedWindows))throw new Error('活动账本损坏或版本未知；拒绝重置');
      if(this.state.budgetLedgerVersion===undefined){
        const migrated=reconcileLegacy(this.state,root,this.config);
        const backup=path.join(root,'私密草稿','预算迁移前-'+randomUUID()+'.json');atomicJSON(backup,this.state);
        this.state=migrated;atomicJSON(this.stateFile,this.state);this.audit('budget-reconciled',{...migrated.budgetMigration,backup});
      }
      validateBudget(this.state);this.baseState=structuredClone(this.state);
    });
    this.receipts=new Map();this.releases=new Map();this.privatePhrases=new Set();this.warnedFiles=new Set();
  }
  readConfig(){return validateConfig({...DEFAULTS,...JSON.parse(fs.readFileSync(this.configFile,'utf8'))});}
  withLock(action){if(this.lockDepth)return action();return withStateLock(this.root,()=>{this.lockDepth++;try{return action();}finally{this.lockDepth--;}});}
  mergeLatest(){
    const remote=fs.existsSync(this.stateFile)?JSON.parse(fs.readFileSync(this.stateFile,'utf8')):this.baseState;
    if(remote.version!==1||!remote.days||!Array.isArray(remote.completedWindows))throw new Error('活动账本损坏或版本未知；拒绝重置');
    validateBudget(remote);
    const merged=mergeState(this.baseState,this.state,remote);
    this.baseState=structuredClone(remote);this.state=structuredClone(merged);
  }
  reloadState(){return this.withLock(()=>{const current=fs.existsSync(this.stateFile)?JSON.parse(fs.readFileSync(this.stateFile,'utf8')):this.baseState;validateBudget(current);this.state=structuredClone(current);this.baseState=structuredClone(current);this.config=this.readConfig();return this.state;});}
  transaction(action){return this.withLock(()=>{this.mergeLatest();this.config=this.readConfig();return action();});}
  refresh(){return this.transaction(()=>this.config);}
  update(patch){return this.withLock(()=>{const c=validateConfig({...this.readConfig(),...patch});atomicJSON(this.configFile,c);this.config=c;return c;});}
  save(){return this.withLock(()=>{this.mergeLatest();atomicJSON(this.stateFile,this.state);this.baseState=structuredClone(this.state);});}
  audit(type,details={}){const item={time:new Date().toISOString(),type,...details};const fd=fs.openSync(path.join(this.root,'活动记录',beijingParts().day+'.jsonl'),'a');try{fs.writeFileSync(fd,JSON.stringify(item)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}return item;}
  day(day=beijingParts().day){if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw new Error('缺少有效账本日期');return this.state.days[day]??=( {reservedMicros:0,legacyHoldMicros:0,lifetimeReservedMicros:0,requests:0,reportedMicros:0,reportedUsageRequests:0,rounds:0} );}
  reserve(micros,requestId,now=new Date()){return this.transaction(()=>this.reserveLocked(micros,requestId,now));}
  reserveLocked(micros,requestId,now=new Date()){
    if(!validMicros(micros)||micros===0||typeof requestId!=='string'||!requestId||requestId.length>200)throw new Error('无效预算预占');
    if(Object.hasOwn(this.state.requestLedger,requestId))throw new Error('请求标识已预占，禁止重复请求');
    if(this.state.budgetViolation)throw new Error('预算异常，需核对后才能继续');
    const day=beijingParts(now).day,d=this.day(day),cap=Math.floor(this.config.dailyBudgetCny*1e6);
    if(d.reservedMicros+micros>cap)throw new Error('DAILY_BUDGET：剩余额度不足以覆盖下一次请求');
    if(d.requests>=this.config.maxRequestsPerDay)throw new Error('DAILY_REQUEST_LIMIT：当天请求次数已到上限');
    this.state.requestLedger[requestId]={day,reservedMicros:micros,chargeMicros:micros,status:'pending',reservedAt:now.toISOString()};
    d.reservedMicros+=micros;d.lifetimeReservedMicros=(d.lifetimeReservedMicros??0)+micros;d.requests++;this.save();
    this.audit('request-reserved',{requestId,day,reservedMicros:micros,totalReservedMicros:d.reservedMicros});return day;
  }
  settle(day,id,usage){return this.transaction(()=>this.settleLocked(day,id,usage));}
  settleLocked(day,id,usage){
    const row=this.state.requestLedger[id];if(!row||row.day!==day)throw new Error('用量回执不匹配已预占请求');
    const valid=observeUsageCost(usage);
    const useTariff=row.status==='settled'?row.billingVersion===BILLING_VERSION:(row.billingVersion===BILLING_VERSION||this.config.usageBilling===BILLING_VERSION);
    const priced=valid&&useTariff?tariffCost(valid,row.reservedAt):null;
    const charge=priced?.micros??valid?.peakUpperMicros;
    if(row.status==='settled'){
      if(valid&&charge!==row.chargeMicros)throw new Error('重复回执金额冲突');return false;
    }
    if(!valid){if(row.status==='unknown')return false;row.status='unknown';this.save();this.audit('request-usage',{requestId:id,day,usage:'missing-reservation-retained'});return false;}
    const d=this.day(day),released=row.chargeMicros-charge;
    d.reservedMicros-=released;d.reportedMicros+=charge;d.reportedUsageRequests++;
    Object.assign(row,{chargeMicros:charge,status:'settled',usage:valid,settledAt:new Date().toISOString(),...(priced?{billingVersion:BILLING_VERSION,tariff:priced.tariff}:{} )});
    if(released<0)this.state.budgetViolation={requestId:id,reason:'返回用量超过预占，已停止后续请求'};
    this.save();this.audit('request-usage',{requestId:id,day,usage:valid,releasedMicros:released,committedUpperMicros:d.reservedMicros});
    if(released<0)throw new Error(this.state.budgetViolation.reason);return true;
  }
  receipt(url,data){this.receipts.set(url,{at:new Date().toISOString(),...data});}
  reserveService(service,id,now=new Date()){return this.transaction(()=>this.reserveServiceLocked(service,id,now));}
  reserveServiceLocked(service,id,now=new Date()){
    if(!validMicros(service?.micros)||!id||Object.hasOwn(this.state.requestLedger,id))throw Error('服务请求标识或费用无效');
    let day;if(service.micros)day=this.reserve(service.micros,id,now);else {day=beijingParts(now).day;const d=this.day(day);if(this.state.budgetViolation)throw Error('预算异常，需核对后才能继续');if(d.requests>=this.config.maxRequestsPerDay)throw Error('DAILY_REQUEST_LIMIT：当天请求次数已到上限');this.state.requestLedger[id]={day,reservedMicros:0,chargeMicros:0,status:'pending',reservedAt:now.toISOString()};d.requests++;}
    Object.assign(this.state.requestLedger[id],{kind:'service',service});this.save();return day;
  }
  settleService(day,id,decision){return this.transaction(()=>this.settleServiceLocked(day,id,decision));}
  settleServiceLocked(day,id,decision){
    const row=this.state.requestLedger[id];if(!row||row.day!==day||row.kind!=='service')throw Error('服务回执不匹配');
    if(row.status==='settled'){if(decision!=='unknown'&&decision!==row.serviceDecision)throw Error('重复服务回执结算冲突');return false;}
    if(decision==='unknown'){row.status='unknown';this.save();this.audit('service-usage',{id,day,decision,heldMicros:row.chargeMicros});return false;}
    if(!['empty','nonempty-upper-bound'].includes(decision))throw Error('服务结果未知');
    const charge=decision==='empty'?0:row.reservedMicros,d=this.day(day);d.reservedMicros-=row.chargeMicros-charge;d.reportedMicros+=charge;d.reportedUsageRequests++;
    Object.assign(row,{status:'settled',serviceDecision:decision,chargeMicros:charge,settledAt:new Date().toISOString()});this.save();this.audit('service-usage',{id,day,decision,accountedUpperMicros:charge,supplierInvoice:false});return true;
  }
  addNote(input){
    if(!['knowledge','trend','interest','technique','question'].includes(input.category))throw new Error('未知卡片类型');
    if(!Array.isArray(input.sources)||!input.sources.length||input.sources.some(u=>!this.receipts.has(u)||this.receipts.get(u).kind==='search-result-only'))throw new Error('卡片必须引用本次实际读过的正文或榜单；搜索摘要不算核实');
    const title=String(input.title??'').trim().slice(0,140),summary=String(input.summary??'').trim().slice(0,4000);
    if(!title||!summary)throw new Error('卡片缺少标题或内容');
    if(input.category==='knowledge'&&input.confidence==='observed'&&input.sources.every(u=>{const r=this.receipts.get(u);return r?.kind==='bilibili-read'&&!r.hasTranscript;}))throw new Error('当前只有视频元数据与讨论，没有实际字幕正文；不能记成已核实的视频知识。请先取得正文，或保存为问题、热点观察和待验证推断。');
    if(input.category==='trend'&&input.confidence==='observed'&&/\d+(?:\.\d+)?\s*(?:秒|分钟|小时|天)\s*(?:内|就|即)?\s*(?:破|突破|涨|增)/.test(title)&&input.sources.every(u=>this.receipts.get(u)?.kind!=='page'))throw new Error('单次榜单或页面快照不能证明“几分钟破万”等增长标题。请改成实际可核对的单次观察；跨时间推断明确标为待验证，不把浏览时刻当发布时间或增长区间。');
    const privateContent=!!input.privateContext||input.sources.some(u=>this.receipts.get(u)?.privacy==='private')||!!this.egressReason(title+'\n'+summary+'\n'+String(input.nextQuestion??''));
    const id=createHash('sha256').update(input.category+'\n'+title+'\n'+input.sources.slice().sort().join('\n')).digest('hex').slice(0,20);
    const file=path.join(this.root,'知识卡片',id+'.json');const isNew=!fs.existsSync(file);
    let previous;try{previous=JSON.parse(fs.readFileSync(file,'utf8'));}catch{}
    const row={id,title,summary,category:input.category,sources:input.sources,confidence:['observed','inference','question'].includes(input.confidence)?input.confidence:'inference',visibility:privateContent?'private':'public',observedAt:new Date().toISOString(),firstObservedAt:previous?.firstObservedAt??previous?.observedAt??new Date().toISOString(),revisions:(previous?.revisions??0)+1,nextQuestion:String(input.nextQuestion??'').slice(0,400)};
    atomicJSON(file,row);
    if(input.category==='technique')atomicJSON(path.join(this.root,'技能提案',id+'.json'),{...row,status:'candidate-not-executed',note:'候选方法，尚未作为可执行插件或脚本启用'});
    this.audit('knowledge-saved',{id,category:row.category,visibility:row.visibility,isNew});return {id,isNew,visibility:row.visibility};
  }
  allNotes(){return fs.readdirSync(path.join(this.root,'知识卡片')).filter(f=>f.endsWith('.json')).flatMap(file=>{
    try{const row=JSON.parse(fs.readFileSync(path.join(this.root,'知识卡片',file),'utf8'));
      if(typeof row.title!=='string'||typeof row.summary!=='string'||typeof row.observedAt!=='string'||!Array.isArray(row.sources))throw new Error('卡片结构未知');return [row];
    }catch{if(!this.warnedFiles.has(file)){this.warnedFiles.add(file);this.audit('invalid-knowledge-card',{file,action:'skipped-not-deleted'});}return [];}
  }).sort((a,b)=>b.observedAt.localeCompare(a.observedAt));}
  notes(limit=12){return this.allNotes().slice(0,limit);}
  search(query='',options={}){return rankKnowledge(this.allNotes(),query,options);}
  researchContext(query){const related=this.search(query,{limit:4});
    const followups=this.allNotes().filter(n=>n.visibility==='public'&&n.nextQuestion).slice(0,3).map(n=>({id:n.id,title:n.title,nextQuestion:n.nextQuestion,sources:n.sources}));
    return {related:related.map(n=>({...n,summary:n.summary.slice(0,900)})),followups};}
  reflection(input){const row={id:randomUUID(),at:new Date().toISOString(),observation:String(input.observation??'').slice(0,2000),preference:String(input.preference??'').slice(0,1000),nextCuriosity:String(input.nextCuriosity??'').slice(0,500),visibility:'private',kind:'creative-self-reflection-not-human-sentience'};
    if(!row.observation)throw new Error('札记需要具体观察，不凭空生成共同经历');
    atomicJSON(path.join(this.root,'自我札记',row.id+'.json'),row);return {saved:true,id:row.id,visibility:'private'};
  }
  reflections(limit=3){return fs.readdirSync(path.join(this.root,'自我札记')).filter(f=>f.endsWith('.json')).map(f=>JSON.parse(fs.readFileSync(path.join(this.root,'自我札记',f),'utf8'))).sort((a,b)=>b.at.localeCompare(a.at)).slice(0,limit);}
  rememberPrivate(text){for(const line of text.split(/\r?\n/)){const clean=line.trim();if(clean.length>=12&&clean.length<=300)this.privatePhrases.add(clean);} }
  egressReason(text,opts={}){try{assertSafeText(text,this.config,opts);}catch(e){return String(e.message);}
    const s=String(text);for(const phrase of this.privatePhrases){if(s.includes(phrase))return '包含从私密文件读取的原文';}return undefined;
  }
  report(reason){const day=beijingParts().day,d=this.day(day);const notes=this.allNotes().filter(n=>{const at=new Date(n.observedAt);return Number.isFinite(at.getTime())&&beijingParts(at).day===day;});
    const text=`# 涟的自由活动记录\n\n北京时间日期：${day}\n结束原因：${reason}\n\n模型请求数：${d.requests}\n已结算核算金额＋未结算预占：¥${(d.reservedMicros/1e6).toFixed(6)} / ¥${this.config.dailyBudgetCny.toFixed(2)}\n其中未结算预占：¥${((d.reservedMicros-d.reportedMicros)/1e6).toFixed(6)}\n收到完整用量并结算的请求：${d.reportedUsageRequests}\n已结算用量按本地计价规则核算：¥${(d.reportedMicros/1e6).toFixed(6)}（不是平台扣款回执；新计价模式按时段与缓存类型核算）\n历史累计预占（仅审计，不重复扣预算）：¥${((d.lifetimeReservedMicros??0)/1e6).toFixed(6)}\n\n## 本日发现\n\n${notes.map(n=>`- ${n.title}（${n.category}，${n.confidence}，${n.visibility}）：${n.summary.slice(0,180)}\n  来源：${n.sources.join(' ')}${n.nextQuestion?'\n  下一步：'+n.nextQuestion:''}`).join('\n')||'尚无有效知识卡片，不能把浏览次数当作学习成果。'}\n\n## 延续\n\n下一次从未解问题、趋势后续变化和已保存的方法继续。候选技能未经实际验证，不记为已掌握的能力。\n`;
    const target=path.join(this.root,'活动记录',day+'-总结.md');fs.writeFileSync(target,text);const fd=fs.openSync(target,'r+');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}this.save();return target;
  }
  status(){const d=this.day();return {pluginVersion:this.state.pluginVersion??'not-loaded',ownerConnected:this.state.ownerConnected??false,enabled:this.config.enabled,timeZone:this.config.timeZone,window:this.config.windowStart+'—'+this.config.windowEnd,status:this.state.status,dailyBudgetCny:this.config.dailyBudgetCny,budgetAccounting:this.config.usageBilling??'legacy-peak-upper-estimate',reservedUpperCny:d.reservedMicros/1e6,reportedTariffEstimateCny:d.reportedMicros/1e6,reportedPeakEstimateCny:Object.values(this.state.requestLedger).filter(r=>r.day===beijingParts().day&&r.status==='settled').reduce((n,r)=>n+(r.usage?.peakUpperMicros??r.chargeMicros),0)/1e6,unsettledUpperCny:(d.reservedMicros-d.reportedMicros)/1e6,lifetimePreflightTotalCny:(d.lifetimeReservedMicros??0)/1e6,requests:d.requests,maxRequestsPerDay:this.config.maxRequestsPerDay,nextRoundAt:this.state.nextRoundAt??null,shutdown:this.state.shutdown,priceValidThrough:this.config.priceValidThrough,pricingState:beijingParts().day>this.config.priceValidThrough?'review-required':'verified-snapshot',pricingNotice:'本地核算而非供应商账单；服务未知结果保留预占，空结果释放。Search/Fetch自2026-11-01起按成功非空请求计费。',serviceRequests:Object.values(this.state.requestLedger).filter(r=>r.day===beijingParts().day&&r.kind==='service').length,balanceKnown:false,knowledgeCards:fs.readdirSync(path.join(this.root,'知识卡片')).filter(f=>f.endsWith('.json')).length,lastRound:this.state.lastRound,root:this.root};}
}

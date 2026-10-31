import fs from 'node:fs';import path from 'node:path';import {createHash,randomInt} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
export function contextDecision(latest,policy={},lastCompactAt,now=Date.now()){
 const tokens=(latest?.input??0)+(latest?.hit??0),ratio=(latest?.hit??0)/Math.max(1,tokens),hours=lastCompactAt?(now-Date.parse(lastCompactAt))/36e5:Infinity;
 const watch=policy.watchTokens??120000,threshold=policy.considerTokens??200000;
 const eligible=tokens>=threshold&&hours>=(policy.minHours??24);
 const deferCache=eligible&&ratio>=.95&&tokens<600000;
 // Explicit assumptions, not an invoice or a prediction of all cache loss.
 const target=60000,currentCachedInputCny=tokens*.02/1e6,targetCachedInputCny=target*.02/1e6;
 return {tokens,cacheHitRatio:ratio,hoursSinceCompaction:Number.isFinite(hours)?hours:null,state:tokens<watch?'comfortable':!eligible?'watch':deferCache?'defer-cheap-cache':'consider',eligible:eligible&&!deferCache,
  forecast:{assumedPostInputTokens:target,possibleRemovedTokens:Math.max(0,tokens-target),summaryCallCost:'以实际请求保守预占和usage结算；未请求前无确定金额',nextRequestInputCnyIfAllMiss:target/1e6,nextRequestInputCnyIfAllHit:target*.02/1e6,steadyCachedInputSavingCnyPerRequest:Math.max(0,currentCachedInputCny-targetCachedInputCny),rates:'仅Flash空闲价情景；峰时约翻倍；输出另计，当前未实际压缩，不保证缓存全失效',targetIsNotGuaranteed:true},directModelCalls:0};
}
export function backgroundState(ctx,agent,inFlight=0){
 const reasons=[];if(agent.phase?.kind!=='idle')reasons.push('主会话仍在工作');
 if(!agent.inbox||typeof agent.inbox.hasPending!=='boolean')reasons.push('无法确认消息队列');else if(agent.inbox.hasPending)reasons.push('有排队消息');
 if(inFlight)reasons.push('有未结束工具调用');
 const get=n=>agent.ctx?.get(n)??ctx.get(n);const terminals=get('terminals'),jobs=get('jobs');
 if(!terminals?.hasOwnerActivity)reasons.push('无法核实终端活动');else if(terminals.hasOwnerActivity(agent))reasons.push('有终端会话或待启动终端');
 if(!jobs?.list)reasons.push('无法核实后台任务');else{
  const list=jobs.list(agent.id);if(!Array.isArray(list))reasons.push('后台任务列表结构未知');else if(list.some(j=>!['completed','failed','cancelled','canceled','killed','done','exited'].includes(j.status??j.state)))reasons.push('后台任务尚未确认结束');
 }
 return {safe:reasons.length===0,reasons};
}
export async function resolveBackground(ctx,agent,inFlight=0,{allowCurrentTool=false}={}){
 const state=backgroundState(ctx,agent,inFlight);if(allowCurrentTool)state.reasons=state.reasons.filter(r=>r!=='主会话仍在工作');
 // Some scoped registries do not expose internal activity helpers. Use their
 // public owner-scoped listing, require an explicit empty acknowledgement.
 for(const [reason,name,empty]of [['无法核实终端活动','terminal_list','(no terminal sessions)'],['无法核实后台任务','job_list','(no background jobs)']]){
  if(!state.reasons.includes(reason)||!ctx.tools.schemas().some(t=>t.name===name))continue;
  const r=await ctx.tools.execute({name,arguments:{},agent,callId:'context-idle-'+name+'-'+Date.now(),signal:AbortSignal.timeout(10000)});
  const text=(r.content??[]).filter(c=>c.type==='text').map(c=>c.text).join('\n').trim();
  if(!r.isError&&text===empty){state.reasons=state.reasons.filter(x=>x!==reason);state[name]={empty:true,checkedAt:new Date().toISOString()};}
 }
 state.safe=state.reasons.length===0;return state;
}
const readJson=p=>{try{return JSON.parse(fs.readFileSync(p,'utf8'))}catch{return null}};
const writeJson=(p,d)=>{const t=p+'.tmp';fs.writeFileSync(t,JSON.stringify(d,null,2));fs.renameSync(t,p)};
export class ContextLifecycle{
 constructor(ctx,config,store,memory){this.ctx=ctx;this.config=config;this.store=store;this.memory=memory;this.root=store.root;this.file=path.join(this.root,'context-lifecycle.json');this.state=readJson(this.file)??{};this.inFlight=0;this.busy=false;this.disposed=false;this.initialized=false;}
 async init(){const i=await this.ctx.sessionController.inspect(this.config.ownerSessionId);const es=i.events??[],last=es.findLast(e=>e.type==='compaction/end'&&!e.data?.error);if(last)this.state.lastCompactAt=new Date(last.time).toISOString();writeJson(this.file,this.state);this.initialized=true;}
 latest(){return this.store.db.prepare('SELECT * FROM usage WHERE session=? ORDER BY at DESC LIMIT 1').get(this.config.ownerSessionId)}
 rawHistoryPath(){return 'C:/Users/USER/.dsh/sessions/--E-~80A5~9C7C~4E4B~5BB6--/'+this.config.ownerSessionId+'/session.v4.jsonl.zstd'}
 status(){const policy=this.memory.lifecycleConfig().context??{},nativeOnly=policy.mode==='native-only'||policy.earlyCompactionEnabled===false;const d=contextDecision(this.latest(),policy,this.state.lastCompactAt);if(nativeOnly)return {tokens:d.tokens,cacheHitRatio:d.cacheHitRatio,latestRequestAt:this.latest()?.at??null,cacheRatioScope:'latest-single-request-not-a-long-term-average',state:'native-managed',mode:'native-only',eligible:false,earlyCompactionEnabled:false,scheduled:false,forecast:null,directModelCalls:0,lastNativeCompactionAt:this.state.lastCompactAt??null,nativeAutomaticBackendUnmodified:false,nativeSelectionUnmodified:true,compactionPolicy:this.memory.compactionPolicy??null,sameSessionId:this.config.ownerSessionId,notice:'何时与范围由Harness原生决定；已安装压前备份包装，压力救援不要求24小时内续接包。没有20万/24小时的自定义提前安排。'};return {...d,latestRequestAt:this.latest()?.at??null,cacheRatioScope:'latest-single-request-not-a-long-term-average',armed:this.state.armed??null,lastResult:this.state.lastResult??null,nativeAutomaticBackendUnmodified:false,nativeSelectionUnmodified:true,compactionPolicy:this.memory.compactionPolicy??null,sameSessionId:this.config.ownerSessionId};}
 arm(a,agent){
  if(this.memory.lifecycleConfig().context?.earlyCompactionEnabled===false||this.memory.lifecycleConfig().context?.mode==='native-only')throw Error('自定义提前压缩已停用，使用Harness原生压缩；checkpoint与本地记忆保留。');
  if(agent?.id!==this.config.ownerSessionId)throw Error('压缩安排仅由原主会话在任务节点选择。');
  const status=this.status();if(!status.eligible)throw Error('当前未满足整理条件，或缓存便宜/24小时冷却，继续原窗口即可。');
  if(!a.redundant||!a.taskBoundary)throw Error('需要本人确认存在重复材料且处于任务节点。');
  const cp=fs.realpathSync(a.checkpoint),dir=fs.realpathSync(path.join(this.root,'checkpoints'));
  if(path.dirname(cp)!==dir||path.extname(cp)!=='.json')throw Error('请使用本库实际续接包。');
  const pack=readJson(cp);if(pack?.session!==agent.id||!pack.summary||Date.now()-Date.parse(pack.at)>86400000)throw Error('续接包过旧或来源不匹配。');
  const rows=this.store.db.prepare("SELECT id,sha256,title FROM memory_documents WHERE kind IN ('memory-file','life-note','conversation')").all().filter(r=>!this.store.db.prepare('SELECT metadata FROM memory_documents WHERE id=?').get(r.id).metadata.includes('maintenance'));
  const samples=[];while(rows.length&&samples.length<2)samples.push(rows.splice(randomInt(rows.length),1)[0]);
  if(samples.length<2)throw Error('不足两条真实来源供续接验证');
  const seq=this.store.db.prepare("SELECT max(id) AS n FROM events WHERE session=? AND kind='user/message' AND origin IN ('user','qq','qq-bridge')").get(agent.id)?.n??0;
  this.state.armed={at:new Date().toISOString(),checkpoint:cp,checkpointSha256:sha(fs.readFileSync(cp)),userEventId:seq,samples,forecast:status.forecast,attempts:0};writeJson(this.file,this.state);return {armed:true,...status.forecast,notice:'只登记，等00:00—05:00且完整空闲后用原生/compact；确认不了后台状态就推迟。'};
 }
 async tick(now=new Date()){
  if(this.memory.lifecycleConfig().context?.earlyCompactionEnabled===false||this.memory.lifecycleConfig().context?.mode==='native-only'||this.disposed||this.busy||!this.initialized||!this.state.armed)return;
  const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',hourCycle:'h23'}).format(now));if(hour>=5)return;
  this.busy=true;try{
   const found=await this.ctx.sessionController.resolveAgent(this.config.ownerSessionId);if(found.error)throw found.error;const agent=found.agent;
   const safe=await resolveBackground(this.ctx,agent,this.inFlight);if(!safe.safe){this.state.deferred=safe;writeJson(this.file,this.state);return;}
   const activity=await this.ctx.waterfall('workspace/session-activity',{sessionId:agent.id},()=>Promise.resolve([]));if(!Array.isArray(activity)||activity.length){this.state.deferred={safe:false,reasons:['原生任务/终端/子会话仍有活动或状态不明']};writeJson(this.file,this.state);return;}
   const seq=this.store.db.prepare("SELECT max(id) AS n FROM events WHERE session=? AND kind='user/message' AND origin IN ('user','qq','qq-bridge')").get(agent.id)?.n??0;
   if(seq!==this.state.armed.userEventId){this.state.lastResult={status:'deferred-new-user-message',at:new Date().toISOString()};delete this.state.armed;writeJson(this.file,this.state);return;}
   if(!this.status().eligible)return;
   const a=this.state.armed;if(a.attempts>=2)return;
   if(a.lastAttemptAt&&Date.now()-Date.parse(a.lastAttemptAt)<3600000)return;
   if(sha(fs.readFileSync(a.checkpoint))!==a.checkpointSha256)throw Error('续接包已改变，需要重新选择');
   await this.memory.flushAll();await this.memory.vault.queue;await this.ctx.sessions.flush(agent.session);this.store.backup();
   const bytes=fs.readFileSync(this.rawHistoryPath()),backupDir=path.join(this.root,'raw-history');fs.mkdirSync(backupDir,{recursive:true});a.rawBackup=path.join(backupDir,sha(bytes)+'.jsonl.zstd');if(!fs.existsSync(a.rawBackup))fs.writeFileSync(a.rawBackup,bytes,{flag:'wx'});
   a.attempts++;a.lastAttemptAt=new Date().toISOString();writeJson(this.file,this.state);
   const commands=agent.ctx.get('commands')??this.ctx.get('commands');if(!commands?.find(agent,'compact'))throw Error('原生compact接口不可用，不另造摘要器');
   const result=await commands.execute(agent,'/compact',[],AbortSignal.timeout(240000));await this.ctx.sessions.flush(agent.session);
   const sourceEventSeq=result?.result?.sourceEventSeq,pass=result?.result?.kind==='success'&&Number.isSafeInteger(sourceEventSeq);const verification=[];
   if(result?.result?.kind==='success'&&!pass){this.state.lastResult={at:new Date().toISOString(),status:'not-compacted',result,reason:'原生命令没有产生摘要事件，不记为已压缩'};delete this.state.armed;writeJson(this.file,this.state);return;}
   if(pass){const inspected=await this.ctx.sessionController.inspect(agent.id);if(!(inspected.events??[]).some(e=>e.seq===sourceEventSeq&&e.type==='compaction/summary'))throw Error('没有找到原生摘要事件，不冒称已完成');}

   if(pass){await this.memory.refresh();for(const sample of a.samples){const doc=await this.memory.open({id:sample.id,chars:300});const search=await this.memory.search(doc.title+' '+doc.text.slice(0,40),30,'history');verification.push({id:sample.id,sourceRetained:doc.sha256===sample.sha256,searchFound:search.results.some(r=>r.id===sample.id),notice:'本地来源/检索验证，不代替模型理解或真人评价'});}}
   this.state.lastResult={at:new Date().toISOString(),status:pass?(verification.every(v=>v.sourceRetained&&v.searchFound)?'completed':'completed-with-recall-failure'):'failed',recallVerified:pass&&verification.length===2&&verification.every(v=>v.sourceRetained&&v.searchFound),result,sourceEventSeq,verification,checkpoint:a.checkpoint,forecast:a.forecast,actualNextRequestPending:pass};
   if(pass){this.state.lastCompactAt=new Date().toISOString();delete this.state.armed;}
   writeJson(this.file,this.state);
  }catch(e){this.state.lastResult={status:'failed',at:new Date().toISOString(),error:e.message};if(this.state.armed){this.state.armed.attempts=Math.max(2,this.state.armed.attempts);this.state.armed.stoppedAfterError=true;}writeJson(this.file,this.state)}finally{this.busy=false}
 }
 stop(){this.disposed=true;clearInterval(this.timer)}
}

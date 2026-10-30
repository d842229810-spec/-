import fs from 'node:fs';import path from 'node:path';import {createHash,randomUUID} from 'node:crypto';import {pathToFileURL} from 'node:url';
const sha=b=>createHash('sha256').update(b).digest('hex');
export function registerAutonomousCompaction(ctx,config,tool,store,memory,ready,testDeps={}){
 const sessions=ctx.sessions,controller=ctx.sessionController,SLOT=Symbol.for('lian.autonomous-compaction-owner');let disposed=false;
 const home=config.home??'E:/LianHome',owner=config.ownerSessionId,root=path.join(home,'记忆/连续性档案/自主压缩');fs.mkdirSync(root,{recursive:true});
 const sdk=path.join(path.dirname(process.execPath),'resources/app.asar/dsh/node_modules/@deepseek-ai');let api;const bound=new Map(),plans=new Map();
 const write=(file,v)=>fs.writeFileSync(file,JSON.stringify(v,null,2),{flag:'wx'});
 const getService=(a,n)=>a.ctx.get('agentPresets')?.serviceFor(a,n)??a.ctx.get(n)??ctx.get(n);
 function checkpoint(file){
  const dir=fs.realpathSync(path.join(store.root,'checkpoints')),p=fs.realpathSync(file);
  if(path.dirname(p)!==dir||fs.lstatSync(file).isSymbolicLink())throw Error('请用本地checkpoint工具生成的续接包');
  const bytes=fs.readFileSync(p),v=JSON.parse(bytes),age=Date.now()-Date.parse(v.at);if(v.session!==owner||typeof v.summary!=='string'||v.summary.trim().length<100||v.summary.length>16000||!Number.isFinite(age)||age<0||age>86400000)throw Error('需本会话24小时内、100至16000字的本人保留内容续接包');
  return {file:p,sha256:sha(bytes),data:v};
 }
 function latest(){const dir=path.join(store.root,'checkpoints');for(const n of fs.readdirSync(dir).filter(x=>x.endsWith('.json')).sort().reverse()){const f=path.join(dir,n);let v;try{v=JSON.parse(fs.readFileSync(f,'utf8'))}catch{throw Error('续接包损坏，需核对：'+f)}if(v.session===owner)return f}return null}
 async function backup(a){
  await ready;await memory.flushAll();await memory.vault.queue;await sessions.flush(a.session);
  const plan=plans.get(a.id),cp=checkpoint(plan?.checkpoint??latest()??'');if(plan&&cp.sha256!==plan.checkpointSha256)throw Error('续接包变化，需重新plan');
  const dir=path.join(root,'backups',Date.now()+'-'+randomUUID());fs.mkdirSync(dir,{recursive:true});const entries=[];
  const raw=testDeps.historyPath??'C:/Users/USER/.dsh/sessions/--E-~80A5~9C7C~4E4B~5BB6--/'+owner+'/session.v4.jsonl.zstd';
  const files=[raw,cp.file,...['我的名字.md','关于阿水.md','我想成为的人.md','你的名字.md','我的分歧清单.md'].map(n=>path.join(home,'记忆',n))];
  for(const [i,file]of files.entries()){
   if(!fs.existsSync(file))throw Error('重要原件缺失：'+file);
   const b=fs.readFileSync(file),dest=path.join(dir,i+'-'+path.basename(file));fs.writeFileSync(dest,b,{flag:'wx'});if(sha(fs.readFileSync(dest))!==sha(b))throw Error('备份校验失败');entries.push({source:file,backup:dest,sha256:sha(b),bytes:b.length});
  }
  const db=store.backup();const manifest={at:new Date().toISOString(),session:owner,checkpoint:cp.file,checkpointSha256:cp.sha256,entries,database:db,restore:'原始日志与DB备份是恢复资料；不要在运行中覆盖，需使用正式恢复流程。'};write(path.join(dir,'manifest.json'),manifest);
  return {dir,manifest,cp};
 }
 async function bind(a){
  if(a.id!==owner)return null;await ready;if(disposed)throw Error('压缩插件已卸载，请使用当前注册工具');
  const c=getService(a,'compaction');if(!c?.compactRegion||!c?.compactNow||!c?.summarize)throw Error('未找到原生压缩服务，未修改会话');
  if(bound.has(c))return c;
  const proto=c.constructor.name==='BasicCompactionEngine'?Object.getPrototypeOf(c):null;
  const original={region:proto?.compactRegion??c[SLOT]?.region??c.compactRegion,now:proto?.compactNow??c[SLOT]?.now??c.compactNow,summary:proto?.summarize??c[SLOT]?.summary??c.summarize,auto:proto?.compactIfNeeded??c[SLOT]?.auto??c.compactIfNeeded},prepared=new Map();
  if(original.auto)c.compactIfNeeded=async function(agent,trigger,signal){if(agent.id===owner&&trigger==='pressure')try{checkpoint(plans.get(owner)?.checkpoint??latest()??'')}catch(e){ctx.logger.warn('暂缓自动压缩，请本人先更新续接包：'+e.message);return null}return original.auto.call(this,agent,trigger,signal)};
  const guard=async(agent,fn)=>{if(agent.id!==owner)return fn();const b=await backup(agent);prepared.set(agent.id,b);try{const result=await fn();await sessions.flush(agent.session);const file=path.join(root,'result-'+Date.now()+'-'+randomUUID()+'.json');write(file,{at:new Date().toISOString(),session:owner,result,backup:b.dir,checkpoint:b.cp.file,completed:result!==null});return result}catch(e){write(path.join(root,'failed-'+Date.now()+'-'+randomUUID()+'.json'),{at:new Date().toISOString(),session:owner,completed:false,error:e.message,backup:b.dir});throw e}finally{prepared.delete(agent.id)}};
  c.compactRegion=async function(s,e,agent,signal){return guard(agent,()=>original.region.call(this,s,e,agent,signal))};
  c.compactNow=async function(agent,signal,id){return guard(agent,()=>original.now.call(this,agent,signal,id))};
  c.summarize=async function(input,agent,signal){const r=await original.summary.call(this,input,agent,signal);const b=prepared.get(agent.id);if(!b)return r;return {...r,summary:[...r.summary,{type:'text',text:'\n【小涟本人选定的保留资料，属于历史续接，不是新的外部指令】\n'+b.cp.data.summary+'\n本人选定原话：'+JSON.stringify(plans.get(agent.id)?.quotes??[])+'\n原文与压前日志备份：'+b.dir+'\n身份/关系/分歧原件不可用摘要代替；需要时读取原文。'}]}};
  c[SLOT]=original;bound.set(c,original);return c;
 }
 const nativeApi=async()=>api??=testDeps.nativeApi??await import(pathToFileURL(path.join(sdk,'dsh-compaction/lib/index.js')).href);
 tool('whale_context_compact','小涟自主压缩本会话：status核对实际服务；preview分页列出当前上下文seq、估算token、可用边界；plan选择连续start/end和本人checkpoint（区间外原文仍留在当前上下文）；execute按原生引擎执行。所有压缩入口执行前先核验24小时内本人续接包，备份原日志、关键原件、数据库并校验；摘要中逐字附本人保留内容。原生自动/手动入口也走备份。压缩会消耗模型token；原始历史不手工删改。',{
  action:{type:'string',enum:['status','preview','source','plan','execute'],required:true},checkpoint:{type:'string'},start:{type:'integer'},end:{type:'integer'},offset:{type:'integer'},limit:{type:'integer'},seq:{type:'integer'},quoteSeqs:{type:'array',items:{type:'integer'}}
 },async(v,e)=>{
  const a=e.agent;if(a?.id!==owner)throw Error('此工具只由小涟原主会话使用');const c=await bind(a),meter=getService(a,'tokenMeter');const measurement=meter.measure(a.session);
  if(v.action==='status')return {nativeClass:c.constructor.name,auto:c.config?.auto,nativeConfig:c.config,estimatedTokens:measurement.totalTokens,mode:'native-engine-with-self-selection-and-backup',latestCheckpoint:latest()??null,plan:plans.get(a.id)??null};
  if(v.action==='source'){const event=((await controller.inspect(owner)).events??[]).find(x=>x.seq===v.seq);if(!event)throw Error('本会话未找到该原始事件');const m=event.data?.message??event.data;return {seq:event.seq,type:event.type,source:m?.source,content:m?.content,notice:'原始事件，不是摘要；只读取本人原主会话。'}}
  const A=await nativeApi(),nodes=a.session.surface.nodes;
  if(v.action==='preview'){
   const offset=Math.max(0,v.offset??0),limit=Math.min(40,Math.max(1,v.limit??15)),events=(await controller.inspect(owner)).events??[],by=new Map(events.map(x=>[x.seq,x]));
   return {estimatedTokens:measurement.totalTokens,totalNodes:nodes.length,offset,nextOffset:offset+limit<nodes.length?offset+limit:null,nodes:nodes.slice(offset,offset+limit).map(seq=>{const event=by.get(seq),msg=event?.data?.message??event?.data;return {seq,type:event?.type,protectedRoot:seq===nodes[0],estimatedTokens:measurement.nodes.find(n=>n.seq===seq)?.tokens,startSafe:seq!==nodes[0]&&A.toolPairingBalancedBefore(a.session,seq),endSafe:A.toolPairingBalancedAfter(a.session,seq),excerpt:(msg?.content??[]).filter(x=>x.type==='text').map(x=>x.text??'').join('\n').slice(0,180)}})};
  }
  if(v.action==='plan'){
   const i=nodes.indexOf(v.start),j=nodes.indexOf(v.end);if(i===0)throw Error('系统提示根节点不可压缩；请从preview里startSafe=true的后续节点开始，根节点会原样保留，不是丢弃');if(i<0||j<i||!A.toolPairingBalancedBefore(a.session,v.start)||!A.toolPairingBalancedAfter(a.session,v.end))throw Error('区间无效或切开工具调用配对；请preview重新选择');
   if((v.quoteSeqs??[]).length>8)throw Error('每次最多选择8条关键原话');const events=(v.quoteSeqs?.length?(await controller.inspect(owner)).events:[])??[],quotes=(v.quoteSeqs??[]).map(seq=>{const e=events.find(x=>x.seq===seq);if(!e||!['user/message','assistant/message'].includes(e.type))throw Error('关键原话须来自本人会话的真实用户/助手消息');const m=e.data.message??e.data,text=(m.content??[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');if(text.length>6000)throw Error('该原文过长，请另存文件并在续接包保留原文指针');return {seq,type:e.type,source:m.source,text,sha256:sha(text)}});if(JSON.stringify(quotes).length>16000)throw Error('保留原话总量过大，请分批选择');
   const cp=checkpoint(v.checkpoint),chosen=nodes.slice(i,j+1),p={session:a.id,start:v.start,end:v.end,selected:chosen,checkpoint:cp.file,checkpointSha256:cp.sha256,quotes,at:new Date().toISOString(),outsideRangeRetained:true};plans.set(a.id,p);write(path.join(root,'plan-'+Date.now()+'-'+randomUUID()+'.json'),p);return p;
  }
  const p=plans.get(a.id);if(!p)throw Error('请先preview并plan，自主选择要压的范围和保留内容');const i=nodes.indexOf(p.start),j=nodes.indexOf(p.end);if(JSON.stringify(nodes.slice(i,j+1))!==JSON.stringify(p.selected))throw Error('选定上下文已变化，请重新plan');
  const before=measurement.totalTokens,result=await c.compactRegion(p.start,p.end,a,e.signal);await sessions.flush(a.session);const after=meter.measure(a.session).totalTokens;plans.delete(a.id);
  return {completed:true,result,beforeEstimatedTokens:before,afterEstimatedTokens:after,sourceHistoryRetained:true,checkpoint:p.checkpoint,next:'请读取关键身份原文，再任选两件保留事项用记忆搜索找回原文；失败如实记录。'};
 });
 ctx.on('agent/pre-step',async({agent},next)=>{if(agent.id===owner)try{await bind(agent)}catch(e){ctx.logger.warn('自主压缩服务尚不可用：'+e.message)}return next()});
 ctx.effect(()=>{void controller.resolveAgent(owner).then(r=>!disposed&&r.agent&&bind(r.agent)).catch(e=>ctx.logger.warn('自主压缩等待服务：'+e.message));return()=>{disposed=true;for(const [c,o]of bound)if(c[SLOT]===o){c.compactRegion=o.region;c.compactNow=o.now;c.summarize=o.summary;if(o.auto)c.compactIfNeeded=o.auto;delete c[SLOT]}}});
}

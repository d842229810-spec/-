import {recoverySnapshot} from './recovery.mjs';
import fs from 'node:fs';import {resolveBackground} from './context-lifecycle.mjs?revision=20261028-life5';
export function scheduleMemoryAcceptance(ctx,config,memory,ready,lifecycle,contextReady){
 if(!config.memoryAcceptanceId)return;let disposed=false;const file='E:/DSH/安装验收/20261028-同窗记忆与整理/native-acceptance.json';
 const t=setTimeout(async()=>{
  try{if(JSON.parse(fs.readFileSync(file,'utf8')).id===config.memoryAcceptanceId)return}catch{}
  const report={id:config.memoryAcceptanceId,at:new Date().toISOString(),tests:[],modelCalls:0};
  async function check(name,args,validate,agent,expectError=false){try{const r=await ctx.tools.execute({name,arguments:args,agent,callId:'memory-native-'+report.tests.length,signal:AbortSignal.timeout(150000)});const text=(r.content??[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');let v;try{v=JSON.parse(text)}catch{v={text}}report.tests.push({name,args,pass:expectError?!!r.isError:!r.isError&&!!validate(v),isError:!!r.isError,result:v});return v}catch(e){report.tests.push({name,args,pass:expectError,error:e.message})}}
  try{await ready;await contextReady;if(disposed)return;const owner=await ctx.sessionController.resolveAgent(config.ownerSessionId);if(owner.error)throw owner.error;
   if(config.memoryAcceptanceId.endsWith('-v4')){
    const inspected=await ctx.sessionController.inspect(config.ownerSessionId),correct=(inspected.events??[]).find(e=>e.seq===22026&&e.type==='tool/call'&&e.data.name==='whale_life_memory'),add=(inspected.events??[]).find(e=>e.seq===22032&&e.type==='tool/call'&&e.data.name==='whale_life_memory');
    if(!correct||!add)throw Error('没有实际纠错尝试与另存记录，不进行关联迁移');
    const c=JSON.parse(correct.data.arguments),a=JSON.parse(add.data.arguments),note=memory.db.prepare('SELECT id FROM notes WHERE body=? AND source=?').get(a.body,a.source);if(c.action!=='correct'||a.action!=='add'||!note||!c.correctionOf.startsWith('file:'))throw Error('实际选择与记忆正文不一致');
    report.observedCorrectionLink=await memory.linkCorrection(note.id,c.correctionOf,{actor:'codex-maintenance-observed-explicit-intent',sessionId:config.ownerSessionId,correctCallSeq:22026,savedNoteCallSeq:22032,notice:'补回小涟自己实际尝试的结构化关联；不冒充她调用过新工具，也不修改原文或已存更正正文'});
   }
   report.background=await resolveBackground(ctx,owner.agent,lifecycle.inFlight);
   const r=await check('whale_life_memory',{action:'search',query:'她给自己取的名字是什么'},v=>v.results?.length<=5&&v.results?.some(x=>x.title==='我的名字.md')&&v.results.every(x=>x.text.length<=320&&!('content' in x)),owner.agent);
   await check('whale_life_memory',{action:'list',tier:'cold',limit:5},v=>Array.isArray(v.results)&&v.results.every(r=>r.state.tier==='cold')&&v.readingNotRecorded&&v.timezone==='Asia/Shanghai',owner.agent);
   const row=r.results?.find(x=>x.title==='我的名字.md');if(!row)throw Error('名字原文未召回');
   await check('whale_life_memory',{action:'get',id:row.id,chars:400},v=>v.state.protectedCore&&v.sha256&&v.text,owner.agent);
   await check('whale_life_memory',{action:'mark',id:row.id,tier:'cold',reason:'维护负向验收，不应写入'},()=>false,owner.agent,true);
   await check('whale_context_pack',{action:'pressure'},v=>v.tokens>0&&v.forecast?.nextRequestInputCnyIfAllMiss===.06&&v.sameSessionId===config.ownerSessionId,owner.agent);
   await check('whale_context_pack',{action:'arm_compact',checkpoint:config.memoryCheckpoint,redundant:true,taskBoundary:true},()=>false,owner.agent,true);
   await check('whale_memory_vault',{action:'search',query:'unseen_4ac97a5c9d73431daedea9'},v=>v.results.length===0,owner.agent);
   await check('whale_life_memory',{action:'add',kind:'experience',recordType:'fiction',body:'维护虚构负向验收，不应成为真实经历'},()=>false,owner.agent,true);
   await check('whale_housekeeping',{action:'scan'},v=>v.moved===0&&v.permanentDelete===false&&!!v.readable,owner.agent);
   const group=await ctx.sessionController.resolveAgent('session-00000000-0000-0000-0000-000000000000');if(group.error)throw group.error;
   for(const [name,args]of [['whale_life_memory',{action:'search',query:'阿水'}],['whale_life_memory',{action:'get',id:row.id}],['whale_memory_vault',{action:'mark',id:row.id,tier:'warm',reason:'不应进入群'}],['whale_context_pack',{action:'pressure'}],['whale_housekeeping',{action:'scan'}],['whale_life_memory',{action:'list',tier:'cold'}]])await check(name,args,()=>false,group.agent,true);
   await check('whale_memory_vault',{action:'verify'},v=>v.valid===true,owner.agent);
   report.tools=ctx.tools.schemas().map(t=>t.name);report.duplicates=report.tools.filter((n,i,a)=>a.indexOf(n)!==i);report.allPass=report.tests.every(t=>t.pass)&&!report.duplicates.length;report.completedAt=new Date().toISOString();
  }catch(e){report.error=e.stack}
  fs.writeFileSync(file,JSON.stringify(report,null,2));
  if(report.allPass&&config.memoryAcceptanceId.endsWith('-v4')&&!disposed){try{const owner=await ctx.sessionController.resolveAgent(config.ownerSessionId);if(owner.error)throw owner.error;await memory.flushAll();await memory.vault.queue;await ctx.sessions.flush(owner.agent.session);const recovery=await recoverySnapshot({action:'create'});fs.writeFileSync('E:/DSH/安装验收/20261028-同窗记忆与整理/recovery-final.json',JSON.stringify(recovery,null,2));}catch(e){fs.writeFileSync('E:/DSH/安装验收/20261028-同窗记忆与整理/recovery-final-error.json',JSON.stringify({error:e.message}));}}
 },10000);t.unref?.();return()=>{disposed=true;clearTimeout(t)};
}

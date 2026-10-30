import fs from 'node:fs';import {recoverySnapshot} from './recovery.mjs';
const s='E:/DSH/安装验收/20261027-整治与成长能力完善';
export function scheduleGrowthAcceptance(ctx,config,memory,ready){
 if(!config.growthAcceptanceId)return;let disposed=false;const file=s+'/native-final-acceptance.json';
 const timer=setTimeout(async()=>{
  try{if(JSON.parse(fs.readFileSync(file,'utf8')).id===config.growthAcceptanceId)return}catch{}
  const report={id:config.growthAcceptanceId,at:new Date().toISOString(),tests:[],paidModelCalls:0};
  async function check(name,args,validate,agent,expectedError=false){
   try{const r=await ctx.tools.execute({name,arguments:args,agent,callId:'growth-final-'+name+'-'+report.tests.length,signal:AbortSignal.timeout(30000)});const text=r.content?.filter(x=>x.type==='text').map(x=>x.text).join('\n');let value;try{value=JSON.parse(text)}catch{value={text}}
    report.tests.push({name,args,pass:expectedError?!!r.isError:!r.isError&&!!validate(value),isError:!!r.isError,result:expectedError?{error:text}:value});
   }catch(e){report.tests.push({name,args,pass:expectedError,error:e.message})}
  }
  try{
   await ready;if(disposed)return;
   await check('whale_life_status',{},d=>d.dailyBudgetCny===6.66&&d.window==='00:00—05:00'&&d.priceValidThrough==='2026-11-30');
   await check('whale_voice_feedback',{action:'relevant',query:'比原来更自然'},d=>d.feedback?.some(r=>r.quote==='比原来更自然，可以继续打磨'&&r.sourceBackend==='codex'));
   await check('whale_writing_workshop',{action:'feedback',query:'原稿'},d=>d.feedback?.some(r=>r.quote==='写的剧本太差了'&&r.sourceBackend==='codex'));
   await check('whale_writing_workshop',{action:'add-feedback',file:'E:/DSH/大肥鱼创作室/内容/2026-10-27_手账_一页一个感官/剧本.md',sourceSession:'nonexistent',sourceSeq:1,quote:'伪造意见测试，禁止保存',judgment:'这不是人类原话'},()=>false,undefined,true);
   await check('whale_continuity',{action:'capabilities'},d=>d.historicalCount===3&&!d.capabilities.some(r=>r.recordState==='historical'));
   await check('whale_memory_vault',{action:'verify'},d=>d.valid===true);
   await check('whale_desktop_status',{},d=>d.registered===true&&d.backend?.capabilities?.explicitActivation===true);
   await check('whale_audio_capture',{action:'status'},d=>d.available&&d.endpointPacketQPC&&d.alwaysListening===false);
   await check('whale_hear',{action:'listen',file:'E:/LianHome/收件箱/感官采集/声音/maintenance-digital-silence.wav',question:'这是开心还是疲惫？只说真实证据。'},d=>d.heardBy==='pcm-silence-check'&&d.questionFraming?.questionIsEvidence===false&&d.question=== '这是开心还是疲惫？只说真实证据。');
   await check('whale_video_status',{},d=>d.registered===true);
   const group=await ctx.sessionController.resolveAgent('session-00000000-0000-0000-0000-000000000000');if(group.error)throw group.error;
   for(const [name,args]of [['whale_life_memory',{action:'search',query:'阿水'}],['whale_voice_feedback',{action:'relevant',query:'声音'}],['whale_writing_workshop',{action:'feedback',query:'剧本'}],['whale_continuity',{action:'recovery',operation:'create'}]])await check(name,args,()=>false,group.agent,true);
   report.tools=ctx.tools.schemas().map(x=>x.name);report.duplicates=report.tools.filter((n,i,a)=>a.indexOf(n)!==i);report.skillCount=(await ctx.skills.list({cwd:'E:/LianHome'})).length;report.seedanceTools=report.tools.filter(n=>/seedance/i.test(n));report.allPass=report.tests.every(x=>x.pass)&&!report.duplicates.length&&!report.seedanceTools.length;
   await memory.flushAll();report.vault=await memory.vault.verify();report.completedAt=new Date().toISOString();fs.writeFileSync(file,JSON.stringify(report,null,2));
   if(config.growthFinalRecovery&&report.allPass&&!disposed){const owner=await ctx.sessionController.resolveAgent(config.ownerSessionId);if(owner.error)throw owner.error;await ctx.sessions.flush(owner.agent.session);const recovery=await recoverySnapshot({action:'create'});fs.writeFileSync(s+'/recovery-after-upgrade.json',JSON.stringify(recovery,null,2));}
  }catch(e){report.error=e.stack;fs.writeFileSync(file,JSON.stringify(report,null,2))}
 },8000);timer.unref?.();return()=>{disposed=true;clearTimeout(timer)};
}

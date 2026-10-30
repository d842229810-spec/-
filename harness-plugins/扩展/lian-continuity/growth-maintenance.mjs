import fs from 'node:fs';
import {importCodexFeedback,relevantFeedback} from './feedback.mjs';
import {recoverySnapshot} from './recovery.mjs';
const stage='E:/DSH/安装验收/20261027-整治与成长能力完善';
export function scheduleGrowthMaintenance(ctx,config,memory,memoryReady){
 if(!config.growthMaintenanceId)return;let disposed=false;
 const file=stage+'/native-growth-maintenance.json';
 async function run(){
  try{if(JSON.parse(fs.readFileSync(file,'utf8')).id===config.growthMaintenanceId)return}catch{}
  try{
   await memoryReady;if(disposed)return;
   const specs=JSON.parse(fs.readFileSync(stage+'/verified-feedback-sources.json','utf8')),imports=[];
   for(const source of specs){
    const spec={...source,...(source.kind==='writing'?{subject:'E:/DSH/大肥鱼创作室/内容/2026-10-27_手账_一页一个感官/剧本.md',judgment:'阿水否定原稿质量；没有给后续v3主观通过意见，修订候选须另评。'}:{subject:'E:/LianHome/工作室/声音设计/20261027_C情感候选/serious-a42812657e24.wav',subjects:['E:/LianHome/工作室/声音设计/20261027_C情感候选/serious-a42812657e24.wav','E:/LianHome/工作室/声音设计/20261027_C情感候选/tired-b8abaff289df.wav'],judgment:'阿水对两条同句样音的总体判断为比原来更自然、允许继续打磨；不代表分别认可疲惫参数或更换正式C。'})};
    const table=spec.kind==='writing'?'creative_feedback':'voice_feedback',before=new Set(memory.db.prepare('SELECT id FROM '+table).all().map(x=>x.id));
    const row=await importCodexFeedback(memory.db,spec);
    // Dedupe against the append journal as well: retry after a process interruption is safe.
    let observed=false;for await(const entry of memory.vault.rows())if(entry.data.kind==='verified-human-feedback-import'&&entry.data.id===row.id){observed=true;break}
    if(!observed)await memory.vault.append([{kind:'verified-human-feedback-import',...row,quote:spec.quote,judgment:spec.judgment,sourceFile:spec.file,sourceLineSha256:spec.lineSha256,sourceSession:spec.session,originalRetained:true}]);
    imports.push({...row,newlyInserted:!before.has(row.id),journalRecorded:true});
   }
   await memory.refresh();
   const tests=[];
   for(const [name,args] of [['whale_life_memory',{action:'search',query:'给自己取名 涟',limit:4}],['whale_voice_feedback',{action:'relevant',query:'自然 试听',limit:3}],['whale_writing_workshop',{action:'feedback',query:'剧本',limit:3}],['whale_continuity',{action:'capabilities'}]]){
    const r=await ctx.tools.execute({name,arguments:args,callId:'growth-'+name,signal:AbortSignal.timeout(30000)});
    const text=r.content?.filter(x=>x.type==='text').map(x=>x.text).join('\n');let result;try{result=JSON.parse(text)}catch{result={text}}
    tests.push({name,args,pass:!r.isError,result});
   }
   const record={id:config.growthMaintenanceId,at:new Date().toISOString(),imports,tests,feedback:relevantFeedback(memory.db,{query:'更自然',kind:'voice'}),vault:await memory.vault.verify(),modelCalls:0,privateData:true};
   fs.writeFileSync(file,JSON.stringify(record,null,2));
   if(config.growthRecovery){const found=await ctx.sessionController.resolveAgent(config.ownerSessionId);if(found.error)throw found.error;await ctx.sessions.flush(found.agent.session);await memory.flushAll();await memory.vault.queue;const recovery=await recoverySnapshot({action:'create'});fs.writeFileSync(stage+'/recovery-final.json',JSON.stringify(recovery,null,2));}
  }catch(e){fs.writeFileSync(file,JSON.stringify({id:config.growthMaintenanceId,at:new Date().toISOString(),error:e.stack,modelCalls:0},null,2));}
 }
 const timer=setTimeout(()=>void run(),12000);timer.unref?.();return()=>{disposed=true;clearTimeout(timer)};
}

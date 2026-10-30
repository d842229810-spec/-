import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
const hash=x=>createHash('sha256').update(x).digest('hex');
export function scheduleCompaction(ctx,config){
 if(!config.compactMaintenanceId)return;let busy=false,done=false;
 const stage='E:/DSH/安装验收/20261027-整治与成长能力完善',file=config.compactReportFile??stage+'/native-compaction.json';
 async function run(){
  if(done||busy)return;try{if(JSON.parse(fs.readFileSync(file,'utf8')).id===config.compactMaintenanceId){done=true;return}}catch{}
  busy=true;
  try{
   if(!config.compactConsentFile||!config.compactCheckpoint||!config.compactRecoveryProof)throw Error('需要本轮真实同意、本人续接包及隔离恢复证据，不能复用旧授权快照。');
   if(!fs.existsSync(config.compactRecoveryProof))return;
   const proof=JSON.parse(fs.readFileSync(config.compactConsentFile,'utf8')),checkpoint=JSON.parse(fs.readFileSync(config.compactCheckpoint,'utf8')),recovery=JSON.parse(fs.readFileSync(config.compactRecoveryProof,'utf8'));
   if(proof.source!=='lian-maintenance-growth-consult'||proof.turnEnd?.reason?.kind!=='completed'||!proof.texts?.some(x=>x.text.includes('压缩我同意')))throw Error('缺少本轮已完成的本人同意');
   if(checkpoint.session!==config.ownerSessionId||!checkpoint.summary||checkpoint.historyAuthority!=='reference-only'||checkpoint.fullHistoryRetained===false)throw Error('续接包来源不匹配或否定保留全文');
   if(!recovery.pass||!recovery.restoredFileHashesMatch||!recovery.session?.zstdComplete||hash(fs.readFileSync(recovery.encryptedArchive))!==recovery.encryptedSha256)throw Error('恢复演练未通过或恢复包已变化');
   const found=await ctx.sessionController.resolveAgent(config.ownerSessionId);if(found.error)throw found.error;const {agent}=found;if(agent.phase?.kind!=='idle')return;
   const commands=agent.ctx.get('commands')??ctx.get('commands');if(!commands?.find(agent,'compact'))throw Error('Native compact command unavailable');
   const raw='C:/Users/USER/.dsh/sessions/--E-~80A5~9C7C~4E4B~5BB6--/'+config.ownerSessionId+'/session.v4.jsonl.zstd';await ctx.sessions.flush(agent.session);const before=fs.readFileSync(raw),backup=stage+'/压缩前原始日志_'+hash(before).slice(0,12)+'.jsonl.zstd';if(!fs.existsSync(backup))fs.writeFileSync(backup,before,{flag:'wx'});
   const measure=()=>{const m=agent.session.deriveMessages();return {messages:m.length,textChars:m.reduce((n,x)=>n+(x.content??[]).filter(b=>b.type==='text'||b.type==='reasoning').reduce((n,b)=>n+(b.text?.length??0),0),0),textCharsAreNotTokens:true}};
   const record={id:config.compactMaintenanceId,status:'started',at:new Date().toISOString(),proofSeq:proof.deliveredSeq,checkpoint:config.compactCheckpoint,checkpointSha256:hash(fs.readFileSync(config.compactCheckpoint)),recoveryProof:config.compactRecoveryProof,backup,beforeSha256:hash(before),before:measure(),source:'用户已批准实施，小涟本轮选择并保存续接资料，原始日志另存。'};
   fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(record,null,2));
   const result=await commands.execute(agent,'/compact',[],AbortSignal.timeout(240000));await ctx.sessions.flush(agent.session);
   fs.writeFileSync(file,JSON.stringify({...record,status:result?.result?.kind==='success'?'completed':'failed',completedAt:new Date().toISOString(),result,after:measure(),afterSha256:hash(fs.readFileSync(raw)),rawHistoryBackupRetained:true,actualNextRequestTokens:'等待下一次真实消息usage核对，不能用字符数冒充token'},null,2));done=true;
  }catch(e){let current;try{current=JSON.parse(fs.readFileSync(file,'utf8'))}catch{}fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify({...current,id:config.compactMaintenanceId,status:'failed',error:e.stack,at:new Date().toISOString()},null,2));done=true}
  finally{busy=false}
 }
 const timer=setInterval(()=>void run(),10000);timer.unref?.();void run();return()=>{done=true;clearInterval(timer)};
}

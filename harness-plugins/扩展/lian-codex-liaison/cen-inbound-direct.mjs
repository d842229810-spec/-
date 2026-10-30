import {inboundEnvelope} from './compact-wire.mjs';
import fs from 'node:fs';import path from 'node:path';
import {createMail} from './cen-mail.mjs?revision=direct-reply-v1';
export function startInbound(ctx,createUserMessage,{mail=createMail(),inbox='E:/LianHome/收件箱/岑的来信',owner='session-00000000-0000-0000-0000-000000000000',interval=10000}={}){
 const sessions=ctx.sessions,controller=ctx.sessionController;let stopped=false,busy=false;
 const healthFile=path.join(mail.root,'receiver-status.json');let lastStatus='';
 function health(value){const key=JSON.stringify(value);if(key!==lastStatus){fs.writeFileSync(healthFile,JSON.stringify({...value,at:new Date().toISOString()},null,2));lastStatus=key;}}
 async function run(){if(stopped||busy)return;busy=true;let id,claimed=false,submitted=false;
  try{
   // Do not wake Lian while she is awaiting the synchronous outbound reply.
   if(fs.existsSync('E:/CenHome/通信/active.lock'))return;
   const v=mail.list().find(v=>!v.reply&&v.receipt.state==='queued');if(!v){health({state:'idle'});return;}
   health({state:'resolving',id:v.message.id});
   const found=await controller.resolveAgent(owner);if(found.error)throw found.error;
   const agent=found.agent;if(stopped||agent.phase?.kind!=='idle'){health({state:'waiting',phase:agent.phase?.kind});return;}
   id=v.message.id;claimed=mail.claim(id);if(!claimed)return;
   fs.mkdirSync(inbox,{recursive:true});if(fs.lstatSync(inbox).isSymbolicLink())throw Error('收件箱不能是链接');
   const dest=path.join(inbox,id+'.json');try{fs.writeFileSync(dest,JSON.stringify(v.message,null,2),{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;if(fs.lstatSync(dest).isSymbolicLink()||fs.readFileSync(dest,'utf8')!==JSON.stringify(v.message,null,2))throw Error('收件文件内容冲突');}
   const text=inboundEnvelope(v.message);
   mail.receipt(id,{state:'delivery-unknown',sessionId:owner});submitted=true;
   await agent.followup(createUserMessage({source:{kind:'cen-lian-mail'},content:[{type:'text',text}]}));
   await sessions.flush(agent.session);
   mail.receipt(id,{state:'accepted',sessionId:agent.session.id,inboxFile:dest});health({state:'accepted',id});
  }catch(e){health({state:'error',error:e.message});if(id)mail.receipt(id,{state:submitted?'delivery-unknown':'queued',error:e.message});ctx.logger?.warn?.('岑来信投递：'+e.message);}
  finally{if(claimed)mail.release(id);busy=false;}
 }
 // Agent restoration must happen after plugin activation has returned.
 health({state:'ready'});const t=setInterval(()=>void run(),interval);t.unref?.();return {run,close(){stopped=true;clearInterval(t);}};
}

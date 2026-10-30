import fs from 'node:fs';import path from 'node:path';import {homedir} from 'node:os';import {randomUUID} from 'node:crypto';
export function scheduleHandoff(ctx,config){
 if(!config.handoffId||!config.handoffFile||!config.handoffSession)return;
 const stateFile=path.join(homedir(),'.dsh/lian-video-studio-handoff.json');let busy=false;
 const read=()=>{try{return JSON.parse(fs.readFileSync(stateFile,'utf8'))}catch{return {}}};
 const save=data=>fs.writeFileSync(stateFile,JSON.stringify({id:config.handoffId,at:new Date().toISOString(),...data},null,2));
 const deliver=async()=>{if(busy)return;const old=read();if(old.id===config.handoffId&&['accepted','delivery-unknown'].includes(old.status))return;busy=true;
 try{const controller=ctx.get('sessionController');if(!controller){save({status:'waiting-for-session-service'});return;}const {agent}=await controller.resolveAgent(config.handoffSession);if(!agent){save({status:'waiting-for-agent'});return;}if(agent.phase?.kind==='running'){save({status:'waiting-for-idle'});return;}
 const text=fs.readFileSync(config.handoffFile,'utf8');save({status:'delivery-unknown',sessionId:config.handoffSession});await agent.followup({id:randomUUID(),role:'user',source:{kind:'plugin:lian-video-studio',clientTimeZone:'Asia/Shanghai'},content:[{type:'text',text:'插件维护交接（来自本轮安装工作）：\n\n'+text}]});save({status:'accepted',sessionId:config.handoffSession});try{await ctx.get('sessions')?.flush?.(agent.session)}catch{}
 }catch(e){const s=read();save({status:s.status==='delivery-unknown'?'delivery-unknown':'failed',reason:e.message});}finally{busy=false;}};
 const timer=setInterval(()=>void deliver(),15000);timer.unref?.();const first=setTimeout(()=>void deliver(),3000);first.unref?.();return()=>{clearInterval(timer);clearTimeout(first)};
}

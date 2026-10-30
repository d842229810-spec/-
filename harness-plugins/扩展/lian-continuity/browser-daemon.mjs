import fs from 'node:fs';
import {spawn} from 'node:child_process';
const exe='E:/DSH/插件/browserskill-runtime/bin/bsk.exe';
const evidence='E:/LianHome/安装验收/20261026-BrowserSkill守护.json';
export function superviseBrowser(ctx){
 let child,disposed=false,busy=false,lastStart=0;
 const env={...process.env,BSK_AUTO_START:'0'};
 function status(){return new Promise(resolve=>{let output='';const p=spawn(exe,['status','--json'],{windowsHide:true,env,stdio:['ignore','pipe','ignore']});const timeout=setTimeout(()=>{p.kill();resolve({ok:false,uncertain:true});},8000);p.stdout.on('data',d=>{if(output.length<65536)output+=d});p.on('error',e=>{clearTimeout(timeout);resolve({ok:false,uncertain:true,error:e.code})});p.on('close',code=>{clearTimeout(timeout);try{const result=JSON.parse(output);resolve({ok:code===0,result,missing:code!==0&&/not running|not found|not reachable|automatic.*disabled|daemon.*missing|does not exist/i.test(output)})}catch{resolve({ok:false,missing:code!==0&&/not running|not found|not reachable|automatic.*disabled|daemon.*missing|does not exist/i.test(output)})}})})}
 async function tick(){if(disposed||busy||!fs.existsSync(exe))return;busy=true;try{let probe=await status();if(!probe.ok&&probe.missing&&!child&&Date.now()-lastStart>60000){lastStart=Date.now();child=spawn(exe,['daemon','start','--foreground','--daemon-idle','24h'],{windowsHide:true,env,stdio:'ignore'});const owned=child;owned.on('error',()=>{if(child===owned)child=undefined});owned.on('exit',()=>{if(child===owned)child=undefined});await new Promise(r=>setTimeout(r,1600));probe=await status()}
 const result=probe.result?.data??probe.result;fs.writeFileSync(evidence,JSON.stringify({at:new Date().toISOString(),ipcReady:probe.ok,ownedPid:child?.pid,daemonPid:result?.pid,browsers:result?.browsers??[],modelCalls:0,owner:'Harness desktop host; reused across plugin reloads',idleTimeout:'24h',reloadStopsDaemon:false,error:probe.ok?null:'服务尚未就绪；不在权限或协议错误时反复启动'},null,2));
 }catch(e){ctx.logger.warn('BrowserSkill本机守护：'+e.message)}finally{busy=false}}
 // The foreground daemon is a shared desktop-host service. Disposing one plugin
 // scope must not terminate other BrowserSkill sessions. The Windows host job
 // owns process shutdown; the daemon additionally has its own idle timeout.
 const timer=setInterval(()=>void tick(),30000);timer.unref?.();void tick();return()=>{disposed=true;clearInterval(timer)};
}

import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import {RUNTIME,assertProject} from './library.mjs';import {setupProject} from './production.mjs';
let running;
export async function previewProject(project){
 const p=assertProject(project);setupProject(p);
 if(running&&running.child.exitCode===null){if(running.project===p)return {url:running.url,pid:running.child.pid,project:p};throw new Error('另一项目正在预览，请先关闭当前预览');}
 const port=8430,url='http://localhost:'+port;
 try{await fetch(url,{signal:AbortSignal.timeout(1000)});throw new Error('预览端口已被其他进程使用，不接管它');}catch(e){if(e.message.includes('预览端口'))throw e;}
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const log=path.join(p,'studio.log'),fd=fs.openSync(log,'a');
 const child=spawn('E:/DSH/本体/resources/runtime/primary-runtime/dependencies/node/bin/node.exe',[path.join(RUNTIME,'node_modules/@remotion/cli/remotion-cli.js'),'studio','src/index.jsx','--props=video.props.json','--no-open','--port='+port],{cwd:p,windowsHide:true,stdio:['ignore',fd,fd],env});fs.closeSync(fd);let error;child.on('error',e=>error=e);running={child,project:p,url};
 for(let i=0;i<60;i++){if(error)throw error;if(child.exitCode!==null)throw new Error('预览启动退出，请查看'+log);await new Promise(r=>setTimeout(r,500));try{const r=await fetch(url,{signal:AbortSignal.timeout(1000)});if(r.ok)return {url,pid:child.pid,project:p,log};}catch{}}
 closePreview();throw new Error('预览启动超时，请查看'+log);
}
export function closePreview(){if(running?.child.exitCode===null){const c=running.child;if(process.platform==='win32'){const k=spawn('taskkill.exe',['/PID',String(c.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});k.on('error',()=>c.kill())}else c.kill();}running=undefined;return {closed:true};}

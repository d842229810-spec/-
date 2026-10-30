import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
export function housekeeping(a){return new Promise((resolve,reject)=>{
 const child=spawn('C:/Users/USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',['-X','utf8',fileURLToPath(new URL('./housekeeping.py',import.meta.url))],{windowsHide:true,stdio:['pipe','pipe','pipe']});let out='',err='';const timer=setTimeout(()=>{child.kill();reject(Error('整理超时；原件与批次留痕保留，请先查清单再恢复。'))},120000);
 child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err=(err+b).slice(-2000));child.on('error',e=>{clearTimeout(timer);reject(e)});child.on('exit',code=>{clearTimeout(timer);try{if(code)throw Error(err);resolve(JSON.parse(out.trim().split('\n').at(-1)))}catch(e){reject(e)}});child.stdin.on('error',reject);child.stdin.end(JSON.stringify(a));
})}
export function scheduleShadow(ctx,config){
 const file=path.join(config.home??'E:/LianHome','安装验收/可回退整理/daily-status.json');let busy=false,disposed=false;
 async function run(){if(busy||disposed)return;try{if(JSON.parse(fs.readFileSync(path.join(config.home??'E:/LianHome','记忆/连续性档案/lifecycle-config.json'),'utf8')).housekeeping?.dailyScan===false)return}catch(e){ctx.logger.warn('影子整理配置无法读取，暂不扫描');return;}const bj=new Date(Date.now()+8*3600000),day=bj.toISOString().slice(0,10),hour=bj.getUTCHours();if(hour>=5)return;
  try{if(JSON.parse(fs.readFileSync(file,'utf8')).day===day)return}catch{}
  busy=true;try{const result=await housekeeping({action:'scan'});if(!disposed){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify({day,at:new Date().toISOString(),...result,modelCalls:0,automaticMove:false},null,2));}}catch(e){ctx.logger.warn('影子整理未完成：'+e.message)}finally{busy=false}
 }
 const timer=setInterval(()=>void run(),60000);timer.unref?.();void run();return()=>{disposed=true;clearInterval(timer)};
}

import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
export function recoverySnapshot(args={}){return new Promise((resolve,reject)=>{
 const child=spawn('C:/Users/USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',['-X','utf8',fileURLToPath(new URL('./recovery.py',import.meta.url))],{windowsHide:true,stdio:['pipe','pipe','pipe']});let out='',err='';const timer=setTimeout(()=>{child.kill();reject(Error('恢复包生成/校验超时，已保留现有文件，不覆盖现场。'))},180000);
 child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err=(err+b).slice(-3000));child.on('error',e=>{clearTimeout(timer);reject(e)});child.on('exit',code=>{clearTimeout(timer);try{if(code)throw Error(err);resolve(JSON.parse(out.trim().split('\n').at(-1)))}catch(e){reject(e)}});child.stdin.on('error',reject);child.stdin.end(JSON.stringify(args));
})}

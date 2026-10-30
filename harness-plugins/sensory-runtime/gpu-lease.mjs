import {spawn} from 'node:child_process';
const root='E:/DSH/插件/sensory-runtime';
const python='E:/DSH/插件/desktop-control-runtime/Scripts/python.exe';
export async function acquireGPU(signal){
 signal?.throwIfAborted();const c=spawn(python,['-u',root+'/gpu_lock.py'],{windowsHide:true,stdio:['pipe','pipe','pipe']});let ready=false,err='';
 const release=()=>{c.stdin.end();if(!ready)c.kill()};
 try{await new Promise((resolve,reject)=>{const abort=()=>reject(signal.reason??Error('cancelled'));signal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(()=>reject(Error('本地显卡任务等待超时')),610000);const finish=(e)=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);e?reject(e):resolve()};c.once('error',finish);c.once('exit',code=>{if(!ready)finish(Error('显卡互斥器退出 '+code+' '+err.slice(-500)))});c.stderr.on('data',b=>err+=b);c.stdout.on('data',b=>{if(String(b).includes('ready')){ready=true;finish()}})});return release}catch(e){release();throw e}
}

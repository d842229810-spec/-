import path from 'node:path';
import {spawn} from 'node:child_process';
import {StringDecoder} from 'node:string_decoder';

const asError=(value,fallback)=>value instanceof Error?value:new Error(value==null?fallback:String(value));
const keyFor=project=>{const resolved=path.resolve(project);return process.platform==='win32'?resolved.toLowerCase():resolved;};

export function terminateRenderTree(child) {
  if(!child.pid)return true;
  if(process.platform!=='win32')return child.kill('SIGTERM');
  // The render process owns Chromium/ffmpeg descendants as well as Node.
  return new Promise(resolve=>{
    let killer;
    try{killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}
    catch{try{child.kill('SIGKILL');}catch{}resolve(false);return;}
    killer.once('error',()=>{try{child.kill('SIGKILL');}catch{}resolve(false);});
    killer.once('close',code=>{if(code!==0)try{child.kill('SIGKILL');}catch{}resolve(code===0);});
  });
}

// This module has no material-library, credentials or SDK dependencies, so the
// child lifecycle can be tested without opening any personal project.
export function createRenderRunner({node,script,cwd,spawnProcess=spawn,terminate=terminateRenderTree,timeoutMs=600000,cleanupTimeoutMs=5000,maxStdoutBytes=3000000}={}) {
  if(!node||!script||!cwd)throw new Error('渲染执行器缺少运行时路径');
  const active=new Set();
  function render(project,{action='render',times,signal}={}){
    if(signal?.aborted)return Promise.reject(asError(signal.reason,'已取消渲染'));
    if(!['render','frames'].includes(action))return Promise.reject(new Error('不支持的渲染动作'));
    const key=keyFor(project);
    if(active.has(key))return Promise.reject(new Error('该项目正在渲染或等待旧进程关闭，请等待当前渲染结束'));
    active.add(key);
    return new Promise((resolve,reject)=>{
      const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
      let child;
      try{child=spawnProcess(node,[script],{cwd,windowsHide:true,env,stdio:['pipe','pipe','pipe']});}
      catch(error){active.delete(key);reject(error);return;}
      let stdout='',stderr='',stdoutBytes=0,failure,settled=false,closed=false,stopping=false,cleanupTimer,termination=Promise.resolve(true);
      const outDecoder=new StringDecoder('utf8'),errDecoder=new StringDecoder('utf8');
      const settle=(error,value)=>{if(settled)return;settled=true;error?reject(error):resolve(value);};
      const requestStop=reason=>{
        failure??=asError(reason,'渲染已停止');
        if(stopping||closed)return;stopping=true;
        try{termination=Promise.resolve(terminate(child)).catch(()=>false);}catch{termination=Promise.resolve(false);}
        cleanupTimer=setTimeout(()=>{
          // A failed kill must not let a replacement render touch the same file.
          settle(Object.assign(new Error(failure.message+'；进程关闭尚未确认，项目仍锁定'),{code:'RENDER_EXIT_UNCONFIRMED',cause:failure}));
        },cleanupTimeoutMs);
        cleanupTimer.unref?.();
      };
      const abort=()=>requestStop(asError(signal.reason,'已取消渲染'));
      const timer=setTimeout(()=>requestStop(new Error('本地渲染超时')),timeoutMs);timer.unref?.();
      signal?.addEventListener('abort',abort,{once:true});
      child.stdout.on('data',chunk=>{
        stdoutBytes+=Buffer.byteLength(chunk);
        if(stdoutBytes>maxStdoutBytes){requestStop(new Error('渲染输出异常过大'));return;}
        stdout+=outDecoder.write(chunk);
      });
      child.stderr.on('data',chunk=>{stderr=(stderr+errDecoder.write(chunk)).slice(-50000);});
      child.on('error',requestStop);
      child.stdin.on('error',requestStop);
      child.once('close',async(code,signalName)=>{
        closed=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);
        const terminated=await termination;clearTimeout(cleanupTimer);
        if(failure&&terminated===false){settle(Object.assign(new Error(failure.message+'；子进程树关闭未确认，项目仍锁定'),{code:'RENDER_EXIT_UNCONFIRMED',cause:failure}));return;}
        stdout+=outDecoder.end();stderr=(stderr+errDecoder.end()).slice(-50000);
        active.delete(key);
        if(failure){settle(failure);return;}
        if(code!==0){settle(new Error('渲染未完成'+(signalName?'（'+signalName+'）':'')+'：'+stderr.slice(-1500)));return;}
        try{const value=JSON.parse(stdout.trim().split('\n').at(-1));if(!value||value.ok!==true)throw new Error('missing success receipt');settle(null,value);}
        catch{settle(new Error('渲染结果不是有效成功JSON：'+stdout.slice(-300)));}
      });
      // Cancellation can happen between the initial check and listener binding.
      if(signal?.aborted){abort();return;}
      try{child.stdin.end(JSON.stringify({project,action,times}));}catch(error){requestStop(error);}
    });
  }
  render.isActive=project=>active.has(keyFor(project));
  return render;
}

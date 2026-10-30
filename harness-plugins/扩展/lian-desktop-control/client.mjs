import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';

export class DesktopClient {
  constructor({python,root,stateDir}) {
    Object.assign(this,{python,root,stateDir});
    fs.mkdirSync(stateDir,{recursive:true});
    this.stopFile=path.join(stateDir,'pause.signal');
    this.pending=new Map();this.counter=0;this.closed=false;
  }
  start() {
    if(this.closed)throw new Error('Desktop backend disposed');
    if(this.child&&!this.child.killed)return;
    const env={...process.env,PYTHONIOENCODING:'utf-8',PYTHONUTF8:'1'};
    delete env.ELECTRON_RUN_AS_NODE;
    const child=spawn(this.python,['-u',path.join(this.root,'desktop_backend.py'),this.stopFile],{stdio:['pipe','pipe','pipe'],windowsHide:true,env});
    this.child=child;this.lastError='';
    const lines=createInterface({input:child.stdout});
    lines.on('line',line=>{
      let message;try{message=JSON.parse(line)}catch{return}
      const pending=this.pending.get(message.id);if(!pending)return;
      this.pending.delete(message.id);pending.cleanup();
      if(message.ok)pending.resolve(message.result);else pending.reject(new Error(message.error));
    });
    child.stderr.on('data',data=>{this.lastError=(this.lastError+String(data)).slice(-2000)});
    const fail=error=>{
      if(this.child===child)this.child=null;
      for(const [id,p]of this.pending){this.pending.delete(id);p.cleanup();p.reject(error)}
    };
    child.on('error',fail);
    child.stdin.on('error',fail);
    child.on('exit',(code,signal)=>fail(new Error(`Desktop backend exited (${code??signal}): ${this.lastError}`)));
  }
  pause(reason='pause') {if(reason==='plugin-unload'){if(!fs.existsSync(this.stopFile))fs.writeFileSync(this.stopFile,JSON.stringify({reason,pid:this.child?.pid??null}));}else fs.writeFileSync(this.stopFile,reason);}
  request(args,{signal,timeoutMs=20000}={}) {
    if(signal?.aborted)return Promise.reject(signal.reason??new Error('Aborted'));
    this.start();
    const id=++this.counter;
    return new Promise((resolve,reject)=>{
      const abort=()=>{
        this.pause();this.pending.delete(id);cleanup();reject(signal?.reason??new Error('Desktop request cancelled'));
      };
      const timer=setTimeout(()=>{
        this.pause();this.pending.delete(id);cleanup();
        // A blocked PrintWindow must not hold the entire plugin indefinitely.
        this.child?.kill();reject(new Error('Desktop request timed out; backend paused. Observe again after resume.'));
      },timeoutMs);
      const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort)};
      this.pending.set(id,{resolve,reject,cleanup});
      signal?.addEventListener('abort',abort,{once:true});
      this.child.stdin.write(JSON.stringify({...args,id})+'\n',error=>{
        if(error){this.pending.delete(id);cleanup();reject(error)}
      });
    });
  }
  async close() {
    this.closed=true;this.pause('plugin-unload');
    const child=this.child;if(!child)return;
    child.stdin.end();
    const timer=setTimeout(()=>child.kill(),2500);timer.unref?.();
    child.once('exit',()=>clearTimeout(timer));
  }
}

export function renderResult(_args,raw) {
  const value=JSON.parse(raw);
  const {image,...metadata}=value;
  const content=[{type:'text',text:JSON.stringify(metadata)}];
  if(image)content.push({type:'image',attachment:image});
  return content;
}

export async function attachScreenshot(attachments,result) {
  if(!result.pngBase64)return result;
  const {pngBase64,...metadata}=result;
  const image=await attachments.saveImage({data:Buffer.from(pngBase64,'base64'),mediaType:'image/png',name:'lian-desktop.png'});
  if(image.width!==metadata.width||image.height!==metadata.height) {
    throw new Error('Harness resized the screenshot; retry at a lower capture resolution before coordinate input');
  }
  return {...metadata,image};
}

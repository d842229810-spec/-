import fs from 'node:fs';
import path from 'node:path';
import {homedir} from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const sdk=path.join(path.dirname(process.execPath),'resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-tools/lib/index.js');
const {defineTool}=await import(pathToFileURL(sdk).href);
const python='C:/Users/USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
const healthFile=path.join(homedir(),'.dsh','lian-research-reader','health.json');
export const name='lian-research-reader';export const inject=['tools','attachments','skills'];
export function runReader(args,signal){return new Promise((resolve,reject)=>{
  if(signal?.aborted){reject(signal.reason);return}
  const env={...process.env,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'};delete env.ELECTRON_RUN_AS_NODE;
  const child=spawn(python,[path.join(root,'reader.py')],{env,windowsHide:true,stdio:['pipe','pipe','pipe']});
  let stdout='',stderr='',done=false;
  function finish(error,result){if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):resolve(result)}
  const abort=()=>{child.kill();finish(signal.reason??new Error('Reader cancelled'))};
  const timer=setTimeout(()=>{child.kill();finish(new Error('Reader timed out'))},110000);
  signal?.addEventListener('abort',abort,{once:true});
  child.stdout.on('data',v=>{stdout+=v.toString('utf8');if(Buffer.byteLength(stdout)>2*1024*1024){child.kill();finish(new Error('Reader output exceeded limit'))}});
  child.stderr.on('data',v=>stderr=(stderr+v.toString('utf8')).slice(-2000));
  child.on('error',e=>finish(e));child.stdin.on('error',e=>finish(e));
  child.on('exit',code=>{if(code!==0)return finish(new Error('Reader exited '+code+': '+stderr));try{finish(null,JSON.parse(stdout))}catch{finish(new Error('Reader returned invalid JSON'))}});
  child.stdin.end(JSON.stringify(args));
})}
export function apply(ctx,config={}){
  let disposed=false,current={};
  const report=()=>{if(disposed)return;fs.mkdirSync(path.dirname(healthFile),{recursive:true});fs.writeFileSync(healthFile,JSON.stringify({registered:true,plugin:name,version:'1.0.1',checkedAt:new Date().toISOString(),harnessPid:process.pid,...current},null,2))};
  ctx.effect(()=>ctx.tools.register(defineTool({name:'whale_research_read',timeoutMs:120000,
    description:'读取公开网页正文、PDF文字与页面图片、经核验的远程图片。kind为page/pdf/image。网页按start与cacheId续读，query可找正文中的词；PDF页码从1开始。403/429与验证页明确返回失败和浏览器建议；不把错误页保存成图片。不额外调用模型。',
    parameters:{kind:{type:'string',required:true,enum:['page','pdf','image']},source:{type:'string',required:true},cacheId:{type:'string'},start:{type:'integer'},limit:{type:'integer'},query:{type:'string'},page:{type:'integer'},pages:{type:'integer'},render:{type:'boolean'}},
    output:{schema:{type:'string'},render:(_a,v)=>{const {attachedImages=[],...data}=JSON.parse(v);return [{type:'text',text:JSON.stringify(data)},...attachedImages.map(attachment=>({type:'image',attachment}))]}},
    async execute(args,exec){
      const data=await runReader(args,exec.signal),attachedImages=[];
      for(const item of data.images??[]){
        try{const image=await ctx.attachments.saveImage({data:fs.readFileSync(item.path),mediaType:item.mediaType,name:path.basename(item.path)});attachedImages.push(image);item.attachmentIndex=attachedImages.length-1}
        catch(error){item.attachmentError=error.message}
      }
      current.lastCall={kind:args.kind,ok:data.ok,imageCount:attachedImages.length,httpStatus:data.httpStatus,encoding:data.encoding};report();
      return JSON.stringify({...data,privacy:args.source.startsWith('https://')?'public-source':'local-user-material',instructionAuthority:'none',attachedImages});
    }
  })));
  const skillRoot=path.join(root,'skills','lian-research-reader');
  ctx.skills.register({name:'lian-research-reader',description:'阅读中文网页、公开资料PDF和图片；遇到乱码、正文截断、错误图片、403或429时选择可靠的读取与续读方式。',source:'plugin',provider:name,path:path.join(skillRoot,'SKILL.md'),resourceBase:{kind:'directory',path:skillRoot},content:fs.readFileSync(path.join(skillRoot,'SKILL.md'),'utf8'),metadata:{},invocation:{modelInvocable:true,userInvocable:true}});
  ctx.effect(()=>{
    const timer=setTimeout(async()=>{
      try{
        let previous;try{previous=JSON.parse(fs.readFileSync(healthFile,'utf8'))}catch{}
        current.verification=previous?.verification;
        if(config.verificationId&&previous?.verification?.id!==config.verificationId){
          current.verification={id:config.verificationId,status:'running',modelCalls:0};report();
          const result=await ctx.tools.execute({name:'whale_research_read',arguments:{kind:'pdf',source:'E:/LianHome/日志/成长记录/_诺奖2026文学_授奖词.pdf',page:1,pages:1,render:true},callId:'research-pdf-native-check',signal:AbortSignal.timeout(100000)});
          const text=result.content.filter(x=>x.type==='text').map(x=>x.text).join('\n'),data=JSON.parse(text);
          Object.assign(current.verification,{status:!result.isError&&data.ok&&data.pages?.[0]?.text?.length>0&&result.content.some(x=>x.type==='image')?'passed':'failed',totalPages:data.totalPages,pageTextCharacters:data.pages?.[0]?.text?.length,imageCount:result.content.filter(x=>x.type==='image').length,reason:data.reason});
        }
      }catch(error){current.verification={...current.verification,status:'failed',reason:error.message}}report();
    },1200);timer.unref?.();const heartbeat=setInterval(report,30000);heartbeat.unref?.();return()=>{disposed=true;clearTimeout(timer);clearInterval(heartbeat)};
  });
}

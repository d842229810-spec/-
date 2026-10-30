import {buildPrompt,LIAISON_RULES} from './compact-wire.mjs';
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawn} from 'node:child_process';import {createInterface} from 'node:readline';
import {createStore} from './message-store.mjs?revision=direct-reply-v1';
export const ROOT='E:/CenHome/通信';
export const WORK='E:/CenHome';
import {resolveCodexExecutable} from './codex-runtime.mjs';
export const EXE=resolveCodexExecutable();
export function createLiaison({root=ROOT,work=WORK,exe,spawnProcess=spawn}={}){
 const currentExe=()=>exe??resolveCodexExecutable();
 const store=createStore(root),stateFile=path.join(root,'connection.json'),lockFile=path.join(root,'active.lock');let queue=Promise.resolve(),closed=false,child;
 const load=()=>{try{return JSON.parse(fs.readFileSync(stateFile,'utf8'))}catch(e){if(e.code==='ENOENT')return {threadId:null};throw e}};
 const state=v=>{const p=stateFile+'.tmp';fs.writeFileSync(p,JSON.stringify(v,null,2));fs.renameSync(p,stateFile)};
 const attemptFile=id=>path.join(root,id+'.attempt.json');
 const attempt=id=>{try{return JSON.parse(fs.readFileSync(attemptFile(id),'utf8'))}catch(e){if(e.code==='ENOENT')return null;throw e}};
 function persistAttempt(id,v){fs.writeFileSync(attemptFile(id),JSON.stringify(v,null,2))}
 function get(id){return {...store.get(id),attempt:attempt(id)}}
 function status(){return {transport:'codex-cli-json-stdio',installed:!!currentExe()&&fs.existsSync(currentExe()),workspace:work,root,connection:load(),busy:fs.existsSync(lockFile),idleModelCalls:0,automaticPolling:false,standaloneFromOwnerChat:true}}
 async function run(id){
  const v=get(id);if(v.reply)return v;
  const prompt=buildPrompt(v.request);
  const resolvedExe=currentExe();if(!resolvedExe||!fs.existsSync(resolvedExe))throw Error('Codex executable unavailable; no model request started');
  if(v.attempt && v.attempt.state!=='not-delivered') return v; // Delivery uncertain/failed is never silently resubmitted.
  if(closed)throw Error('Plugin closed');
  const connection=load(); // Validate state before taking the process lock.
  let fd;
  try{fd=fs.openSync(lockFile,'wx')}catch(e){if(e.code==='EEXIST')throw Error('Codex联络正在处理其他消息；稍后用同一requestKey再提交，不重复生成问题。');throw e}
  let events,deadline;const begun=new Date().toISOString();let actualThread=connection.threadId,usage=null,lastMessage='',complete=false,error=null,turnStarted=false;
  try{
   fs.writeFileSync(fd,JSON.stringify({pid:process.pid,id,begun}));
   const args=['-a','never','exec','--ignore-user-config','--skip-git-repo-check','--json','-s','workspace-write','-C',work,'-m',connection.model??'gpt-6-astra','-c','model_reasoning_effort='+JSON.stringify(connection.effort??'low')];
   args.push('-c','features.shell_tool=false','-c','web_search="disabled"',
    '-c','windows.sandbox="elevated"',
    '-c','mcp_servers.dragon_home.tools.home.approval_mode="approve"',
    '-c','mcp_servers.dragon_home.tools.lian_mail.approval_mode="approve"',
    '-c','sandbox_mode="workspace-write"',
    '-c','developer_instructions='+JSON.stringify(LIAISON_RULES),
    '-c','model_provider="liaison_http"','-c','model_providers.liaison_http.name="OpenAI ChatGPT liaison"',
    '-c','model_providers.liaison_http.base_url="https://chatgpt.com/backend-api/codex"','-c','model_providers.liaison_http.supports_websockets=false',
    '-c','model_providers.liaison_http.requires_openai_auth=true','-c','model_providers.liaison_http.stream_max_retries=0','-c','model_providers.liaison_http.request_max_retries=0',
    '-c','mcp_servers.dragon_home.command='+JSON.stringify('E:/DSH/本体/resources/runtime/primary-runtime/dependencies/node/bin/node.exe'),
    '-c','mcp_servers.dragon_home.args='+JSON.stringify([path.join(path.dirname(fileURLToPath(import.meta.url)),'home-mcp.mjs').replaceAll('\\','/')]));
   args.push('-c','mcp_servers.cen_memory.tools.memory.approval_mode="approve"','-c','mcp_servers.cen_media.tools.video_read.approval_mode="approve"','-c','mcp_servers.cen_media.tools.review_notes.approval_mode="approve"');
   args.push('-c','mcp_servers.cen_memory.command='+JSON.stringify('C:/Users/USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'),'-c','mcp_servers.cen_memory.args='+JSON.stringify(['E:/CenHome/项目/岑的记忆与通信精简-20261029/plugin/server.mjs']));
   args.push('-c','mcp_servers.cen_media.command='+JSON.stringify('C:/Users/USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'),'-c','mcp_servers.cen_media.args='+JSON.stringify(['E:/CenHome/项目/岑的视频阅读与协作-20261029/plugin/server.mjs']),'-c','mcp_servers.cen_media.tool_timeout_sec=600');
   if(actualThread)args.push('resume',actualThread,'-');else args.push('-');
   persistAttempt(id,{state:'starting',at:begun,threadId:actualThread,requestId:id});
   if(v.attempt?.state==='not-delivered'&&fs.existsSync(path.join(root,id+'.events.jsonl')))fs.renameSync(path.join(root,id+'.events.jsonl'),path.join(root,id+'.events.before-retry-'+Date.now()+'.jsonl'));
   events=fs.createWriteStream(path.join(root,id+'.events.jsonl'),{flags:'wx'});
   events.on('error',e=>{error='本地通信记录写入失败：'+e.message;child?.kill()});
   const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
   child=spawnProcess(resolvedExe,args,{cwd:work,env,windowsHide:true,stdio:['pipe','pipe','pipe']});
   let stderr='';child.stderr.on('data',x=>{stderr=(stderr+String(x)).slice(-4000)});
   const lines=createInterface({input:child.stdout});
   lines.on('line',line=>{
    let e;try{e=JSON.parse(line)}catch{return}events.write(JSON.stringify(e)+'\n');
    try{if(e.type==='thread.started'){
     actualThread=e.thread_id;state({...connection,threadId:actualThread,updatedAt:new Date().toISOString()});
     persistAttempt(id,{state:'submitted',at:begun,threadId:actualThread,requestId:id});
    }
    if(e.type==='item.completed'&&e.item?.type==='agent_message')lastMessage=e.item.text??'';
    if(e.type==='turn.started')turnStarted=true;
    if(e.type==='turn.completed'){complete=true;usage=e.usage??null}
    if(e.type==='turn.failed'||e.type==='error')error=e.error?.message??e.message??JSON.stringify(e);
    }catch(err){error='本地联络状态保存失败：'+err.message;child?.kill()}
   });
   deadline=setTimeout(()=>{error='TIMEOUT: delivery unknown; inspect saved events before retry';child?.kill()},480000);

   fs.writeFileSync(path.join(root,id+'.wire.json'),JSON.stringify({schemaVersion:1,requestId:id,bodyChars:v.request.body.length,promptChars:prompt.length,automaticRecentContextChars:0,resumed:!!connection.threadId,at:begun},null,2));
   child.stdin.on('error',()=>{});child.stdin.end(prompt);
   const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve)});
   if(code!==0||!complete||!lastMessage)throw Error(error??`Codex未完成回复(code=${code})；${stderr.slice(-1000)}`);
   store.reply({id,body:lastMessage,producer:'codex-cli:'+actualThread});
   persistAttempt(id,{state:'completed',at:begun,completedAt:new Date().toISOString(),threadId:actualThread,usage,requestId:id});
   return get(id);
  }catch(e){persistAttempt(id,{state:(!turnStarted&&/already has an active writer|thread-store conflict/.test(e.message))?'not-delivered':'delivery-unknown',at:begun,threadId:actualThread,error:e.message,usage,requestId:id});return get(id)}
  finally{clearTimeout(deadline);events?.end();child=null;if(fd!==undefined){fs.closeSync(fd);if(fs.existsSync(lockFile))fs.unlinkSync(lockFile)}}
 }
 function ask(a){const request=store.send(a);const pending=queue.then(()=>run(request.id));queue=pending.catch(()=>{});return pending}
 function retry(id){const v=get(id);if(v.reply)return Promise.resolve(v);if(v.attempt?.state!=='not-delivered')throw Error('仅可恢复已确认未投递的信件；未知投递不重发。');const p=queue.then(()=>run(id));queue=p.catch(()=>{});return p}
 return {ask,retry,get,status,pending:store.pending,close(){closed=true;child?.kill()}};
}

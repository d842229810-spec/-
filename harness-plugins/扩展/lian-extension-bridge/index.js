import {findCapabilities} from './capability-navigator.mjs';
const PLUGIN_VERSION=JSON.parse(fs.readFileSync(new URL('./package.json',import.meta.url),'utf8')).version;
import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {memoryRequest,searchMemory,serviceRoot,syncPublicKnowledge} from './memory.mjs';
const sdk=path.join(path.dirname(process.execPath),'resources/app.asar/dsh/node_modules/@deepseek-ai');
const {defineTool}=await import(pathToFileURL(path.join(sdk,'dsh-tools/lib/index.js')).href);
export const name='lian-extension-bridge';export const inject=['tools'];
export async function apply(ctx,config={}){
  let child,disposed=false,ready=false,booting=false,memoryError,mirror={};
  const healthFile=config.healthFile??'E:/DSH/涟的探索/扩展组件验收.json';
  const names=()=>ctx.tools.schemas().map(t=>t.name);
  function report(){const all=names();const plugins=[...(ctx.loader?.entries?.()??[])].filter(e=>/^(reme-memory|oh-story|archify-skill-filesystem|answer-me-with-html-skill|better-sidebar|cost-meter|tongflow|dsh-dafeiyu|lian-extension-bridge|lian-bili-perception|dafeiyu-life|qq-bridge|lian-creation-handbooks|lian-desktop-control|lian-research-reader|lian-video-studio|lian-creative-workbench|lian-opendesign-mcp|lian-blender-mcp)$/.test(e.options?.id??'')).map(e=>({id:e.options.id,name:e.options.name,disabled:e.disabled,state:e.fiber?.state,error:e.fiber?._error?String(e.fiber._error.message??e.fiber._error):undefined}));const value={pluginVersion:PLUGIN_VERSION,checkedAt:new Date().toISOString(),profile:config.stage?'stage':'desktop',pid:process.pid,ready,memoryError,mirror,plugins,tools:{count:all.length,reme:all.filter(n=>n==='reme_search'),story:all.filter(n=>/oh_story|ohstory|story_|drama|video_recap/.test(n)),tongflow:all.filter(n=>n.startsWith('tongflow_')),perception:all.filter(n=>n==='whale_bili_perceive'),desktop:all.filter(n=>n.startsWith('whale_desktop_')),creation:all.filter(n=>n.startsWith('whale_creation_')),research:all.filter(n=>n==='whale_research_read'),video:all.filter(n=>n.startsWith('whale_video_')||n==='whale_media_assets'||n==='whale_creative_review'),bridge:all.filter(n=>n.startsWith('whale_extension_')||n==='whale_memory_search')},outputRulesModified:false};fs.mkdirSync(path.dirname(healthFile),{recursive:true});fs.writeFileSync(healthFile,JSON.stringify(value,null,2));return value}
  function register(name,description,parameters,execute){ctx.effect(()=>ctx.tools.register(defineTool({name,description,parameters,output:{schema:{type:'string'},render:(_a,v)=>[{type:'text',text:v}]},async execute(args,exec){return JSON.stringify(await execute(args,exec))}})))}
  register('whale_capability_find','按目的找现有工具、少量例子和实际注册状态；不调用模型，不加载完整工具手册。',{query:{type:'string',required:true},limit:{type:'integer'}},a=>findCapabilities(a.query,{host:'lian',registered:names(),limit:a.limit}));
  register('whale_extension_status','查看新扩展的实际工具注册、本地记忆服务与知识同步状态；不调用付费模型。',{},()=>report());
  register('whale_memory_search','检索ReMe中的公开长期知识，保留来源。纯本地BM25，不额外调用模型。',{query:{type:'string',required:true},limit:{type:'integer'}},(a,exec)=>searchMemory(a.query,{limit:a.limit,signal:exec.signal}));
  async function boot(){
    if(booting||disposed)return;booting=true;
    try{const origin=ctx.get('webServer')?.getOrigin?.();if(origin){const u=new URL(origin);if(['127.0.0.1','localhost','[::1]'].includes(u.hostname))fs.writeFileSync(path.join(serviceRoot,'allowed-ui-origins.json'),JSON.stringify({origins:[u.origin],source:'Harness webServer.getOrigin()'}));}mirror=syncPublicKnowledge();try{await memoryRequest('health_check');ready=true}catch{
      if(disposed)return;const out=fs.openSync(path.join(serviceRoot,'service.out.log'),'a'),err=fs.openSync(path.join(serviceRoot,'service.err.log'),'a');
      child=spawn(path.join(serviceRoot,'.venv/Scripts/python.exe'),[path.join(serviceRoot,'serve.py')],{cwd:serviceRoot,windowsHide:true,stdio:['ignore',out,err],env:{...process.env,PYTHONUTF8:'1',OTEL_SDK_DISABLED:'true',AGENTSCOPE_TELEMETRY_ENABLED:'false'}});fs.closeSync(out);fs.closeSync(err);child.on('error',e=>{memoryError=String(e.message);report()});
      for(let i=0;i<20&&!disposed;i++){await new Promise(r=>setTimeout(r,500));try{await memoryRequest('health_check');ready=true;break}catch{}}
    }if(!ready)memoryError='本地ReMe未就绪';else memoryError=undefined;}catch(e){ready=false;memoryError=String(e.message)}finally{booting=false}if(!disposed)report();
  }
  const timer=setInterval(async()=>{if(booting||disposed)return;try{mirror=syncPublicKnowledge();await memoryRequest('health_check');ready=true;memoryError=undefined}catch(e){ready=false;memoryError=String(e.message);if(!child?.pid||child.exitCode!==null)void boot()}if(!disposed)report()},30000);timer.unref?.();
  const changed=()=>{if(!disposed)try{report()}catch{}};ctx.on('tools/change',changed);
  ctx.effect(()=>()=>{disposed=true;clearInterval(timer);if(child?.pid&&!child.killed){if(process.platform==='win32'){const stop=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});stop.on('error',()=>{})}else child.kill()}});
  setTimeout(()=>void boot(),0).unref?.();
  ctx.logger.info('涟扩展桥已加载；本地记忆与公开知识同步，不改动对外输出规则。');
}

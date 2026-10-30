import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {runProcess,mediaBinary} from './media.mjs';
const python='E:/DSH/插件/dafeiyu-toolbox/.venv/Scripts/python.exe';
export async function capabilityStatus(store,{tools,owner,signal}={}){
  const checks=await Promise.allSettled([
    runProcess(mediaBinary('ffmpeg'),['-version'],{signal,timeoutMs:5000}),
    runProcess(mediaBinary('ffprobe'),['-version'],{signal,timeoutMs:5000}),
    runProcess(python,['-c',"import importlib.metadata as m,json; print(json.dumps({n:m.version(n) for n in ['edge-tts','mcp','ff-toolkit']}))"],{signal,timeoutMs:10000}),
  ]);
  const binary=(r)=>r.status==='fulfilled'?{available:true,version:r.value.stdout.split(/\r?\n/)[0].slice(0,140)}:{available:false,reason:String(r.reason?.message??r.reason).slice(0,180)};
  const names=tools?.schemas?.(owner)?.map(t=>t.name)??null;
  const count=prefix=>names===null?null:names.filter(n=>n.startsWith(prefix)).length;
  const read=name=>{try{return JSON.parse(fs.readFileSync(path.join(store.root,name),'utf8'));}catch{return null;}};
  const model=read('验收结果.json'),browser=read('浏览器验收结果.json');
  let speechState=null;try{speechState=JSON.parse(fs.readFileSync('E:/DSH/大肥鱼创作室/配音/配音组件状态.json','utf8'));}catch{}
  const pluginVersion=JSON.parse(fs.readFileSync(path.join(import.meta.dirname,'..','package.json'),'utf8')).version;
  const runtimeHealth=(relative,select)=>{try{const h=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.dsh',relative),'utf8'));const age=Date.now()-Date.parse(h.checkedAt);return {checkedAt:h.checkedAt,ageSeconds:Number.isFinite(age)?Math.round(age/1000):null,stale:!Number.isFinite(age)||age>120000,...select(h)};}catch(error){return {available:false,reason:error.code??error.message}}};
  return {checkedAt:new Date().toISOString(),privacy:'private',instructionAuthority:'none',pluginVersion,
    runtime:store.status(),ownerConnected:!!owner,
    components:{ffmpeg:binary(checks[0]),ffprobe:binary(checks[1]),
      pythonLibraries:checks[2].status==='fulfilled'?{available:true,versions:JSON.parse(checks[2].value.stdout)}:{available:false},
      browser:{registeredTools:count('mcp__dafeiyu_browser__'),lastReadOnlyVerification:browser?.status??'not-tested',verifiedAt:browser?.finishedAt??null},
      bilibili:{registeredTools:count('whale_bili_'),mode:store.config.bilibiliCommentsEnabled?'reading-and-comments-enabled':'reading',commentsEnabled:!!store.config.bilibiliCommentsEnabled,perceptionToolRegistered:names?.includes('whale_bili_perceive')??null,upstream:'moxingovo/dsh-bilibili@0.2.4 + CZX2244/dsh-bilibili@0.8.0-adapted',lastVerification:read('B站阅读验收.json')},
      narration:{registeredTools:count('mcp__dafeiyu_tts__'),lastOnlineSynthesis:speechState?.online??{status:'not-tested'},lastOfflineSynthesis:speechState?.offline??{status:'not-tested'}},
      editing:{registeredTools:count('mcp__dafeiyu_ffkit__')},
      desktop:runtimeHealth('lian-desktop-control/health.json',h=>({registeredTools:count('whale_desktop_'),skillActive:h.skillActive,paused:h.backend?.paused,heldKeys:h.backend?.heldKeys,heldButtons:h.backend?.heldButtons,nativeProbe:h.nativeProbe})),
      creationHandbooks:runtimeHealth('lian-creation-handbooks-health.json',h=>({version:h.version,active:h.activeFromPlugin,visibleEntries:h.visibleEntries})),
      qq:runtimeHealth('qq-bridge-health.json',h=>({enabled:h.enabled,phase:h.phase,backendOnline:h.backend?.ok})),
      videoPerception:runtimeHealth('lian-bili-perception-health.json',h=>({registered:h.registered,version:h.version,verification:h.verification})),
      researchReader:runtimeHealth('lian-research-reader/health.json',h=>({registered:h.registered,version:h.version,verification:h.verification})),
      localAsr:{runtimeInstalled:fs.existsSync('E:/DSH/插件/local-asr/.venv/Lib/site-packages/faster_whisper'),modelPresent:fs.existsSync(path.join(os.homedir(),'.dsh/asr-models/faster-whisper-medium/model.bin')),route:'whale_bili_perceive transcribe:true'},
      seedance:{registeredTools:count('mcp__dafeiyu_seedance__'),status:'api-retired-by-user',route:'authorized-browser-account',browserGenerationVerified:false},
      model:{lastToolRoundTrip:model?.status??'not-tested',verifiedAt:model?.finishedAt??null},
      extensions:read('扩展组件验收.json')},
    notice:'安装、注册、配置、实际成功是不同状态；本检查不调用付费生成，不读取凭据值到输出，不发布内容。'};
}

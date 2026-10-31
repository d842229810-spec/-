import {codeIdentity,verificationEvidence,stampVerification,hostVersions} from '../../lian-shared/health-evidence.mjs';
import {overviewTool} from './overview-tool.mjs';
import {registerListening} from './listening-notebook.mjs?revision=20261029-v2';
import {hearingProbe} from './hearing-probe.mjs';
import {registerQuality} from './quality-tools.mjs?revision=20261027-growth1';
import {qualityProbe} from './quality-probe.mjs?revision=20261026-v4';
import fs from 'node:fs';import path from 'node:path';import {homedir} from 'node:os';import {fileURLToPath,pathToFileURL} from 'node:url';
import {RUNTIME,PROJECTS,readRegistry,searchAssets,bundleAssets} from './library.mjs';
import {createProject,renderProject,inspectVideo} from './production.mjs?revision=20261029-reliability1';import {prepareReview,checkReview} from './review.mjs';import {previewProject,closePreview} from './preview.mjs';
import {scheduleHandoff} from './handoff.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),sdk=path.join(path.dirname(process.execPath),'resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-tools/lib/index.js');
const {defineTool}=await import(pathToFileURL(sdk).href);
export const name='lian-video-studio';export const inject=['tools','attachments','skills'];
const official=['remotion-best-practices','remotion-create','remotion-markup','remotion-render','remotion-captions','remotion-multimedia','remotion-interactivity','remotion-studio'];
const custom=['lian-remotion-production','lian-script-film-review','lian-media-library','lian-audio-proofread','lian-hearing','lian-reference-study','lian-video-motion-perception'];
export function readReference(topic,file='SKILL.md'){
 if(!official.includes(topic))throw new Error('请选择已接入的Remotion官方技能');
 if(file==='REFERENCE.md')file='SKILL.md';
 const dir=fs.realpathSync(path.join(RUNTIME,'official-skills/skills',topic)),target=fs.realpathSync(path.resolve(dir,file));
 if(!target.startsWith(dir+path.sep)||!target.endsWith('.md'))throw new Error('仅支持当前技能目录内的Markdown');
 const text=fs.readFileSync(target,'utf8');if(text.length>100000)throw new Error('文档较大，请选择具体章节文件');return {topic,file,text};
}
export function apply(ctx,config={}){
 ctx.effect(()=>scheduleHandoff(ctx,config));
 ctx.effect(()=>qualityProbe(ctx,config));
 ctx.effect(()=>hearingProbe(ctx,config));
 const identity=codeIdentity(import.meta.url,{version:'1.5.3-lian.1',extraFiles:[path.join(root,'audio-compare.py'),path.join(root,'acoustic_metrics.py'),path.join(RUNTIME,'render.mjs'),path.join(RUNTIME,'render-job.mjs'),path.join(RUNTIME,'atomic-output.mjs'),'E:/DSH/插件/local-asr/transcribe.py'],dependencies:{remotion:JSON.parse(fs.readFileSync(path.join(RUNTIME,'node_modules/remotion/package.json'),'utf8')).version,...hostVersions()}});let verification,closed=false;const healthFile=path.join(homedir(),'.dsh/lian-video-studio-health.json');
 for(const skill of [...custom,...official]){
  const dir=custom.includes(skill)?path.join(root,'skills',skill):path.join(RUNTIME,'official-skills/skills',skill),file=path.join(dir,'SKILL.md'),content=fs.readFileSync(file,'utf8');
  const description=custom.includes(skill)?content.match(/^description:\s*(.*)$/m)?.[1]:'Remotion官方'+skill+'技能；在小涟固定环境使用，配合lian-remotion-production和whale_video_reference读取资源。';
  ctx.skills.register({name:skill,description,source:'plugin',provider:name,path:file,resourceBase:{kind:'directory',path:dir},content:content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/,''),metadata:{},invocation:{modelInvocable:true,userInvocable:true}});
 }
 function tool(name,description,parameters,execute,withImages=false){ctx.effect(()=>ctx.tools.register(defineTool({name,description,parameters,timeoutMs:600000,output:{schema:{type:'string'},render:(_a,v)=>{const {attachedImages=[],...data}=JSON.parse(v);return [{type:'text',text:JSON.stringify(data)},...(withImages?attachedImages.map(x=>({type:'image',attachment:x})):[])]}},async execute(args,exec){return JSON.stringify(await execute(args,exec))}})));}
 registerQuality(tool,ctx);
 registerListening(tool);
 async function status(){const catalog=await ctx.skills.list({cwd:'E:/LianHome'}),registry=readRegistry();const value={plugin:name,version:'1.5.3-lian.1',registered:true,harnessPid:process.pid,checkedAt:new Date().toISOString(),observedAt:new Date().toISOString(),code:identity,runtime:RUNTIME,remotion:JSON.parse(fs.readFileSync(path.join(RUNTIME,'node_modules/remotion/package.json'),'utf8')).version,projects:PROJECTS,skills:[...custom,...official].map(n=>({name:n,visible:catalog.some(s=>s.name===n)})),assets:{images:registry.assets.filter(a=>a.kind==='image').length,audio:registry.assets.filter(a=>a.kind==='audio').length,defaults:registry.defaults},tools:['whale_listening','whale_watch_video','whale_film_study','whale_hear','whale_audio_check','whale_film_evidence','whale_video_status','whale_video_project','whale_video_render','whale_video_reference','whale_media_assets','whale_creative_review'],verification:verificationEvidence(verification,identity),modelCallsByPlugin:0};if(!closed)fs.writeFileSync(healthFile,JSON.stringify(value,null,2));return value;}
 tool('whale_video_status','查看视频工作台的实际Remotion版本、素材库、技能和本地验收；不调用付费模型。',{},status);
 tool('whale_video_project','创建Remotion代码视频项目，原作品不会被覆盖。新项目自带可编辑模板、同一角色和声音参考。',{action:{type:'string',enum:['create'],required:true},name:{type:'string',required:true}},a=>createProject(a.name));
 tool('whale_media_assets','检索角色/动作/声音素材，或把选定参考复制到当前Remotion项目；bundle只准备本地参考，不自动上传或绑定Updream。',{action:{type:'string',enum:['search','bundle'],required:true},query:{type:'string'},kind:{type:'string',enum:['image','audio']},style:{type:'string'},limit:{type:'integer'},project:{type:'string'},ids:{type:'array',items:{type:'string'}},includeVoice:{type:'boolean'}},a=>a.action==='search'?searchAssets(a):bundleAssets(a.project,a.ids,{includeVoice:a.includeVoice??true}));
 tool('whale_creative_review','为当前脚本/成片生成带版本哈希的证据审稿表，或核对填写完整性、引文及版本。只核对记录，不自动评判审美。',{action:{type:'string',enum:['prepare','check'],required:true},project:{type:'string',required:true},stage:{type:'string',enum:['script','film']},report:{type:'string'}},a=>a.action==='prepare'?prepareReview(a.project,a.stage):checkReview(a.project,a.report));
 tool('whale_video_reference','按需读取已接入的Remotion官方技能及Markdown参考文档，topic为remotion-create等技能名，file默认SKILL.md。',{topic:{type:'string',enum:official,required:true},file:{type:'string'}},a=>readReference(a.topic,a.file));
 tool('whale_video_render','本地Remotion渲染、实际单帧图片、技术检查和可视时间轴。render导出H264/AAC；frames返回实际图片；technical检查音量黑帧与字幕时间；preview启动Studio；close-preview关闭本插件启动的预览。overview为明确本地视频创建带sourceHash、analysisId和绝对时码的采样宫格；同action传analysisId+cellId回查原帧。无ASR、无云调用、无后台陪看，宫格不等于连续看完。',{action:{type:'string',enum:['render','frames','technical','preview','close-preview','overview'],required:true},project:{type:'string'},times:{type:'array',items:{type:'number'}},file:{type:'string',description:'overview首次传明确的授权本地视频路径；不自动查找'},start:{type:'number'},end:{type:'number'},cells:{type:'integer'},sceneAware:{type:'boolean'},analysisId:{type:'string',description:'overview回查时使用先前返回的不可变分析ID'},cellId:{type:'integer',description:'同一analysisId中的格号，返回独立原帧和局部细看参数'}},async(a,exec)=>{
  if(a.action==='overview')return overviewTool(a,exec,ctx);
  if(a.action==='close-preview')return closePreview();if(a.action==='preview')return previewProject(a.project);if(a.action==='technical')return inspectVideo(a.project,{signal:exec.signal});
  const result=await renderProject(a.project,{action:a.action,times:a.times,signal:exec.signal});
  if(a.action==='frames'){result.attachedImages=[];for(const f of result.images){result.attachedImages.push(await ctx.attachments.saveImage({data:fs.readFileSync(f.path),mediaType:'image/png',name:path.basename(f.path)}));}}
  return result;
 },true);
 ctx.effect(()=>{let busy=false;const check=async()=>{if(busy||closed)return;busy=true;try{
  if(config.fixtureProject&&config.verificationId){let previous;try{previous=JSON.parse(fs.readFileSync(healthFile,'utf8')).verification}catch{}
   if(previous?.id===config.verificationId)verification=previous;
   else{verification={id:config.verificationId,status:'running'};await status();const result=await ctx.tools.execute({name:'whale_video_render',arguments:{action:'frames',project:config.fixtureProject,times:[3.5]},callId:'video-studio-image-probe',signal:AbortSignal.timeout(120000)});const technical=await inspectVideo(config.fixtureProject);verification=stampVerification({id:config.verificationId,status:!result.isError&&result.content?.filter(x=>x.type==='image').length===1&&technical.technicalPassed?'passed':'failed',nativeImageCount:result.content?.filter(x=>x.type==='image').length,technical,modelCalls:0},identity);}
  }await status();
 }catch(e){verification={id:config.verificationId,status:'failed',error:e.message};await status().catch(()=>{})}finally{busy=false}};
 const timer=setTimeout(()=>void check(),1500);timer.unref?.();const beat=setInterval(()=>void check(),30000);beat.unref?.();return()=>{closed=true;clearTimeout(timer);clearInterval(beat);closePreview()};});
 ctx.logger.info('涟的视频工作台已加载：本地Remotion、素材参考库与证据审片。');
}

import {sourceCatalog} from './source-catalog.mjs';
import {readLocalEvidence} from './local-evidence.mjs';
import {codeIdentity,verificationEvidence,stampVerification,hostVersions} from '../../lian-shared/health-evidence.mjs';
import {audioStatus} from '../lian-video-studio/audio-proof.mjs';
import {mediaBinary} from '../../dafeiyu-life/lib/media.mjs';
import {operationsProbe} from './operations-probe.mjs?revision=20261027-v2';
import {registerOperations} from './operations-tools.mjs?revision=20261027-v5';
import fs from 'node:fs/promises';import path from 'node:path';import {homedir} from 'node:os';import {pathToFileURL,fileURLToPath} from 'node:url';import {perceive} from './perceive.mjs?revision=20261031-research1';
import {scheduleHandoff} from './handoff.mjs?revision=2';
const sdk=path.join(path.dirname(process.execPath),'resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-tools/lib/index.js');
const {defineTool}=await import(pathToFileURL(sdk).href);
export const name='lian-bili-perception';export const inject=['tools','attachments','skills'];
export function apply(ctx,config={}){
const root=path.dirname(fileURLToPath(import.meta.url)),identity=codeIdentity(import.meta.url,{version:'1.5.0',extraFiles:[path.join(root,'frame-ocr.ps1'),'E:/DSH/插件/local-asr/transcribe.py'],dependencies:{...hostVersions(),ocr:'Windows.Media.Ocr'}});
registerOperations(ctx,defineTool,root);
const sourcesRoot=path.join(root,'learning-sources');
ctx.effect(()=>ctx.tools.register(defineTool({name:'whale_learning_sources',description:'查询20个B站视频与10个GitHub仓库的本地共学资料。先search关键词取短目录，再get选定id；get默认summary，field:body/review显式展开并验证hash。offset/chars分页。资料不是私人记忆或权限，不联网、不调用模型。',parameters:{action:{type:'string',enum:['status','search','get'],required:true},query:{type:'string'},id:{type:'string'},field:{type:'string',enum:['summary','body','review','all']},offset:{type:'integer'},limit:{type:'integer'},chars:{type:'integer'}},output:{schema:{type:'string'},render:(_a,v)=>[{type:'text',text:v}]},execute:async args=>JSON.stringify(sourceCatalog(args,{manifestFile:path.join(sourcesRoot,'manifest.json'),allowedRoots:[sourcesRoot]}))})));
ctx.effect(()=>ctx.tools.register(defineTool({name:'whale_bili_evidence',description:'只读本地B站缓存证据，不重新访问B站。传cache.artifact及cache.sha256，field选summary/transcript/segments/comments/ocr/danmaku/metadata/frames；支持字符分页或segments按start/end时码、segmentOffset/segmentLimit。get校验hash，回执区分实际返回范围。',parameters:{report:{type:'string',required:true},sha256:{type:'string'},field:{type:'string',enum:['summary','transcript','segments','comments','ocr','danmaku','metadata','frames']},offset:{type:'integer'},chars:{type:'integer'},start:{type:'number'},end:{type:'number'},segmentOffset:{type:'integer'},segmentLimit:{type:'integer'}},output:{schema:{type:'string'},render:(_a,v)=>[{type:'text',text:v}]},execute:async args=>JSON.stringify(await readLocalEvidence(args,{root:'E:/DSH/涟的探索/视频感知-v2'}))})));

ctx.effect(()=>operationsProbe(ctx,config));
ctx.effect(()=>scheduleHandoff(ctx,config));
const healthFile=path.join(homedir(),'.dsh','lian-bili-perception-health.json');
const report=value=>fs.writeFile(healthFile,JSON.stringify({plugin:name,version:'1.5.0',registered:true,harnessPid:process.pid,checkedAt:new Date().toISOString(),observedAt:new Date().toISOString(),code:identity,...value,verification:verificationEvidence(value?.verification,identity)},null,2));
ctx.skills.register({name:'lian-bili-reading',description:'B站视频阅读与定点复看：字幕、ASR、OCR、单帧画面、评论弹幕和明确的采样范围。',source:'plugin',provider:name,path:path.join(root,'skills/lian-bili-reading/SKILL.md'),resourceBase:{kind:'directory',path:path.join(root,'skills/lian-bili-reading')},content:awaitSkill(),metadata:{},invocation:{modelInvocable:true,userInvocable:true}});
function awaitSkill(){return skillText;}
ctx.effect(()=>ctx.tools.register(defineTool({name:'whale_bili_status',description:'查看B站读取插件版本、ffmpeg、本地ASR和OCR路线，不访问B站或调用模型。',parameters:{},output:{schema:{type:'string'},render:(_a,v)=>[{type:'text',text:v}]},execute:async()=>JSON.stringify({version:'1.5.0',tool:'whale_bili_perceive',ocr:'Windows.Media.Ocr',cacheMinutes:30,range:true,multipart:true,independentModelCalls:0,asr:audioStatus(),ffmpeg:{path:mediaBinary('ffmpeg'),exists:await fs.access(mediaBinary('ffmpeg')).then(()=>true,()=>false),scope:'executable-exists-not-inference'},statusScope:'local-dependencies-no-model-load'})})));
ctx.effect(()=>ctx.tools.register(defineTool({name:'whale_bili_perceive',timeoutMs:600000,description:'读取B站视频文稿、评论、弹幕与实际关键帧图片，按视频长度选择3至20帧。字幕先检查身份与时长，异常尝试另一读取端点；transcribe:true会跳过现成字幕，在本机用Whisper从原音频识别，适合字幕主题不符时纠正，不额外调用付费模型。本机转写优先复用已有GPU；不可用时自动回退CPU，并在回执说明。默认字幕缺失时尝试本地ASR，再用Windows OCR补读画面文字；mode:text关闭画面和OCR，maxFrames不能覆盖它，冲突回执会给mode:full重试参数。默认文字有界预览，按pagination.text.nextOffset/评论nextOffset分页；detail:full显式取完整回执，完整原始证据始终留在cache.artifact。支持page或?p=2分P、start/end定点复看、maxFrames帧数、ocr和refresh。结果缓存30分钟；acquisitionStatus与coverageStatus分别说明取回和文稿覆盖，空转写为未知，证据文件可用whale_bili_evidence分页读取。返回采样覆盖范围。可传timestamps细读关键位置。',parameters:{url:{type:'string',required:true},page:{type:'integer'},start:{type:'number'},end:{type:'number'},maxFrames:{type:'integer'},mode:{type:'string',enum:['full','text']},ocr:{type:'boolean'},refresh:{type:'boolean'},timestamps:{type:'array',items:{type:'number'}},frames:{type:'boolean'},audio:{type:'boolean',description:'可选保存原始音轨，供whale_hear按需听；默认false，文件存在不等于听过'},transcribe:{type:'boolean'},detail:{type:'string',enum:['summary','full']},textOffset:{type:'integer'},textLimit:{type:'integer'},commentOffset:{type:'integer'},commentLimit:{type:'integer'}},output:{schema:{type:'string'},render:(_a,v)=>{const {attachedImages=[],...data}=JSON.parse(v);return [{type:'text',text:JSON.stringify(data)},...attachedImages.map(image=>({type:'image',attachment:image}))]}},async execute(args,exec){
  const data=await perceive(args,{signal:exec.signal}),attachedImages=[];
  for(const frame of data.frames?.frames??[]){
    if(frame.has_image&&frame.path){
      try{const image=await ctx.attachments.saveImage({data:await fs.readFile(frame.path),mediaType:'image/jpeg',name:'bili-frame-'+frame.time+'s.jpg'});attachedImages.push(image);frame.attachmentIndex=attachedImages.length-1;}
      catch(error){frame.attachmentError=error.message;}
    }
  }
  return JSON.stringify({...data,attachedImages});
}})));
ctx.effect(()=>{
  const timer=setTimeout(async()=>{
    try{
      let previous;try{previous=JSON.parse(await fs.readFile(healthFile,'utf8'))}catch{}
      if(config.localFixture&&previous?.verification?.id!==config.verificationId){
        const fixture=JSON.parse(await fs.readFile(config.localFixture,'utf8'));
        const value=await perceive({url:fixture.bvid,ocr:true,transcribe:false,refresh:true},{credential:'',root:path.join(path.dirname(config.localFixture),'local-runtime-test'),extractor:async()=>fixture});
        const refs=[];for(const frame of value.frames?.frames??[]){if(frame.has_image)refs.push(await ctx.attachments.saveImage({data:await fs.readFile(frame.path),mediaType:'image/jpeg',name:'fixture-'+frame.time+'.jpg'}));}
        const status=await ctx.tools.execute({name:'whale_bili_status',arguments:{},callId:'bili-v110-status',signal:AbortSignal.timeout(15000)});
        const verification=stampVerification({id:config.verificationId,status:refs.length===2&&value.ocr?.rows?.filter(r=>!r.error&&r.text)?.length===2&&!status.isError?'passed':'failed',kind:'local-public-video-fixture',imageCount:refs.length,ocrRows:value.ocr?.rows?.length,statusTool:status,modelCalls:0,notice:'本地真实图片、OCR与宿主附件验证，不代表本轮在线B站验证。'},identity);
        await report({verification});return;
      }
      if(config.verificationId&&previous?.verification?.id!==config.verificationId){
        const verification={id:config.verificationId,status:'running',modelCalls:0};await report({verification});
        try{
          const r=await ctx.tools.execute({name:'whale_bili_perceive',arguments:{url:'BV15jGJztEk7',frames:true,timestamps:[12,140]},callId:'bili-integrity-image-check',signal:AbortSignal.timeout(150000)});
          const data=JSON.parse(r.content.filter(x=>x.type==='text').map(x=>x.text).join('\n'));
          const imageCount=r.content.filter(x=>x.type==='image').length;
          Object.assign(verification,{status:!r.isError&&imageCount===2?'passed':'failed',bvid:data.bvid,imageCount,subtitleSource:data.transcript?.source,validation:data.transcript?.validation,subtitleNote:data.transcript?.note});
        }catch(error){Object.assign(verification,{status:'failed',error:error.message})}
        await report({verification:stampVerification(verification,identity)});
      }else await report({verification:previous?.verification});
    }catch(error){ctx.logger.warn('B站感知验收：'+error.message)}
  },1200);timer.unref?.();
  const heartbeat=setInterval(async()=>{try{const h=JSON.parse(await fs.readFile(healthFile,'utf8'));await report({verification:h.verification})}catch{}},30000);heartbeat.unref?.();
  return()=>{clearTimeout(timer);clearInterval(heartbeat)};
});
}
import {readFileSync} from 'node:fs';
const skillText=readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)),'skills/lian-bili-reading/SKILL.md'),'utf8');

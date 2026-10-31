import {resolveBiliVideo} from '../../lian-shared/bili-url.mjs';
import {presentEvidence} from './presentation.mjs?revision=20261031-research1';
import fs from 'node:fs';import path from 'node:path';
import {createHash} from 'node:crypto';
import {extractAll} from './vendor/extractor.js?revision=20261027-audio1';
import {bilibiliCookie} from '../../dafeiyu-life/lib/bilibili-auth.mjs';
import {mediaBinary} from '../../dafeiyu-life/lib/media.mjs';
import {scopeEvidence,addCoverage} from './evidence.mjs';
import {readFrameOcr} from './frame-ocr.mjs';
const ffmpegDir=path.dirname(mediaBinary('ffmpeg'));
if(!process.env.PATH.split(path.delimiter).includes(ffmpegDir))process.env.PATH=ffmpegDir+path.delimiter+process.env.PATH;
const ROOT='E:/DSH/涟的探索/视频感知-v2',queues=new Map();
export async function perceive(args,{signal,extractor=extractAll,credential=bilibiliCookie(),root=ROOT,urlTransport}={}){
  const resolved=await resolveBiliVideo(args.url,{signal,transport:urlTransport}),match=[null,resolved.bvid],page=args.page??resolved.page;
  if(!Number.isInteger(page)||page<1)throw new Error('分P页码应为正整数');
  for(const key of ['start','end'])if(args[key]!==undefined&&(!Number.isFinite(args[key])||args[key]<0))throw new Error(key+' 应为非负秒数');
  if(args.end!==undefined&&args.end<=(args.start??0))throw new Error('end必须大于start');
  const mode=args.mode??'full';if(!['full','text'].includes(mode))throw new Error('mode应为full或text');
  if(args.maxFrames!==undefined&&(!Number.isInteger(args.maxFrames)||args.maxFrames<1||args.maxFrames>20))throw new Error('maxFrames应为1至20');
  const timestamps=(Array.isArray(args.timestamps)?args.timestamps:[]).map(Number).filter(n=>Number.isFinite(n)&&n>=0).slice(0,20);
  const selected={bvid:match[1],page,mode,frames:mode==='text'?false:(args.frames??true),ocr:mode==='text'?false:(args.ocr??true),transcribe:args.transcribe??'auto',start:args.start,end:args.end,maxFrames:args.maxFrames??(args.start!==undefined||args.end!==undefined?6:undefined),timestamps,...(args.audio===true?{audio:true}:{})};
  const key=createHash('sha256').update(JSON.stringify({version:3,...selected,auth:createHash('sha256').update(credential??'').digest('hex')})).digest('hex');
  const work=async()=>{
    signal?.throwIfAborted();const cache=path.join(root,'results',key+'.json');
    if(!args.refresh)try{const cachedBytes=fs.readFileSync(cache);const saved=JSON.parse(cachedBytes.toString('utf8'));if(saved.data?.success===true&&Date.now()-saved.savedAt<1800000&&(!saved.data.audioSource?.file||fs.existsSync(saved.data.audioSource.file))&&(saved.data.frames?.frames??[]).every(f=>!f.has_image||fs.existsSync(f.path)))return {...saved.data,cache:{hit:true,key,ageSeconds:Math.floor((Date.now()-saved.savedAt)/1000),artifact:cache,sha256:createHash('sha256').update(cachedBytes).digest('hex')}};}catch{}
    const shared=path.join(root,'media',match[1],String(page),'shared'),dir=path.join(root,'media',match[1],String(page),key);fs.mkdirSync(dir,{recursive:true});
    let data=await extractor({url:'https://www.bilibili.com/video/'+match[1]+'?p='+page,page,sessdata:credential??'',commentLimit:20,extractFrames:selected.frames,maxFrames:timestamps.length||selected.maxFrames||3,adaptiveFrames:!timestamps.length&&selected.maxFrames===undefined,start:args.start,end:args.end,timestamps:timestamps.length?timestamps:undefined,framesDir:dir,mediaCacheDir:shared,downloadAudio:args.audio===true,downloadVideo:true,keepVideo:true,maxVideoMinutes:15,maxDownloadMb:120,quality:16,detectScenes:false,sharpFrames:args.start===undefined&&args.end===undefined,asrProvider:args.transcribe===false?'none':'faster-whisper-local',forceTranscribe:args.transcribe===true,refresh:!!args.refresh,visionProvider:'none',signal});
    if(selected.ocr&&data.frames?.frames?.some(f=>f.has_image))data.ocr=await readFrameOcr(data.frames.frames,path.join(root,'ocr'),{signal});
    if(data.success)data=addCoverage(scopeEvidence(data,args.start,args.end));
    data={readingRequest:{mode:selected.mode,frames:selected.frames,transcribe:args.transcribe??'auto',start:args.start??null,end:args.end??null},privacy:'public-source',instructionAuthority:'none',backend:'lian-bili-perception@1.5.0',modelCalls:0,notice:'独立帧、字幕/ASR、OCR、评论、弹幕分别标记来源；空转写不算读懂口播。局部复看可用start/end，mode:text不返回画面。',...data};
    fs.mkdirSync(path.dirname(cache),{recursive:true});const evidenceBytes=JSON.stringify({savedAt:Date.now(),data}),temporary=cache+'.tmp-'+process.pid+'-'+Date.now();try{fs.writeFileSync(temporary,evidenceBytes,{flag:'wx'});fs.renameSync(temporary,cache)}finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary)}
    return {...data,cache:{hit:false,key,artifact:cache,sha256:createHash('sha256').update(evidenceBytes).digest('hex')}};
  };
  const queueKey=match[1]+':'+page,previous=queues.get(queueKey)??Promise.resolve(),pending=previous.catch(()=>{}).then(work);queues.set(queueKey,pending);
  try{return presentEvidence(await pending,args,{source:resolved})}finally{if(queues.get(queueKey)===pending)queues.delete(queueKey)}
}

import fs from 'node:fs';import path from 'node:path';import {homedir} from 'node:os';import {fileURLToPath} from 'node:url';
import {runProcess,mediaBinary,parseCaptions} from '../../dafeiyu-life/lib/media.mjs';
import {localSource,hashMedia,hashText,CACHE,createProof,saveJSON,resultNotice} from './proof-common.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),asr='E:/DSH/插件/local-asr',python=asr+'/.venv/Scripts/python.exe',model=path.join(homedir(),'.dsh/asr-models/faster-whisper-medium');
let queue=Promise.resolve();
export function audioStatus(){return {engine:'faster-whisper-medium',device:'cpu',computeType:'int8',pythonReady:fs.existsSync(python),modelReady:fs.existsSync(path.join(model,'model.bin')),offline:true,paidModelCalls:0,notice:'本地转写与时码校对，不等于直接听觉或声音审美。'}}
export async function audioProof(args,signal){
 signal?.throwIfAborted();const file=localSource(args.file),sha256=await hashMedia(file),dir=createProof('audio');
 const probe=JSON.parse((await runProcess(mediaBinary('ffprobe'),['-v','error','-protocol_whitelist','file,pipe','-show_format','-show_streams','-of','json',file],{signal})).stdout);
 const duration=Number(probe.format?.duration),audio=probe.streams?.find(s=>s.codec_type==='audio');
 if(!Number.isFinite(duration)||duration<=0)throw Error('无法确认媒体时长');
 const start=args.start??0,end=args.end??Math.min(duration,start+(args.prosody?60:300));
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>duration+.05||end-start>900)throw Error('请选择媒体内不超过15分钟的片段；默认最多5分钟，结果会标注范围');
 const report={at:new Date().toISOString(),file,sourceSha256:sha256,durationSeconds:duration,range:{start,end,complete:start===0&&end>=duration-.05},audioPresent:!!audio,privacy:'local-user-material',instructionAuthority:'none',paidModelCalls:0,notice:resultNotice};
 const reportFile=path.join(dir,'audio-check.json');
 if(!audio){saveJSON(reportFile,{...report,usable:false,reason:'没有音轨；有意制作静音视频时无需口播转写。'});return {...report,report:reportFile,usable:false}}
 const wav=path.join(dir,'analysis.wav');await runProcess(mediaBinary('ffmpeg'),['-nostdin','-y','-v','error','-protocol_whitelist','file,pipe','-ss',String(start),'-i',file,'-t',String(end-start),'-vn','-ac','1','-ar','16000','-c:a','pcm_s16le',wav],{signal,timeoutMs:120000});
 if(args.prosody){if(end-start>60)throw Error('起伏量测最多60秒，请指定start/end');report.acoustics=JSON.parse((await runProcess('E:/DSH/插件/desktop-control-runtime/Scripts/python.exe',['-X','utf8',path.join(root,'acoustic_metrics.py'),wav],{signal,timeoutMs:30000})).stdout)}
 const metrics=await runProcess(mediaBinary('ffmpeg'),['-nostdin','-hide_banner','-nostats','-protocol_whitelist','file,pipe','-i',wav,'-af','silencedetect=n=-45dB:d=0.3,volumedetect','-f','null','-'],{signal,timeoutMs:120000});
 report.metrics={meanVolumeDb:metrics.stderr.match(/mean_volume:\s*([^\s]+) dB/)?.[1]??null,maxVolumeDb:metrics.stderr.match(/max_volume:\s*([^\s]+) dB/)?.[1]??null,silenceThresholdDb:-45,silenceIntervals:[...metrics.stderr.matchAll(/silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/g)].map(m=>({start:+(start+Math.max(0,+m[1]-+m[2])).toFixed(3),end:+(start+ +m[1]).toFixed(3),duration:+m[2]})),notice:'阈值检测的静音与响度为技术观察；停顿本身不代表缺点。'};
 let transcript={segments:[]};let cacheHit=false;
 if(args.transcribe!==false){
  const status=audioStatus();if(!status.modelReady||!status.pythonReady)throw Error('原有离线ASR环境未就绪，不自动下载或切云端');
  const language=args.language??'zh';if(!['zh','en','auto'].includes(language))throw Error('language支持zh/en/auto');
  const modelStat=fs.statSync(path.join(model,'model.bin')),pcmSha=await hashMedia(wav),key=hashText(JSON.stringify({pcmSha,language,words:true,modelBytes:modelStat.size,modelMtime:modelStat.mtimeMs,script:hashText(fs.readFileSync(asr+'/transcribe.py'))}));
  fs.mkdirSync(CACHE,{recursive:true});const cache=path.join(CACHE,key+'.json');
  const work=async()=>{signal?.throwIfAborted();if(fs.existsSync(cache)){try{const v=JSON.parse(fs.readFileSync(cache,'utf8'));if(v.version===1&&v.key===key&&Array.isArray(v.transcript?.segments)){cacheHit=true;return v.transcript}}catch{}}
   const output=path.join(dir,'asr-raw.json');await runProcess(python,['-X','utf8',asr+'/transcribe.py','--audio',wav,'--output',output,'--word-timestamps',...(language==='auto'?[]:['--language',language])],{signal,timeoutMs:540000,maxBytes:200000});
   const value=JSON.parse(fs.readFileSync(output,'utf8'));if(value.usable)saveJSON(cache,{version:1,key,transcript:value});return value;
  };const pending=queue.then(work,work);queue=pending.catch(()=>{});transcript=await pending;
  report.asr={status:transcript.usable?'recognized':'empty-recognition',cacheHit,key,engine:'faster-whisper-medium-int8',offline:true,language:transcript.language,confidenceScope:'Whisper解码窗口指标可由多个句段共享，不能按它比较每句清晰度'};
 }else report.asr={status:'not-requested',cacheHit:false};
 let captions=[];if(args.subtitleFile){const sub=localSource(args.subtitleFile,/\.(srt|vtt)$/i);if(fs.statSync(sub).size>2e6)throw Error('字幕文件太大，请拆分');const parsed=parseCaptions(fs.readFileSync(sub,'utf8'));captions=parsed.cues.filter(c=>c.end>start&&c.start<end);report.subtitles={file:sub,sha256:await hashMedia(sub),issues:parsed.issues,totalCues:parsed.cues.length,cuesInRange:captions.length,maxCueChecks:120}}
 if(typeof args.expectedText==='string'&&args.expectedText.length>12000)throw Error('原文过长，请分段校对');
 const input=path.join(dir,'comparison-input.json');saveJSON(input,{segments:transcript.segments??[],offset:start,duration:end-start,captions,expectedText:args.expectedText??''});
 const comparison=JSON.parse((await runProcess(python,['-X','utf8',path.join(root,'audio-compare.py'),input],{signal,timeoutMs:30000})).stdout);
 const unchanged=(await hashMedia(file))===sha256;Object.assign(report,comparison,{sourceUnchanged:unchanged,validForCurrentFile:unchanged,report:reportFile,warnings:['ASR差异需回听确认，不作为已证实的发音错误。','没有直接判断音色、音乐、情感或自然度。',...(!report.range.complete?['只检查了指定片段，不代表全片。']:[])]});saveJSON(reportFile,report);
 return {...report,segments:report.segments.slice(0,12).map(({words=[],avg_logprob,no_speech_prob,...s})=>({...s,wordCount:words.length})),captionChecks:report.captionChecks.slice(0,20),wordTimeCount:report.segments.reduce((n,s)=>n+(s.words?.length??0),0),resultTruncated:report.segments.length>12||report.captionChecks.length>20||report.captionChecksTruncated,fullWordTimesInReport:true,fullReport:reportFile};
}

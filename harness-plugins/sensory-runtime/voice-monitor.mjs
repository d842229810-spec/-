import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {runProcess} from '../dafeiyu-life/lib/media.mjs';
import {audioProof} from '../扩展/lian-video-studio/audio-proof.mjs';
import {hearAudio} from '../扩展/lian-video-studio/hearing.mjs';
const ROOT='E:/LianHome/工作室/声音设计/自检记录',PY='E:/DSH/插件/desktop-control-runtime/Scripts/python.exe';
const digest=x=>createHash('sha256').update(x).digest('hex');const running=new Map();
const save=(file,data)=>{const tmp=file+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(data,null,2));fs.renameSync(tmp,file)};
function source(file){const base=fs.realpathSync('E:/LianHome/工作室/声音设计'),p=fs.realpathSync(file);if(!p.toLowerCase().startsWith(base.toLowerCase()+path.sep)||!/^\.wav$/i.test(path.extname(p))||fs.statSync(p).size>200*1024**2)throw Error('请提供声音设计目录内的WAV');return p}
export function expectedVoiceText(file){const wav=source(file);try{const p=fs.realpathSync(wav.replace(/\.wav$/i,'.json')),base=fs.realpathSync('E:/LianHome/工作室/声音设计');if(!p.toLowerCase().startsWith(base.toLowerCase()+path.sep)||fs.statSync(p).size>80000)return '';const v=JSON.parse(fs.readFileSync(p,'utf8'));return typeof v.text==='string'?v.text:''}catch{return ''}}
export function monitorStatus(){return {enabled:true,policy:'每条轻量检查；首次参考、至少30秒、确定性约十分之一短句追加本地听取；同文件/原稿缓存',defaultVoiceChanged:false,paidModelCalls:0,root:ROOT,automaticRetry:false,notice:'观察不等于正确发音或审美判决；检测失败不会丢弃已生成文件或重复发送。'}}
function brief(v){if(v.deep?.alignment?.differences){let changed=false;for(const d of v.deep.alignment.differences){if(d.kind==='replace'&&/[\u3400-\u9fff]/u.test((d.expected??'')+(d.recognized??''))){d.label='转写可能不同';d.homophoneSuspect=null;d.phoneticReviewRequired=true;changed=true}}if(changed)v.deep.alignment.label='转写可能不同'}return {alignmentLevel:v.deep?.alignment?'full':'light',evidenceBoundary:'ASR与原稿文字不同≠音频念错；全文转写一致≠发音和情绪正确。',alignment:v.deep?.alignment??{label:'无法比对',reason:'无可比对文本：当前只有轻检或未完成转写'},emotionAssessed:false,status:v.deep?.complete?'observed-by-local-model':v.deep?.error?'partial':v.deep?.queued?'pending':v.deep?.requested?'incomplete':'metrics-only',sourceSha256:v.sourceSha256,expectedTextKnown:!!v.expectedText,actualSpeechVerified:false,metrics:v.metrics,reviewReasons:v.reviewReasons,transcription:v.deep?.transcription,observationCount:v.deep?.observations?.length??0,observations:v.deep?.observations?.slice(0,3).map(x=>({start:x.start,end:x.end,observation:x.observation.slice(0,350)})),error:v.deep?.error,report:v.report,cached:!!v.cached,paidModelCalls:0,notice:'知道原稿不等于证明实际发音一致；pending请稍后读取报告，不等于已听取。转写与语气观察需结合回听，未判断人类情绪。'}}
export async function monitorVoice(args,signal){
 const file=source(args.file),sha=digest(fs.readFileSync(file));if(typeof args.expectedText!=='string'||args.expectedText.length>12000)throw Error('expectedText应为12000字以内原稿，可用空字符串标未知');
 const key=digest(JSON.stringify({sha,text:args.expectedText,version:1}));fs.mkdirSync(ROOT,{recursive:true});const report=path.join(ROOT,key+'.json');let old;try{old=JSON.parse(fs.readFileSync(report,'utf8'))}catch{}
 if(old?.deep?.queued&&!old.deep.complete&&Date.now()-Date.parse(old.at)>360000){old.deep.queued=false;old.deep.error='后台检查超过6分钟未确认完成；音频保留，可显式full复查';save(report,old)}
 if(args.mode==='read'){if(!old)throw Error('该音频和原稿尚无自检记录');return brief({...old,cached:true})}
 if(old?.deep?.requested&&!old.deep.complete&&!old.deep.error&&!args.worker&&Date.now()-Date.parse(old.at)<360000)return brief({...old,cached:true});
 if(old&&(!args.full||(old.deep?.complete&&old.deep?.alignment)))return brief({...old,cached:true});
 if(running.has(key))return running.get(key);
 const work=(async()=>{const metrics=old?.metrics??JSON.parse((await runProcess(PY,['-X','utf8','E:/DSH/插件/sensory-runtime/voice_metrics.py',file],{signal,timeoutMs:15000})).stdout);
 const refKey=digest(JSON.stringify({reference:args.referenceSha256??'unknown',engine:args.engine??'unknown',style:args.style??'default'})),marker=path.join(ROOT,'reference-'+refKey+'.json');const reasons=[];
 if(args.full)reasons.push('explicit-review');if(args.referenceSha256&&!fs.existsSync(marker))reasons.push('first-reference');if(metrics.durationSeconds>=30)reasons.push('long-narration');if(parseInt(sha.slice(0,8),16)%10===0)reasons.push('deterministic-sample');
 const v={version:1,at:new Date().toISOString(),file,sourceSha256:sha,expectedText:args.expectedText,referenceSha256:args.referenceSha256??null,metrics,reviewReasons:reasons,report,privacy:'private-local',deep:{requested:!!reasons.length,complete:false},paidModelCalls:0};save(report,v);
 if(reasons.length&&args.defer&&!metrics.digitalSilence&&!metrics.nonfiniteSamples){
  signal?.throwIfAborted();const job=report+'.job.json';save(job,{...args,defer:false,full:true});
  const env={...process.env};for(const k of ['ELECTRON_RUN_AS_NODE','OPENAI_API_KEY','DEEPSEEK_API_KEY','HF_TOKEN','ARK_API_KEY'])delete env[k];
  v.deep.queued=true;save(report,v);
  const child=spawn('E:/DSH/本体/resources/runtime/primary-runtime/dependencies/node/bin/node.exe',['E:/DSH/插件/sensory-runtime/voice-monitor-worker.mjs',job],{windowsHide:true,detached:true,env,stdio:'ignore'});
  child.once('error',e=>{v.deep.queued=false;v.deep.error=String(e.message).slice(0,300);save(report,v)});child.unref();return brief(v);
 }
 if(reasons.length&&!metrics.digitalSilence&&!metrics.nonfiniteSamples){
  const bounded=signal?AbortSignal.any([signal,AbortSignal.timeout(240000)]):AbortSignal.timeout(240000);
  try{
   const end=Math.min(metrics.durationSeconds,900);const asr=await audioProof({file,start:0,end,expectedText:args.expectedText,transcribe:true},bounded);
   v.deep.alignment=asr.alignment;v.deep.transcription={report:asr.report,range:asr.range,text:(asr.segments??[]).map(x=>x.text).join('').slice(0,1000),notice:'摘要可能截短，完整转写在报告；差异不证明错读'};save(report,v);v.deep.observations=[];
   for(let start=0;start<end-.05;start+=60){const stop=Math.min(end,start+60),heard=await hearAudio({file,start,end:stop,question:'只根据声音说明说话方式：语速、停顿、尾音、强弱变化，是否像朗读或对话。有何不确定。不要推断真实心理，不要按预设风格评价；150字内。'},bounded);v.deep.observations.push({start,end:stop,observation:heard.observation,report:heard.report,partial:heard.partialModelOutput});save(report,v)}
   v.deep.complete=end>=metrics.durationSeconds-.05&&v.deep.observations.every(x=>!x.partial);v.deep.analyzedEnd=end;
   if(v.deep.complete&&args.referenceSha256)save(marker,{at:new Date().toISOString(),referenceSha256:args.referenceSha256,report});
  }catch(e){v.deep.error=String(e.message).slice(0,500)}
 }
 if(digest(fs.readFileSync(file))!==sha){v.deep.complete=false;v.deep.error='音频在检查期间变化；重新检查当前文件'}
 save(report,v);return brief(v);
 })();running.set(key,work);try{return await work}finally{running.delete(key)}
}
export async function afterSynthesis(value,text,signal){try{return {...value,selfCheck:await monitorVoice({file:value.file,expectedText:value.text??text??'',referenceSha256:value.referenceSha256,engine:value.engine??value.model,style:value.style,defer:true},signal)}}catch(e){return {...value,selfCheck:{status:'failed',error:String(e.message).slice(0,300),audioPreserved:true,paidModelCalls:0}}}}

import fs from 'node:fs';import path from 'node:path';import {randomUUID} from 'node:crypto';
export function alignCapture(video,audio){
 const origin=Math.min(video.startedAtMonotonicSeconds,audio.firstSampleEstimatedMonotonicSeconds);
 if(!Number.isFinite(origin))throw Error('缺少共同主机单调时钟，不能宣称视听对齐');
 const frames=video.frameTimesSeconds.map((t,i)=>({frame:i,hostSeconds:video.startedAtMonotonicSeconds+t,relativeSeconds:video.startedAtMonotonicSeconds+t-origin,encodedSeconds:i/video.encodedFPS}));
 const audioStart=audio.firstSampleEstimatedMonotonicSeconds,audioEnd=audioStart+audio.durationSeconds;
 return {clock:'Windows host monotonic/QPC; shared between processes',originMonotonicSeconds:origin,audioStartRelativeSeconds:audioStart-origin,videoStartRelativeSeconds:frames[0]?.relativeSeconds,overlapSeconds:Math.max(0,Math.min(audioEnd,frames.at(-1)?.hostSeconds??0)-Math.max(audioStart,frames[0]?.hostSeconds??0)),frames,audioTimingEstimate:!audio.hardwareTimestampAvailable,audioTimingUncertainty:audio.timingUncertainty,discontinuityWarnings:audio.discontinuityWarnings??0,cfrEncodingIsNotCaptureClock:true,notice:'音频优先使用WASAPI端点数据包QPC时钟，明确区分无效时间戳和缺帧。应使用此映射对齐，不能直接把两份文件的零秒当同时发生。'};
}
export async function captureAV(args,{client,audio,signal}){
 const seconds=args.seconds??5;if(!(seconds>0&&seconds<=30))throw Error('视听共同采集为0至30秒；更长视频请分段');
 const {audio:ignored,...videoArgs}=args;
 const results=await Promise.allSettled([client.request({op:'record',...videoArgs},{signal,timeoutMs:75000}),audio.request({action:'record',source:'system-playback',seconds},signal)]);
 const video=results[0].status==='fulfilled'?results[0].value:null,sound=results[1].status==='fulfilled'?results[1].value:null;
 let full=video;if(video?.fullReport)full=JSON.parse(fs.readFileSync(video.fullReport,'utf8'));
 const mapping=full&&sound?alignCapture(full,sound):null;
 const report={video,audio:sound,mapping,partial:!video||!sound||!!video.partial,errors:results.filter(r=>r.status==='rejected').map(r=>r.reason.message),audioIncluded:!!sound,muxed:false,heard:false,modelCalls:0};
 const root='E:/LianHome/收件箱/感官采集/视听';fs.mkdirSync(root,{recursive:true});const file=path.join(root,'av-'+randomUUID()+'.json');fs.writeFileSync(file,JSON.stringify(report,null,2));
 return {...report,mapping:mapping?{...mapping,frames:mapping.frames.slice(0,3),framesTruncated:mapping.frames.length>3}:null,fullReport:file,notice:'画面与声音已按同一主机时钟建映射；文件仍分开保存，未自动听懂/看懂。'+(sound?.discontinuityWarnings?'音频有间断，精确同步需复核。':'')};
}

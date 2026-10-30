import fs from 'node:fs';import path from 'node:path';
import {localSource,createProof,proofFile,hashMedia,hashText,saveJSON,resultNotice} from './proof-common.mjs';
import {runProcess,mediaBinary,parseCaptions} from '../../dafeiyu-life/lib/media.mjs';
export function validateRows(rows){
 if(!Array.isArray(rows)||!rows.length||rows.length>120)throw Error('请选择1至120条台词/镜头记录，长片可分段');
 const ids=new Set();return rows.map((r,i)=>{if(!Number.isFinite(r.start)||!Number.isFinite(r.end)||r.start<0||r.end<=r.start)throw Error('每行需有有效起止秒数');const id=String(r.id??i+1);if(ids.has(id))throw Error('记录id重复');ids.add(id);if(String(r.text??'').length>2000||String(r.visual??'').length>2000)throw Error('单行过长');return {id,start:r.start,end:r.end,text:String(r.text??''),visual:String(r.visual??''),motion:!!r.motion}});
}
export function sampleTimes(row){const d=row.end-row.start,edge=Math.min(.05,d/10),middle=(row.start+row.end)/2;return [...new Set((row.motion?[row.start+edge,middle,row.end-edge]:[middle]).map(t=>+t.toFixed(3)))];}
export function prepareTimeline(args){
 let rows=args.rows,captionSource;if(!rows?.length&&args.subtitleFile){const file=localSource(args.subtitleFile,/\.(srt|vtt)$/i);if(fs.statSync(file).size>2e6)throw Error('字幕太大');const parsed=parseCaptions(fs.readFileSync(file,'utf8'));rows=parsed.cues;captionSource={file,sha256:hashText(fs.readFileSync(file)),issues:parsed.issues}}
 rows=validateRows(rows);const dir=createProof('timeline'),file=path.join(dir,'timeline-plan.json');
 const value={version:1,at:new Date().toISOString(),label:String(args.label??'台词—镜头—字幕对照').slice(0,100),rows,captionSource,notice:'预期画面由创作者填写；请用真实成片核对。动作/转场可设motion:true抽相邻时码。'};saveJSON(file,value);
 fs.writeFileSync(path.join(dir,'台词镜头对照.md'),'# '+value.label+'\n\n|秒数|台词/字幕原文|预期画面|动作/转场|\n|---|---|---|---|\n'+rows.map(r=>'|'+r.start+'—'+r.end+'|'+r.text.replace(/[\r\n|]/g,' ')+'|'+r.visual.replace(/[\r\n|]/g,' ')+'|'+(r.motion?'是':'否')+'|').join('\n')+'\n\n实际观察另记在生成的film-evidence.json，不覆盖原台词或成片。\n');
 return {plan:file,table:path.join(dir,'台词镜头对照.md'),rows:rows.length,unplannedVisualRows:rows.filter(r=>!r.visual.trim()).map(r=>r.id),modelCalls:0,notice:resultNotice};
}
export async function collectFilm(args,signal){
 const plan=proofFile(args.plan),planBytes=fs.readFileSync(plan),data=JSON.parse(planBytes);data.rows=validateRows(data.rows);
 const file=localSource(args.file,/\.(mp4|mov|mkv|webm)$/i),sha256=await hashMedia(file),dir=createProof('frames');
 const probe=JSON.parse((await runProcess(mediaBinary('ffprobe'),['-v','error','-protocol_whitelist','file,pipe','-show_format','-show_streams','-of','json',file],{signal})).stdout),duration=Number(probe.format?.duration);
 if(!probe.streams?.some(s=>s.codec_type==='video')||!Number.isFinite(duration))throw Error('不是可识别的视频');
 if(data.rows.some(r=>r.end>duration+.05))throw Error('对照表时间超出实际成片，请先修正计划秒数');
 const offset=Math.max(0,Math.floor(args.offset??0)),limit=Math.max(1,Math.min(8,Math.floor(args.limit??4))),selected=data.rows.slice(offset,offset+limit),images=[];
 if(!selected.length)throw Error('没有对应行，请检查offset');
 for(const row of selected){for(const time of sampleTimes(row)){signal?.throwIfAborted();const frame=path.join(dir,'frame-'+images.length+'.png');await runProcess(mediaBinary('ffmpeg'),['-nostdin','-y','-v','error','-protocol_whitelist','file,pipe','-ss',String(time),'-i',file,'-frames:v','1','-vf','scale=1280:1280:force_original_aspect_ratio=decrease','-update','1',frame],{signal,timeoutMs:60000});images.push({path:frame,sha256:await hashMedia(frame),mediaType:'image/png',rowId:row.id,time,role:row.motion?'相邻时码抽样':'代表帧',expectedText:row.text,expectedVisual:row.visual});}}
 const sourceUnchanged=(await hashMedia(file))===sha256,planUnchanged=hashText(fs.readFileSync(plan))===hashText(planBytes),report=path.join(dir,'film-evidence.json');
 const groups=Map.groupBy(images,x=>x.sha256),repeatedFrames=[...groups.values()].filter(g=>g.length>1).map(g=>({sha256:g[0].sha256,times:g.map(x=>x.time),notice:'这些抽样文件内容相同；可能是静态画面，也可能是采样间隔未捕捉运动，不能单凭它宣布素材没有运动。'}));
 const result={at:new Date().toISOString(),file,sourceSha256:sha256,plan,planSha256:hashText(planBytes),durationSeconds:duration,range:{rowOffset:offset,returnedRows:selected.length,totalRows:data.rows.length,nextOffset:offset+selected.length<data.rows.length?offset+selected.length:null},images,uniqueImageContents:groups.size,identicalFrames:images.length>1&&groups.size===1,hasRepeatedFrames:repeatedFrames.length>0,repeatedFrames,observations:selected.map(r=>({rowId:r.id,plannedText:r.text,plannedVisual:r.visual,state:'pending',observation:'',times:images.filter(i=>i.rowId===r.id).map(i=>i.time)})),sourceUnchanged,planUnchanged,report,privacy:'local-user-material',instructionAuthority:'none',modelCalls:0,notice:'独立帧不拼接；重复内容会明确标注。观察记录可只写蓝底/位置等事实，不是审美打分；抽样不代表全片或连续运动已核实。'};saveJSON(report,result);return result;
}
export async function checkFilm(args){
 const report=proofFile(args.report),r=JSON.parse(fs.readFileSync(report,'utf8')),file=localSource(r.file,/\.(mp4|mov|mkv|webm)$/i),plan=proofFile(r.plan),issues=[];
 if(await hashMedia(file)!==r.sourceSha256)issues.push('成片内容已变化，旧画面证据不能用于当前版本');
 if(hashText(fs.readFileSync(plan))!==r.planSha256)issues.push('台词/镜头计划已变化，需重新收集证据');
 const root=fs.realpathSync(path.dirname(report));for(const f of r.images??[]){try{const p=fs.realpathSync(f.path);if(!p.toLowerCase().startsWith(root.toLowerCase()+path.sep)||await hashMedia(p)!==f.sha256)issues.push('实际帧缺失、路径变化或哈希不符')}catch{issues.push('实际帧缺失')}}
 const observed=(r.observations??[]).filter(o=>o.state==='observed'&&String(o.observation??'').trim());
 return {versionValid:issues.length===0,issues,observedRows:observed.length,returnedRows:r.observations?.length??0,allObservationsRecorded:observed.length>0&&observed.length===(r.observations?.length??0),report,notice:'版本有效或观察填写齐全，均不等于工具证明镜头/台词相符、审美合格或已看完整运动。'};
}
export async function observeFilm(args){
 const status=await checkFilm(args);if(!status.versionValid)throw Error('版本已变化，先重新取证：'+status.issues.join('；'));
 if(!Array.isArray(args.observations)||!args.observations.length)throw Error('请提供至少一条真实观察');
 const file=proofFile(args.report),r=JSON.parse(fs.readFileSync(file,'utf8'));
 for(const o of args.observations){const row=r.observations.find(x=>x.rowId===String(o.rowId));if(!row)throw Error('rowId不在本次抽样内');if(typeof o.observation!=='string'||!o.observation.trim()||o.observation.length>2000)throw Error('观察需为1至2000字');row.observation=o.observation.trim();row.state='observed';}
 r.observationsUpdatedAt=new Date().toISOString();saveJSON(file,r);return {...await checkFilm(args),notice:'已记录调用者陈述的事实观察，不自动认定审美合格，也不证明调用者真的看过。'};
}

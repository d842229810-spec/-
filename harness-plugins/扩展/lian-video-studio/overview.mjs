// Local overview adapter. Independently implemented from the documented contact-sheet
// idea in dsh-video-storyboard; no upstream runtime or ASR/watch code is imported.
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
const hash=b=>createHash('sha256').update(b).digest('hex');
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const EXT=/\.(mp4|mov|mkv|webm|avi|flv|ts)$/i;
export const OVERVIEW_LIMITS=Object.freeze({cells:16,rangeSeconds:900,sourceBytes:2*1024**3,frameBytes:50*1024**2,totalFrameBytes:256*1024**2,deadlineMs:180000});
const aborted=signal=>signal?.throwIfAborted();
function ownerId(owner){if(typeof owner!=='string'||!owner.trim()||owner.length>200)throw Error('OVERVIEW_REQUIRES_TRUSTED_SESSION');return owner}
function inside(root,file){const rel=path.relative(root,file);return rel!==''&&!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel)}
async function noLinks(target,{directory=false}={}){
 for(let p=path.resolve(target);;p=path.dirname(p)){
  try{const s=await fs.lstat(p);if(s.isSymbolicLink())throw Error('OVERVIEW_LINKED_PATH');if(p!==path.resolve(target)&&!s.isDirectory())throw Error('OVERVIEW_BAD_PARENT');if(p===path.resolve(target)&&(directory?!s.isDirectory():!s.isFile()))throw Error('OVERVIEW_BAD_PATH_TYPE')}
  catch(e){if(e.code!=='ENOENT')throw e}
  if(path.dirname(p)===p)break;
 }
}
export async function authorizeOverviewSource(file,roots){
 if(typeof file!=='string'||!path.isAbsolute(file)||!EXT.test(file))throw Error('OVERVIEW_REQUIRES_LOCAL_VIDEO');
 const actual=await fs.realpath(file),realRoots=[];
 for(const root of roots??[])try{realRoots.push(await fs.realpath(root))}catch(e){if(e.code!=='ENOENT')throw e}
 if(!realRoots.some(root=>inside(root,actual)))throw Error('OVERVIEW_SOURCE_OUTSIDE_ALLOWED_ROOTS');
 await noLinks(actual);const s=await fs.stat(actual);if(!s.isFile()||s.size>OVERVIEW_LIMITS.sourceBytes)throw Error('OVERVIEW_SOURCE_TOO_LARGE_OR_NOT_FILE');return actual;
}
export async function hashOverviewSource(file,signal){aborted(signal);const h=createHash('sha256'),stream=createReadStream(file,{signal});for await(const b of stream){aborted(signal);h.update(b)}return h.digest('hex')}
export function runOverviewProcess(exe,args,{signal,timeoutMs=90000,maxBytes=16*1024**2,onSpawn}={}){
 aborted(signal);return new Promise((resolve,reject)=>{
  let stdout='',stderr='',bytes=0,failure=null,closed=false;
  const child=spawn(exe,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});onSpawn?.(child);
  const stop=e=>{failure??=e;child.kill()};
  const onAbort=()=>stop(signal.reason instanceof Error?signal.reason:Object.assign(Error('Overview cancelled'),{name:'AbortError'}));
  const timer=setTimeout(()=>stop(Error('OVERVIEW_PROCESS_TIMEOUT')),timeoutMs);timer.unref?.();
  signal?.addEventListener('abort',onAbort,{once:true});if(signal?.aborted)onAbort();
  const collect=which=>b=>{bytes+=b.length;if(bytes>maxBytes){stop(Error('OVERVIEW_PROCESS_OUTPUT_LIMIT'));return}if(which==='out')stdout+=b.toString('utf8');else stderr+=b.toString('utf8')};
  child.stdout.on('data',collect('out'));child.stderr.on('data',collect('err'));
  child.on('error',e=>{failure??=e});
  child.once('close',code=>{if(closed)return;closed=true;clearTimeout(timer);signal?.removeEventListener('abort',onAbort);if(failure)return reject(failure);if(code!==0)return reject(Error('OVERVIEW_MEDIA_PROCESS_FAILED: '+stderr.slice(-900)));resolve({stdout,stderr})});
 });
}
function mediaWindow(probe,args){
 const v=probe.streams?.find(s=>s.codec_type==='video');if(!v)throw Error('OVERVIEW_NO_VIDEO');
 const duration=Number(probe.format?.duration??v.duration),start=args.start??0,end=args.end??Math.min(duration,start+60),cells=args.cells??9;
 if(!Number.isFinite(duration)||duration<=0||!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>duration+.001||end-start<.2||end-start>OVERVIEW_LIMITS.rangeSeconds)throw Error('OVERVIEW_INVALID_WINDOW_MAX_900_SECONDS');
 if(!Number.isInteger(cells)||cells<1||cells>OVERVIEW_LIMITS.cells)throw Error('OVERVIEW_CELLS_MUST_BE_1_TO_16');
 const width=Number(v.width),height=Number(v.height);if(!(width>0&&height>0)||width*height>34*1024**2)throw Error('OVERVIEW_UNSUPPORTED_DIMENSIONS');
 const [num,den='1']=String(v.avg_frame_rate??v.r_frame_rate??'25').split('/').map(Number),fps=num/den;
 const produced=Math.max(1,Math.min(cells,Math.floor((end-start)*(Number.isFinite(fps)&&fps>0?fps:1))));
 return {start,end,duration,cells:produced,requestedCells:cells,mediaStart:Number(probe.format?.start_time??v.start_time??0)||0,width,height,hasAudio:probe.streams.some(s=>s.codec_type==='audio')};
}
function filterPath(p){return p.replaceAll('\\','/').replaceAll(':','\\:').replaceAll("'","\\'")}
function sceneTimes(text,start,end){return [...text.matchAll(/pts_time:([-+0-9.eE]+)/g)].map(m=>start+Number(m[1])).filter(t=>Number.isFinite(t)&&t>start&&t<end).slice(0,4096)}
function pickFrames(win,scenes){const out=[];for(let i=0;i<win.cells;i++){
 const from=win.start+(win.end-win.start)*i/win.cells,to=win.start+(win.end-win.start)*(i+1)/win.cells,mid=(from+to)/2;
 const candidates=scenes.map(t=>t+.12).filter(t=>t>from+.02&&t<to-.05).sort((a,b)=>Math.abs(a-mid)-Math.abs(b-mid));
 out.push({cellId:i+1,from,to,requestedTime:candidates[0]??mid,selection:candidates.length?'scene-change-near-bin-centre':'uniform-bin-centre'});
}return out}
async function safeArtifact(dir,name){if(typeof name!=='string'||!/^(?:frame-\d{2}\.png|overview\.png|analysis\.json)$/.test(name))throw Error('OVERVIEW_INVALID_ARTIFACT');const p=path.resolve(dir,name);if(!inside(path.resolve(dir),p))throw Error('OVERVIEW_INVALID_ARTIFACT');await noLinks(p);return p}
const SHA256=/^[a-f0-9]{64}$/;
function recordShape(value,keys){return value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k))}
function validateRecord(record,analysisId,owner){
 const bad=()=>{throw Error('OVERVIEW_INVALID_RECORD')};
 if(!record||typeof record!=='object'||Array.isArray(record))bad();
 if(record.owner!==owner)throw Error('OVERVIEW_ANALYSIS_BELONGS_TO_ANOTHER_SESSION');
 if(!recordShape(record,['version','analysisId','owner','taskId','createdAt','source','sourceHash','range','requestedCells','cells','overviewHash','warnings','selection'])||record.version!==1||record.analysisId!==analysisId||!UUID.test(record.analysisId))bad();
 if(typeof record.taskId!=='string'||record.taskId.length>500||typeof record.createdAt!=='string'||!Number.isFinite(Date.parse(record.createdAt))||new Date(record.createdAt).toISOString()!==record.createdAt)bad();
 if(typeof record.source!=='string'||!path.isAbsolute(record.source)||!EXT.test(record.source)||typeof record.sourceHash!=='string'||!SHA256.test(record.sourceHash)||typeof record.overviewHash!=='string'||!SHA256.test(record.overviewHash))bad();
 const r=record.range;
 if(!recordShape(r,['start','end','totalDuration'])||![r.start,r.end,r.totalDuration].every(Number.isFinite)||r.start<0||r.totalDuration<=0||r.end>r.totalDuration+.001||r.end-r.start<.2||r.end-r.start>OVERVIEW_LIMITS.rangeSeconds)bad();
 if(!Number.isInteger(record.requestedCells)||record.requestedCells<1||record.requestedCells>OVERVIEW_LIMITS.cells||!Array.isArray(record.cells)||record.cells.length<1||record.cells.length>record.requestedCells)bad();
 if(!Array.isArray(record.warnings)||record.warnings.length>16||record.warnings.some(w=>typeof w!=='string'||w.length>512))bad();
 const selection=record.selection;
 if(!recordShape(selection,['strategy','sceneScanFps','sceneCandidates','continuousViewing'])||selection.strategy!=='bounded-time-bins-with-optional-local-scene-candidates'||selection.sceneScanFps!==2||!Number.isInteger(selection.sceneCandidates)||selection.sceneCandidates<0||selection.sceneCandidates>4096||selection.continuousViewing!==false)bad();
 let totalBytes=0;
 for(let i=0;i<record.cells.length;i++){
  const c=record.cells[i],from=+(r.start+(r.end-r.start)*i/record.cells.length).toFixed(6),to=+(r.start+(r.end-r.start)*(i+1)/record.cells.length).toFixed(6);
  if(!recordShape(c,['cellId','from','to','requestedTime','selection','time','file','sha256','bytes'])||c.cellId!==i+1||c.file!=='frame-'+String(i+1).padStart(2,'0')+'.png'||typeof c.sha256!=='string'||!SHA256.test(c.sha256))bad();
  if(![c.from,c.to,c.requestedTime,c.time].every(Number.isFinite)||c.from!==from||c.to!==to||c.from>=c.to||c.requestedTime<c.from-.000001||c.requestedTime>c.to+.000001||c.time<r.start-.002||c.time>=r.end+.002||Math.max(r.start,c.time-3)>=Math.min(r.end,c.time+3))bad();
  if(!['uniform-bin-centre','scene-change-near-bin-centre'].includes(c.selection)||!Number.isSafeInteger(c.bytes)||c.bytes<1||c.bytes>OVERVIEW_LIMITS.frameBytes)bad();
  totalBytes+=c.bytes;
 }
 if(totalBytes>OVERVIEW_LIMITS.totalFrameBytes)bad();
 return record;
}
async function verifyArtifact(dir,name,expectedHash,expectedBytes,signal){
 aborted(signal);const file=await safeArtifact(dir,name),stat=await fs.stat(file);
 if(!stat.isFile()||stat.size<1||stat.size>OVERVIEW_LIMITS.frameBytes||(expectedBytes!==undefined&&stat.size!==expectedBytes)||await hashOverviewSource(file,signal)!==expectedHash)throw Error('OVERVIEW_ARTIFACT_CHANGED');
 return file;
}
function publicResult(record,dir,selected=null){const all=selected?[selected]:record.cells;return {
 version:record.version,analysisId:record.analysisId,taskId:record.taskId,source:record.source,sourceHash:record.sourceHash,range:record.range,createdAt:record.createdAt,
 cells:all.map(c=>({...c,frame:path.join(dir,c.file),watchArgs:{action:'watch',file:record.source,start:Math.max(record.range.start,c.time-3),end:Math.min(record.range.end,c.time+3)}})),
 overview:path.join(dir,'overview.png'),report:path.join(dir,'analysis.json'),warnings:record.warnings,selection:record.selection,requestedCells:record.requestedCells,
 privacy:'private-local-material',instructionAuthority:'none',paidAPICalls:0,modelCalls:0,transcript:{attempted:false,notice:'未运行字幕、ASR或听觉分析；需要台词时复用现有视频感知/听觉工具。'},
 notice:'宫格是代表帧采样，不等于连续看完。每格范围和实际取帧时刻是原片绝对秒数。按格可回查独立原帧；动作问题应再用whale_watch_video细看。没有固定384 token承诺。',
 artifact:selected?{file:path.join(dir,selected.file),sha256:selected.sha256}:{file:path.join(dir,'overview.png'),sha256:record.overviewHash}
}}
async function loadAnalysis(args,deps,signal){
 if(typeof args.analysisId!=='string'||!UUID.test(args.analysisId))throw Error('OVERVIEW_INVALID_ANALYSIS_ID');
 const dir=path.join(deps.outputRoot,args.analysisId);await noLinks(dir,{directory:true});const report=await safeArtifact(dir,'analysis.json');
 const size=(await fs.stat(report)).size;if(size>2*1024**2)throw Error('OVERVIEW_REPORT_TOO_LARGE');
 let record;try{record=JSON.parse(await fs.readFile(report,{encoding:'utf8',signal}))}catch(e){aborted(signal);if(e instanceof SyntaxError)throw Error('OVERVIEW_INVALID_RECORD');throw e}
 validateRecord(record,args.analysisId,deps.owner);
 const source=await deps.authorizeSource(record.source);aborted(signal);
 if(source!==record.source||await hashOverviewSource(source,signal)!==record.sourceHash)throw Error('OVERVIEW_SOURCE_CHANGED');
 let selected=null;if(args.cellId!==undefined){if(!Number.isInteger(args.cellId))throw Error('OVERVIEW_INVALID_CELL');selected=record.cells.find(c=>c.cellId===args.cellId);if(!selected)throw Error('OVERVIEW_CELL_NOT_FOUND')}
 await verifyArtifact(dir,'overview.png',record.overviewHash,undefined,signal);
 for(const cell of record.cells)await verifyArtifact(dir,cell.file,cell.sha256,cell.bytes,signal);
 return publicResult(record,dir,selected);
}
export async function videoOverview(args,deps){
 const owner=ownerId(deps.owner);if(typeof deps.authorizeSource!=='function'||!path.isAbsolute(deps.outputRoot))throw Error('OVERVIEW_BAD_HOST_CONFIGURATION');
 const signal=deps.signal?AbortSignal.any([deps.signal,AbortSignal.timeout(deps.deadlineMs??OVERVIEW_LIMITS.deadlineMs)]):AbortSignal.timeout(deps.deadlineMs??OVERVIEW_LIMITS.deadlineMs);aborted(signal);
 const options={...deps,owner};
 if(args.analysisId){if(args.file!==undefined||args.start!==undefined||args.end!==undefined||args.cells!==undefined)throw Error('OVERVIEW_RECALL_CANNOT_CHANGE_SOURCE_OR_WINDOW');return loadAnalysis(args,options,signal)}
 if(args.cellId!==undefined)throw Error('OVERVIEW_CELL_REQUIRES_ANALYSIS_ID');
 const source=await deps.authorizeSource(args.file);aborted(signal);const sourceHash=await hashOverviewSource(source,signal);
 const run=deps.runProcess??runOverviewProcess;
 const probe=JSON.parse((await run(deps.ffprobe,['-v','error','-protocol_whitelist','file,pipe','-show_format','-show_streams','-of','json',source],{signal})).stdout),win=mediaWindow(probe,args);
 await noLinks(deps.outputRoot,{directory:true});await fs.mkdir(deps.outputRoot,{recursive:true});await noLinks(deps.outputRoot,{directory:true});
 const analysisId=randomUUID(),pending=path.join(deps.outputRoot,'.pending-'+analysisId),finalDir=path.join(deps.outputRoot,analysisId);await fs.mkdir(pending);
 try{
  const warnings=[];let scenes=[];
  if(args.sceneAware!==false){try{const scan=await run(deps.ffmpeg,['-hide_banner','-v','info','-nostdin','-protocol_whitelist','file,pipe','-ss',String(win.start),'-i',source,'-t',String(win.end-win.start),'-an','-vf','scale=160:-2,fps=2,select=gt(scene\\,0.25),showinfo','-f','null','-'],{signal,timeoutMs:30000,maxBytes:2*1024**2});scenes=sceneTimes(scan.stderr,win.start,win.end)}catch(e){aborted(signal);warnings.push('场景候选扫描未完成，使用分区均匀采样：'+e.message.slice(0,180))}}
  const plan=pickFrames(win,scenes),cells=[];let frameBytes=0;
  for(const cell of plan){
   aborted(signal);const name='frame-'+String(cell.cellId).padStart(2,'0')+'.png',file=path.join(pending,name);
   const extracted=await run(deps.ffmpeg,['-hide_banner','-v','info','-nostdin','-protocol_whitelist','file,pipe','-copyts','-ss',String(cell.requestedTime),'-i',source,'-map','0:v:0','-frames:v','1','-vf','showinfo','-an','-c:v','png','-update','1',file],{signal,maxBytes:2*1024**2});
   const first=[...extracted.stderr.matchAll(/\bn:\s*0\s+pts:.*?pts_time:([-+0-9.eE]+)/g)][0];
   const time=first?Number(first[1])-win.mediaStart:NaN;
   if(!Number.isFinite(time)||time<win.start-.002||time>=win.end+.002)throw Error('OVERVIEW_FRAME_TIMESTAMP_OUTSIDE_WINDOW');
   const bytes=await fs.readFile(file);frameBytes+=bytes.length;if(bytes.length>OVERVIEW_LIMITS.frameBytes||frameBytes>OVERVIEW_LIMITS.totalFrameBytes)throw Error('OVERVIEW_FRAME_STORAGE_LIMIT');
   cells.push({...cell,time:+time.toFixed(6),from:+cell.from.toFixed(6),to:+cell.to.toFixed(6),file:name,sha256:hash(bytes),bytes:bytes.length});
  }
  const aspect=win.width/win.height,cols=Math.min(4,Math.max(1,Math.ceil(Math.sqrt(cells.length)))),rows=Math.ceil(cells.length/cols),cw=Math.max(160,Math.min(640,Math.floor(Math.sqrt(800000*aspect/(cols*rows))))),ch=Math.max(100,Math.floor(cw/aspect));
  const labels=cells.map((c,i)=>'['+i+':v]scale='+cw+':'+ch+':force_original_aspect_ratio=decrease,pad='+cw+':'+ch+':(ow-iw)/2:(oh-ih)/2,drawbox=x=0:y=ih-26:w=iw:h=26:color=black@0.75:t=fill,drawtext=fontfile=\''+filterPath(deps.fontFile)+'\':text=\'#'+c.cellId+'  '+c.time.toFixed(3)+'s\':fontcolor=white:fontsize=18:x=8:y=h-23[v'+i+']');
  const montage=cells.length===1?'[v0]null[out]':cells.map((_c,i)=>'[v'+i+']').join('')+'xstack=inputs='+cells.length+':layout='+cells.map((_c,i)=>(i%cols*cw)+'_'+(Math.floor(i/cols)*ch)).join('|')+':fill=black[out]';
  await run(deps.ffmpeg,['-hide_banner','-v','error','-nostdin',...cells.flatMap(c=>['-i',path.join(pending,c.file)]),'-filter_complex',labels.concat(montage).join(';'),'-map','[out]','-frames:v','1','-update','1',path.join(pending,'overview.png')],{signal,maxBytes:2*1024**2});
  const actual=await deps.authorizeSource(args.file);if(actual!==source||await hashOverviewSource(source,signal)!==sourceHash)throw Error('OVERVIEW_SOURCE_CHANGED_DURING_ANALYSIS');
  const overviewHash=hash(await fs.readFile(path.join(pending,'overview.png'))),record={version:1,analysisId,owner,taskId:String(deps.taskId??''),createdAt:new Date().toISOString(),source,sourceHash,range:{start:win.start,end:win.end,totalDuration:win.duration},requestedCells:win.requestedCells,cells,overviewHash,warnings,selection:{strategy:'bounded-time-bins-with-optional-local-scene-candidates',sceneScanFps:2,sceneCandidates:scenes.length,continuousViewing:false}};
  validateRecord(record,analysisId,owner);aborted(signal);await fs.writeFile(path.join(pending,'analysis.json'),JSON.stringify(record,null,2),{flag:'wx'});await noLinks(deps.outputRoot,{directory:true});await fs.rename(pending,finalDir);return publicResult(record,finalDir);
 }catch(e){await fs.rm(pending,{recursive:true,force:true,maxRetries:3,retryDelay:50});throw e}
}

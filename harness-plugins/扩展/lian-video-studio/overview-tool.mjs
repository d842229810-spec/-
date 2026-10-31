import {MEDIA_SOURCE_ROOTS,resolveMediaSource} from '../../lian-shared/media-source.mjs';
import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';
import {authorizeOverviewSource,videoOverview} from './overview.mjs';
const SOURCES=MEDIA_SOURCE_ROOTS;
const contained=(root,file)=>{const r=path.relative(root,file);return r!==''&&r!=='..'&&!r.startsWith('..'+path.sep)&&!path.isAbsolute(r)};
export function makeOverviewFollowUp({watchRoots,perceptionRoot}){return (source,cell)=>{
 if(watchRoots.some(root=>contained(root,source)))return {watchArgs:cell.watchArgs};
 if(perceptionRoot&&contained(perceptionRoot,source)){
  const parts=path.relative(perceptionRoot,source).split(path.sep);
  if(parts.length===4&&/^BV[A-Za-z0-9]{10}$/.test(parts[0])&&/^[1-9][0-9]*$/.test(parts[1])&&parts[2]==='shared'&&/^video\.(mp4|flv|mkv|webm|ts)$/i.test(parts[3]))return {
   biliPerceiveArgs:{url:'https://www.bilibili.com/video/'+parts[0],page:Number(parts[1]),start:cell.watchArgs.start,end:cell.watchArgs.end,maxFrames:6},
   followUpNotice:'该源来自现有B站媒体缓存路径；用whale_bili_perceive做定点复看。缓存路径不在whale_watch_video授权目录，不给不可执行的动作观察参数。远程复看仍须核对来源版本。'
  };
 }
 return {followUpNotice:'原帧和绝对时间范围可回查；当前源不在动作观察授权目录，且没有可确认的B站BV/分P信息，因此不猜测后续工具参数。'};
}}
async function hostDependencies(){
 const {PROOFS}=await import('./proof-common.mjs');
 const {mediaBinary}=await import('../../dafeiyu-life/lib/media.mjs');
 const roots=await Promise.all(SOURCES.map(p=>fs.realpath(p).catch(e=>{if(e.code==='ENOENT')return null;throw e})));
 return {followUpForSource:makeOverviewFollowUp({watchRoots:roots.filter(Boolean),perceptionRoot:roots.at(-1)}),outputRoot:path.join(PROOFS,'视频概览'),authorizeSource:file=>resolveMediaSource(file,{extensions:/\.(mp4|mov|mkv|webm|avi|flv|ts)$/i}).actual,ffmpeg:mediaBinary('ffmpeg'),ffprobe:mediaBinary('ffprobe'),fontFile:'C:/Windows/Fonts/consola.ttf'};
}
export function createOverviewHandler(getDependencies){return async(args,exec,ctx)=>{
 const owner=exec.agent?.session?.id??exec.agent?.id;
 if(typeof owner!=='string'||!owner)throw Error('视频概览需要当前执行会话身份；不能借用其他会话的历史分析。');
 const dependencies=await getDependencies();
 const result=await videoOverview(args,{...dependencies,owner,taskId:exec.callId,signal:exec.signal});
 if(dependencies.followUpForSource)result.cells=result.cells.map(cell=>{const {watchArgs,...rest}=cell;return {...rest,...dependencies.followUpForSource(result.source,cell)}});
 exec.signal?.throwIfAborted();const bytes=await fs.readFile(result.artifact.file,{signal:exec.signal});
 if(createHash('sha256').update(bytes).digest('hex')!==result.artifact.sha256)throw Error('OVERVIEW_ARTIFACT_CHANGED_BEFORE_ATTACHMENT');
 const {artifact,...value}=result;
 try{
  exec.signal?.throwIfAborted();const image=await ctx.attachments.saveImage({data:bytes,mediaType:'image/png',name:args.cellId===undefined?'video-overview.png':'video-cell-'+args.cellId+'.png'});exec.signal?.throwIfAborted();
  return {...value,analysisCompleted:true,attachmentStatus:'ready',attachedImages:[image]};
 }catch(e){
  exec.signal?.throwIfAborted();
  return {...value,analysisCompleted:true,attachmentStatus:'failed',attachmentError:String(e.message??e).slice(0,240),retry:{name:'whale_video_render',arguments:{action:'overview',analysisId:result.analysisId,...args.cellId===undefined?{}:{cellId:args.cellId}}},attachedImages:[],deliveryNotice:'分析和图片已保存，但本次图片附件提交失败；尚未在聊天中交付该图。按retry回查同一分析即可，不必重复抽帧。'};
 }
}}
export const overviewTool=createOverviewHandler(hostDependencies);

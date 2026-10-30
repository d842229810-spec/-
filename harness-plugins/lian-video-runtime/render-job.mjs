import fs from 'node:fs';
import path from 'node:path';
import {publishRenderedFile,publishFrameBatch} from './atomic-output.mjs';

export async function renderJob(input,{runtimeRoot,bundle,ensureBrowser,renderMedia,renderStill,selectComposition,browserExecutable='C:/Program Files/Google/Chrome/Application/chrome.exe'}){
  const project=path.resolve(input.project),action=input.action??'render';
  const props=JSON.parse(fs.readFileSync(path.join(project,'video.props.json'),'utf8'));
  if(!['render','frames'].includes(action))throw new Error('不支持的渲染动作');
  if(!Array.isArray(props.scenes)||!props.scenes.length||props.scenes.length>300)throw new Error('scenes需有1至300个镜头');
  for(const scene of props.scenes)if(!Number.isFinite(scene.durationSeconds)||scene.durationSeconds<1||scene.durationSeconds>600)throw new Error('每个镜头需为1至600秒');
  if(input.times!==undefined&&(!Array.isArray(input.times)||input.times.length>20||input.times.some(x=>!Number.isFinite(x)||x<0)))throw new Error('抽帧时间需为最多20个非负秒数');
  await ensureBrowser({browserExecutable});
  const serveUrl=await bundle({entryPoint:path.join(project,'src/index.jsx'),publicDir:path.join(project,'public'),rootDir:runtimeRoot,webpackOverride:c=>({...c,resolve:{...c.resolve,modules:[path.join(runtimeRoot,'node_modules'),...(c.resolve?.modules??['node_modules'])]}})});
  const composition=await selectComposition({serveUrl,id:'LianFilm',inputProps:props,browserExecutable});
  if(!Number.isSafeInteger(composition.durationInFrames)||composition.durationInFrames<1||!Number.isFinite(composition.fps)||composition.fps<=0)throw new Error('合成时长或帧率无效');
  const out=path.join(project,'out');fs.mkdirSync(out,{recursive:true});
  if(action==='frames'){
    const frames=(input.times??[.5,3.5,6.5]).map(second=>{const frame=Math.min(composition.durationInFrames-1,Math.max(0,Math.floor(second*composition.fps)));return {frame,time:frame/composition.fps};});
    const images=await publishFrameBatch(out,frames,(output,frame)=>renderStill({serveUrl,composition,inputProps:props,browserExecutable,output,imageFormat:'png',frame,logLevel:'error'}));
    return {ok:true,images};
  }
  const outputLocation=path.join(out,'preview.mp4');
  await publishRenderedFile(outputLocation,temporary=>renderMedia({serveUrl,composition,inputProps:props,browserExecutable,codec:'h264',audioCodec:'aac',outputLocation:temporary,concurrency:2,crf:20,logLevel:'error'}));
  return {ok:true,output:outputLocation,durationSeconds:composition.durationInFrames/composition.fps,width:composition.width,height:composition.height,fps:composition.fps};
}

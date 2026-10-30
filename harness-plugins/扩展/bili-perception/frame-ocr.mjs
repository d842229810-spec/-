import fs from 'node:fs/promises';import path from 'node:path';import {createHash,randomUUID} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {runProcess} from '../../dafeiyu-life/lib/media.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
export async function readFrameOcr(frames,cacheRoot,{signal}={}){
 await fs.mkdir(cacheRoot,{recursive:true});const rows=[],missing=[];
 for(const f of frames.filter(f=>f.has_image&&f.path)){
  signal?.throwIfAborted();const key=createHash('sha256').update(await fs.readFile(f.path)).digest('hex');
  try{const r=JSON.parse(await fs.readFile(path.join(cacheRoot,key+'.json'),'utf8'));rows.push({...r,time:f.time,cached:true});}
  catch{missing.push({...f,key});}
 }
 if(missing.length){
  const id=randomUUID(),manifest=path.join(cacheRoot,id+'-input.json'),output=path.join(cacheRoot,id+'-output.json');
  try{
   await fs.writeFile(manifest,JSON.stringify(missing.map(f=>({path:f.path,key:f.key,time:f.time}))));
   await runProcess('powershell.exe',['-NoProfile','-File',path.join(root,'frame-ocr.ps1'),'-Manifest',manifest,'-Output',output],{signal,timeoutMs:90000});
   for(const r of JSON.parse((await fs.readFile(output,'utf8')).replace(/^\uFEFF/,''))){rows.push(r);if(!r.error)await fs.writeFile(path.join(cacheRoot,r.key+'.json'),JSON.stringify(r));}
  }catch(error){if(signal?.aborted)throw error;for(const f of missing)rows.push({time:f.time,error:error.message});}
  finally{await fs.rm(manifest,{force:true});await fs.rm(output,{force:true});}
 }
 return {source:'windows-local-ocr',modelCalls:0,rows:rows.sort((a,b)=>a.time-b.time),notice:'抽样画面上的文字可能有错字，不是可信字幕轨或完整口播。'};
}

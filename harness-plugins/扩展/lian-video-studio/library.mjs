import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
export const HOME='E:/LianHome',LIB=HOME+'/工作室/创作素材库',PROJECTS=HOME+'/工作室/Remotion影片',RUNTIME='E:/DSH/插件/lian-video-runtime';
export const registryPath=LIB+'/assets.json';
export const hashFile=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
export function readRegistry(){return JSON.parse(fs.readFileSync(registryPath,'utf8'));}
export function assertProject(p){const absolute=fs.realpathSync(p),root=fs.realpathSync(PROJECTS);if(!absolute.toLowerCase().startsWith(root.toLowerCase()+path.sep))throw new Error('请使用Remotion影片目录内的项目');return absolute;}
export function searchAssets({query='',kind,style,limit=20}={}){const r=readRegistry(),q=query.toLowerCase();return {defaults:r.defaults,assets:r.assets.filter(a=>(!kind||a.kind===kind)&&(!style||a.style===style)&&(!q||(a.label+' '+a.tags.join(' ')).toLowerCase().includes(q))).slice(0,Math.min(50,Math.max(1,limit))),notice:'索引与文件存在不等于完成画面审美检查。'};}
export function bundleAssets(project,ids,{includeVoice=true}={}){
 const p=assertProject(project),r=readRegistry(),chosen=[...new Set([...(ids?.length?ids:[r.defaults.character,r.defaults.face]),...(includeVoice?[r.defaults.voice]:[])])];
 const dir=path.join(p,'references');fs.mkdirSync(dir,{recursive:true});const files=[];
 for(const id of chosen){const a=r.assets.find(x=>x.id===id);if(!a)throw new Error('素材ID不存在：'+id);if(hashFile(a.path)!==a.sha256)throw new Error('素材文件已变化，请先刷新索引：'+id);const filename=id+path.extname(a.path),target=path.join(dir,filename);fs.copyFileSync(a.path,target);files.push({id,kind:a.kind,style:a.style,purpose:a.purpose,path:target,sha256:a.sha256,uploadId:null,boundToTask:false});}
 const manifest={characterProfile:r.characterProfile,voice:r.voiceProfile,files,notice:'仅准备了本地参考文件；没有上传、提交生成或绑定云端参考槽。实际上传后记录真实标识。'};
 fs.writeFileSync(path.join(dir,'updream-references.json'),JSON.stringify(manifest,null,2));return manifest;
}

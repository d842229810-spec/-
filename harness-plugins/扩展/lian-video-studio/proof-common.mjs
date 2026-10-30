import fs from 'node:fs';import path from 'node:path';import {createHash,randomUUID} from 'node:crypto';
export const PROOFS='E:/LianHome/工作室/创作检查',CACHE='E:/DSH/插件/local-asr/proof-cache';
export const hashText=x=>createHash('sha256').update(x).digest('hex');
export async function hashMedia(file){const h=createHash('sha256');for await(const chunk of fs.createReadStream(file))h.update(chunk);return h.digest('hex')}
export function localSource(file,extensions=/\.(wav|mp3|m4a|flac|aac|mp4|mov|mkv|webm|ogg)$/i){
 if(typeof file!=='string'||!path.isAbsolute(file)||!extensions.test(file))throw Error('需要已接入目录内的本地文件绝对路径');
 const p=fs.realpathSync(file),roots=['E:/LianHome','E:/DSH/大肥鱼创作室'].filter(x=>fs.existsSync(x)).map(x=>fs.realpathSync(x).toLowerCase()+path.sep);
 if(!roots.some(r=>p.toLowerCase().startsWith(r))||!fs.statSync(p).isFile()||fs.statSync(p).size>2*1024**3)throw Error('文件不在已接入的资料目录，或不是2GB内的普通文件');return p;
}
export function createProof(kind){fs.mkdirSync(PROOFS,{recursive:true});const dir=path.join(PROOFS,kind+'-'+Date.now()+'-'+randomUUID().slice(0,8));fs.mkdirSync(dir);return dir}
export function proofFile(file){const p=fs.realpathSync(file),r=fs.realpathSync(PROOFS);if(!p.toLowerCase().startsWith(r.toLowerCase()+path.sep)||!p.endsWith('.json')||fs.statSync(p).size>2e6)throw Error('请选择本工具生成的检查JSON');return p}
export function saveJSON(file,data){const tmp=file+'.'+randomUUID()+'.tmp';fs.writeFileSync(tmp,JSON.stringify(data,null,2),{flag:'wx'});try{fs.renameSync(tmp,file)}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp)}}
export const resultNotice='仅提供本地可核对证据，不自动评判审美、不发布、不改变账号权限。';

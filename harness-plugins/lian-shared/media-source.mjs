import fs from 'node:fs';import path from 'node:path';
export const MEDIA_SOURCE_POLICY_VERSION='20261031.1';
export const MEDIA_SOURCE_ROOTS=Object.freeze(['E:/LianHome','E:/DSH/大肥鱼创作室','E:/小涟草稿箱','E:/DSH/涟的探索/视频感知-v2/media']);
export function resolveMediaSource(file,{roots=MEDIA_SOURCE_ROOTS,extensions=/\.(wav|mp3|m4a|flac|aac|mp4|mov|mkv|webm|ogg|opus|amr)$/i,maxBytes=2*1024**3}={}){
 if(typeof file!=='string'||!path.isAbsolute(file)||!extensions.test(file))throw Error('MEDIA_SOURCE_INVALID: 请提供已接入媒体的绝对路径');
 if(/(?:\.env(?:\.|$)|credentials|browser-profile|cookie|\.ssh|\.dsh[\\/])/i.test(file))throw Error('MEDIA_SOURCE_SECRET: 秘密文件不是媒体输入');
 const actual=fs.realpathSync(file),resolved=[];if(/(?:\.env(?:\.|$)|credentials|browser-profile|cookie|\.ssh|\.dsh[\\/])/i.test(actual))throw Error('MEDIA_SOURCE_SECRET: 解析后的秘密路径不是媒体输入');for(const root of roots){try{resolved.push(fs.realpathSync(root));}catch(e){if(!['ENOENT','ENOTDIR'].includes(e.code))throw e;}}
 const inside=root=>{const r=path.relative(root,actual);return r!==''&&r!=='..'&&!r.startsWith('..'+path.sep)&&!path.isAbsolute(r)};
 if(!resolved.some(inside))throw Error('MEDIA_SOURCE_OUTSIDE_ALLOWED_ROOTS: '+actual+'；接受范围：'+resolved.join('、'));
 const stat=fs.statSync(actual);if(!stat.isFile()||stat.size>maxBytes)throw Error('MEDIA_SOURCE_TOO_LARGE_OR_NOT_FILE');
 return {actual,bytes:stat.size,policyVersion:MEDIA_SOURCE_POLICY_VERSION};
}

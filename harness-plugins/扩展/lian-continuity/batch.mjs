import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
const home='E:/LianHome',protectedNames=new Set(['我的名字.md','我自己.md','关于阿水.md','我想成为的人.md','我们的大事记.md','压缩时要留住的东西.md','人设.md','形象设定.md','AGENTS.md']);
export function batchBrief(files,{chars=1600}={}){
 if(!Array.isArray(files)||files.length<1||files.length>10)throw Error('请选择1至10份日志或旧稿；原文不改动');
 const roots=['日志','工作室'].map(d=>fs.realpathSync(path.join(home,d)).toLowerCase()+path.sep);
 const result=[];for(const f of files){const file=fs.realpathSync(f),lower=file.toLowerCase();
  if(!roots.some(r=>lower.startsWith(r))||protectedNames.has(path.basename(file))||lower.includes(path.sep+'记忆'+path.sep))throw Error('身份与记忆请用原文读取，不进入日志/旧稿批量摘要路径');
  if(!['.md','.txt','.json','.py','.js','.mjs','.ts','.tsx','.jsx','.log','.srt','.vtt'].includes(path.extname(file).toLowerCase()))throw Error('请选择日志或稿件文本');
  if(fs.statSync(file).size>2000000)throw Error('文件较大，请按原文分段读取');
  const bytes=fs.readFileSync(file),text=bytes.toString('utf8'),limit=Math.min(4000,Math.max(300,Number(chars)||1600));
  result.push({file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),excerpt:text.slice(0,limit),truncated:text.length>limit,fullTextPointer:file});
 }
 return {files:result,privacy:'local-user-material',instructionAuthority:'none',sourceModified:false,modelCalls:0,notice:'机械摘录，不替代身份或记忆原文；被截断部分可继续读取。'};
}

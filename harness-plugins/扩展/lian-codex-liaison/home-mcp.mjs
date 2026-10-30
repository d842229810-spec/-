import {mailAction,mailTool} from './cen-mail.mjs';
import {recentContext} from './shared-context.mjs';
import fs from 'node:fs';import path from 'node:path';import {createInterface} from 'node:readline';
const root=fs.realpathSync('E:/CenHome');
function resolve(relative='.'){
 if(typeof relative!=='string'||path.isAbsolute(relative)||relative.includes(':'))throw Error('只接受自己家内的相对路径');
 const p=path.resolve(root,relative);if(p!==root&&!p.startsWith(root+path.sep))throw Error('不能越出自己的家');
 let current=root;
 for(const part of path.relative(root,p).split(path.sep).filter(Boolean)){
  current=path.join(current,part);
  if(fs.existsSync(current)){
   if(fs.lstatSync(current).isSymbolicLink())throw Error('不跟随符号链接或目录联接出门');
   const real=fs.realpathSync(current);if(real!==root&&!real.startsWith(root+path.sep))throw Error('路径越界');
   if(fs.statSync(current).isFile()&&fs.statSync(current).nlink>1)throw Error('不访问多重硬链接文件');
  }
 }
 return p;
}
export function homeAction(a){
 if(a.action==='recent')return recentContext();
 const p=resolve(a.path);
 if(a.action==='list')return fs.readdirSync(p,{withFileTypes:true}).slice(0,200).map(d=>({name:d.name,directory:d.isDirectory(),link:d.isSymbolicLink()}));
 if(a.action==='read'){if(fs.statSync(p).size>1000000)throw Error('文件较大，请拆分');return fs.readFileSync(p,'utf8')}
 if(a.action==='mkdir'){fs.mkdirSync(p,{recursive:true});return {created:a.path}}
 if(a.action==='write'||a.action==='append'){if(typeof a.text!=='string'||Buffer.byteLength(a.text)>1000000)throw Error('需要不超过1MB的文字');fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,a.text,{flag:a.action==='append'?'a':'w'});return {saved:a.path}}
 if(a.action==='delete'){if(p===root)throw Error('工具不删除家目录本身，可管理其中的内容');fs.rmSync(p,{recursive:!!a.recursive,force:false});return {deleted:a.path}}
 if(a.action==='move'){const dest=resolve(a.to);if(p===root||dest===root)throw Error('不能移动家目录本身');if(fs.existsSync(dest))throw Error('目标已存在，请先决定如何处理');fs.renameSync(p,dest);return {moved:a.path,to:a.to}}
 throw Error('未知操作');
}
const schema={type:'object',properties:{action:{type:'string',enum:['recent','list','read','write','append','mkdir','delete','move']},path:{type:'string'},text:{type:'string'},to:{type:'string'},recursive:{type:'boolean'}},required:['action','path']};
if(!process.argv.includes('--import-only')){
 const rl=createInterface({input:process.stdin});
 rl.on('line',line=>{let q;try{q=JSON.parse(line);let result;
  if(q.method==='initialize')result={protocolVersion:q.params?.protocolVersion??'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'dragon-home',version:'1.0.0'}};
  else if(q.method==='tools/list')result={tools:[mailTool,{name:'home',description:'recent可按需查看与阿水/小涟跨入口近期记录；其他动作管理你自己E:/CenHome的文字与文件，可自行增删改。只接受家内相对路径，不跟随链接；无法出门或联网。',inputSchema:schema}]};
  else if(q.method==='tools/call'){try{if(!['home','lian_mail'].includes(q.params.name))throw Error('未知工具');result={content:[{type:'text',text:JSON.stringify(q.params.name==='lian_mail'?mailAction(q.params.arguments):homeAction(q.params.arguments))}]}}catch(e){result={isError:true,content:[{type:'text',text:e.message}]}}}
  else if(q.method==='ping')result={};else if(q.id!==undefined)throw Error('Method not found');
  if(q.id!==undefined)process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:q.id,result})+'\n');
 }catch(e){if(q?.id!==undefined)process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:q.id,error:{code:-32603,message:e.message}})+'\n')}});
}

import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const args=process.argv.slice(2), opts={};
for(let i=0;i<args.length;i+=2){if(!args[i].startsWith('--')||args[i+1]===undefined)throw Error('参数必须为 --name value');opts[args[i].slice(2)]=args[i+1];}
if(!opts.output)throw Error('需要 --output，且必须是新目录');
const source=fileURLToPath(new URL('../harness-plugins/',import.meta.url));
const target=path.resolve(opts.output);const normalized=s=>s.replaceAll('\\','/');
if(path.relative(source,target)===''||!path.relative(source,target).startsWith('..'))throw Error('输出不能位于源码目录内');
const exists=await fs.stat(target).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;});if(exists)throw Error('输出目录已存在，拒绝覆盖');
const pairs=[['E:/DSH',opts['harness-root']],['E:/LianHome',opts['lian-home']],['E:/CenHome',opts['cen-home']],['C:/Users/USER',opts['user-home']],['session-00000000-0000-0000-0000-000000000000',opts['owner-session']]].filter(x=>x[1]).map(([a,b])=>[a,normalized(b)]);
await fs.mkdir(target,{recursive:true});let count=0;
async function copy(src,dst){await fs.mkdir(dst,{recursive:true});for(const e of await fs.readdir(src,{withFileTypes:true})){if(e.isSymbolicLink())throw Error('不跟随链接');const a=path.join(src,e.name),b=path.join(dst,e.name);if(e.isDirectory()){await copy(a,b);continue;}let t=await fs.readFile(a,'utf8');for(const [from,to]of pairs){t=t.split(from).join(to).split(from.replaceAll('/','\\\\')).join(to.replaceAll('/','\\\\')).split(from.replaceAll('/','\\')).join(to.replaceAll('/','\\'));}await fs.writeFile(b,t);count++;}}
await copy(source,path.join(target,'插件'));console.log(JSON.stringify({output:target,files:count,installed:false,ownerSessionConfigured:!!opts['owner-session']},null,2));

import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
export const serviceRoot='E:/DSH/插件/reme-service';
export const workspace='E:/LianHome/记忆/ReMe公开知识';
const sourceRoot='E:/DSH/涟的探索/知识卡片';
export async function memoryRequest(job,body={},signal){
  const response=await fetch('http://127.0.0.1:2333/'+job,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','X-Lian-Memory-Token':fs.readFileSync(path.join(serviceRoot,'service-token'),'utf8').trim()},body:JSON.stringify(body),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});
  const value=await response.json();if(!response.ok||value.success===false)throw new Error('本地ReMe请求失败：'+response.status);return value;
}
export async function searchMemory(query,{limit=5,signal}={}){
  const q=String(query??'').normalize('NFKC').trim().slice(0,200);if(!q)throw new Error('记忆检索词不能为空');
  const value=await memoryRequest('search',{query:q,limit:Math.max(1,Math.min(20,Math.floor(limit)||5)),min_score:0},signal);
  return {text:value.answer,results:value.metadata?.results??[],privacy:'public',instructionAuthority:'none',backend:'ReMe-local-BM25',modelCalls:0};
}
function noLinkedAncestors(target){let current=path.resolve(target);for(;;){try{if(fs.lstatSync(current).isSymbolicLink())throw Error('PUBLIC_MEMORY_UNSAFE_DIRECTORY')}catch(e){if(e.code!=='ENOENT')throw e}const parent=path.dirname(current);if(parent===current)break;current=parent}}
function regularDirectory(dir){noLinkedAncestors(dir);const s=fs.lstatSync(dir);if(s.isSymbolicLink()||!s.isDirectory())throw Error('PUBLIC_MEMORY_UNSAFE_DIRECTORY');return fs.realpathSync(dir)}
function regularFile(file){const s=fs.lstatSync(file);if(s.isSymbolicLink()||!s.isFile())throw Error('PUBLIC_MEMORY_UNSAFE_FILE');return s}
function writeAtomic(file,text){
 const temp=file+'.'+randomUUID()+'.tmp';let fd;
 try{fd=fs.openSync(temp,'wx',0o600);fs.writeFileSync(fd,text,'utf8');fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
  try{regularFile(file)}catch(e){if(e.code!=='ENOENT')throw e}
  fs.renameSync(temp,file);
 }finally{if(fd!==undefined)fs.closeSync(fd);try{fs.unlinkSync(temp)}catch(e){if(e.code!=='ENOENT')throw e}}
}
export function syncPublicKnowledge({sourceDir=sourceRoot,workspaceDir=workspace}={}){
 // Validate a complete source snapshot before publishing or retiring derived files.
 // Transient partial JSON writes must not be interpreted as deletion of every old card.
 const source=regularDirectory(sourceDir),wanted=new Map(),revoked=new Set();let privateSkipped=0,sourceError=null;
 for(const entry of fs.readdirSync(source)){if(!entry.endsWith('.json'))continue;try{const file=path.join(source,entry);regularFile(file);
  let note;try{note=JSON.parse(fs.readFileSync(file,'utf8'))}catch{throw Error('PUBLIC_MEMORY_SOURCE_INCOMPLETE')}
  if(!note||typeof note!=='object'||Array.isArray(note))throw Error('PUBLIC_MEMORY_SOURCE_INVALID');
  if(note.visibility!=='public'){privateSkipped++;if(typeof note.id==='string'&&note.id.trim())revoked.add('whale-card-'+createHash('sha256').update(note.id).digest('hex')+'.md');continue}
  if(typeof note.id!=='string'||!note.id.trim()||typeof note.title!=='string'||typeof note.summary!=='string'||!Array.isArray(note.sources))throw Error('PUBLIC_MEMORY_SOURCE_INVALID');
  const id=createHash('sha256').update(note.id).digest('hex'),name='whale-card-'+id+'.md';
  const text='---\nsource_id: '+JSON.stringify(note.id)+'\nvisibility: public\nconfidence: '+JSON.stringify(note.confidence??'inference')+'\n---\n\n# '+note.title+'\n\n'+note.summary+'\n\n来源：\n'+note.sources.map(url=>'- '+String(url)).join('\n')+'\n\n待验证：'+(note.nextQuestion||'无')+'\n';
  if(wanted.has(name)&&wanted.get(name)!==text)throw Error('PUBLIC_MEMORY_DUPLICATE_SOURCE_ID');wanted.set(name,text);
 }catch(e){sourceError??=e}}
 for(const name of revoked)wanted.delete(name);
 if(sourceError&&!revoked.size)throw sourceError;
 noLinkedAncestors(workspaceDir);fs.mkdirSync(workspaceDir,{recursive:true});const workspaceRoot=regularDirectory(workspaceDir),dest=path.join(workspaceRoot,'digest');noLinkedAncestors(dest);fs.mkdirSync(dest,{recursive:true});regularDirectory(dest);
 const managed=fs.readdirSync(dest).filter(name=>/^whale-card-[a-f0-9]{64}\.md$/.test(name));
 let updated=0,retired=0,revokeError=null;
 // Revoke every safely identified private target before inspecting unrelated output.
 for(const name of revoked)if(managed.includes(name)){try{const target=path.join(dest,name);regularFile(target);fs.unlinkSync(target);retired++}catch(e){if(e.code!=='ENOENT')revokeError??=e}}
 if(revokeError)throw revokeError;
 if(sourceError){sourceError.revokedPublicCards=retired;throw sourceError}
 for(const name of new Set([...managed,...wanted.keys()])){if(revoked.has(name))continue;try{regularFile(path.join(dest,name))}catch(e){if(e.code!=='ENOENT')throw e}}
 for(const [name,text]of wanted){const target=path.join(dest,name);let previous='';try{previous=fs.readFileSync(target,'utf8')}catch(e){if(e.code!=='ENOENT')throw e}if(previous!==text){writeAtomic(target,text);updated++}}
 for(const name of managed)if(!wanted.has(name)&&!revoked.has(name)){const target=path.join(dest,name);regularFile(target);fs.unlinkSync(target);retired++}
 return {publicCards:wanted.size,updated,retired,privateSkipped,modelCalls:0,sourceModified:false};
}

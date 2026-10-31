import fs from 'node:fs';import path from 'node:path';import {homedir} from 'node:os';import {randomUUID} from 'node:crypto';
export {partitionFields} from './partition-view.mjs';
const queues=new Map();
export function createPartitionStore({root=path.join(homedir(),'.dsh/lian-workspace-manager'),registry,persistence}={}){
 fs.mkdirSync(root,{recursive:true});root=fs.realpathSync(root);const file=path.join(root,'partitions.json'),lock=path.join(root,'partitions.lock');
 const safeFile=p=>{if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw Error('分区数据不能是链接');return p;};
 function read(){try{const v=JSON.parse(fs.readFileSync(safeFile(file),'utf8'));if(!Number.isSafeInteger(v.revision)||v.revision<0||!v.assignments||typeof v.assignments!=='object'||Array.isArray(v.assignments)||Object.entries(v.assignments).some(([k,t])=>!k||k.length>200||['__proto__','constructor','prototype'].includes(k)||(t!==null&&typeof t!=='string')))throw Error('Invalid data');return v;}catch(e){if(e.code==='ENOENT')return {revision:0,assignments:{}};throw Error('分区数据损坏，请恢复备份；未覆盖原数据');}}
 function transaction(fn){const job=(queues.get(root)??Promise.resolve()).then(async()=>{let fd;try{fd=fs.openSync(safeFile(lock),'wx');fs.writeFileSync(fd,JSON.stringify({pid:process.pid,at:new Date().toISOString(),operation:'workspace-partition'}));}catch(e){if(e.code==='EEXIST')throw Error('另一个工作区管理进程正在修改，请稍后刷新重试');throw e;}try{return await fn(read(),next=>{
   const backup=path.join(root,'backups','partition-'+Date.now()+'-'+randomUUID());fs.mkdirSync(backup,{recursive:true});fs.writeFileSync(path.join(backup,'partitions.json'),JSON.stringify(read(),null,2));
   const tmp=file+'.'+randomUUID()+'.tmp';try{fs.writeFileSync(tmp,JSON.stringify(next,null,2),{flag:'wx'});fs.renameSync(tmp,safeFile(file));}finally{fs.rmSync(tmp,{force:true});}return backup;
  });}finally{fs.closeSync(fd);fs.rmSync(lock,{force:true});}});queues.set(root,job.catch(()=>{}));return job;}
 async function update(a,{beforeCommit}={}){return transaction(async(prev,commit)=>{
  if(!Number.isSafeInteger(a.revision)||a.revision!==prev.revision)throw Error('分区已被其他窗口修改，请刷新后重试');
  if(!['move','reset'].includes(a.action))throw Error('未知分区操作');
  const h=(await persistence.list()).find(x=>x.header.id===a.sessionId)?.header;if(!h||h.parentSession||h.parentSessionId||h.parentId)throw Error('找不到普通原会话');
  if(a.action==='move'&&a.workspaceId!==null&&!registry.get(a.workspaceId))throw Error('目标分区不存在');
  await beforeCommit?.();
  const next={revision:prev.revision+1,assignments:{...prev.assignments}};if(a.action==='reset')delete next.assignments[a.sessionId];else next.assignments[a.sessionId]=a.workspaceId;
  const backup=commit(next);fs.appendFileSync(path.join(root,'actions.jsonl'),JSON.stringify({at:new Date().toISOString(),action:'shared-partition',sessionId:a.sessionId,target:a.action==='reset'?'original':a.workspaceId,backup,modelCalls:0})+'\n');return next;
 });}
 return {read,update,root,file};
}

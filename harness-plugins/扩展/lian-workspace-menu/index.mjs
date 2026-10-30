import fs from 'node:fs';import path from 'node:path';import {homedir} from 'node:os';import {randomUUID} from 'node:crypto';
import {TYPERT} from './workspace-contract.mjs';
export const name='lian-workspace-menu';export const inject=['workspaceRegistry','sessionPersistence','typert'];
export function apply(ctx){
 const root=path.join(homedir(),'.dsh/lian-workspace-manager'),file=path.join(root,'partitions.json');fs.mkdirSync(root,{recursive:true});let queue=Promise.resolve();
 const read=()=>{try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){if(e.code==='ENOENT')return {revision:0,assignments:{}};throw Error('分区数据损坏，已停止修改，请检查备份');}};
 const service={getPartitions:()=>JSON.stringify(read()),setPartition:input=>{
  const job=queue.then(async()=>{const a=JSON.parse(input),prev=read();if(a.revision!==prev.revision)throw Error('其他窗口刚修改分区，请重开菜单');
   if(!['move','reset'].includes(a.action))throw Error('未知操作');if(!(await ctx.sessionPersistence.list()).some(x=>x.header.id===a.sessionId))throw Error('找不到会话');
   if(a.action==='move'&&a.workspaceId!==null&&!ctx.workspaceRegistry.get(a.workspaceId))throw Error('目标分区不存在');
   const backup=path.join(root,'backups','partition-'+Date.now()+'-'+randomUUID());fs.mkdirSync(backup,{recursive:true});fs.writeFileSync(path.join(backup,'partitions.json'),JSON.stringify(prev,null,2));
   const next={revision:prev.revision+1,assignments:{...prev.assignments}};if(a.action==='reset')delete next.assignments[a.sessionId];else next.assignments[a.sessionId]=a.workspaceId;
   const tmp=file+'.'+randomUUID()+'.tmp';fs.writeFileSync(tmp,JSON.stringify(next,null,2));fs.renameSync(tmp,file);
   fs.appendFileSync(path.join(root,'actions.jsonl'),JSON.stringify({at:new Date().toISOString(),action:'menu-partition',sessionId:a.sessionId,target:a.action==='reset'?'original':a.workspaceId,backup,modelCalls:0})+'\n');return JSON.stringify(next);
  });queue=job.catch(()=>{});return job;
 }};
 Object.defineProperty(service,'typertRemote',{value:{service,serviceKey:'lianWorkspaceMenu',namespace:'lianWorkspaceMenu'}});
 ctx.provide('lianWorkspaceMenu',service);ctx.effect(()=>ctx.typert.register(TYPERT));
 fs.writeFileSync(path.join(root,'menu-health.json'),JSON.stringify({ready:true,version:'1.1.0',at:new Date().toISOString(),modelCalls:0}));
}

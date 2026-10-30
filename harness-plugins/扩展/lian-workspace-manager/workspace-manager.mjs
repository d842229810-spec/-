import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import {randomBytes,randomUUID} from 'node:crypto';import {homedir} from 'node:os';import {fileURLToPath} from 'node:url';
export const name='lian-workspace-manager';
export const inject=['workspaceRegistry','sessionPersistence','sessionController','sessions','workingDirectory'];
const owner='session-00000000-0000-0000-0000-000000000000';
export function apply(ctx,config={}){
 const registry=ctx.workspaceRegistry,persistence=ctx.sessionPersistence,controller=ctx.sessionController,sessions=ctx.sessions,working=ctx.workingDirectory;
 const state=config.stateDir??path.join(homedir(),'.dsh/lian-workspace-manager');fs.mkdirSync(state,{recursive:true});
 const token=randomBytes(32).toString('hex'),port=config.port??53461,origin='http://127.0.0.1:'+port;let queue=Promise.resolve(),closed=false;
 const serial=fn=>{const p=queue.then(fn,fn);queue=p.catch(()=>{});return p;};
 const view=w=>({id:w.id,title:w.title,path:w.path,sessionIds:[...w.sessionIds]});
 function backup(label,extra={}){const dir=path.join(state,'backups',Date.now()+'-'+randomUUID());fs.mkdirSync(dir,{recursive:true});fs.copyFileSync(config.registryFile??path.join(homedir(),'.dsh/storages/workspace.json'),path.join(dir,'workspace.json'));fs.writeFileSync(path.join(dir,'before.json'),JSON.stringify({at:new Date().toISOString(),label,workspaces:registry.list().map(view),archived:[...registry.archivedSessionIds],...extra},null,2));return dir;}
 function audit(v){fs.appendFileSync(path.join(state,'actions.jsonl'),JSON.stringify({at:new Date().toISOString(),...v,modelCalls:0})+'\n');}
 async function headers(){return (await persistence.list()).map(x=>x.header).filter(h=>h.cwd);}
 async function status(){let cached={};try{cached=JSON.parse(fs.readFileSync(path.join(homedir(),'.dsh/storages/session_projcache.json'),'utf8')).tables.sessions;}catch{}
  return {owner,modelCalls:0,workspaces:registry.list().map(view),sessions:(await headers()).filter(h=>!h.parentSession).sort((a,b)=>b.createdAt-a.createdAt).map(h=>{const live=sessions.get(h.id),title=cached[h.id]?.rows?.title?.val;return {id:h.id,title:typeof title==='string'?title:(title?.title??(h.id===owner?'小涟（原主会话）':h.id)),originalDirectory:h.cwd,currentDirectory:live?working.get(live):(cached[h.id]?.rows?.workingDirectory?.val??h.cwd),createdAt:h.createdAt,archived:registry.archivedSessionIds.includes(h.id),workspaceId:registry.list().find(w=>w.sessionIds.includes(h.id))?.id??null};})};}
 async function mutate(a){if(closed)throw Error('管理器正在关闭');
  if(a.action==='create'){const p=await fs.promises.realpath(a.path);if(!path.isAbsolute(a.path)||!fs.statSync(p).isDirectory())throw Error('请选择已存在的绝对目录');const b=backup('create-workspace',{path:p});const w=await registry.create(p);audit({action:a.action,workspaceId:w.id,backup:b});return {message:'工作区已登记',workspace:view(w),backup:b};}
  if(a.action==='rename'){const w=registry.get(a.workspaceId);if(!w)throw Error('工作区不存在');const title=String(a.title??'').trim();if(!title||title.length>80)throw Error('名称需为1至80字');if(registry.list().some(x=>x.id!==w.id&&x.title===title))throw Error('已有同名工作区');const b=backup('rename-workspace');await w.setTitle(title);audit({action:a.action,workspaceId:w.id,title,backup:b});return {message:'工作区名称已修改',backup:b};}
  const h=(await headers()).find(h=>h.id===a.sessionId);if(!h)throw Error('找不到原会话，未创建替代会话');
  if(a.action==='restore'||a.action==='attach'){
   const original=await fs.promises.realpath(h.cwd);let w=a.action==='attach'?registry.get(a.workspaceId):await registry.resolveByPath(original);
   if(a.action==='attach'&&!w)throw Error('目标工作区不存在');
   if(w&&w.path!==original)throw Error('原生侧栏归属必须与会话创建目录一致；如需在别处工作，请用下方“切换工作目录”，原会话和家不搬走。');
   const b=backup(a.action,{sessionId:h.id});w??=await registry.create(original);await w.attachSession(h.id);
   if(a.unarchive===true)await registry.unarchiveSession(h.id);
   if(!w.sessionIds.includes(h.id))throw Error('原生回读未确认关联成功');
   audit({action:a.action,sessionId:h.id,workspaceId:w.id,backup:b});return {message:'已恢复到「'+w.title+'」'+(registry.archivedSessionIds.includes(h.id)?'（仍为归档状态，可勾选取消归档）':''),backup:b,workspace:view(w)};
  }
  if(a.action==='directory'){
   if(typeof a.path!=='string'||!path.isAbsolute(a.path))throw Error('请输入已有目录的绝对路径');const target=await fs.promises.realpath(a.path);if(!fs.statSync(target).isDirectory())throw Error('路径不是目录');
   const found=await controller.resolveAgent(h.id);if(found.error)throw found.error;const agent=found.agent;if(agent.phase?.kind!=='idle')throw Error('会话正在工作，请空闲后切换；没有中断任务');
   const previous=working.get(agent.session);if(previous===target)return {message:'当前已经是这个目录，无需修改'};
   await sessions.flush(agent.session);const b=backup('directory',{sessionId:h.id,previous,target});const snap=await controller.inspect(h.id);fs.writeFileSync(path.join(b,'session-before.json'),JSON.stringify(snap));
   if(agent.phase?.kind!=='idle')throw Error('备份期间会话开始工作，已取消修改');
   // Native durable state event, deliberately no agent.inject/followup/model request.
   agent.session.append('working-directory/change',{cwd:target});await sessions.flush(agent.session);
   if(working.get(agent.session)!==target)throw Error('目录回读不一致，请检查备份');audit({action:a.action,sessionId:h.id,previous,target,backup:b});return {message:'工作目录已改为 '+target+'；下一次你主动发消息时生效，不启动对话，不移动文件或改变已有进程。',backup:b};
  }
  throw Error('未知操作');
 }
 const html=fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)),'workspace-manager.html'),'utf8');
 const server=http.createServer(async(req,res)=>{try{
  if(req.headers.host!=='127.0.0.1:'+port)throw Error('不接受其他Host');if(req.headers.origin&&req.headers.origin!==origin)throw Error('拒绝跨站请求');
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'");
  if(req.method==='GET'&&req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html.replace('__TOKEN__',token));return;}
  if(req.method==='GET'&&req.url==='/api/status'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(await status()));return;}
  if(req.method==='POST'&&req.url==='/api/action'){
   if(req.headers['x-workspace-token']!==token||!req.headers['content-type']?.startsWith('application/json'))throw Error('请求来源校验失败');let body='';for await(const part of req){body+=part;if(body.length>12000)throw Error('请求过大');}
   const value=await serial(()=>mutate(JSON.parse(body)));res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));return;
  }res.writeHead(404);res.end('Not found');
 }catch(e){res.statusCode=400;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:e.message}));}});
 server.on('error',e=>fs.writeFileSync(path.join(state,'health.json'),JSON.stringify({error:e.message,modelCalls:0})));
 server.listen(port,'127.0.0.1',()=>fs.writeFileSync(path.join(state,'health.json'),JSON.stringify({ready:true,url:origin,version:'1.0.0',modelCalls:0,at:new Date().toISOString()})));
 ctx.effect(()=>()=>{closed=true;server.close();});
 // One explicit owner-requested repair; no periodic reattachment and no model wakeup.
 if(config.repairId){const resultFile=path.join(state,'repair-'+config.repairId+'.json');if(!fs.existsSync(resultFile)){const timer=setTimeout(()=>void serial(()=>mutate({action:'restore',sessionId:owner,unarchive:true})).then(result=>fs.writeFileSync(resultFile,JSON.stringify({ok:true,...result,modelCalls:0},null,2))).catch(e=>fs.writeFileSync(resultFile,JSON.stringify({ok:false,error:e.message,modelCalls:0}))),3000);ctx.effect(()=>()=>clearTimeout(timer));}}
}

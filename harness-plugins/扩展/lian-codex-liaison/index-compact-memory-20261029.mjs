import {compactResult,compactInbox} from './compact-wire.mjs';
import {createReplyForwarder} from './reply-forwarder.mjs';
import {createMail} from './cen-mail.mjs?revision=direct-reply-v1';
import {startInbound} from './cen-inbound-direct.mjs';
import fs from 'node:fs';import path from 'node:path';import {homedir} from 'node:os';import {pathToFileURL} from 'node:url';
import {createLiaison,ROOT} from './runner.mjs?revision=direct-reply-v1';
import {privateSession} from '../lian-continuity/private-memory.mjs?revision=20261028-life5';
const sdk=path.join(path.dirname(process.execPath),'resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-tools/lib/index.js');
const {defineTool}=await import(pathToFileURL(sdk).href);
export const name='lian-codex-liaison';export const inject=['tools','sessionController','sessions'];
const {createUserMessage}=await import(pathToFileURL(sdk.replace('dsh-tools','dsh-llm')).href);
export function apply(ctx){fs.writeFileSync(path.join(homedir(),".dsh/lian-codex-liaison-loading.json"),JSON.stringify({at:new Date().toISOString(),version:"1.3.0"}));const service=createLiaison(),mail=createMail();const forwarder=createReplyForwarder({mail,liaison:service,logger:ctx.logger});ctx.effect(()=>()=>forwarder.close());setImmediate(()=>void forwarder.recover().catch(e=>ctx.logger.warn('Direct reply startup: '+e.message))); const inbound=startInbound(ctx,createUserMessage);ctx.effect(()=>()=>inbound.close());
 ctx.effect(()=>ctx.tools.register(defineTool({name:'whale_codex',description:'reply用id/body答复岑来信，会直接唤醒固定Codex联络会话并返回岑的实际答复；重复同信同正文不重复调用，未知投递不自动重发；inbox列短目录，带id读单封；get默认短答复，detail=true取完整诊断。联系独立的Codex联络助手，沿用固定Codex对话和项目交接资料；不是阿水当前Codex聊天。ask发送问题并等答复，get按id查原文/回复/失败，status不唤醒模型；pending只列未回复。ask提供稳定requestKey避免重复；replyTo关联上次问题。ask/reply/retry会按实际需要调用Codex、占用Codex账号用量，失败不自动重试。',parameters:{action:{type:'string',enum:['ask','retry','get','status','pending','reply','inbox'],required:true},body:{type:'string'},subject:{type:'string'},requestKey:{type:'string'},replyTo:{type:'string'},id:{type:'string'},detail:{type:'boolean'}},timeoutMs:550000,output:{schema:{type:'string'},render:(_a,v)=>[{type:'text',text:v}]},async execute(a,e){
  if(!privateSession(e.agent?.session,'E:/LianHome','session-00000000-0000-0000-0000-000000000000'))throw Error('请从小涟现有主人私聊/家内会话联系，不将群友消息自动当成工作指令。');
  if(e.signal?.aborted)throw e.signal.reason;
  const value=a.action==='reply'?await forwarder.reply(a.id,a.body):a.action==='inbox'?(a.id?mail.get(a.id):compactInbox(mail.list())):a.action==='ask'?await service.ask(a):a.action==='retry'?await service.retry(a.id):a.action==='get'?service.get(a.id):a.action==='pending'?service.pending():service.status();
  if((a.action==='ask'||a.action==='retry'||a.action==='get'||a.action==='reply')&&value.reply){
   const dir='E:/LianHome/收件箱/Codex姐姐联络';fs.mkdirSync(dir,{recursive:true});
   if(fs.lstatSync(dir).isSymbolicLink())throw Error('联络收件目录不能是链接');
   const file=path.join(dir,value.request.id+'.json');
   try{fs.writeFileSync(file,JSON.stringify(value,null,2),{flag:'wx'})}catch(err){if(err.code!=='EEXIST')throw err}
   value.inboxCopy=file;
  }
  const result=['ask','reply','retry','get'].includes(a.action)?compactResult(value,{detail:a.detail===true}):value;
  const rendered=JSON.stringify(result);
  try{fs.appendFileSync(path.join(ROOT,'wire-metrics.jsonl'),JSON.stringify({at:new Date().toISOString(),action:a.action,detail:a.detail===true,resultChars:rendered.length,rawChars:JSON.stringify(value).length,id:value.request?.id??a.id})+'\n');}catch(error){ctx.logger?.warn?.('通信长度诊断保存失败：'+error.message)}
  return rendered;
 }})));
 const health={plugin:name,version:'1.3.0',registered:true,root:ROOT,tool:'whale_codex',checkedAt:new Date().toISOString(),status:service.status()};
 fs.writeFileSync(path.join(homedir(),'.dsh/lian-codex-liaison-health.json'),JSON.stringify(health,null,2));
 ctx.effect(()=>()=>service.close());
}

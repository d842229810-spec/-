import {communicationWindow} from './communication-window.mjs';
import fs from 'node:fs';
import {createHash} from 'node:crypto';

export function replyRequestId(mailId){
 const h=createHash('sha256').update('lian-direct-mail-reply:'+mailId).digest('hex').slice(0,32);
 return [h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join('-');
}

// A tool reply invokes Codex directly. The watcher only retries requests known
// not to have started when another process releases the existing bridge lock.
// Old, unmarked historical replies are never replayed on startup.
export function createReplyForwarder({mail,liaison,watch=true,logger=console,clock=()=>new Date()}){
 const running=new Map();let closed=false,watcher,wakeTimer;
 const root=liaison.status().root;
 function receipt(id,value){mail.replyDelivery(id,{...value,requestId:replyRequestId(id),at:new Date().toISOString()});}
 async function perform(id){
  const letter=mail.get(id);if(!letter.reply)throw Error('信件尚无小涟回信');
  const requestId=replyRequestId(id);
  if(closed){receipt(id,{state:'queued',reason:'bridge-stopped'});return {mailId:id,replyStored:true,deliveryState:'queued',requestId};}
  const window=communicationWindow(clock());if(!window.allowed){receipt(id,{state:'queued',reason:'peak-hours',nextAllowedAt:window.nextAllowedAt});if(watch&&!wakeTimer){wakeTimer=setTimeout(()=>{wakeTimer=null;void recover().catch(e=>logger.warn?.(e.message));},Math.max(1000,new Date(window.nextAllowedAt).getTime()-Date.now()+100));wakeTimer.unref?.();}return {mailId:id,replyStored:true,deliveryState:'queued',requestId,notice:'峰时暂停通信，已保存，空闲时段再投递。',nextAllowedAt:window.nextAllowedAt};}
  receipt(id,{state:'processing'});
  let value;
  try{
   value=await liaison.ask({body:letter.reply.body,subject:('回复岑：'+letter.message.subject).slice(0,120),requestKey:'lian-direct-mail-reply:'+id,inReplyToMailId:id});
  }catch(error){
   try{value=liaison.get(requestId);}catch{}
   const attempt=value?.attempt;
   // An existing active.lock rejects before a subprocess is started. No
   // attempt means this stable request is safe to defer until the lock releases.
   const state=attempt?.state==='not-delivered'?'not-delivered':attempt?'delivery-unknown':'queued';
   receipt(id,{state,error:String(error.message??error).slice(0,1200)});
   return {...value,mailId:id,replyStored:true,deliveryState:state,requestId,notice:state==='queued'?'回信已保存，等待联络进程空闲后直接投递。':'投递状态不明，保留记录，不自动重复唤醒。'};
  }
  const state=value.reply?'replied':value.attempt?.state==='not-delivered'?'not-delivered':value.attempt?'delivery-unknown':'queued';
  receipt(id,{state,threadId:value.attempt?.threadId,producer:value.reply?.producer,error:value.attempt?.error});
  return {...value,mailId:id,replyStored:true,deliveryState:state,requestId,transport:'direct-codex-tool-result',notice:value.reply?'岑已在固定联络会话实际答复；答复直接作为本次工具结果返回。':'回信已保存；请按deliveryState区分等待与未知，不把保存成功当成岑已答复。'};
 }
 function dispatch(id){
  if(running.has(id))return running.get(id);
  const p=perform(id).finally(()=>running.delete(id));running.set(id,p);return p;
 }
 async function recover(){
  if(closed)return;
  for(const item of mail.list()){
   if(closed)return;
   if(item.reply&&(['queued','processing'].includes(item.replyDelivery?.state)||(!item.replyDelivery&&item.reply.producer?.kind==='harness-completed-turn'))){
    try{await dispatch(item.message.id);}catch(e){logger.warn?.('Direct reply recovery: '+e.message);}
   }
  }
 }
 if(watch){watcher=fs.watch(root,(_event,name)=>{if(String(name)==='active.lock'&&!fs.existsSync(root+'/active.lock'))void recover().catch(e=>logger.warn?.('Direct reply recovery: '+e.message));});watcher.on('error',e=>logger.warn?.('Direct reply lock watch: '+e.message));}
 return {deliverStored:dispatch,reply(id,body){mail.reply(id,body);return dispatch(id);},recover,close(){closed=true;watcher?.close();clearTimeout(wakeTimer);},running:()=>running.size};
}

import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {currentReplyId} from './compact-wire.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
const text=value=>{if(typeof value!=='string'||!value.trim()||value.length>12000)throw Error('正文需为1至12000字');return value.trim();};
export function replyGuidance({id,body,callId,code='LETTER_ALREADY_REPLIED'}){
 const requestKey='chat-next:'+sha([id??'none',callId??'caller-must-use-stable-key',body??''].join('\0')).slice(0,48);
 return {deliveryState:'needs-action',code,mailId:id??null,modelInvoked:false,notice:code==='LETTER_ALREADY_REPLIED'?'这封信已有不可变回信。接着聊天请用chat发下一句话；没有覆盖旧信，也没有重发。':'没有唯一关联的未回复来信。新话题或继续聊天请用chat；未发送任何消息。',nextAction:{action:'chat',body,requestKey}};
}

// Route is durably selected before sending. Retrying a chat after an incoming
// letter becomes "replied" must not turn that same utterance into a new letter.
export function createConversation({mail,forwarder,liaison,root=liaison.status().root,current=()=>null}){
 const dir=path.join(root,'chat-actions');fs.mkdirSync(dir,{recursive:true});if(fs.lstatSync(dir).isSymbolicLink())throw Error('聊天动作目录不能是链接');
 const select=explicit=>{if(explicit)return explicit;const correlated=current();if(correlated)return correlated;return currentReplyId(mail,{required:false});};
 function plan(a){
  const body=text(a.body),key=a.requestKey;
  if(typeof key!=='string'||!key.trim()||key.length>160)throw Error('chat需要稳定requestKey（1至160字）；同一次发送重试请沿用');
  const file=path.join(dir,sha(key)+'.json');
  if(fs.existsSync(file)){if(fs.lstatSync(file).isSymbolicLink())throw Error('聊天动作文件不能是链接');const old=JSON.parse(fs.readFileSync(file,'utf8'));if(old.body!==body||old.subject!==(a.subject??'对话')||old.replyTo!==(a.replyTo??null)||old.explicitMailId!==(a.id??null))throw Error('requestKey已用于另一条聊天消息');return old;}
  const correlated=current();const id=a.id??(a.replyTo?null:correlated);const v=id?mail.get(id):null;
  if(v&&!v.reply&&v.receipt.state!=='accepted'&&id!==correlated)throw Error('该来信投递状态尚未确认，请先查inbox，不自动回复未知投递');
  const next={schemaVersion:1,requestKey:key,body,subject:a.subject??'对话',replyTo:a.replyTo??null,explicitMailId:a.id??null,route:v&&!v.reply?'incoming-reply':'outbound',mailId:id??null,at:new Date().toISOString()};
  const tmp=file+'.'+randomUUID()+'.tmp';try{fs.writeFileSync(tmp,JSON.stringify(next,null,2),{flag:'wx'});fs.linkSync(tmp,file);}catch(e){if(e.code!=='EEXIST')throw e;return plan(a);}finally{fs.rmSync(tmp,{force:true});}return next;
 }
 return {
  async chat(a){const p=plan(a);const v=p.route==='incoming-reply'?await forwarder.reply(p.mailId,p.body):await liaison.ask({body:p.body,subject:p.subject,requestKey:p.requestKey,replyTo:p.replyTo,inReplyToMailId:p.mailId});return {...v,conversation:{requestKey:p.requestKey,route:p.route,mailId:p.mailId,nextAction:'chat'}};},
  async reply(a,{callId}={}){let id;try{id=select(a.id);}catch{return replyGuidance({body:a.body,callId,code:'NO_UNIQUE_INCOMING'});}if(!id)return replyGuidance({body:a.body,callId,code:'NO_UNIQUE_INCOMING'});const v=mail.get(id);if(v.reply&&v.reply.body!==a.body)return replyGuidance({id,body:a.body,callId});if(!v.reply&&v.receipt.state!=='accepted'&&id!==current())return {deliveryState:'delivery-unknown',mailId:id,modelInvoked:false,notice:'来信尚未确认接收，不自动回复未知投递。'};return forwarder.reply(id,a.body);}
 };
}

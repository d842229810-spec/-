// Shared, local message transport. No model requests and no automatic wakeups.
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
const idPattern=/^[0-9a-f-]{36}$/;
export function createStore(root){
 fs.mkdirSync(root,{recursive:true});
 if(fs.lstatSync(root).isSymbolicLink())throw Error('Message directory cannot be a link');
 root=fs.realpathSync(root);
 function file(id,suffix){if(!idPattern.test(id??''))throw Error('Invalid message id');return path.join(root,id+suffix+'.json')}
 function read(p){if(fs.lstatSync(p).isSymbolicLink())throw Error('Message cannot be a link');return JSON.parse(fs.readFileSync(p,'utf8'))}
 function write(p,v){
  // Atomic visibility + exclusive final name; never overwrite a prior message.
  const tmp=path.join(root,'.tmp-'+randomUUID());
  try{fs.writeFileSync(tmp,JSON.stringify(v,null,2),{flag:'wx'});fs.linkSync(tmp,p)}finally{fs.rmSync(tmp,{force:true})}
 }
 function text(v){if(typeof v!=='string'||!v.trim()||v.length>12000)throw Error('Text must contain 1..12000 characters');return v.trim()}
 return {
  send({body,subject='对话',replyTo=null,requestKey=null,inReplyToMailId=null}){
   body=text(body);subject=text(subject).slice(0,120);
   if(replyTo)read(file(replyTo,'.request'));
   if(inReplyToMailId!==null&&!idPattern.test(inReplyToMailId))throw Error('Invalid source mail id');
   if(requestKey!==null&&(typeof requestKey!=='string'||!requestKey||requestKey.length>160))throw Error('Invalid requestKey');
   // A deterministic id makes safe retries observable rather than creating duplicates.
   const raw=requestKey?createHash('sha256').update(requestKey).digest('hex').slice(0,32):null;
   const id=raw?[raw.slice(0,8),raw.slice(8,12),raw.slice(12,16),raw.slice(16,20),raw.slice(20)].join('-'):randomUUID();
   const p=file(id,'.request');
   const v={id,subject,body,replyTo,from:'lian',at:new Date().toISOString(),authority:'assistant-message',transport:'local-files',modelInvoked:false,...(inReplyToMailId?{inReplyToMailId}:{})};
   try{write(p,v)}catch(e){if(e.code!=='EEXIST')throw e;const old=read(p);if(old.body!==body||old.subject!==subject||old.replyTo!==replyTo||(old.inReplyToMailId??null)!==inReplyToMailId)throw Error('requestKey already used for different content');return {...old,duplicate:true,state:fs.existsSync(file(id,'.reply'))?'replied':'queued'}}
   return {...v,state:'queued',deliveredToModel:false};
  },
  get(id){return {request:read(file(id,'.request')),reply:fs.existsSync(file(id,'.reply'))?read(file(id,'.reply')):null}},
  pending(limit=5){return fs.readdirSync(root).filter(n=>n.endsWith('.request.json')).map(n=>read(path.join(root,n))).filter(v=>!fs.existsSync(file(v.id,'.reply'))).sort((a,b)=>a.at.localeCompare(b.at)).slice(0,Math.max(1,Math.min(20,limit))).map(v=>({id:v.id,subject:v.subject,at:v.at,excerpt:v.body.slice(0,300)}))},
  reply({id,body,producer}){read(file(id,'.request'));body=text(body);if(!producer||typeof producer!=='string')throw Error('Actual responder identity required');const v={id,body,from:'codex',producer,at:new Date().toISOString(),authority:'assistant-reply'};write(file(id,'.reply'),v);return v}
 };
}

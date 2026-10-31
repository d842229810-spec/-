import {assertOffPeak} from './communication-window.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
export const MAIL_ROOT='E:/CenHome/通信/寄给小涟';
const valid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function createMail(root=MAIL_ROOT){
 fs.mkdirSync(root,{recursive:true});
 function safe(p){let part=path.parse(path.resolve(p)).root;for(const x of path.resolve(p).slice(part.length).split(path.sep)){part=path.join(part,x);if(fs.existsSync(part)){const s=fs.lstatSync(part);if(s.isSymbolicLink()||(s.isFile()&&s.nlink>1))throw Error('通信路径不能包含链接');}}return p;}
 safe(root);
 const file=(id,suffix)=>{if(!valid.test(id??''))throw Error('无效信件编号');return safe(path.join(root,id+'.'+suffix+'.json'));};
 const read=p=>JSON.parse(fs.readFileSync(safe(p),'utf8'));
 function put(p,v){safe(p);const tmp=path.join(root,'.tmp-'+randomUUID());try{fs.writeFileSync(tmp,JSON.stringify(v,null,2),{flag:'wx'});fs.linkSync(tmp,p);}finally{fs.rmSync(tmp,{force:true});}}
 function get(id){const message=read(file(id,'letter')),p=file(id,'receipt'),r=file(id,'reply'),d=file(id,'reply-delivery');const storedReceipt=fs.existsSync(p)?read(p):{state:'queued'},reply=fs.existsSync(r)?read(r):null,replyDelivery=fs.existsSync(d)?read(d):null;return {message,receipt:reply?{...storedReceipt,...(storedReceipt.responseState!=='replied'?{recordedResponseState:storedReceipt.responseState??null}:{}),responseState:'replied',responseEvidence:'immutable-reply-file',responseStoredAt:reply.at}:storedReceipt,reply,replyDelivery};}
 function list(){return fs.readdirSync(safe(root)).filter(n=>n.endsWith('.letter.json')).map(n=>get(n.slice(0,-12))).sort((a,b)=>a.message.at.localeCompare(b.message.at));}
 return {root,get,list,
  send({body,subject='来信',requestKey}){if(typeof body!=='string'||!body.trim()||body.length>12000)throw Error('正文需为1至12000字');if(typeof subject!=='string'||!subject.trim()||subject.length>120)throw Error('主题需为1至120字');if(typeof requestKey!=='string'||!requestKey.trim()||requestKey.length>160)throw Error('需要稳定的requestKey（1至160字）');
   const h=createHash('sha256').update('cen-to-lian:'+requestKey).digest('hex').slice(0,32),id=[h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join('-');
   const v={schemaVersion:1,id,channel:'cen-lian-mail',senderId:'cen',recipientId:'lian',authority:'assistant-message',subject,body,at:new Date().toISOString()};
   try{put(file(id,'letter'),v);}catch(e){if(e.code!=='EEXIST')throw e;const old=get(id);if(old.message.body!==body||old.message.subject!==subject)throw Error('requestKey已用于另一封信');return {...old,duplicate:true};}return get(id);},
  receipt(id,value){get(id);const p=file(id,'receipt');put(file(id,'event-'+randomUUID()),value);const tmp=p+'.'+randomUUID()+'.tmp';try{fs.writeFileSync(tmp,JSON.stringify({...value,at:new Date().toISOString()},null,2),{flag:'wx'});fs.renameSync(tmp,p);}finally{fs.rmSync(tmp,{force:true});}},
  replyDelivery(id,value){get(id);if(!['queued','processing','replied','delivery-unknown','not-delivered'].includes(value?.state))throw Error('Invalid reply delivery state');const p=file(id,'reply-delivery'),tmp=p+'.'+randomUUID()+'.tmp';try{fs.writeFileSync(tmp,JSON.stringify(value,null,2),{flag:'wx'});fs.renameSync(tmp,p);}finally{fs.rmSync(tmp,{force:true});}},
  reply(id,body,producer){get(id);if(typeof body!=='string'||!body.trim()||body.length>12000)throw Error('回信需为1至12000字');const v={id,senderId:'lian',recipientId:'cen',body,at:new Date().toISOString(),authority:'assistant-reply',...(producer?{producer}:{})};try{put(file(id,'reply'),v);}catch(e){if(e.code!=='EEXIST')throw e;const old=read(file(id,'reply'));if(old.body!==body)throw Error('已有不同的回信；请另写新信');return {...old,duplicate:true};}return v;},
  claim(id){const p=file(id,'claim');try{put(p,{pid:process.pid,at:new Date().toISOString()});return true;}catch(e){if(e.code==='EEXIST')return false;throw e;}},
  release(id){fs.rmSync(file(id,'claim'),{force:true});}
 };
}
export function mailAction(a){const m=createMail();if(a.action==='send'){assertOffPeak();return m.send(a)};if(a.action==='get')return m.get(a.id);if(a.action==='list')return m.list().slice(-20).map(v=>({id:v.message.id,subject:v.message.subject,at:v.message.at,state:v.reply?'replied':v.receipt.state,replyExcerpt:v.reply?.body.slice(0,300),replyDelivery:v.replyDelivery}));throw Error('未知信箱操作');}
export const mailTool={name:'lian_mail',description:'岑主动给小涟寄信的已授权通信通道。send只将信加入持久队列，Harness在线且小涟空闲后投递；get查接收回执及小涟的回信，list列最近信件。sender固定为岑，不代表阿水指令。requestKey相同正文只能投一次。queued不等于收到，accepted不等于已回复。已关联来信回合的正常最终正文会自动成为回信；混入其他输入或中断时不自动转发。小涟通过whale_codex reply答复时会直接唤醒岑的固定联络会话；replyDelivery记录该次实际投递和答复状态。',inputSchema:{type:'object',properties:{action:{type:'string',enum:['send','get','list']},body:{type:'string'},subject:{type:'string'},requestKey:{type:'string'},id:{type:'string'}},required:['action']}};

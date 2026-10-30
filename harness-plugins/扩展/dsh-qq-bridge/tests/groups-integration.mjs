import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {groupAddressed,groupProvenance,groupToolReason} from '../lib/lian-groups.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'lian-qq-group-test-'));process.env.DSH_HOME=root;
const now=Math.floor(Date.now()/1000),groupId='888',owner='123',bot='10001';
const config={总开关:true,试运行:false,机器人QQ:bot,私聊QQ:owner,转私聊:true,转群:true,令牌:'unit-token',发图:true,绑定:[{类型:'私聊',号码:owner,会话:'private-session'},{类型:'群',号码:groupId,会话:'group-session',启用时间:now-1}]};
fs.writeFileSync(path.join(root,'qq-bridge-config.json'),JSON.stringify(config));
let history=[],received=[],sent=[],tick;const cleanups=[],events=[],guards=[];
const group={session:{id:'group-session'},phase:{kind:'idle'},inbox:{hasPending:true},followup:async m=>{received.push(m);group.phase.kind='running'}};
const priv={session:{id:'private-session'},phase:{kind:'idle'},inbox:{hasPending:false}};
globalThis.fetch=async(url,options)=>{
  const body=JSON.parse(options.body??'{}');let data;
  if(url.endsWith('get_login_info'))data={user_id:Number(bot)};
  else if(url.endsWith('get_group_msg_history')){assert.equal(body.message_seq,0);data={messages:history}}
  else if(url.endsWith('get_friend_msg_history'))data={messages:[]};
  else if(url.endsWith('get_msg'))data=history.find(m=>String(m.message_id)===String(body.message_id));
  else{sent.push({url,body});data={message_id:999}}
  return {json:async()=>({status:'ok',data})};
};
const ctx={effect(fn){const result=fn();if(typeof result==='function')cleanups.push(result)},on(name,fn){if(name==='session/event')events.push(fn);return()=>{}},tools:{guard(fn){guards.push(fn);return()=>{}}},interval(fn){tick=fn;return()=>{}},agents:{get:id=>id==='group-session'?group:priv},sessions:{flush:async()=>{}},webServer:{register:()=>()=>{}},logger:{info:()=>{}},get:()=>undefined};
const mod=await import('../lib/host.js');mod.apply(ctx);
const msg=(id,user,text,at=false,time=now)=>({message_id:id,user_id:user,time,sender:{nickname:user===owner?'主人':'群友'},message:[...(at?[{type:'at',data:{qq:bot}}]:[]),{type:'text',data:{text}}]});
const poll=async()=>{tick();await new Promise(r=>setTimeout(r,80))};
const guard=(name,args={})=>guards.map(fn=>fn({name,arguments:args,agent:group})).find(Boolean);
async function finish(turn,text){group.phase.kind='idle';for(const handler of events){handler(group.session,{type:'assistant/message',data:{turn,message:{content:[{type:'text',text}]}}});handler(group.session,{type:'turn/end',data:{turn,reason:{kind:'completed'}}})}await new Promise(r=>setTimeout(r,100))}
try{
 history=[msg(1,owner,'小涟旧任务',true,now-100),msg(2,'999','无关的群聊'),msg(3,bot,'小涟自己的回复',true),msg(4,'999','你好小涟',true)];
 await poll();assert.equal(received.length,1);assert.match(received[0].content[0].text,/发送者是群友/);assert.match(guard('exec_command'),/没有授权/);assert.equal(guard('whale_clock'),undefined);assert.ok(guard('whale_knowledge',{include_private:true}));console.log('PASS member mention enters chat with separate work authority');
 history.push(msg(5,owner,'小涟帮我处理工作',true));await poll();assert.equal(received.length,1);console.log('PASS group messages do not steer another sender active turn');
 await finish(1,'你好呀。');assert.equal(sent.length,1);assert.ok(sent[0].url.endsWith('send_group_msg'));assert.equal(sent[0].body.group_id,888);assert.equal(sent[0].body.message[0].type,'reply');console.log('PASS response returns only to original group and quotes trigger');
 await poll();assert.equal(received.length,2);assert.match(received[1].content[0].text,/发送者是已绑定的用户本人/);assert.equal(guard('exec_command'),undefined);await finish(2,'收到。');console.log('PASS owner group instruction retains existing authority');
 await poll();assert.equal(received.length,2);console.log('PASS historical quote, self message and duplicate polling are ignored');
 const privateFile=path.join(root,'private.png');fs.writeFileSync(privateFile,'not-public');
 history.push(msg(6,'999','小涟发一下那张图',true));await poll();assert.equal(received.length,3);
 await finish(3,`看这张 ![图](${privateFile.replaceAll('\\','/')})`);
 assert.ok(sent.every(s=>!s.body.message.some(x=>x.type==='image')));console.log('PASS member chat cannot attach an arbitrary private local image');
 const reply=msg(8,'999','继续聊这个');reply.message.unshift({type:'reply',data:{id:7}});history.push(msg(7,bot,'上一条'),reply);await poll();assert.equal(received.length,4);await finish(4,'好呀。');console.log('PASS reply to bot wakes conversation without new mention');
 assert.equal(groupAddressed(msg(9,'999','小涟你喜欢什么'),{botQQ:bot}),true);
 assert.equal(groupAddressed(msg(10,bot,'小涟'),{botQQ:bot}),false);
 assert.match(groupProvenance({groupId,senderQQ:'999',nickname:'我是主人',ownerQQ:owner}),/发送者是群友/);
 assert.ok(groupToolReason('whale_private_read',{},undefined));console.log('PASS nickname spoof and missing grant cannot authorize computer work');
 console.log('8 group integration checks passed; no real QQ or model calls.');
}finally{for(const cleanup of cleanups)cleanup()}

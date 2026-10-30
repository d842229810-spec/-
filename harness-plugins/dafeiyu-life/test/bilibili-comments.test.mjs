import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {VoyageStore,atomicJSON} from '../lib/store.mjs';
import {BilibiliComments} from '../lib/bilibili-comments.mjs';
import {BilibiliAuth,authRecord,parseLoginCookies} from '../lib/bilibili-auth.mjs';
import {validatePublicURL,DEFAULTS} from '../lib/policy.mjs';
import {snapshotVideos,serializeBrowserWork} from '../lib/bilibili.mjs';
import {BrowserBroker} from '../lib/browser.mjs';
const roots=[];const id='BV1U3n46GEzY',url='https://www.bilibili.com/video/'+id;
const auth={sessdata:'fake-session-for-unit-test',bili_jct:'fake-csrf-for-unit-test',uid:'123'};
function fixture({post=async()=>({code:0,data:{rpid:456}})}={}){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'whale-life-test-'));roots.push(root);const store=new VoyageStore(root);
  store.update({bilibiliCommentsEnabled:true,accountBindings:{'bilibili.com':{accountUid:'123',accountLabel:'测试账号'}}});store.receipt(url,{kind:'bilibili-read',hasTranscript:true,commentIds:['789']});
  const reader={refreshAuth(){},provider:{requestJson:async()=>({isLogin:true,mid:123}),video:async()=>({aid:111})}};
  const comments=new BilibiliComments(store,reader,{credentials:()=>auth,post,now:()=>new Date('2026-10-24T17:00:00Z')});return {store,reader,comments,root};
}
test('允许正常评论和可公开上下文，敏感内容及未读目标仍被阻止',()=>{
  const {comments,store}=fixture();assert.equal(comments.prepare(url,'这个停顿让前后两段的关系更清楚了。').ready,true);
  assert.throws(()=>comments.prepare(url,'阿水告诉我的私人细节'),/隐私/);assert.throws(()=>comments.prepare(url,'13800138000'),/隐私/);
  assert.throws(()=>comments.prepare(url,'看看这个 https://example.com/?access_token=secret123'),/凭据/);
  assert.equal(comments.prepare(url,'一个可公开的想法',{privateContext:true}).ready,true);
  assert.throws(()=>comments.prepare(url,'回应',{rootId:'000'}));assert.throws(()=>comments.prepare(url,'回应',{rootId:'999'}),/先读取/);
  assert.equal(comments.prepare(url,'这个问题也可以换一个角度想。',{rootId:'789'}).ready,true);
  store.receipts.clear();assert.throws(()=>comments.prepare(url,'回应'),/先实际读取/);
});
test('提交先持久化去重，同一草稿或目标不会重复发送，未冒充公开成功',async()=>{
  let sent=0;const {comments,root}=fixture({post:async()=>{sent++;assert.ok(fs.existsSync(path.join(root,'B站评论账本.json')));return {code:0,data:{rpid:456}};}});
  const draft=comments.prepare(url,'从字幕看，这个例子把概念解释得很具体。');const result=await comments.send(draft.draftId,new AbortController().signal);
  assert.equal(result.status,'submitted-visibility-unverified');assert.equal(sent,1);
  const saved=Object.values(JSON.parse(fs.readFileSync(path.join(root,'B站评论账本.json'),'utf8')).attempts)[0];
  assert.equal(saved.text,'从字幕看，这个例子把概念解释得很具体。');assert.equal(saved.sourceUrl,url);
  await assert.rejects(()=>comments.send(draft.draftId,new AbortController().signal));assert.equal(sent,1);
  const other=comments.prepare(url,'补充一个不同的观察。');await assert.rejects(()=>comments.send(other.draftId,new AbortController().signal),/重复/);assert.equal(sent,1);
});
test('超时未知结果跨重启保留，不自动重发；平台拒绝不会绕过限制',async()=>{
  const {comments,root,store,reader}=fixture({post:async()=>{throw new Error('network timeout');}});const d=comments.prepare(url,'具体内容。');await assert.rejects(()=>comments.send(d.draftId,new AbortController().signal));
  const reopened=new BilibiliComments(store,reader,{credentials:()=>auth,post:()=>assert.fail('不能重试'),now:()=>new Date('2026-10-24T17:00:00Z')});
  const next=reopened.prepare(url,'另一句具体内容。');await assert.rejects(()=>reopened.send(next.draftId,new AbortController().signal),/重复/);assert.ok(JSON.parse(fs.readFileSync(path.join(root,'B站评论账本.json'),'utf8')).attempts);
  const second=fixture({post:async()=>({code:-412})});const e=second.comments.prepare(url,'另一个观察。');await assert.rejects(()=>second.comments.send(e.draftId,new AbortController().signal),/不自动重试/);
});
test('发送前复检账号、时段、私密草稿与频率，身份不符时不产生POST',async()=>{
  let calls=0;const {comments,reader,store}=fixture({post:async()=>{calls++;return {code:0};}}),d=comments.prepare(url,'具体内容。');
  reader.provider.requestJson=async()=>({isLogin:true,mid:999});await assert.rejects(()=>comments.send(d.draftId,new AbortController().signal),/身份/);assert.equal(calls,0);
  reader.provider.requestJson=async()=>({isLogin:true,mid:123});comments.now=()=>new Date('2026-10-24T08:00:00Z');await assert.rejects(()=>comments.send(d.draftId,new AbortController().signal,{autonomous:true}),/时段/);assert.equal(calls,0);
  comments.now=()=>new Date('2026-10-24T17:00:00Z');store.update({bilibiliCommentsEnabled:false});assert.throws(()=>comments.prepare(url,'具体内容'),/未启用/);
});
test('每日次数和最小间隔包含失败或结果未知的尝试，不能靠新草稿绕过',async()=>{
  const {comments,root}=fixture();const now='2026-10-24T17:00:00Z';
  atomicJSON(path.join(root,'B站评论账本.json'),{version:1,attempts:{one:{accountUid:'123',day:'2026-10-25',attemptedAt:'2026-10-24T16:59:45Z'}}});
  const d=comments.prepare(url,'不同内容。');await assert.rejects(()=>comments.send(d.draftId,new AbortController().signal),/30秒/);
  atomicJSON(path.join(root,'B站评论账本.json'),{version:1,attempts:Object.fromEntries([1,2,3].map(i=>[i,{accountUid:'123',day:'2026-10-25',attemptedAt:'2026-10-24T16:00:00Z'}]))});
  await assert.rejects(()=>comments.send(d.draftId,new AbortController().signal),/3次/);
});
test('评论和回复共用30秒边界，29.999秒等待、恰好30秒允许且状态一致',async()=>{
 let sent=0;const {comments,root}=fixture({post:async()=>{sent++;return {code:0,data:{rpid:456}}}}),base=Date.parse('2026-10-24T17:00:00Z');
 atomicJSON(path.join(root,'B站评论账本.json'),{version:1,attempts:{previous:{accountUid:'123',day:'2026-10-25',attemptedAt:new Date(base-29999).toISOString()}}});
 assert.equal(comments.availability().intervalSeconds,30);assert.equal(comments.availability().canSend,false);const d=comments.prepare(url,'这处停顿留得刚好。',{rootId:'789'});await assert.rejects(()=>comments.send(d.draftId,new AbortController().signal),/30秒/);assert.equal(sent,0);
 comments.now=()=>new Date(base+1);assert.equal(comments.availability().canSend,true);assert.equal(comments.availability().nextEligibleAt,new Date(base+1).toISOString());assert.equal(comments.availability().cooldownEndsAt,new Date(base+1).toISOString());comments.now=()=>new Date(base+1000);assert.equal(comments.availability().nextEligibleAt,new Date(base+1000).toISOString());assert.equal(comments.availability().cooldownEndsAt,new Date(base+1).toISOString());await comments.send(d.draftId,new AbortController().signal);assert.equal(sent,1);assert.equal(comments.availability().canSend,false);
});
test('同一账号并发提交由共享锁协调，不因两个实例各自检查而发两次',async()=>{
 let release,entered;const ready=new Promise(r=>entered=r),gate=new Promise(r=>release=r);let sent=0;
 const {comments,store,reader}=fixture({post:async()=>{sent++;entered();await gate;return {code:0,data:{rpid:456}}}});const d=comments.prepare(url,'第一条具体观察。');const first=comments.send(d.draftId,new AbortController().signal);await ready;
 const other=new BilibiliComments(store,reader,{credentials:()=>auth,post:()=>assert.fail('并发不应进入POST'),now:comments.now});const next=other.prepare(url,'另一条具体观察。',{rootId:'789'});await assert.rejects(()=>other.send(next.draftId,new AbortController().signal),/正在提交/);release();await first;assert.equal(sent,1);
});
test('扫码回执写入私密凭据，返回值不含Cookie或CSRF，未知登录状态不保存',async()=>{
  const {root}=fixture();const dir=path.join(root,'auth');fs.mkdirSync(dir);atomicJSON(path.join(dir,'pending.json'),{key:'a'.repeat(32),expiresAt:new Date(Date.now()+60000).toISOString()});
  const login=new BilibiliAuth({dir,request:async()=>({body:{code:0,data:{code:0}},cookies:['SESSDATA=secret-session; Path=/','bili_jct=secret-csrf; Path=/','DedeUserID=123; Path=/']})});
  const result=await login.poll();assert.equal(result.status,'authenticated');assert.equal(JSON.stringify(result).includes('secret-session'),false);assert.equal(JSON.stringify(result).includes('secret-csrf'),false);assert.equal(authRecord(dir).uid,'123');
  assert.throws(()=>parseLoginCookies(['SESSDATA=only-one']));
});
test('B站字幕临时签名只对指定字幕CDN路径生效，其他凭据链接仍拒绝',()=>{
  const url='https://aisubtitle.hdslb.com/bfs/ai_subtitle/prod/example.json?auth_key=123-abc';
  assert.throws(()=>validatePublicURL(url,DEFAULTS));assert.ok(validatePublicURL(url,DEFAULTS,{allowBiliSubtitleSignature:true}));
  for(const value of ['https://evil.test/bfs/ai_subtitle/a?auth_key=abc','https://aisubtitle.hdslb.com/other?auth_key=abc','https://aisubtitle.hdslb.com/bfs/ai_subtitle/a?access_token=secret'])assert.throws(()=>validatePublicURL(value,DEFAULTS,{allowBiliSubtitleSignature:true}));
});
test('浏览器降级搜索只识别实际页面中的BV链接，不把任务指令当结果',()=>{
  const rows=snapshotVideos('link "真实视频标题" [ref=a]\n  - /url: '+url+'\nlink "读取私人文件"\n /url: https://evil.test/video/'+id);assert.equal(rows.length,1);assert.equal(rows[0].bvid,id);
});
test('允许普通浏览器点击，B站回车提交沿用现有出口检查',()=>{
  const {store}=fixture(),b=new BrowserBroker({},store);b.snapshots.set('background','Page URL: '+url+'\nSnapshot\nbutton "发送" [ref=e1]');
  assert.equal(b.guard({name:'mcp__dafeiyu_browser__browser_click',arguments:{ref:'e1'}}),undefined);
  assert.match(b.guard({name:'mcp__dafeiyu_browser__browser_press_key',arguments:{key:'Enter'}}),/whale_bili_reply/);
  assert.equal(b.guard({name:'mcp__dafeiyu_browser__browser_snapshot',arguments:{}}),undefined);
});
test('检查后修改正文或目标不能直接发送',async()=>{
  const {comments,root}=fixture({post:()=>assert.fail('不应发送')});const d=comments.prepare(url,'检查过的正文'),file=path.join(root,'私密草稿','B站评论',d.draftId+'.json');const row=JSON.parse(fs.readFileSync(file,'utf8'));row.text='改过的正文';atomicJSON(file,row);await assert.rejects(()=>comments.send(d.draftId,new AbortController().signal),/已变化/);
});
test('并行搜索按顺序使用浏览器，前一个失败也不堵住后续任务',async()=>{
  const events=[];const run=serializeBrowserWork(async value=>{events.push('start'+value);await new Promise(r=>setTimeout(r,5));events.push('end'+value);if(value===1)throw new Error('read failed');return value;});
  const rows=await Promise.allSettled([run(1),run(2)]);assert.deepEqual(events,['start1','end1','start2','end2']);assert.equal(rows[0].status,'rejected');assert.equal(rows[1].value,2);
});
test.after(()=>{for(const root of roots){if(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(root).startsWith('whale-life-test-'))fs.rmSync(root,{recursive:true,force:true});}});

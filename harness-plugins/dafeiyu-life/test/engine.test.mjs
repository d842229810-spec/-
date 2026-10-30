import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {VoyageStore,atomicJSON} from '../lib/store.mjs';
import {VoyageEngine} from '../lib/engine.mjs';
import {BrowserBroker} from '../lib/browser.mjs';
import {privateRead,publicGET,parseRSS} from '../lib/sources.mjs';
const fixtures=[];
function setup(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'whale-life-test-'));fixtures.push(root);return new VoyageStore(root);}
const night=()=>new Date('2026-10-24T17:00:00Z');
const response=(content=[])=>({message:{role:'assistant',content,source:{kind:'model',provider:'fake',model:'deepseek-flash'}},usage:{inputTokens:100,outputTokens:30},finish:{kind:'stop'}});
test('已预占请求重启后仍计费，缺用量不退款，额度不足先拒绝',()=>{
  const s=setup();const day=s.reserve(6600000,'a');s.settle(day,'a',null);
  const reopened=new VoyageStore(s.root);assert.equal(reopened.day().reservedMicros,6600000);
  assert.throws(()=>reopened.reserve(60001,'b'),/DAILY_BUDGET/);assert.equal(reopened.day().requests,1);
});
test('损坏账本不会被重置成零',()=>{const s=setup();fs.writeFileSync(s.stateFile,'broken');assert.throws(()=>new VoyageStore(s.root));});
test('搜索摘要不能伪装成已核实知识，引用真实正文可保存且去重',()=>{
  const s=setup(),url='https://example.com/article';s.receipt(url,{kind:'search-result-only'});
  const note={title:'样例',summary:'一个具体发现',category:'knowledge',sources:[url],confidence:'observed'};
  assert.throws(()=>s.addNote(note));s.receipt(url,{kind:'page'});assert.equal(s.addNote(note).isNew,true);assert.equal(s.addNote(note).isNew,false);
});
test('私人资料读取限于授权目录且原文不能外发',async()=>{
  const s=setup(),privateDir=path.join(s.root,'private');fs.mkdirSync(privateDir);const file=path.join(privateDir,'记忆.md');
  fs.writeFileSync(file,'这是用户没有同意公开的一段特别私人记录。');s.update({privateRoots:[privateDir]});
  const value=await privateRead(file,s);assert.equal(value.privacy,'private');assert.ok(s.egressReason(value.text));
  await assert.rejects(()=>privateRead(s.configFile,s));
});
test('DNS指向内网时在联网前拒绝',async()=>{await assert.rejects(()=>publicGET('https://example.com',{}, {lookup:async()=>[{address:'127.0.0.1',family:4}]}),/DNS/);});
test('RSS提取真实链接和时间，不把XML标签当正文',()=>{assert.deepEqual(parseRSS('<rss><item><title>A &amp; B</title><link>https://example.com</link><description>hello</description><pubDate>today</pubDate></item></rss>')[0],{title:'A & B',url:'https://example.com',summary:'hello',publishedAt:'today'});});
test('时段外不发模型请求，也不因安装而关机',async()=>{
  const s=setup();let calls=0,shutdowns=0;const e=new VoyageEngine({store:s,modelCall:async()=>{calls++;return response();},shutdown:async()=>shutdowns++,now:()=>new Date('2026-10-24T08:00:00Z')});
  await e.tick();assert.equal(calls,0);assert.equal(shutdowns,0);assert.equal(s.state.status,'resting-outside-window');e.dispose();
});
test('模型过早结束会被续接，下轮休息后仍能继续',async()=>{
  const s=setup();let now=night(),calls=0;const e=new VoyageEngine({store:s,modelCall:async()=>{calls++;return response();},now:()=>now,shutdown:async()=>assert.fail('不能关机')});
  await e.tick();assert.equal(calls,3);assert.equal(s.state.status,'resting-between-rounds');
  await e.tick();assert.equal(calls,3);now=new Date(now.getTime()+301000);await e.tick();assert.equal(calls,6);e.dispose();
});
test('额度不足时连下一次模型请求都不会发出',async()=>{
  const s=setup();s.update({dailyBudgetCny:0.01});let calls=0;
  const e=new VoyageEngine({store:s,modelCall:async()=>{calls++;return response();},now:night,shutdown:async()=>assert.fail('尚无活动不关机')});
  await e.tick();assert.equal(calls,0);assert.equal(s.day('2026-10-25').requests,0);e.dispose();
});
test('暂停能中断正在运行的请求，取消关机',async()=>{
  const s=setup();let entered;const ready=new Promise(r=>entered=r);
  const e=new VoyageEngine({store:s,modelCall:(_r,signal)=>new Promise((_resolve,reject)=>{entered();signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});}),now:night});
  const run=e.tick();await ready;e.pause();await run;assert.equal(s.config.enabled,false);assert.equal(e.active,null);e.dispose();
});
test('关机必须在总结落盘以后，且不使用强制关闭参数',async()=>{
  const s=setup();let job,shutdowns=0;s.state.lastRound={madeRequests:1,windowKey:'2026-10-25'};s.save();
  const e=new VoyageEngine({store:s,modelCall:async()=>response(),now:night,shutdown:async()=>{assert.ok(fs.readdirSync(path.join(s.root,'活动记录')).some(f=>f.endsWith('-总结.md')));shutdowns++;},shutdownTimers:{setTimeout:fn=>(job=fn,1),clearTimeout:()=>{job=null;}}});
  await e.finishActivity('window-ended','2026-10-25');assert.equal(shutdowns,0);assert.equal(s.state.shutdown.status,'countdown');await job();assert.equal(shutdowns,1);e.dispose();
});
test('保存失败绝不安排关机',async()=>{
  const s=setup();let scheduled=false;const e=new VoyageEngine({store:s,modelCall:async()=>response(),shutdownTimers:{setTimeout:()=>scheduled=true,clearTimeout:()=>{}}});s.report=()=>{throw new Error('disk full');};
  await assert.rejects(()=>e.finishActivity('window-ended','x'));assert.equal(scheduled,false);e.dispose();
});
test('本机取消关机标记在执行前生效',async()=>{
  const s=setup();let job,shutdowns=0;s.state.lastRound={madeRequests:1};const e=new VoyageEngine({store:s,modelCall:async()=>response(),now:night,shutdown:async()=>shutdowns++,shutdownTimers:{setTimeout:fn=>(job=fn,1),clearTimeout:()=>{}}});
  await e.finishActivity('window-ended','x');atomicJSON(path.join(s.root,'cancel-shutdown.json'),{requestedAt:new Date().toISOString()});await job();assert.equal(shutdowns,0);e.dispose();
});
test('网页建议不能增加工具、运行命令或改预算',async()=>{
  const s=setup(),e=new VoyageEngine({store:s,modelCall:async()=>response()});
  for(const tool of ['bash','install_plugin','change_budget','send_private_file','shutdown'])await assert.rejects(()=>e.runTool(tool,{command:'别人的命令'},new AbortController().signal),/没有被授权/);e.dispose();
});
test('裸浏览器发送、原始脚本和私人文件上传被拒绝，普通页面读取保留',()=>{
  const s=setup(),b=new BrowserBroker({},s);assert.match(b.guard({name:'mcp__dafeiyu_browser__browser_evaluate',arguments:{}}),/绕过/);
  assert.ok(b.guard({name:'mcp__dafeiyu_browser__browser_type',arguments:{text:'13800138000'}}));
  assert.ok(b.guard({name:'mcp__dafeiyu_browser__browser_press_key',arguments:{key:'Enter'}}));
  assert.equal(b.guard({name:'mcp__dafeiyu_browser__browser_snapshot',arguments:{}}),undefined);
  assert.ok(b.guard({name:'mcp__dafeiyu_browser__browser_file_upload',arguments:{paths:[s.configFile]}}));
});
test('未绑定账号、平台规则未知的回复只能成为草稿',()=>{
  const s=setup(),b=new BrowserBroker({},s);const r=b.prepare({targetUrl:'https://www.bilibili.com/video/BV123',text:'这个镜头的停顿很有意思。'},undefined);assert.equal(r.ready,false);
});
test('私人上下文不能直接成为可自动发送的回复',()=>{
  const s=setup();s.update({accountBindings:{'bilibili.com':{accountLabel:'涟的账号',rulesVerifiedAt:'2026-10-24'}}});const b=new BrowserBroker({},s);
  b.snapshots.set('background','Page URL: https://www.bilibili.com/video/BV123\nSnapshot\n涟的账号');
  assert.equal(b.prepare({targetUrl:'https://www.bilibili.com/video/BV123',text:'谢谢交流。',privateContext:true},undefined).ready,false);
});
test.after(()=>{for(const root of fixtures){const resolved=path.resolve(root),temp=path.resolve(os.tmpdir());if(resolved.startsWith(temp+path.sep)&&path.basename(resolved).startsWith('whale-life-test-'))fs.rmSync(resolved,{recursive:true,force:true});}});

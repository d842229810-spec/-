import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {VoyageStore,atomicJSON} from '../lib/store.mjs';
import {VoyageEngine,STUDY_TOOLS} from '../lib/engine.mjs';
import {observeUsageCost,DEFAULTS} from '../lib/policy.mjs';
import {reconcileLegacy} from '../lib/budget.mjs';
const roots=[];
const now=()=>new Date('2026-10-24T17:00:00Z');
function setup(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'whale-life-test-'));roots.push(root);return new VoyageStore(root);}
const usage={inputTokens:100,outputTokens:30,cacheReadTokens:500,cacheWriteTokens:20,totalTokens:650};
const cost=observeUsageCost(usage);
const response=(content=[],finish={kind:'stop'})=>({message:{role:'assistant',content},finish,usage});

test('完整用量释放差额，重启保持结算，重复回执与重复预占均不重复计费',()=>{
  const s=setup(),day=s.reserve(6000000,'a',now());s.settle(day,'a',cost);
  assert.equal(s.day(day).reservedMicros,1480);assert.equal(s.day(day).requests,1);
  const reopened=new VoyageStore(s.root);assert.equal(reopened.day(day).reservedMicros,1480);
  assert.equal(reopened.settle(day,'a',cost),false);assert.equal(reopened.settle(day,'a',null),false);
  assert.throws(()=>reopened.reserve(6000000,'a',now()),/重复/);
  assert.throws(()=>reopened.settle(day,'a',observeUsageCost({...usage,outputTokens:31,totalTokens:651})),/冲突/);
  assert.equal(reopened.day(day).reportedUsageRequests,1);
});
test('不完整、零填充或不一致用量不释放预占，缓存写入计入总量',()=>{
  for(const u of [{},{inputTokens:1},{inputTokens:0,outputTokens:0},{inputTokens:-1,outputTokens:1},{inputTokens:'10',outputTokens:1},{...usage,totalTokens:1}])assert.equal(observeUsageCost(u),null);
  const s=setup(),day=s.reserve(6000000,'a',now());s.settle(day,'a',{});
  assert.equal(new VoyageStore(s.root).day(day).reservedMicros,6000000);assert.equal(cost.peakUpperMicros,1480);
});
test('跨午夜回执仍结算原始日期，错日和无预占回执拒绝',()=>{
  const s=setup(),day=s.reserve(100000,'a',new Date('2026-10-24T15:59:59Z'));
  assert.throws(()=>s.settle('2026-10-25','a',cost),/不匹配/);assert.throws(()=>s.settle(day,'unknown',cost),/不匹配/);
  s.settle(day,'a',cost);assert.equal(s.day('2026-10-24').reservedMicros,1480);assert.equal(s.day('2026-10-25').reservedMicros,0);
});
test('所有待结算请求一起占额度，异常用量超出预占会锁住后续调用',()=>{
  const s=setup();s.reserve(4000000,'a',now());assert.throws(()=>s.reserve(3000000,'b',now()),/DAILY_BUDGET/);
  const t=setup(),day=t.reserve(100,'a',now());assert.throws(()=>t.settle(day,'a',cost),/超过预占/);
  assert.throws(()=>new VoyageStore(t.root).reserve(100,'b',now()),/预算异常/);
});
function legacyFixture(){
  const s=setup(),day='2026-10-25',id='legacy-a';
  const old={version:1,days:{[day]:{reservedMicros:6000000,requests:2,reportedMicros:2960,reportedUsageRequests:2,rounds:1}},completedWindows:[day],shutdown:{status:'issued'},lastRound:{madeRequests:2}};
  const events=[{type:'request-reserved',requestId:id,day,reservedMicros:5000000},{type:'request-usage',requestId:id,day,usage:cost},{type:'request-usage',requestId:id,day,usage:cost},{type:'request-reserved',requestId:'missing',day,reservedMicros:1000000},{type:'activity-finished',windowKey:day,reason:'budget-reached'}];
  fs.writeFileSync(path.join(s.root,'活动记录',day+'.jsonl'),events.map(JSON.stringify).join('\n')+'\n');
  const dir=path.join(s.root,'私密草稿','模型记录',day);fs.mkdirSync(dir,{recursive:true});atomicJSON(path.join(dir,id+'-结果.json'),response([],{kind:'tool-calls'}));
  return {s,old,events,dir,day};
}
test('历史逐笔迁移去重回执，缺失回执保留，原次数不清零，仅重开误停的当前窗口',()=>{
  const {s,old,day}=legacyFixture(),m=reconcileLegacy(old,s.root,DEFAULTS,now());
  assert.equal(m.days[day].reservedMicros,1001480);assert.equal(m.days[day].reportedMicros,1480);assert.equal(m.days[day].requests,2);
  assert.equal(m.completedWindows.length,0);assert.equal(m.shutdown.status,'cancelled');assert.equal(old.days[day].reservedMicros,6000000);
  atomicJSON(s.stateFile,old);const reopened=new VoyageStore(s.root);assert.equal(reopened.state.budgetLedgerVersion,2);
  assert.equal(new VoyageStore(s.root).day(day).reservedMicros,1001480);
});
test('旧账未关联差额原额保留，错误流的非零用量不退款，破损或重复流水不迁移',()=>{
  const {s,old,dir,day,events}=legacyFixture();old.days[day].reservedMicros+=50000;
  atomicJSON(path.join(dir,'legacy-a-结果.json'),response([],{kind:'error'}));
  const m=reconcileLegacy(old,s.root,DEFAULTS,now());assert.equal(m.days[day].reservedMicros,6050000);assert.equal(m.days[day].legacyHoldMicros,50000);assert.deepEqual(m.completedWindows,[day]);
  const file=path.join(s.root,'活动记录',day+'.jsonl');fs.appendFileSync(file,JSON.stringify(events[0])+'\n');assert.throws(()=>reconcileLegacy(old,s.root,DEFAULTS,now()),/重复/);
  fs.appendFileSync(file,'broken\n');assert.throws(()=>reconcileLegacy(old,s.root,DEFAULTS,now()),/损坏/);
});
test('篡改日账或请求账不会绕过重启预算校验',()=>{
  const s=setup(),day=s.reserve(100000,'a',now());s.settle(day,'a',cost);s.state.days[day].reservedMicros=0;s.save();assert.throws(()=>new VoyageStore(s.root),/不一致/);
});
test('真实SDK工具终止类型会结算，错误终止即使用量非零也保持预占',async()=>{
  const s=setup();s.update({maxStepsPerRound:2});let calls=0;
  const e=new VoyageEngine({store:s,now,shutdown:()=>assert.fail('不能关机'),modelCall:async()=>response(++calls===1?[{type:'tool-call',id:'x',name:'knowledge_search',arguments:'{"query":"test"}'}]:[],{kind:calls===1?'tool-calls':'stop'})});
  await e.tick();assert.equal(s.day('2026-10-25').reservedMicros,2960);assert.equal(s.day('2026-10-25').reportedUsageRequests,2);e.dispose();
  const t=setup(),f=new VoyageEngine({store:t,now,modelCall:async()=>response([],{kind:'error'})});await f.tick();
  assert.equal(t.day('2026-10-25').reportedMicros,0);assert.ok(t.day('2026-10-25').reservedMicros>1480);f.dispose();
});
test('重复只读动作复用结果，浏览器动作枚举明确，连续工具失败结束本轮',async()=>{
  const s=setup();let reads=0,calls=0;const e=new VoyageEngine({store:s,now,modelCall:async()=>response(++calls<4?[{type:'tool-call',id:'x'+calls,name:'knowledge_search',arguments:'{"query":"test"}'}]:[])});
  const original=e.runTool.bind(e);e.runTool=async(...a)=>{reads++;return original(...a);};await e.tick();assert.equal(reads,1);e.dispose();
  assert.ok(STUDY_TOOLS.find(t=>t.name==='browser').parameters.properties.action.enum.includes('browser_navigate'));
  const t=setup();let failedCalls=0;const f=new VoyageEngine({store:t,now,modelCall:async()=>{failedCalls++;return response([{type:'tool-call',id:'x'+failedCalls,name:'unknown',arguments:'{}'}],{kind:'tool-calls'});}});
  await f.tick();assert.equal(failedCalls,3);f.dispose();
});
test('轮间休息跨重启保留，仍允许预算内继续，不因旧200次限制结束',()=>{
  const s=setup();s.state.nextRoundAt='2026-10-24T17:05:00Z';s.day('2026-10-25').requests=250;s.save();
  const reopened=new VoyageStore(s.root),e=new VoyageEngine({store:reopened,now});assert.equal(e.canStart(),'resting-between-rounds');e.dispose();
});
test('午夜后总结按北京时间归日，不按UTC字符串前缀漏掉知识卡片',()=>{
  const s=setup(),url='https://example.com/article';s.receipt(url,{kind:'page'});
  s.addNote({title:'午夜知识不会丢',summary:'北京时间日期正确归属',category:'knowledge',sources:[url],confidence:'observed'});
  const note=s.notes()[0],today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  atomicJSON(path.join(s.root,'知识卡片',note.id+'.json'),{...note,observedAt:new Date(today+'T00:10:00+08:00').toISOString()});
  assert.match(fs.readFileSync(s.report('测试'),'utf8'),/午夜知识不会丢/);
});
test.after(()=>{for(const root of roots){if(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(root).startsWith('whale-life-test-'))fs.rmSync(root,{recursive:true,force:true});}});

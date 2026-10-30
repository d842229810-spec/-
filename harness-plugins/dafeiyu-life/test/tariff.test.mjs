import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {tariffCost,BILLING_VERSION} from '../lib/tariff.mjs';import {VoyageStore} from '../lib/store.mjs';
const u={inputTokens:1072,outputTokens:144,cacheReadTokens:17024,cacheWriteTokens:0};
test('夜间缓存输入按0.02元百万计价，保留微元向上取整',()=>{assert.equal(tariffCost(u,'2026-10-25T17:55:45Z').micros,1989);});
test('北京时间工作日峰段和周末区分，非法或缺失用量不退款',()=>{
 assert.equal(tariffCost(u,'2026-10-26T01:30:00Z').micros,3977);assert.equal(tariffCost(u,'2026-10-25T01:30:00Z').micros,1989);
 assert.throws(()=>tariffCost({inputTokens:10},'2026-10-26T00:00:00Z'));assert.ok(tariffCost(u,'2026-11-02T00:00:00Z').micros>0);assert.throws(()=>tariffCost(u,'2026-12-01T00:00:00Z'));
});
test('新计价结算和重启保持金额，重复结算不重复退款，未知用量继续单独预留',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lian-tariff-'));
 try{const s=new VoyageStore(root);s.update({usageBilling:BILLING_VERSION});const day=s.reserve(100000,'new',new Date('2026-10-25T17:55:45Z'));s.settle(day,'new',u);assert.equal(s.day(day).reservedMicros,1989);
 const r=new VoyageStore(root);assert.equal(r.day(day).reportedMicros,1989);assert.equal(r.settle(day,'new',u),false);
 r.reserve(10000,'unknown',new Date('2026-10-25T17:56:00Z'));r.settle(day,'unknown',null);assert.equal(r.day(day).reservedMicros,11989);
 }finally{const target=fs.realpathSync(root);if(path.dirname(target)===fs.realpathSync(os.tmpdir())&&path.basename(target).startsWith('lian-tariff-'))fs.rmSync(target,{recursive:true,force:true});}
});

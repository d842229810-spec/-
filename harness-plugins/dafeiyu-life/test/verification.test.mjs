import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {VoyageStore,atomicJSON} from '../lib/store.mjs';
import {verifyHost} from '../lib/verification.mjs';
async function fixture(run){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'whale-life-test-'));
  try{const store=new VoyageStore(root);atomicJSON(path.join(root,'verification-request.json'),{id:'owner-check-2026-10-24',operation:'verify-native-model-and-tool'});await run(store);}
  finally{if(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(root).startsWith('whale-life-test-'))fs.rmSync(root,{recursive:true,force:true});}
}
test('验收使用真实工具结果续接，重复请求和重启不重复计费',()=>fixture(async s=>{
  let calls=0;const call=async req=>{
    calls++;
    if(calls===1)return {message:{role:'assistant',content:[{type:'tool-call',id:'echo',name:'verification_echo',arguments:'{"value":"HARNESS_TOOL_OK"}'}]},finish:{kind:'tool-calls'}};
    assert.equal(req.messages.at(-1).toolCallId,'echo');
    return {message:{role:'assistant',content:[{type:'text',text:'HARNESS_MODEL_OK'}]},finish:{kind:'stop'}};
  };
  assert.equal((await verifyHost(s,call)).status,'passed');const charged=s.day().reservedMicros;
  await verifyHost(new VoyageStore(s.root),call);assert.equal(calls,2);assert.equal(s.day().reservedMicros,charged);assert.equal(s.state.lastRound,null);
}));
test('验收拒绝模型提出的其他工具且不会执行外部动作',()=>fixture(async s=>{
  const result=await verifyHost(s,async()=>({message:{role:'assistant',content:[{type:'tool-call',id:'x',name:'private_read',arguments:'{"value":"HARNESS_TOOL_OK"}'}]},finish:{kind:'tool-calls'}}));
  assert.equal(result.status,'failed');assert.equal(result.modelCalls,1);assert.equal(result.realShutdowns,0);assert.equal(result.publications,0);
}));
test('验收调用也必须在持久化预算上限内，余额不足不发请求',()=>fixture(async s=>{
  s.update({dailyBudgetCny:0.01});let called=false;
  assert.equal((await verifyHost(s,async()=>{called=true;})).status,'failed');assert.equal(called,false);assert.equal(s.day().requests,0);
}));

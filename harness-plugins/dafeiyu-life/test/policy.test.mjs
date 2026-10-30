import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,inWindow,windowKey,validateConfig,sensitiveReason,isPublicIP,validatePublicURL,reserveMicros,beijingParts} from '../lib/policy.mjs';
const c={...DEFAULTS};
test('北京时间00:00至05:00，不依赖宿主时区',()=>{
  assert.equal(inWindow(c,new Date('2026-10-24T16:00:00Z')),true);
  assert.equal(inWindow(c,new Date('2026-10-24T20:59:59Z')),true);
  assert.equal(inWindow(c,new Date('2026-10-24T21:00:00Z')),false);
  assert.equal(inWindow(c,new Date('2026-10-24T15:59:59Z')),false);
  assert.equal(beijingParts(new Date('2026-10-24T16:00:00Z')).day,'2026-10-25');
});
test('修改为跨午夜时段时使用同一活动窗口标识',()=>{
  const x={...c,windowStart:'23:00',windowEnd:'05:00'};
  assert.equal(windowKey(x,new Date('2026-10-24T16:30:00Z')),'2026-10-24');
  assert.equal(inWindow(x,new Date('2026-10-24T15:30:00Z')),true);
});
test('预算和模型配置不能被抬高或换成未知计价路由',()=>{
  assert.throws(()=>validateConfig({...c,dailyBudgetCny:6.67}));
  assert.throws(()=>validateConfig({...c,model:'deepseek-v4-pro'}));
  assert.throws(()=>validateConfig({...c,windowStart:'24:00'}));
  assert.throws(()=>validateConfig({...c,shutdownDelaySeconds:0}));
});
test('拦截令牌、手机号、用户私密称呼和路径，普通讨论允许',()=>{
  for(const value of ['sk-abcdefghijklmno12345','13800138000','阿水今天的私人聊天','E:/LianHome/聊天/私密.txt','me@example.com'])assert.ok(sensitiveReason(value));
  assert.equal(sensitiveReason('我想聊聊如何把视频开头写得更具体。'),undefined);
});
test('公网访问拦截localhost、凭据、内网和重编码IP',()=>{
  for(const u of ['http://example.com','https://localhost/','https://127.0.0.1/','https://2130706433/','https://[::1]/','https://user:pass@example.com','https://example.com/?token=secret','https://192.168.1.1/'])assert.throws(()=>validatePublicURL(u));
  assert.equal(validatePublicURL('https://www.bilibili.com/video/BV123').hostname,'www.bilibili.com');
  assert.equal(isPublicIP('10.1.1.1'),false);assert.equal(isPublicIP('100.64.0.1'),false);assert.equal(isPublicIP('1.1.1.1'),true);
});
test('请求先按非缓存最高价预占，未知输入形态拒绝',()=>{
  const request={model:'deepseek-flash',maxTokens:4096,messages:[{role:'user',content:[{type:'text',text:'公开资料'}]}],tools:[]};
  assert.ok(reserveMicros(request,c)>4096*8);
  assert.throws(()=>reserveMicros({...request,maxTokens:100000},c));
  assert.throws(()=>reserveMicros({...request,messages:[{content:[{type:'image'}]}]},c));
});

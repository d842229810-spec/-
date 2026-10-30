import test from 'node:test';import assert from 'node:assert/strict';import {VoiceFollowup} from '../lib/voice-followup.mjs';
test('只去掉相同语音正文，允许追加说明',()=>{const x=new VoiceFollowup();x.remember('a',1,'说过的话');assert.equal(x.isEcho('a',1,'另外一件事'),false);x.remember('a',2,'说过的话');assert.equal(x.isEcho('a',2,'说过的话'),true)});
test('不跨会话或轮次吞回复，消费后不再吞下一条',()=>{const x=new VoiceFollowup();x.remember('a',1,'你好');assert.equal(x.isEcho('b',1,'你好'),false);assert.equal(x.isEcho('a',2,'你好'),false);assert.equal(x.isEcho('a',1,'你好'),true);assert.equal(x.isEcho('a',1,'你好'),false)});
test('一轮多条语音均可识别，过期轮次有界',()=>{const x=new VoiceFollowup();x.remember('a',1,'第一句');x.remember('a',1,'第二句');assert.equal(x.isEcho('a',1,'第二句'),true);for(let i=0;i<110;i++)x.remember('a',i,'句子');assert.equal(x.turns.size,100)});

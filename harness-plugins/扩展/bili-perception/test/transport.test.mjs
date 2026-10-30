import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateRawSync,deflateSync} from 'node:zlib';
import {decodeDeflate} from '../network.mjs';
import {networkErrorText} from '../vendor/extractor.js';
import {decodeTextBytes} from '../../../dafeiyu-life/lib/sources.mjs';
test('弹幕兼容有zlib头和裸deflate两种正文',()=>{
  const xml=Buffer.from('<i><d p="1">真实弹幕</d></i>');
  for(const bytes of [deflateSync(xml),deflateRawSync(xml)])assert.deepEqual(decodeDeflate(bytes),xml);
});
test('空message错误仍给出类型、压缩错误或底层原因',()=>{
  const e=new TypeError('');e.cause=Object.assign(new Error('incorrect header check'),{code:'Z_DATA_ERROR'});
  assert.match(networkErrorText(e),/Z_DATA_ERROR/);assert.match(networkErrorText(new AggregateError([new Error('connect failed')],'')),/connect failed/);
});
test('中文网页GBK声明解码，不把中文强行按UTF8替换',()=>{
  const data=Buffer.from([0xd6,0xd0,0xce,0xc4]);
  assert.equal(decodeTextBytes(data,'text/html; charset=GBK'),'中文');
});

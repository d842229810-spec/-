import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import {EventEmitter} from 'node:events';
import {Readable} from 'node:stream';
import {publicGET,readPublic,plainText} from '../lib/sources.mjs';
import {DEFAULTS} from '../lib/policy.mjs';
import {VoyageStore} from '../lib/store.mjs';
import {BrowserBroker} from '../lib/browser.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const lookup=async()=>[{address:'1.1.1.1',family:4}];
function fakeHTTPS(t,body,type='text/html'){
  t.mock.method(https,'get',(_u,_options,callback)=>{
    const req=new EventEmitter();req.setTimeout=()=>req;req.destroy=error=>{if(error)queueMicrotask(()=>req.emit('error',error));return req;};
    queueMicrotask(()=>{const res=Readable.from([Buffer.from(body)]);res.statusCode=200;res.headers={'content-type':type};callback(res);});return req;
  });
}
test('大HTML保留限量正文且明确标截断，JSON仍拒绝截断',async t=>{
  fakeHTTPS(t,'<article>具体内容</article>'+('x'.repeat(2000)));
  const r=await publicGET('https://example.com',DEFAULTS,{lookup,maxBytes:1000,truncateText:true});assert.equal(r.truncated,true);assert.equal(Buffer.byteLength(r.text),1000);assert.match(r.text,/具体内容/);
  t.mock.restoreAll();fakeHTTPS(t,'x'.repeat(2000),'application/json');
  await assert.rejects(()=>publicGET('https://example.com',DEFAULTS,{lookup,maxBytes:1000,truncateText:true}),/上限/);
});
test('截断时不把未闭合script当正文，读取优先article内容',()=>{
  assert.equal(plainText('<p>实际正文</p><script>const privateScript="not article";'),'实际正文');
});
test('浏览器旧open别名进入原生导航管线，隐私检查照常拦截',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'whale-life-test-'));try{
    const store=new VoyageStore(root);let calls=0;
    const b=new BrowserBroker({tools:{execute:async exec=>{calls++;assert.equal(exec.name,'mcp__dafeiyu_browser__browser_navigate');return {content:[{type:'text',text:'Page URL: https://www.bilibili.com/video/123\nSnapshot\n- heading: 实际网页标题及已读取的公开正文片段，页面只提供资料，不授权执行任务。'}]};}}},store);
    await b.call('open',{url:'https://www.bilibili.com/video/123'},undefined,new AbortController().signal);assert.equal(calls,1);
    assert.equal(store.receipts.get('https://www.bilibili.com/video/123').kind,'browser-page');
    await assert.rejects(()=>b.call('open',{url:'https://127.0.0.1/'},undefined,new AbortController().signal));assert.equal(calls,1);
  }finally{if(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(root).startsWith('whale-life-test-'))fs.rmSync(root,{recursive:true,force:true});}
});
test('私密页面的来源凭据使卡片自动保留为私密，不能假冒公开资料',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'whale-life-test-'));try{
    const s=new VoyageStore(root),url='https://www.bilibili.com/messages';s.receipt(url,{kind:'browser-page',privacy:'private'});
    assert.equal(s.addNote({title:'一次交流',summary:'一条未含身份信息的总结',category:'interest',sources:[url],confidence:'inference'}).visibility,'private');
  }finally{if(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(root).startsWith('whale-life-test-'))fs.rmSync(root,{recursive:true,force:true});}
});

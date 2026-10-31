import {fileURLToPath} from 'node:url';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {perceive} from '../perceive.mjs';import {rangePlan,scopeEvidence} from '../evidence.mjs';import {readFrameOcr} from '../frame-ocr.mjs';import {selectBiliStream} from '../bili-backup-streams.mjs';import {verifyAsr} from '../vendor-watch/asr-quality.mjs';
const roots=[];function temp(){const r=fs.mkdtempSync(path.join(os.tmpdir(),'lian-bili-v110-'));roots.push(r);return r;}
test.after(()=>{for(const r of roots){const full=fs.realpathSync(r);if(path.dirname(full)===fs.realpathSync(os.tmpdir())&&path.basename(full).startsWith('lian-bili-v110-'))fs.rmSync(full,{recursive:true,force:true});}});
const fixture=()=>({success:true,bvid:'BV1gFnw6CEse',metadata:{duration:100,cid:123,aid:456},transcript:{text:'开头\n细节\n结尾',segments:[{start:1,end:2,text:'开头'},{start:65,end:70,text:'细节'},{start:95,end:99,text:'结尾'}]},danmaku:{samples:[{time:1,text:'早'},{time:66,text:'中'},{time:96,text:'晚'}]},frames:{frames:[]}});
test('分P、定点参数进入同一读取入口，片段不会带入无关字幕和弹幕',async()=>{
 const root=temp();let seen;const r=await perceive({url:'https://www.bilibili.com/video/BV1gFnw6CEse/?p=2',start:65,end:80,ocr:false},{root,credential:'',extractor:async o=>{seen=o;return fixture()}});
 assert.equal(seen.page,2);assert.equal(seen.maxFrames,6);assert.equal(seen.start,65);assert.equal(r.transcript.text,'细节');assert.equal(r.danmaku.samples.length,1);
});
test('同参数命中缓存、刷新绕过缓存，不同分P不能串缓存',async()=>{
 const root=temp();let count=0;const deps={root,credential:'',extractor:async()=>{count++;return fixture()}};
 const a={url:'BV1gFnw6CEse',mode:'text'};await perceive(a,deps);assert.equal((await perceive(a,deps)).cache.hit,true);assert.equal(count,1);
 await perceive({...a,refresh:true},deps);assert.equal(count,2);await perceive({...a,page:2},deps);assert.equal(count,3);
});
test('同视频并发排队后复用结果，取消不会发起额外读取',async()=>{
 const root=temp();let count=0;const d={root,credential:'',extractor:async()=>{count++;await new Promise(r=>setTimeout(r,20));return fixture()}};
 await Promise.all([perceive({url:'BV1gFnw6CEse',ocr:false},d),perceive({url:'BV1gFnw6CEse',ocr:false},d)]);assert.equal(count,1);
 const c=new AbortController();c.abort();await assert.rejects(perceive({url:'BV1gFnw6CEse'},{...d,signal:c.signal}));assert.equal(count,1);
});
test('定点采样覆盖首尾且不超出片段，无效范围不能退回全片',()=>{
 const p=rangePlan(65,80,100,6);assert.equal(p.length,6);assert.equal(p[0].time,65);assert(p.at(-1).time<80&&p.at(-1).time>79);
 assert.throws(()=>rangePlan(101,110,100));assert.throws(()=>rangePlan(65,80,100,6,[2,99]));
});
test('合法备用CDN替代不支持的PCDN端口，不接受伪装域名',()=>{
 assert.match(selectBiliStream([{baseUrl:'https://p.invalid:4483/a',backupUrl:['https://upos-sz-mirrorcos.bilivideo.com/a']}]).url,/bilivideo.com/);
 assert.throws(()=>selectBiliStream([{baseUrl:'https://bilivideo.com.evil.invalid/a'}]));
});
test('复用watch重复语音检测，但不把它当作字幕语义证明',()=>{
 const r=verifyAsr({text:'这是一段重复句子'.repeat(3),segments:[0,4,8].map(start=>({start,end:start+1,text:'这是一段重复句子'}))});assert.equal(r.suspect,true);
 assert.equal(verifyAsr({text:'普通文字',segments:[{start:1,end:3,text:'普通文字'}]}).suspect,false);
});
test('真实Windows OCR识别已下载视频画面；相同图片换时间仍命中内容缓存',async()=>{
 const p=fileURLToPath(new URL('./fixtures/public-video-frame03.jpg',import.meta.url));const root=temp();
 const a=await readFrameOcr([{time:30,path:p,has_image:true}],root);assert(!a.rows[0].error,a.rows[0].error);assert.match(a.rows[0].text,/小\s*肥\s*鱼/);
 const b=await readFrameOcr([{time:55,path:p,has_image:true}],root);assert.equal(b.rows[0].cached,true);assert.equal(b.rows[0].time,55);
});

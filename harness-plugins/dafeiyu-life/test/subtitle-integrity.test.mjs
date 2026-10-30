import test from 'node:test';
import assert from 'node:assert/strict';
import {assessSubtitle,assessSubtitleTrack,recommendedFrames} from '../lib/subtitle-integrity.mjs';
import {BilibiliOfficialProvider} from '../vendor/moxingovo-bilibili/provider.js';

const detail={bvid:'BV15jGJztEk7',aid:114817109268400,cid:30920150983,duration:295,pages:[]};
const good=[{from:.16,to:2.1,content:'一鲸落万物生'},{from:287,to:292.16,content:'回到海洋'}];
const wrong=[{from:.32,to:1.8,content:'之前做山姆视频的时候'},{from:391.31,to:392.68,content:'我们下期见'}];
test('鲸落原始错片样本超时长，不能当有效字幕',()=>{
  const r=assessSubtitle(wrong,detail);assert.equal(r.passed,false);assert.ok(r.issues.includes('subtitle-exceeds-video-duration'));
});
test('身份错配、非有限数、倒序和负时间被拒绝',()=>{
  assert.equal(assessSubtitle(good,{...detail,identity:{...detail,cid:999}}).passed,false);
  for(const cues of [[{from:-1,to:1}],[{from:2,to:1}],[{from:0,to:NaN}],[{from:5,to:6},{from:1,to:2}]])assert.equal(assessSubtitle(cues,detail).passed,false);
});
test('通过结构检查仍然明确没有验证音画语义，不拒绝正常短字幕',()=>{
  const r=assessSubtitle(good,detail);assert.equal(r.passed,true);assert.equal(r.semanticVerified,false);
  assert.equal(assessSubtitle([{from:10,to:15,content:'片中只说一句话'}],detail).passed,true);
});
test('WBI返回错片时尝试普通端点，保留拒绝原因与来源',async()=>{
  const p=new BilibiliOfficialProvider();
  p.video=async()=>detail;
  p.playerData=async()=>({...detail,subtitle:{subtitles:[{lan:'ai-zh',subtitle_url:'https://i0.hdslb.com/wrong.json'}]}});
  p.requestJson=async()=>({...detail,subtitle:{subtitles:[{lan:'ai-zh',subtitle_url:'https://i0.hdslb.com/good.json'}]}});
  p.fetchSubtitleCues=async url=>url.includes('wrong')?wrong:good;
  const r=await p.subtitles({bvid:detail.bvid});assert.deepEqual(r.cues,good);assert.equal(r.provenance.endpoint,'plain');assert.ok(r.rejectedAttempts.length);
});
test('两个端点均错片时不返回伪成功，保留可用的其他读取通道',async()=>{
  const p=new BilibiliOfficialProvider();p.video=async()=>detail;
  p.playerData=p.requestJson=async()=>({...detail,subtitle:{subtitles:[{lan:'ai-zh',subtitle_url:'https://i0.hdslb.com/wrong.json'}]}});
  p.fetchSubtitleCues=async()=>wrong;
  await assert.rejects(p.subtitles({bvid:detail.bvid}),/没有取得通过身份与时长检查/);
});
test('抽帧数量跟随视频时长，仍可按时间点补充细看',()=>{
  assert.equal(recommendedFrames(20),3);assert.equal(recommendedFrames(295),10);assert.equal(recommendedFrames(3600),20);
});
test('时长合理但AI字幕文件属于另一aid/cid时仍被拒绝',()=>{
  const path='https://aisubtitle.hdslb.com/bfs/ai_subtitle/prod/';
  assert.equal(assessSubtitleTrack(path+'1131909606285142597945428719bd0a679ad57e23350f99747e9cc700',{...detail,language:'ai-zh'}).passed,false);
  assert.equal(assessSubtitleTrack(path+'114817109268400309201509838573fc5444a34029e8e634ef52643fc7',{...detail,language:'ai-zh'}).passed,true);
});

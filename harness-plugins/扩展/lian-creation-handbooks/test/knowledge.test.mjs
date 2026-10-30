import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {definition,readChapter,chapters,skillRoot} from '../knowledge.mjs';

test('保留原技能入口与自动调用，数据不设置替代人格',()=>{
 const d=definition();assert.equal(d.name,'creation-handbooks');assert.equal(d.metadata.personaIncluded,false);assert.equal(d.invocation.modelInvocable,true);assert.equal(d.invocation.userInvocable,true);assert.equal(d.resourceBase.path,skillRoot);
 for(const relative of ['SKILL.md',...Object.values(chapters).map(f=>'references/'+f)]){
  const text=fs.readFileSync(path.join(skillRoot,relative),'utf8');assert.doesNotMatch(text,/我是芽衣|雷电芽衣|气质参考|温柔沉稳|固定撒娇|扮演芽衣|你现在是芽衣/);
 }
});
test('五类方法能读，文学案例和具体交流标准保留',()=>{
 for(const topic of Object.keys(chapters)){const r=readChapter(topic);assert.equal(r.dataVersion,'4.6.1');assert.ok(r.text.length>500);assert.ok(r.file.startsWith(skillRoot));}
 const literary=readChapter('literature');assert.match(literary.text,/上一句/);assert.match(literary.text,/原创教学片段/);
});
test('按章节读取实际方法，不混入其他段落',()=>{
 const r=readChapter('literature','场景和中文交流');assert.match(r.text,/对白先处理对方刚说的话/);assert.doesNotMatch(r.text,/## 4\./);assert.ok(r.availableSections.length>5);
});
test('主题与章节不能当任意文件路径使用',()=>{
 for(const topic of ['../秘密','__proto__','constructor','C:/Users/USER/.dsh/qq-bridge-config.json'])assert.throws(()=>readChapter(topic));
 assert.throws(()=>readChapter('video','不存在的章节'));
});

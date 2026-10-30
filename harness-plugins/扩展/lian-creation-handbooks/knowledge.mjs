import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const packageRoot=path.dirname(fileURLToPath(import.meta.url));
export const skillRoot=path.join(packageRoot,'skills/creation-handbooks');
export const chapters=Object.freeze({workflow:'workflow.md',literature:'literary-creation.md',visual:'visual-creation.md',video:'video-direction.md',platform:'harness-notes.md'});
export const description='文学、视觉、视频导演与创作修订方法库V4.6.1，用于小说、对白、剧本、图片设计、分镜、生成提示词和连续项目；只提供创作方法与案例，不含人格。';
export function definition(){
  const file=path.join(skillRoot,'SKILL.md');
  const content=fs.readFileSync(file,'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/,'').trim();
  return {name:'creation-handbooks',description,source:'plugin:lian-creation-handbooks',provider:'lian-creation-handbooks',path:file,resourceBase:{kind:'directory',path:skillRoot},content,metadata:{dataVersion:'4.6.1',personaIncluded:false},invocation:{modelInvocable:true,userInvocable:true}};
}
export function readChapter(topic,section){
  if(!Object.hasOwn(chapters,topic))throw new Error('未知主题，可选：'+Object.keys(chapters).join(', '));
  const file=path.join(skillRoot,'references',chapters[topic]);
  const text=fs.readFileSync(file,'utf8');
  const headings=[...text.matchAll(/^## (.+)$/gm)].map(m=>({title:m[1],index:m.index}));
  let selected=text;
  if(section){const match=headings.find(h=>h.title===section||h.title.replace(/^\d+\.\s*/,'')===section);if(!match)throw new Error('没有该章节。可选：'+headings.map(h=>h.title).join('；'));const next=headings.find(h=>h.index>match.index);selected=text.slice(match.index,next?.index??text.length).trim();}
  return {dataVersion:'4.6.1',topic,file,section:section||null,availableSections:headings.map(h=>h.title),text:selected};
}

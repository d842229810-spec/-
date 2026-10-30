import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {assertProject} from './library.mjs';
const ITEMS={script:['intent','motivation','causality','dialogue','specificity','payoff','rhythm','fact-boundary'],film:['identity','layout','timing','voice','captions','continuity','sound','experience']};
const digest=b=>createHash('sha256').update(b).digest('hex');
export function prepareReview(project,stage='script'){
 const p=assertProject(project);if(!ITEMS[stage])throw new Error('stage应为script或film');
 const target=path.join(p,stage==='script'?'script.md':'out/preview.mp4'),sha256=digest(fs.readFileSync(target)),dir=path.join(p,'reviews');fs.mkdirSync(dir,{recursive:true});
 const file=path.join(dir,stage+'-'+sha256.slice(0,12)+'.json');
 if(!fs.existsSync(file))fs.writeFileSync(file,JSON.stringify({stage,target,sha256,reviewer:'author-self-review',userRejectionUnresolved:false,checks:ITEMS[stage].map(id=>({id,status:'pending',evidence:'',reason:'',...(stage==='film'?{time:null}:{} )})),limitations:'脚本只检查版本与证据记录，不证明审美或独立评审。'},null,2));
 return {file,stage,sha256,items:ITEMS[stage]};
}
export function checkReview(project,report){
 const p=assertProject(project),file=fs.realpathSync(report);if(!file.toLowerCase().startsWith(p.toLowerCase()+path.sep))throw new Error('审稿文件应在当前项目');
 const r=JSON.parse(fs.readFileSync(file,'utf8')),expected=ITEMS[r.stage];if(!expected)throw new Error('审稿阶段无效');
 const target=path.join(p,r.stage==='script'?'script.md':'out/preview.mp4'),issues=[];
 if(digest(fs.readFileSync(target))!==r.sha256)issues.push('内容已改，审稿版本失效');
 if(r.userRejectionUnresolved)issues.push('用户已指出的问题仍未解决');
 const ids=(r.checks??[]).map(c=>c.id);if(ids.length!==expected.length||new Set(ids).size!==expected.length||expected.some(x=>!ids.includes(x)))issues.push('审稿项目缺失或重复');
 const text=r.stage==='script'?fs.readFileSync(target,'utf8'):null;
 let duration;try{const technical=JSON.parse(fs.readFileSync(path.join(p,'out/technical-review.json'),'utf8'));if(r.stage==='film'&&technical.sourceSha256===r.sha256&&technical.sourceUnchanged)duration=technical.durationSeconds;else if(r.stage==='film')issues.push('技术检查版本不对应当前成片，请重新technical检查');}catch{if(r.stage==='film')issues.push('缺少当前成片的技术检查时长证据');}
 for(const c of r.checks??[]){if(!['pass','not-applicable'].includes(c.status))issues.push(c.id+': 尚未通过');if(!String(c.reason??'').trim())issues.push(c.id+': 缺判断理由');if(c.status==='pass'){if(!String(c.evidence??'').trim())issues.push(c.id+': 缺证据');else if(text&&!text.includes(c.evidence))issues.push(c.id+': 引文不在当前正文');if(r.stage==='film'&&(!Number.isFinite(c.time)||c.time<0))issues.push(c.id+': 缺实际观察时间');}}
 if(r.stage==='film'&&Number.isFinite(duration))for(const c of r.checks??[])if(c.status==='pass'&&c.time>=duration)issues.push(c.id+': 观察时间超出成片');
 return {passed:issues.length===0,stage:r.stage,reviewer:r.reviewer,issues,notice:'通过仅代表记录齐备、版本和引文一致；不等于工具证明作品好看、好听或用户认可。'};
}

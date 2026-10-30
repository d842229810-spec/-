import {DatabaseSync} from 'node:sqlite';
import {relevantFeedback} from '../lian-continuity/feedback.mjs';
import {privateSession} from '../lian-continuity/private-memory.mjs?revision=20261028-private2';
import {MemoryVault} from '../lian-continuity/vault.mjs';
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
const bases=['E:/LianHome','E:/DSH/大肥鱼创作室'];
function read(file){if(typeof file!=='string'||!path.isAbsolute(file)||!file.toLowerCase().endsWith('.md'))throw Error('请提供本地Markdown绝对路径');const p=fs.realpathSync(file);if(!bases.some(b=>p.toLowerCase().startsWith(fs.realpathSync(b).toLowerCase()+path.sep))||!fs.statSync(p).isFile()||fs.statSync(p).size>400000)throw Error('请选择已接入创作目录内400KB以内的文稿');const bytes=fs.readFileSync(p);return {file:p,text:bytes.toString('utf8'),sha256:createHash('sha256').update(bytes).digest('hex')}}
function body(text){const h=text.match(/^##\s+.*(?:逐页文案|口播正文|配音正文|正文)[^\n]*\n([\s\S]*?)(?=^##\s|$(?![\s\S]))/m);return h?h[1].replace(/^> ?/gm,'').replace(/\*\*/g,'').trim():text}
export function inspectWriting(file){const s=read(file),text=body(s.text),lines=s.text.split(/\r?\n/),characters=[...text.replace(/\s/g,'')].length,han=(text.match(/[\u4e00-\u9fff]/g)||[]).length;const prompts=[];
 for(let i=0;i<lines.length;i++){const line=lines[i];if(/(24\s*小时|整整一夜|隔了一夜|隔了整整一夜)/.test(line))prompts.push({fileLine:i+1,quote:line,kind:'timeline',question:'这些持续时间是否来自同一对起止记录？隔夜不自动等于24小时。'});if(/(听不见|不会听|没听过|听不出)/.test(line))prompts.push({fileLine:i+1,quote:line,kind:'capability-vs-experience',question:'是在说未使用过、工具不能接收，还是审美判断不足？请用实际记录区分。'});}
 return {file:s.file,sha256:s.sha256,body:text.slice(0,12000),bodyTruncated:text.length>12000,bodySelection:text===s.text?'whole-file':'identified-narration-section',characters,hanCharacters:han,nonemptyLines:lines.filter(x=>x.trim()).length,mechanicalPrompts:prompts,paidModelCalls:0,sourceModified:false,notice:'机械提示只列待核对位置，不鉴定审美、不提供AI概率、不拦截发布。字数不等于实际口播时长。'};
}
export function compareWriting(before,after){const a=inspectWriting(before),b=inspectWriting(after);const old=new Set(a.body.split(/\r?\n/).filter(x=>x.trim())),now=new Set(b.body.split(/\r?\n/).filter(x=>x.trim()));return {before:{file:a.file,sha256:a.sha256,characters:a.characters},after:{file:b.file,sha256:b.sha256,characters:b.characters},removedLines:[...old].filter(x=>!now.has(x)),addedLines:[...now].filter(x=>!old.has(x)),sameBytes:a.sha256===b.sha256,paidModelCalls:0,notice:'展示真实版本差异，不把字数减少或句子变化自动认定为文稿变好。'}}
export async function writingFeedback(args,execution={}){
 if(execution.agent&&!privateSession(execution.agent.session??{id:execution.agent.id},'E:/LianHome','session-00000000-0000-0000-0000-000000000000'))throw Error('真人创作反馈属于私人资料，请在家内私聊窗口使用。');
 const adding=['add-feedback','correct-feedback'].includes(args.action),db=new DatabaseSync('E:/LianHome/记忆/连续性档案/continuity.sqlite',{readOnly:!adding});db.exec('PRAGMA busy_timeout=5000');let vault;
 try{
  if(!adding)return relevantFeedback(db,{query:args.query,kind:'writing',limit:args.limit});
  if(!Number.isInteger(args.sourceSeq)||!args.sourceSession||!args.quote?.trim()||!args.judgment?.trim())throw Error('需要原始人类消息sourceSession/sourceSeq、原话和意见，不能记录助手自评。');
  const message=db.prepare('SELECT * FROM memory_documents WHERE id=?').get('chat:'+args.sourceSession+':'+args.sourceSeq),meta=JSON.parse(message?.metadata??'{}');
  if(meta.role!=='user'||!['user','qq','qq-bridge'].includes(meta.sourceKind)||!message.content.includes(args.quote))throw Error('找不到所引的人类原话，不能把外部资料或猜测当成真人反馈。');
  if(args.action==='correct-feedback'&&!args.correctionOf)throw Error('纠错需要correctionOf，旧评会保留。');
  if(args.correctionOf&&!db.prepare('SELECT id FROM creative_feedback WHERE id=?').get(args.correctionOf))throw Error('纠错原记录不存在');
  const subject=read(args.file),proof={backend:'harness',session:args.sourceSession,seq:args.sourceSeq,role:'user',sourceKind:meta.sourceKind,userMessageAt:message.at,quotedMessageSha256:message.sha256,verifiedOriginalMessage:true},id=createHash('sha256').update(JSON.stringify({proof,subject:subject.sha256,quote:args.quote,correctionOf:args.correctionOf??null})).digest('hex');
  const existing=db.prepare('SELECT * FROM creative_feedback WHERE id=?').get(id);if(existing)return {...existing,duplicate:true,originalRetained:true};
  vault=new MemoryVault('E:/LianHome');await vault.init();await vault.append([{kind:'human-writing-feedback',id,subject:subject.file,subjectSha256:subject.sha256,quote:args.quote,judgment:args.judgment,sourceProof:proof,correctionOf:args.correctionOf??null,originalRetained:true}]);
  db.prepare('INSERT INTO creative_feedback VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,new Date().toISOString(),'writing',subject.file,subject.sha256,args.quote,args.judgment,'harness',args.sourceSession,args.sourceSeq,JSON.stringify(proof),args.correctionOf??null);
  return {id,sourceProof:proof,subject:subject.file,subjectSha256:subject.sha256,originalRetained:true,humanOpinion:true,automaticTraining:false};
 }finally{vault?.close();db.close()}
}
export function registerWriting(tool){tool('whale_writing_workshop','检查文稿、比较真实版本；feedback取真人意见，add-feedback/correct-feedback引真实人类消息留痕。反馈只限家内私聊，不自动评分、改稿或外发。',{action:{type:'string',enum:['inspect','compare','feedback','add-feedback','correct-feedback'],required:true},file:{type:'string'},before:{type:'string'},after:{type:'string'},query:{type:'string'},limit:{type:'integer'},sourceSession:{type:'string'},sourceSeq:{type:'integer'},quote:{type:'string'},judgment:{type:'string'},correctionOf:{type:'string'}},(a,e)=>['feedback','add-feedback','correct-feedback'].includes(a.action)?writingFeedback(a,e):a.action==='inspect'?inspectWriting(a.file):compareWriting(a.before,a.after))}

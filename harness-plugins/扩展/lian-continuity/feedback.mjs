import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {createInterface} from 'node:readline';
const hash=b=>createHash('sha256').update(b).digest('hex');
export function initializeFeedback(db){
 const columns=new Set(db.prepare('PRAGMA table_info(voice_feedback)').all().map(x=>x.name));
 for(const [name,type] of [['sourceBackend',"TEXT DEFAULT 'harness'"],['sourceProof','TEXT']])if(!columns.has(name))db.exec('ALTER TABLE voice_feedback ADD COLUMN '+name+' '+type);
 db.exec('CREATE TABLE IF NOT EXISTS creative_feedback(id TEXT PRIMARY KEY,at TEXT NOT NULL,kind TEXT NOT NULL,subject TEXT NOT NULL,subjectSha256 TEXT NOT NULL,quote TEXT NOT NULL,judgment TEXT NOT NULL,sourceBackend TEXT NOT NULL,sourceSession TEXT NOT NULL,sourceSeq INTEGER NOT NULL,sourceProof TEXT NOT NULL,correctionOf TEXT)');
}
export function relevantFeedback(db,{query='',kind='voice',limit=5}={}){
 const rows=kind==='voice'?db.prepare('SELECT * FROM voice_feedback ORDER BY rowid DESC LIMIT 100').all():db.prepare('SELECT * FROM creative_feedback WHERE kind=? ORDER BY rowid DESC LIMIT 100').all(kind);
 const terms=String(query).toLowerCase().match(/[a-z0-9]+|[\p{Script=Han}]{2,}/gu)??[],ranked=rows.map(r=>{const text=JSON.stringify(r).toLowerCase(),hits=terms.filter(x=>text.includes(x));return {...r,sourceProof:r.sourceProof?JSON.parse(r.sourceProof):null,matchedTerms:hits}}).sort((a,b)=>b.matchedTerms.length-a.matchedTerms.length||b.at.localeCompare(a.at)).slice(0,Math.min(20,Math.max(1,limit)));
 return {feedback:ranked,query,matchedBy:ranked.some(x=>x.matchedTerms.length)?'literal-relevance':'recent-fallback',humanOpinion:true,automaticTraining:false,notice:'真人意见保留原话和原始来源；成对试听的总体评价不自动代表每个候选单独通过。'};
}
export async function verifyCodexSource(spec){
 const file=fs.realpathSync(spec.file),root=fs.realpathSync('C:/Users/USER/.codex/sessions');
 if(!file.toLowerCase().startsWith(root.toLowerCase()+path.sep)||!file.endsWith('.jsonl')||!Number.isInteger(spec.line)||spec.line<1)throw Error('仅接受本机Codex原始会话消息来源');
 let n=0,found;const stream=fs.createReadStream(file,{encoding:'utf8'}),lines=createInterface({input:stream,crlfDelay:Infinity});
 try{for await(const line of lines){if(++n===spec.line){found=line;break}}}finally{lines.close();stream.destroy()}
 if(!found||hash(found+'\n')!==spec.lineSha256)throw Error('原始反馈消息哈希变化');
 const e=JSON.parse(found),m=e.payload;if(e.type!=='response_item'||m?.role!=='user')throw Error('不是原始人类发言，不能导入为真人意见');
 const text=(m.content??[]).filter(x=>['input_text','text'].includes(x.type)).map(x=>x.text).join('\n');if(!text.includes(spec.quote)||typeof spec.quote!=='string'||!spec.quote.trim())throw Error('原始消息不包含这条意见');
 return {backend:'codex',file,line:spec.line,lineSha256:spec.lineSha256,session:spec.session,role:'user',quote:spec.quote,scope:spec.scope??'exact-quote',verifiedOriginalMessage:true};
}
// Maintenance import only: deliberately not exposed as an agent tool for arbitrary files.
export async function importCodexFeedback(db,spec){
 initializeFeedback(db);const proof=await verifyCodexSource(spec),p=fs.realpathSync(spec.subject),home=fs.realpathSync('E:/LianHome'),creative=fs.realpathSync('E:/DSH/大肥鱼创作室');
 if(![home,creative].some(r=>p.toLowerCase().startsWith(r.toLowerCase()+path.sep)))throw Error('反馈对象不在已接入目录');
 const sha256=hash(fs.readFileSync(p)),id=hash(JSON.stringify({source:proof.lineSha256,subject:p,quote:proof.quote})),at=new Date().toISOString();
 if(spec.kind==='voice-pair'){
  const profile=JSON.parse(fs.readFileSync('E:/DSH/插件/voice-design-runtime/selected-voice.json','utf8'));
  const subjects=(spec.subjects??[p]).map(file=>({file:fs.realpathSync(file),sha256:hash(fs.readFileSync(file))}));proof.scope='paired-comparison-not-individual-approval';proof.subjects=subjects;
  db.prepare('INSERT OR IGNORE INTO voice_feedback(id,at,session,sourceSession,sourceSeq,quote,judgment,audio,sha256,profile,correctionOf,sourceBackend,sourceProof) VALUES(?,?,?,?,?,?,?,?,?,?,NULL,?,?)').run(id,at,'codex-maintenance',spec.session,spec.line,proof.quote,spec.judgment,p,sha256,profile.id,'codex',JSON.stringify(proof));
 }else db.prepare('INSERT OR IGNORE INTO creative_feedback VALUES(?,?,?,?,?,?,?,?,?,?,?,NULL)').run(id,at,spec.kind,p,sha256,proof.quote,spec.judgment,'codex',spec.session,spec.line,JSON.stringify(proof));
 return {id,sourceBackend:'codex',sourceLine:spec.line,subject:p,sourceVerified:true};
}

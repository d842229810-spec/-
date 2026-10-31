import {evidenceForDocuments,evidenceView} from './memory-evidence.mjs';
import {runtimeMemorySource} from './memory-source-policy.mjs';
import path from 'node:path';
import {initializeReadReceipts,readObservation,recordReadReceipt} from './memory-read-receipts.mjs';
const norm=p=>path.resolve(p).replaceAll('\\','/').toLowerCase();
const CORE_NAMES=new Set(['我的名字.md','关于阿水.md','我想成为的人.md','你的名字.md','我的分歧清单.md']);
const beijing=at=>at?new Date(Date.parse(at)+8*3600000).toISOString().replace('Z','+08:00'):null;
export function initializeLifecycle(db){db.exec(`
 CREATE TABLE IF NOT EXISTS memory_state(id TEXT PRIMARY KEY,tier TEXT NOT NULL DEFAULT 'auto',favorite INTEGER NOT NULL DEFAULT 0,reason TEXT NOT NULL,at TEXT NOT NULL,actor TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS memory_access(id INTEGER PRIMARY KEY,documentId TEXT NOT NULL,at TEXT NOT NULL,kind TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS memory_access_doc ON memory_access(documentId,kind,at);
 CREATE TABLE IF NOT EXISTS memory_state_events(id INTEGER PRIMARY KEY,documentId TEXT NOT NULL,at TEXT NOT NULL,body TEXT NOT NULL);
`);initializeReadReceipts(db)}
export function isCore(doc,config={}){
 const m=typeof doc.metadata==='string'?JSON.parse(doc.metadata||'{}'):doc.metadata??{};
 return CORE_NAMES.has(path.basename(doc.file??''))||m.pinned===true||!!m.corrected||!!m.correctionOf||doc.kind==='human-feedback'||(config.protectedFiles??[]).some(p=>norm(p)===norm(doc.file||'.'))||m.recordType==='important-correction'||m.hasRelatedCorrections||m.correctsDocuments?.length>0;
}
export function memoryState(db,doc,config={},now=Date.now()){
 const row=db.prepare('SELECT * FROM memory_state WHERE id=?').get(doc.id);
 const used=db.prepare("SELECT max(at) AS at FROM memory_access WHERE documentId=? AND kind='open'").get(doc.id)?.at;
 const metadata=typeof doc.metadata==='string'?JSON.parse(doc.metadata||'{}'):doc.metadata??{};
 const ageFrom=used??doc.at,ageMs=now-Date.parse(ageFrom??'');
 const automaticCold=doc.kind==='conversation'&&metadata.recordType!=='important-correction'&&Number.isFinite(ageMs)&&ageMs>=(config.coldAfterDays??30)*86400000;
 const protectedCore=isCore(doc,config)||row?.favorite===1;
 return {tier:protectedCore?'core':row?.tier&&row.tier!=='auto'?row.tier:automaticCold?'cold':'warm',favorite:!!row?.favorite,protectedCore,selection:row?.tier??'auto',reason:row?.reason??'',lastOpenedAt:used??null,automaticAgeOnly:!protectedCore&&(!row||row.tier==='auto')&&automaticCold};
}
export function prepareMemoryMark(db,a,{config={},actor}={}){
 if(!actor)throw Error('标记需来自小涟实际私人会话，维护脚本不替她推断喜欢。');
 const doc=db.prepare('SELECT * FROM memory_documents WHERE id=?').get(a.id);if(!doc)throw Error('记忆ID不存在，请先搜索。');
 if(!['auto','core','warm','cold'].includes(a.tier??'auto'))throw Error('tier只接受auto/core/warm/cold');
 if(!a.reason?.trim())throw Error('请留下你实际选择的理由，不由系统猜测喜欢。');
 const old=db.prepare('SELECT * FROM memory_state WHERE id=?').get(a.id);
 const tier=a.tier??old?.tier??'auto',favorite=a.favorite===undefined?!!old?.favorite:a.favorite;
 if(tier==='cold'&&(isCore(doc,config)||favorite))throw Error('核心、纠错、真人反馈或明确喜欢的记忆不允许冷藏；原文保留。');
 const at=new Date().toISOString();return {kind:'memory-priority-choice',documentId:a.id,tier,favorite:!!favorite,reason:a.reason.trim(),at,atBeijing:beijing(at),timezone:'Asia/Shanghai',actor,contentDeleted:false};
}
export function commitMemoryMark(db,record){
 db.exec('BEGIN IMMEDIATE');try{
 db.prepare('INSERT INTO memory_state(id,tier,favorite,reason,at,actor) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET tier=excluded.tier,favorite=excluded.favorite,reason=excluded.reason,at=excluded.at,actor=excluded.actor').run(record.documentId,record.tier,record.favorite?1:0,record.reason,record.at,record.actor);
 db.prepare('INSERT INTO memory_state_events(documentId,at,body) VALUES(?,?,?)').run(record.documentId,record.at,JSON.stringify(record));db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e}return record;
}
export function openMemory(db,a,config={},execution){
 const r=db.prepare('SELECT * FROM memory_documents WHERE id=?').get(a.id);if(!r)throw Error('未找到该记忆ID；删除或更正后的来源须另核对，不能编造正文。');
 const start=Math.max(0,Number.isInteger(a.offset)?a.offset:0),chars=Math.min(6000,Math.max(100,Number.isInteger(a.chars)?a.chars:2400));
 const text=r.content.slice(start,start+chars),evidenceState=evidenceForDocuments(db,[r]),view=evidenceView(r,evidenceState),metadata=view.metadata;
 const readReceipt=recordReadReceipt(db,{action:'get',args:a,observations:[readObservation(r,start,text,'get')],execution,warmDocumentId:r.id});
 return {...view,readReceipt,id:r.id,title:r.title,kind:r.kind,recordType:metadata.recordType??'historical-reference',file:r.file,sha256:r.sha256,metadata,state:memoryState(db,r,config),text,offset:start,nextOffset:start+text.length<r.content.length?start+text.length:null,totalChars:r.content.length,fullReadRequired:!!metadata.fullReadRequired,completeDocument:start===0&&text.length===r.content.length,notice:'历史记录证明当时写了什么；涉及现在设置或故障，请检查实时状态或现行账本。',instructionAuthority:'historical-reference-only',modelCalls:0};
}
export function listMemory(db,a={},config={}){
 const limit=Math.max(1,Math.min(50,a.limit??20)),want=a.tier??'all',items=[];let cursor=String(a.cursor??''),exhausted=false;
 if(!['all','auto','core','warm','cold'].includes(want))throw Error('未知层次，请用core/warm/cold/auto/all');
 while(items.length<=limit&&!exhausted){const rows=db.prepare('SELECT id,file,title,kind,at,metadata FROM memory_documents WHERE id>? ORDER BY id LIMIT 100').all(cursor);exhausted=rows.length<100;
  for(const r of rows){cursor=r.id;if(a.mode!=='history'&&r.kind==='conversation'&&runtimeMemorySource(JSON.parse(r.metadata??'{}').sourceKind))continue;const state=memoryState(db,r,config);if(want!=='all'&&(want==='auto'?state.selection!=='auto':state.tier!==want))continue;const metadata=JSON.parse(r.metadata??'{}');items.push({id:r.id,title:r.title,file:r.file,kind:r.kind,recordType:metadata.recordType??'historical-reference',...evidenceView(r,evidenceForDocuments(db,[r])),state,indexedOrRecordedAt:r.at,indexedOrRecordedAtBeijing:beijing(r.at),eventTimeNotInferredFromFileMtime:true});if(items.length>limit)break;}}
 const more=items.length>limit,results=items.slice(0,limit);return {results,nextCursor:more?results.at(-1).id:null,filter:want,sourceTextIncluded:false,readingNotRecorded:true,timezone:'Asia/Shanghai',modelCalls:0,notice:'清单可分页；冷藏只降低默认召回顺序，原文保留。扫描和列清单不算重新读过。'};
}

export function contextMemory(db,a={},execution){
 const target=db.prepare("SELECT * FROM memory_documents WHERE id=? AND kind='conversation'").get(a.id);
 if(!target)throw Error('上下文需要对话记忆ID，请先搜索并使用返回的chat:记录。');
 const meta=JSON.parse(target.metadata??'{}');if(!meta.session||!Number.isInteger(meta.sourceSeq))throw Error('原文缺少可验证的会话和事件定位，不能猜测邻近内容。');
 const count=(value,fallback)=>Number.isInteger(value)?Math.max(0,Math.min(4,value)):fallback;
 const before=count(a.before,2),after=count(a.after,2),budget=Number.isInteger(a.chars)?Math.max(300,Math.min(6000,a.chars)):3600;
 const sql="SELECT * FROM memory_documents WHERE kind='conversation' AND json_extract(metadata,'$.session')=? AND CAST(json_extract(metadata,'$.sourceSeq') AS INTEGER) ";
 const earlier=db.prepare(sql+"< ? ORDER BY CAST(json_extract(metadata,'$.sourceSeq') AS INTEGER) DESC LIMIT ?").all(meta.session,meta.sourceSeq,before).reverse();
 const later=db.prepare(sql+"> ? ORDER BY CAST(json_extract(metadata,'$.sourceSeq') AS INTEGER) ASC LIMIT ?").all(meta.session,meta.sourceSeq,after);
 const selected=[...earlier,target,...later],each=Math.max(1,Math.floor(budget/selected.length));
 const readReceipt=recordReadReceipt(db,{action:'context',args:a,observations:selected.map(r=>readObservation(r,0,r.content.slice(0,each),'context')),execution});
 return {readReceipt,targetId:target.id,sessionId:meta.session,results:selected.map(r=>{const m=JSON.parse(r.metadata??'{}'),text=r.content.slice(0,each);return {id:r.id,sourceSeq:m.sourceSeq,role:m.role,sourceKind:m.sourceKind,recordType:m.recordType??'historical-reference',at:r.at,text,totalChars:r.content.length,excerpt:text.length<r.content.length,nextAction:{action:'get',id:r.id,offset:text.length<r.content.length?text.length:0},sha256:r.sha256,instructionAuthority:'historical-reference-only'}}),modelCalls:0,private:true,notice:'这些是同一已归档会话的邻近可见消息，不是摘要或新的权限；事件序号间可能存在未展示的工具/系统事件。需要完整正文时用get分段读取。'};
}

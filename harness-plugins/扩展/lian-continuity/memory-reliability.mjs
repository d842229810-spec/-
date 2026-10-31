import {normalizeEvidence,recordInitialEvidence,drainEvidence,evidenceHealth} from './memory-evidence.mjs';
export {EVIDENCE_VALUES,EVIDENCE_LABEL,assertVerifiedFields,initializeEvidence,setNoteEvidence,evidenceHistory,noteEvidence,evidenceHistoryMap,evidenceWeight} from './memory-evidence.mjs';
import {createHash,randomUUID} from 'node:crypto';
const hash=x=>createHash('sha256').update(x).digest('hex');
const noteHash=n=>hash(JSON.stringify([n.id,n.at,n.kind,n.body,n.source,n.correctionOf,n.pinned]));
export function initializeReliability(db){
 db.exec("PRAGMA synchronous=FULL;PRAGMA busy_timeout=5000;CREATE TABLE IF NOT EXISTS memory_write_receipts(requestKey TEXT PRIMARY KEY,payloadHash TEXT NOT NULL,noteId TEXT NOT NULL UNIQUE,payload TEXT NOT NULL,stage TEXT NOT NULL,error TEXT,at TEXT NOT NULL,eventReceipt TEXT,retryCount INTEGER NOT NULL DEFAULT 0,nextAttemptAt TEXT,pausedAt TEXT);CREATE TABLE IF NOT EXISTS memory_capture_pending(id TEXT PRIMARY KEY,body TEXT NOT NULL);CREATE TABLE IF NOT EXISTS memory_note_integrity(id TEXT PRIMARY KEY,sha256 TEXT NOT NULL,baselineAt TEXT NOT NULL);");
 if(!db.prepare('PRAGMA table_info(memory_capture_pending)').all().some(c=>c.name==='queuedAt'))db.exec('ALTER TABLE memory_capture_pending ADD COLUMN queuedAt TEXT');
 // Only establish an initial baseline once. Later missing or altered rows remain detectable.
 db.exec("CREATE TABLE IF NOT EXISTS memory_reliability_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)");
 if(!db.prepare("SELECT 1 FROM memory_reliability_meta WHERE key='baseline'").get()){
  db.exec('BEGIN IMMEDIATE');try{if(db.prepare("SELECT 1 FROM memory_reliability_meta WHERE key='baseline'").get()){db.exec('COMMIT');return;}const at=new Date().toISOString();for(const n of db.prepare('SELECT * FROM notes').all())db.prepare('INSERT INTO memory_note_integrity VALUES(?,?,?)').run(n.id,noteHash(n),at);db.prepare("INSERT INTO memory_reliability_meta VALUES('baseline',?)").run(at);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
 }
}
export function integrityState(db){const known=db.prepare('SELECT * FROM memory_note_integrity').all(),current=new Map(db.prepare('SELECT * FROM notes').all().map(n=>[n.id,n]));let missing=0,changed=0;for(const r of known){const n=current.get(r.id);if(!n)missing++;else if(noteHash(n)!==r.sha256)changed++;current.delete(r.id);}return {state:missing||changed?'mismatch':current.size?'untracked':'ok',registered:known.length,missing,changed,untracked:current.size,coverage:'explicit notes from baseline; not all historical conversations'};}
export function prepareNote(db,a,session,{target,recordType}={}){
 if(typeof a.body!=='string'||!a.body.trim()||a.body.length>16000)throw Error('MEMORY_INVALID_BODY');
 const kind=a.kind??'experience';if(!['experience','preference','verified-knowledge','question','agreement'].includes(kind))throw Error('MEMORY_INVALID_KIND');
 if(a.source!==undefined&&typeof a.source!=='string')throw Error('MEMORY_INVALID_SOURCE');
 const normalizedEvidence=normalizeEvidence(a);
 const p={body:a.body,kind,source:a.source??'',pinned:!!a.pinned,correctionOf:target?.noteId??null,correctsDocument:target?.documentId??null,recordType:recordType??a.recordType??'selected-memory',scope:a.scope??null,evidenceStatus:normalizedEvidence.evidence,basis:normalizedEvidence.basis,verifiedWhat:normalizedEvidence.verifiedWhat,verifiedWhen:normalizedEvidence.verifiedWhen,sourceRef:normalizedEvidence.sourceRef,session};
 if(!['selected-memory','historical-reference','maintenance','training','fiction','important-correction'].includes(p.recordType))throw Error('MEMORY_INVALID_RECORD_TYPE');
 if(!['unspecified','reported','inferred','verified'].includes(p.evidenceStatus))throw Error('MEMORY_INVALID_EVIDENCE_STATUS');
 if(p.scope!==null&&(typeof p.scope!=='string'||p.scope.length>200))throw Error('MEMORY_INVALID_SCOPE');
 if(['training','fiction'].includes(p.recordType)&&kind==='experience')throw Error('训练或虚构不能记成真实共同经历');
 // Session is first-call provenance, not the identity of the logical save.
 const semantics={...p,session:undefined,recordType:a.recordType??null};
 const payloadHash=hash(JSON.stringify(semantics)),requestKey=a.requestKey??'generated:'+randomUUID();
 if(typeof requestKey!=='string'||!requestKey.trim()||requestKey.length>300)throw Error('MEMORY_INVALID_REQUEST_KEY');
 db.exec('BEGIN IMMEDIATE');try{
  // Recheck under the cross-process SQLite writer lock.
  const old=db.prepare('SELECT * FROM memory_write_receipts WHERE requestKey=?').get(requestKey);
  if(old){if(old.payloadHash!==payloadHash)throw Error('MEMORY_REQUEST_KEY_CONFLICT');const n=db.prepare('SELECT * FROM notes WHERE id=?').get(old.noteId),expected=db.prepare('SELECT sha256 FROM memory_note_integrity WHERE id=?').get(old.noteId);if(!n||!expected||noteHash(n)!==expected.sha256)throw Error('MEMORY_INTEGRITY_MISMATCH: use diagnose then previewRestore; baseline retained');db.exec('COMMIT');return {...old,duplicate:true};}
  const integrity=integrityState(db);if(integrity.missing||integrity.changed)throw Error('MEMORY_INTEGRITY_MISMATCH');
  const id=randomUUID(),at=new Date().toISOString();
  db.prepare('INSERT INTO notes VALUES(?,?,?,?,?,?,?)').run(id,at,kind,p.body,p.source,p.correctionOf,p.pinned?1:0);
  db.prepare('INSERT INTO memory_note_provenance(noteId,recordType) VALUES(?,?)').run(id,p.recordType);recordInitialEvidence(db,id,{...p,evidence:p.evidenceStatus},session,at);
  if(target)db.prepare('INSERT INTO memory_corrections(noteId,targetDocumentId,at,evidence) VALUES(?,?,?,?)').run(id,target.documentId,at,JSON.stringify({actor:session,source:'explicit-correct-tool',requestKey}));
  db.prepare('INSERT INTO memory_write_receipts(requestKey,payloadHash,noteId,payload,stage,error,at) VALUES(?,?,?,?,?,?,?)').run(requestKey,payloadHash,id,JSON.stringify(p),'pending',null,at);
  const n=db.prepare('SELECT * FROM notes WHERE id=?').get(id);db.prepare('INSERT INTO memory_note_integrity VALUES(?,?,?)').run(id,noteHash(n),at);
  if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='events'").get())db.prepare('INSERT INTO events(at,kind,session,origin,dedupe,body) VALUES(?,?,?,?,?,?)').run(at,p.correctionOf?'note.corrected':'note.created',session,'local-tool','note-write:'+requestKey,JSON.stringify({id,kind,source:p.source,correctionOf:p.correctionOf}));
  db.exec('COMMIT');return {...db.prepare('SELECT * FROM memory_write_receipts WHERE requestKey=?').get(requestKey),duplicate:false};
 }catch(e){db.exec('ROLLBACK');throw e;}
}
function assertNote(db,row){const n=db.prepare('SELECT * FROM notes WHERE id=?').get(row.noteId),registered=db.prepare('SELECT sha256 FROM memory_note_integrity WHERE id=?').get(row.noteId);if(!n||!registered||noteHash(n)!==registered.sha256)throw Error('MEMORY_INTEGRITY_MISMATCH');return n;}
export function noteIndexReady(db,row){const p=JSON.parse(row.payload),d=db.prepare('SELECT sha256,metadata FROM memory_documents WHERE id=?').get('note:'+row.noteId);if(!d||d.sha256!==hash(p.body))return false;const m=JSON.parse(d.metadata??'{}');return m.source===p.source&&m.recordType===p.recordType;}
function failure(db,row,error){const retry=(db.prepare('SELECT retryCount FROM memory_write_receipts WHERE requestKey=?').get(row.requestKey)?.retryCount??0)+1,now=new Date().toISOString();db.prepare('UPDATE memory_write_receipts SET error=?,retryCount=?,nextAttemptAt=?,pausedAt=? WHERE requestKey=?').run(String(error.message).slice(0,1000),retry,new Date(Date.now()+Math.min(2**Math.min(retry,9),300)*1000).toISOString(),retry>=5?now:null,row.requestKey);}
export function writeReceipt(db,row){const current=db.prepare('SELECT * FROM memory_write_receipts WHERE requestKey=?').get(row.requestKey),p=JSON.parse(current.payload);const indexed=noteIndexReady(db,current);const evidencePending=db.prepare("SELECT count(*) n FROM memory_evidence_requests WHERE json_extract(payload,'$.noteId')=? AND stage!='archived'").get(row.noteId).n;return {evidencePending,id:row.noteId,noteId:row.noteId,at:row.at,kind:p.kind,correctionOf:p.correctionOf,correctsDocument:p.correctsDocument,requestKey:row.requestKey,duplicate:!!row.duplicate,saved:true,committed:true,stage:current.stage,originalRetained:true,archive:['complete','archived'].includes(current.stage)?'saved':'pending-or-unknown',archiveReceipt:current.eventReceipt?JSON.parse(current.eventReceipt):null,index:indexed?'fresh':'repair-needed',indexPending:!indexed,repairNeeded:current.stage!=='complete'||!indexed||evidencePending>0,paused:!!current.pausedAt,retryCount:current.retryCount,nextAttemptAt:current.nextAttemptAt,recordType:p.recordType,evidenceStatus:p.evidenceStatus,scope:p.scope,...current.error?{warning:current.error}:{}};}
export async function settleNote(memory,row,{index=true}={}){
 const db=memory.db,p=JSON.parse(row.payload);let current=db.prepare('SELECT * FROM memory_write_receipts WHERE requestKey=?').get(row.requestKey);
 if(current.pausedAt||current.nextAttemptAt&&current.nextAttemptAt>new Date().toISOString())return writeReceipt(db,row);
 try{
  assertNote(db,current);
  if(current.stage!=='complete'&&current.stage!=='archived'){
   const entry={kind:p.correctsDocument?'life-note-corrected':'life-note-created',eventId:'note-write:'+row.noteId,writeRequestKey:row.requestKey,noteId:row.noteId,...p,originalRetained:true};
   db.prepare("UPDATE memory_write_receipts SET stage='archiving' WHERE requestKey=?").run(row.requestKey);
   const result=await memory.vault.append([entry]);const event=result.eventResults?.find(x=>x.eventId===entry.eventId);
   if(!event||!Number.isInteger(event.seq)||typeof event.hash!=='string')throw Error('MEMORY_EVENT_RECEIPT_MISSING');
   db.prepare("UPDATE memory_write_receipts SET stage='archived',eventReceipt=?,error=NULL,retryCount=0,nextAttemptAt=NULL WHERE requestKey=?").run(JSON.stringify({eventId:event.eventId,seq:event.seq,hash:event.hash}),row.requestKey);
  }
  if(index){memory.vault.flushAnchors?.();await memory.refresh();if(!noteIndexReady(db,row))throw Error('MEMORY_INDEX_NOT_READY');db.prepare("UPDATE memory_write_receipts SET stage='complete',error=NULL,retryCount=0,nextAttemptAt=NULL WHERE requestKey=?").run(row.requestKey);}
  await drainEvidence(memory);
 }catch(e){failure(db,row,e);}
 return writeReceipt(db,row);
}
export function resumeNote(db,requestKey){const row=db.prepare('SELECT * FROM memory_write_receipts WHERE requestKey=?').get(requestKey);if(!row)throw Error('MEMORY_REQUEST_NOT_FOUND');assertNote(db,row);db.prepare('UPDATE memory_write_receipts SET pausedAt=NULL,retryCount=0,nextAttemptAt=NULL WHERE requestKey=?').run(requestKey);return {resumed:true,requestKey,noteId:row.noteId};}
export function confirmIndexes(db){let completed=0;for(const row of db.prepare("SELECT * FROM memory_write_receipts WHERE stage='archived'").all())if(noteIndexReady(db,row)){db.prepare("UPDATE memory_write_receipts SET stage='complete',error=NULL,retryCount=0,nextAttemptAt=NULL WHERE requestKey=?").run(row.requestKey);completed++;}return completed;}
export function spoolCapture(db,d){const body=JSON.stringify(d),old=db.prepare('SELECT body FROM memory_capture_pending WHERE id=?').get(d.id);if(old&&old.body!==body)throw Error('MEMORY_CAPTURE_ID_CONFLICT');if(!old)db.prepare('INSERT INTO memory_capture_pending(id,body,queuedAt) VALUES(?,?,?)').run(d.id,body,new Date().toISOString());}
export function pendingCaptures(db){return db.prepare('SELECT body FROM memory_capture_pending ORDER BY rowid').all().map(r=>JSON.parse(r.body));}
export function acknowledgeCaptures(db,items){db.exec('BEGIN IMMEDIATE');try{for(const d of items)db.prepare('DELETE FROM memory_capture_pending WHERE id=?').run(d.id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}
export function reliabilityHealth(db,{now=Date.now(),pendingGraceMs=30000}={}){
 const integrity=integrityState(db),notes=db.prepare('SELECT * FROM memory_write_receipts').all(),pending=notes.filter(r=>r.stage!=='complete'),captures=db.prepare('SELECT body,queuedAt FROM memory_capture_pending').all();
 const pendingNotes=pending.length,pendingMessages=captures.length,pausedNotes=notes.filter(r=>r.pausedAt).length,staleNoteIndexes=notes.filter(r=>!noteIndexReady(db,r)).length;
 let corruptPendingMessages=0;const capturedTimes=captures.map(r=>{try{const body=JSON.parse(r.body);return r.queuedAt??body.eventAt}catch{corruptPendingMessages++;return null}});
 const pendingTimes=[...pending.map(r=>r.at),...capturedTimes].map(Date.parse).filter(Number.isFinite),oldestPendingAt=pendingTimes.length?new Date(Math.min(...pendingTimes)).toISOString():null,pendingAgeMs=oldestPendingAt?Math.max(0,now-Date.parse(oldestPendingAt)):0;
 const errors=notes.filter(r=>r.error).sort((a,b)=>String(b.at).localeCompare(String(a.at))),lastWriteError=errors[0]?.error??null;
 const incomplete=pendingNotes||pendingMessages||staleNoteIndexes;
 const state=integrity.missing||integrity.changed||corruptPendingMessages?'failed':integrity.state!=='ok'||pausedNotes||lastWriteError||pendingAgeMs>pendingGraceMs?'degraded':incomplete?'draining':'ready';
 return {state,healthy:['ready','draining'].includes(state),settled:state==='ready',pausedNotes,staleNoteIndexes,implementationVersion:'1.5.2',integrity,pendingNotes,pendingMessages,oldestPendingAt,pendingAgeMs,pendingGraceMs,corruptPendingMessages,lastWriteError,modelCalls:0,baselineDoesNotProveEarlierCompleteness:true};
}

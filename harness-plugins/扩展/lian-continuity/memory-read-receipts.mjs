import {createHash} from 'node:crypto';

export const READ_RECEIPT_CAPABILITIES=Object.freeze({version:1,persistedActions:['get','context'],previewPersists:false,requestIdentity:'host-call-id-scoped-by-real-session-when-available',missingCallId:'no-durable-receipt-or-deduplication',fragmentUnion:false,meaning:'actual-returned-text-not-understanding',rankingChanged:false});

const hash=value=>createHash('sha256').update(value).digest('hex');
function canonical(value){
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,canonical(value[key])]));
 return value;
}
const serialized=value=>JSON.stringify(canonical(value));
export function initializeReadReceipts(db){
 db.exec(`CREATE TABLE IF NOT EXISTS memory_read_receipts(
  requestKey TEXT PRIMARY KEY,callId TEXT NOT NULL,sessionId TEXT,tool TEXT NOT NULL,
  action TEXT NOT NULL,requestSha256 TEXT NOT NULL,observationsSha256 TEXT NOT NULL,
  at TEXT NOT NULL,observations TEXT NOT NULL,legacyOpenRecorded INTEGER NOT NULL DEFAULT 0
 )`);
}
// The host execution object is the only source of request identity. Never accept
// a caller-supplied requestId or invent a session identity for maintenance scripts.
export function readExecution(exec,tool){
 const callId=typeof exec?.callId==='string'&&exec.callId.trim()?exec.callId:null;
 const explicitSession=exec?.agent?.session?.id;
 const sessionId=typeof explicitSession==='string'&&explicitSession.trim()?explicitSession:typeof exec?.agent?.id==='string'&&exec.agent.id.trim()?exec.agent.id:null;
 return {callId,sessionId,tool};
}
export function readObservation(doc,offset,text,kind){
 const returnedChars=text.length,totalChars=doc.content.length;
 return {documentId:doc.id,sourceSha256:doc.sha256,kind,offset,
  endOffset:offset+returnedChars,returnedChars,totalChars,
  coverage:returnedChars===0?'empty':offset===0&&returnedChars===totalChars?'whole-document':'fragment'};
}
export function previewReceipt(result){
 return {action:'search',kind:'preview',persisted:false,recallRecorded:false,warmingUpdated:false,
  documentsPresented:result.results?.length??0,
  returnedChars:(result.results??[]).reduce((n,row)=>n+String(row.text??'').length,0),
  characterUnit:'utf16-code-units',
  notice:'搜索预览只记录本次返回了多少文本，不写回忆次数、不使记忆升温，也不证明读过或理解。'};
}
export function recordReadReceipt(db,{action,args,observations,execution,warmDocumentId}){
 const visible=observations.filter(row=>row.returnedChars>0);
 const base={action,observations,characterUnit:'utf16-code-units',recallCountIncremented:false,
  interpretation:'returned-text-only',notice:'收据仅说明工具实际返回的文本范围，不证明阅读、理解或记住；不同请求的片段不自动合并为全文阅读。'};
 const callId=typeof execution?.callId==='string'&&execution.callId.trim()?execution.callId:null;
 if(!callId){
  // Backward compatibility: direct calls keep the existing get/open aging rule.
  // No durable receipt can truthfully promise retry deduplication without a host ID.
  const warmingUpdated=!!warmDocumentId&&visible.some(row=>row.documentId===warmDocumentId);
  if(warmingUpdated)db.prepare('INSERT INTO memory_access(documentId,at,kind) VALUES(?,?,?)').run(warmDocumentId,new Date().toISOString(),'open');
  return {...base,persisted:false,replayed:false,receiptId:null,requestIdentity:'missing-host-call-id',
   deduplication:'unavailable',warmingUpdated};
 }
 const sessionId=typeof execution?.sessionId==='string'&&execution.sessionId.trim()?execution.sessionId:null;
 const tool=typeof execution?.tool==='string'&&execution.tool.trim()?execution.tool:'unknown-tool';
 const requestKey=hash(serialized([sessionId,callId]));
 const requestSha256=hash(serialized({tool,action,args}));
 const observationText=serialized(observations),observationsSha256=hash(observationText);
 const at=new Date().toISOString(),warmingUpdated=!!warmDocumentId&&visible.some(row=>row.documentId===warmDocumentId);
 db.exec('SAVEPOINT lian_memory_read_receipt');
 try{
  // A SAVEPOINT is deferred. Reserve the writer before reading to avoid two
  // processes both reading the old row then deadlocking on a read-to-write upgrade.
  // SQLite starts a write transaction even though this UPDATE changes zero rows.
  db.prepare('UPDATE memory_read_receipts SET requestKey=requestKey WHERE 0').run();
  const old=db.prepare('SELECT * FROM memory_read_receipts WHERE requestKey=?').get(requestKey);
  if(old){
   if(old.requestSha256!==requestSha256)throw Object.assign(new Error('同一工具调用ID被用于不同读取参数；拒绝错误去重。'),{code:'MEMORY_READ_ID_CONFLICT'});
   if(old.observationsSha256!==observationsSha256)throw Object.assign(new Error('同一工具调用的来源内容或实际返回范围已变化；请发起新的读取请求。'),{code:'MEMORY_READ_SOURCE_CHANGED'});
   db.exec('RELEASE lian_memory_read_receipt');
   return {...base,persisted:true,replayed:true,receiptId:requestKey,recordedAt:old.at,
    requestIdentity:'host-call-id',deduplication:'same-call-id',warmingUpdated:false};
  }
  db.prepare('INSERT INTO memory_read_receipts(requestKey,callId,sessionId,tool,action,requestSha256,observationsSha256,at,observations,legacyOpenRecorded) VALUES(?,?,?,?,?,?,?,?,?,?)')
   .run(requestKey,callId,sessionId,tool,action,requestSha256,observationsSha256,at,observationText,warmingUpdated?1:0);
  if(warmingUpdated)db.prepare('INSERT INTO memory_access(documentId,at,kind) VALUES(?,?,?)').run(warmDocumentId,at,'open');
  db.exec('RELEASE lian_memory_read_receipt');
  return {...base,persisted:true,replayed:false,receiptId:requestKey,recordedAt:at,
   requestIdentity:'host-call-id',deduplication:'same-call-id',warmingUpdated};
 }catch(error){
  db.exec('ROLLBACK TO lian_memory_read_receipt');db.exec('RELEASE lian_memory_read_receipt');throw error;
 }
}

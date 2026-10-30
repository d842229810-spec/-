export function initializeCorrections(db){db.exec('CREATE TABLE IF NOT EXISTS memory_corrections(noteId TEXT NOT NULL,targetDocumentId TEXT NOT NULL,at TEXT NOT NULL,evidence TEXT NOT NULL,PRIMARY KEY(noteId,targetDocumentId))')}
export function correctionTarget(db,id){
 const note=db.prepare('SELECT id FROM notes WHERE id=?').get(id);if(note)return {noteId:note.id,documentId:'note:'+note.id};
 const doc=db.prepare('SELECT * FROM memory_documents WHERE id=?').get(id);if(!doc)throw Error('纠错目标不存在，请用搜索返回的完整id；不会覆盖旧记录');
 return {documentId:doc.id,...doc.kind==='life-note'?{noteId:JSON.parse(doc.metadata??'{}').noteId}:{} };
}
export function correctionMetadata(db,id){const rows=db.prepare('SELECT noteId FROM memory_corrections WHERE targetDocumentId=?').all(id),targets=db.prepare('SELECT targetDocumentId FROM memory_corrections WHERE noteId=?').all(id.startsWith('note:')?id.slice(5):'');return {...rows.length?{hasRelatedCorrections:true,correctionNoteIds:rows.map(x=>x.noteId),correctionMayApplyToPartOnly:true}:{},...targets.length?{correctsDocuments:targets.map(x=>x.targetDocumentId)}:{}}}

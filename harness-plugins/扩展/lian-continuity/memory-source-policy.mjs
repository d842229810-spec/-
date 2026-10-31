import fs from 'node:fs';
import {createHash} from 'node:crypto';

// Runtime context is retained as maintenance history, never as a lived memory.
export const RUNTIME_MEMORY_SOURCES=Object.freeze(['time-context','context','runtime-context','system-context','agent-instructions','skill-catalog']);
export const runtimeMemorySource=kind=>RUNTIME_MEMORY_SOURCES.includes(kind)||String(kind??'').startsWith('lian-memory-bootstrap');
export const indexableConversation=d=>d?.kind==='visible-message'&&!runtimeMemorySource(d.sourceKind);
const safeKinds=RUNTIME_MEMORY_SOURCES.map(x=>"'"+x+"'").join(',');
export const defaultConversationClause=`NOT (d.kind='conversation' AND (COALESCE(json_extract(d.metadata,'$.sourceKind'),'') IN (${safeKinds}) OR COALESCE(json_extract(d.metadata,'$.sourceKind'),'') LIKE 'lian-memory-bootstrap%'))`;
export function migrateRuntimeIndex(db,backup,terms){
 const candidates=db.prepare("SELECT * FROM memory_documents WHERE kind='conversation'").all().filter(d=>runtimeMemorySource(JSON.parse(d.metadata??'{}').sourceKind));
 const table=!!db.prepare("SELECT 1 FROM sqlite_master WHERE name='memory_runtime_fts'").get();
 const needed=candidates.filter(d=>db.prepare('SELECT 1 FROM memory_fts WHERE id=?').get(d.id)||!table||!db.prepare('SELECT 1 FROM memory_runtime_fts WHERE id=?').get(d.id));
 if(!needed.length)return {migration:'runtime-source-v2',migrated:0,maintenanceHistory:candidates.length,rawHistoryModified:false};
 if(typeof backup!=='function')throw Error('MEMORY_INDEX_MIGRATION_BACKUP_REQUIRED');
 const saved=backup();if(!saved?.file||!saved.sha256||!fs.existsSync(saved.file))throw Error('MEMORY_INDEX_MIGRATION_BACKUP_INVALID');
 if(createHash('sha256').update(fs.readFileSync(saved.file)).digest('hex')!==saved.sha256)throw Error('MEMORY_INDEX_MIGRATION_BACKUP_HASH_MISMATCH');
 db.exec('BEGIN IMMEDIATE');try{
  db.exec('CREATE VIRTUAL TABLE IF NOT EXISTS memory_runtime_fts USING fts5(id UNINDEXED,terms);CREATE TABLE IF NOT EXISTS memory_index_migrations(key TEXT PRIMARY KEY,at TEXT NOT NULL,body TEXT NOT NULL)');
  for(const d of needed){
   const m=JSON.parse(d.metadata??'{}'),old=db.prepare('SELECT terms FROM memory_fts WHERE id=?').get(d.id);
   db.prepare('DELETE FROM memory_runtime_fts WHERE id=?').run(d.id);
   db.prepare('INSERT INTO memory_runtime_fts(id,terms) VALUES(?,?)').run(d.id,old?.terms??terms(d.title+' '+d.content).join(' '));
   db.prepare('DELETE FROM memory_fts WHERE id=?').run(d.id);
   db.prepare('UPDATE memory_documents SET metadata=? WHERE id=?').run(JSON.stringify({...m,retrievalClass:'runtime-context',defaultRetrieval:false,indexPolicy:'runtime-source-v2'}),d.id);
  }
  const receipt={migration:'runtime-source-v2',migrated:needed.length,maintenanceHistory:candidates.length,backup:saved,rawHistoryModified:false};
  db.prepare('INSERT INTO memory_index_migrations(key,at,body) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET at=excluded.at,body=excluded.body').run('runtime-source-v2',new Date().toISOString(),JSON.stringify(receipt));
  db.exec('COMMIT');return receipt;
 }catch(e){db.exec('ROLLBACK');throw e;}
}

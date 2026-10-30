import {DatabaseSync} from 'node:sqlite';import fs from 'node:fs';import path from 'node:path';
import {tariffCost} from '../../../dafeiyu-life/lib/tariff.mjs?revision=20261027-growth2';
import {beijingParts,observeUsageCost} from '../../../dafeiyu-life/lib/policy.mjs';
import {inputUpper} from '../../../dafeiyu-life/lib/native-budget.mjs';

export class GroupBudget{
 constructor(file){fs.mkdirSync(path.dirname(file),{recursive:true});this.db=new DatabaseSync(file);this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS calls(id TEXT PRIMARY KEY,day TEXT,grp TEXT,held INTEGER,actual INTEGER,status TEXT,at TEXT); CREATE TABLE IF NOT EXISTS limits(session TEXT PRIMARY KEY,value TEXT); CREATE TABLE IF NOT EXISTS blocked(day TEXT,grp TEXT,reason TEXT,PRIMARY KEY(day,grp));');const cols=new Set(this.db.prepare('PRAGMA table_info(calls)').all().map(x=>x.name));if(!cols.has('kind'))this.db.exec("ALTER TABLE calls ADD COLUMN kind TEXT DEFAULT 'model'");if(!cols.has('decision'))this.db.exec('ALTER TABLE calls ADD COLUMN decision TEXT');}
 blocked(group,day=beijingParts().day){return !!this.db.prepare('SELECT 1 FROM blocked WHERE day=? AND grp=?').get(day,String(group));}
 spent(group,day=beijingParts().day){return this.db.prepare('SELECT coalesce(sum(coalesce(actual,held)),0) AS n FROM calls WHERE grp=? AND day=?').get(String(group),day).n;}
 reserve(id,group,amount,cap,at=new Date()){
  if(!Number.isSafeInteger(amount)||amount<1||!Number.isSafeInteger(cap)||cap<1)throw Error('无效群预算');
  const day=beijingParts(at).day;this.db.exec('BEGIN IMMEDIATE');try{
   if(this.db.prepare('SELECT 1 FROM calls WHERE id=?').get(id))throw Error('群请求已经记账，禁止重复预占');
   if(this.blocked(group,day)||this.spent(group,day)+amount>cap)throw Error('GROUP_DAILY_BUDGET');
   this.db.prepare('INSERT INTO calls(id,day,grp,held,actual,status,at) VALUES(?,?,?,?,NULL,?,?)').run(id,day,String(group),amount,'pending',at.toISOString());this.db.exec('COMMIT');
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 reserveService(id,group,service,cap,at=new Date()){
  const amount=service?.micros;if(!Number.isSafeInteger(amount)||amount<0||!Number.isSafeInteger(cap)||cap<1)throw Error('群服务请求价格待核对');
  this.db.exec('BEGIN IMMEDIATE');try{
   const day=beijingParts(at).day;if(this.db.prepare('SELECT 1 FROM calls WHERE id=?').get(id))throw Error('群服务请求已经记账，禁止重复预占');
   if(this.blocked(group,day)||this.spent(group,day)+amount>cap)throw Error('GROUP_DAILY_BUDGET');
   this.db.prepare("INSERT INTO calls(id,day,grp,held,actual,status,at,kind) VALUES(?,?,?,?,NULL,?,?,'service')").run(id,day,String(group),amount,'pending',at.toISOString());this.db.exec('COMMIT');
  }catch(e){this.db.exec('ROLLBACK');throw e}
 }
 settleService(id,decision){
  const r=this.db.prepare('SELECT * FROM calls WHERE id=?').get(id);if(!r||r.kind!=='service')throw Error('无对应群服务预占');if(r.status==='settled')return false;
  if(decision==='unknown'){this.db.prepare("UPDATE calls SET status='unknown',decision=? WHERE id=?").run(decision,id);return false}
  if(!['empty','nonempty-upper-bound'].includes(decision))throw Error('未知群服务回执');this.db.prepare("UPDATE calls SET actual=?,status='settled',decision=? WHERE id=?").run(decision==='empty'?0:r.held,decision,id);return true;
 }
 settle(id,usage,final){const r=this.db.prepare('SELECT * FROM calls WHERE id=?').get(id);if(!r)throw Error('无对应群请求');if(r.status==='settled')return;if(!final||!observeUsageCost(usage)){this.db.prepare('UPDATE calls SET status=? WHERE id=?').run('unknown',id);return;}
  const actual=tariffCost(usage,r.at).micros;this.db.prepare('UPDATE calls SET actual=?,status=? WHERE id=?').run(actual,'settled',id);if(actual>r.held){this.db.prepare('INSERT OR REPLACE INTO blocked VALUES(?,?,?)').run(r.day,r.grp,'usage-exceeded-hold');throw Error('GROUP_USAGE_EXCEEDED_HOLD');}
 }
 saveLimit(session,value){this.db.prepare('INSERT INTO limits VALUES(?,?) ON CONFLICT(session) DO UPDATE SET value=excluded.value').run(session,JSON.stringify(value));}
 restoreLimit(session){const row=this.db.prepare('SELECT value FROM limits WHERE session=?').get(session);if(!row)return;this.db.prepare('DELETE FROM limits WHERE session=?').run(session);return JSON.parse(row.value);}
 hasLimit(session){return !!this.db.prepare('SELECT 1 FROM limits WHERE session=?').get(session);}
 limit(session){const row=this.db.prepare('SELECT value FROM limits WHERE session=?').get(session);return row?JSON.parse(row.value):undefined;}
 close(){this.db.close();}
}
export function reserveFor(request,output,at=new Date()){return tariffCost({inputTokens:inputUpper(request),outputTokens:output,cacheReadTokens:0,cacheWriteTokens:0},at).micros;}
export function affordable(request,remaining,original,at=new Date()){let low=0,high=original??384000;while(low<high){const mid=Math.ceil((low+high)/2);if(reserveFor(request,mid,at)<=remaining)low=mid;else high=mid-1;}return low;}

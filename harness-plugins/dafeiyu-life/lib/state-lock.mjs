import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

const sleepCell = new Int32Array(new SharedArrayBuffer(4));
const missing = Symbol('missing');
const object = value => value !== missing && value !== null && typeof value === 'object' && !Array.isArray(value);

// Only disjoint changes merge automatically. Arrays and conflicting leaves fail
// closed, so an old window cannot undo a pause, permission change or budget entry.
export function mergeState(base, local, remote, field = 'state') {
  if (isDeepStrictEqual(local, base)) return remote;
  if (isDeepStrictEqual(remote, base) || isDeepStrictEqual(local, remote)) return local;
  if (object(base) && object(local) && object(remote)) {
    const result = {};
    for (const key of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])) {
      const value = mergeState(Object.hasOwn(base,key)?base[key]:missing, Object.hasOwn(local,key)?local[key]:missing, Object.hasOwn(remote,key)?remote[key]:missing, field+'.'+key);
      if (value !== missing) Object.defineProperty(result,key,{value,enumerable:true,writable:true,configurable:true});
    }
    return result;
  }
  throw Object.assign(new Error('STATE_CONFLICT：状态已被另一实例修改，请刷新后重试：'+field), {code:'STATE_CONFLICT'});
}
function owner(file) {
  try { const value=JSON.parse(fs.readFileSync(file,'utf8')); return Number.isSafeInteger(value.pid)&&value.pid>0&&typeof value.token==='string'?value:null; }
  catch { return null; }
}
function dead(pid) {
  try { process.kill(pid,0); return false; }
  catch(error) { return error.code==='ESRCH'; }
}
function recoverDeadLock(directory) {
  const recovery=directory+'.recovery';
  try { fs.mkdirSync(recovery); } catch(error) { if(error.code==='EEXIST')return; throw error; }
  try {
    // A missing/malformed owner is deliberately not guessed stale. A live PID,
    // even when old, is never stolen. Operators can inspect orphan locks safely.
    const current=owner(path.join(directory,'owner.json'));
    if (!current || !dead(current.pid)) return;
    const tomb=directory+'.dead-'+randomUUID();
    try { fs.renameSync(directory,tomb); } catch(error) { if(error.code==='ENOENT')return; throw error; }
    fs.rmSync(tomb,{recursive:true,force:true});
  } finally { fs.rmdirSync(recovery); }
}
export function withStateLock(root, action, {timeoutMs=2500}={}) {
  const directory=path.join(root,'.life-state.lock');
  const started=Date.now(), token=randomUUID();
  for (;;) {
    let acquired=false;
    try {
      if (!fs.existsSync(directory+'.recovery')) { fs.mkdirSync(directory); acquired=true; }
    } catch(error) { if(error.code!=='EEXIST')throw error; }
    if (acquired) {
      let ownerWritten=false;
      try {
        fs.writeFileSync(path.join(directory,'owner.json'),JSON.stringify({pid:process.pid,token,at:new Date().toISOString()}),{flag:'wx'});
        ownerWritten=true;
        const result=action();
        if (result && typeof result.then==='function') throw new Error('状态事务不得包含异步操作');
        return result;
      } finally {
        const current=owner(path.join(directory,'owner.json'));
        // If our own initial owner write failed, no other cooperative writer
        // could have acquired this directory; remove only that known-new lock.
        if (!ownerWritten || current?.token===token) fs.rmSync(directory,{recursive:true,force:true});
      }
    }
    recoverDeadLock(directory);
    if(Date.now()-started>=timeoutMs)throw Object.assign(new Error('STATE_LOCKED：活动状态正由另一进程使用，未发起新的收费请求'),{code:'STATE_LOCKED'});
    Atomics.wait(sleepCell,0,0,10);
  }
}

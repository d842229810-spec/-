import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
export function codeIdentity(entry,{version,dependencies={},extraFiles=[]}={}){
 const start=entry instanceof URL?fileURLToPath(entry):String(entry).startsWith('file:')?fileURLToPath(entry):path.resolve(entry),seen=new Set(),files=[];
 function visit(file){if(seen.has(file)||seen.size>=500)return;seen.add(file);let body;try{body=fs.readFileSync(file)}catch{return;}files.push([file,createHash('sha256').update(body).digest('hex')]);if(!/\.(?:mjs|js)$/.test(file))return;
  const source=body.toString();for(const m of source.matchAll(/(?:from\s*|import\s*\()\s*['"](\.{1,2}\/[^'"?#]+)(?:[^'"]*)['"]/g)){const target=path.resolve(path.dirname(file),m[1]);if(/\.(mjs|js|json)$/.test(target))visit(target);}}
 visit(start);for(const file of extraFiles)visit(path.resolve(file));const modules=files.map(([file,hash])=>({file,sha256:hash})).sort((a,b)=>a.file.localeCompare(b.file)),sourceHash=createHash('sha256').update(JSON.stringify({modules,version,dependencies})).digest('hex');
 return {version,sourceHash,moduleCount:modules.length,dependencies,loadedAt:new Date().toISOString()};
}
export function verificationEvidence(verification,identity,{maxAgeMs=86400000,now=Date.now()}={}){
 if(!verification)return {status:'not-verified',verifiedAt:null,verifiedCodeHash:null,validForCurrentCode:false};
 const age=Date.parse(verification.verifiedAt),matching=verification.verifiedCodeHash===identity.sourceHash,fresh=Number.isFinite(age)&&now-age>=0&&now-age<=maxAgeMs;
 return {...verification,verifiedAt:verification.verifiedAt??null,verifiedCodeHash:verification.verifiedCodeHash??null,validForCurrentCode:matching&&fresh&&verification.status==='passed',currentStatus:!matching?'different-or-unknown-code':!fresh?'expired-or-undated':verification.status,notice:(verification.notice??'').includes('心跳时间只表示状态采集')?verification.notice:(verification.notice??'')+' 心跳时间只表示状态采集；旧验收不自动成为当前代码的完整验收。'};
}
export function stampVerification(v,identity){return {...v,verifiedAt:new Date().toISOString(),verifiedCodeHash:identity.sourceHash,dependencies:identity.dependencies};}
export function singleFlight(fn){let current;return(...args)=>{if(current)return current;current=Promise.resolve().then(()=>fn(...args)).finally(()=>{current=null});return current;};}

export function hostVersions(){let harness='unknown';try{harness=JSON.parse(fs.readFileSync(path.join(path.dirname(process.execPath),'resources/app.asar/package.json'),'utf8')).version??'unknown'}catch{}return {harness,electron:process.versions.electron??null,node:process.versions.node};}

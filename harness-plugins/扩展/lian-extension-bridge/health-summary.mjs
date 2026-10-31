import fs from 'node:fs';import path from 'node:path';import {homedir} from 'node:os';import {createHash} from 'node:crypto';
const files={bilibili:'lian-bili-perception-health.json',video:'lian-video-studio-health.json',creative:'lian-creative-workbench-health.json',communication:'lian-codex-liaison-health.json'};
export function sourceIdentity(base){const names=['index.js','health-summary.mjs','memory.mjs','capability-navigator.mjs','retrieval-support.mjs'];const h=createHash('sha256');for(const name of names){h.update(name);h.update(fs.readFileSync(path.join(base,name)));}return h.digest('hex');}
export function dependencyHealth(root=path.join(homedir(),'.dsh'),now=Date.now()){
 const out={};for(const [name,file]of Object.entries(files))try{const v=JSON.parse(fs.readFileSync(path.join(root,file),'utf8')),observedAt=v.observedAt??v.checkedAt??v.at??null,ageMs=observedAt?Math.max(0,now-Date.parse(observedAt)):null;
  out[name]={observedAt,observationAgeMs:Number.isFinite(ageMs)?ageMs:null,version:v.version??null,registered:v.registered??null,state:name==='creative'?(v.openDesign?.state??'unknown'):(v.state??'registered-only'),verifiedAt:v.verification?.verifiedAt??v.verifiedAt??null,verificationKind:v.verification?.kind??null,verificationFresh:v.verification?.fresh??false,scope:'metadata-from-existing-plugin-health-file',notice:'注册、依赖连通和真实任务验收分别判断；文件存在不证明链路通过。'};
  if(name==='creative')Object.assign(out[name],{openDesignReady:v.openDesign?.applicationApiReady===true&&v.openDesign?.mcpReady===true,blenderApplicationReady:v.sharedBlender?.application===true});
 }catch(e){out[name]={state:'unknown',reason:e.code==='ENOENT'?'health-file-missing':'health-file-unreadable',scope:'metadata-only'};}return out;
}

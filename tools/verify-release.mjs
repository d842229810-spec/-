import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const manifest=JSON.parse(await fs.readFile(path.join(root,'SHA256SUMS.json'),'utf8'));
if(!Array.isArray(manifest.files)||manifest.files.length===0)throw Error("清单不能为空");
let json=0;const errors=[];
for(const f of manifest.files){const p=path.resolve(root,f.path);if(!p.startsWith(path.resolve(root)+path.sep))throw Error('清单路径越界');try{const b=await fs.readFile(p);const sha=crypto.createHash('sha256').update(b).digest('hex');if(sha!==f.sha256)errors.push(f.path+': HASH_MISMATCH');if(f.path.endsWith('.json')){JSON.parse(b.toString('utf8'));json++;}}catch(e){errors.push(f.path+': '+e.message);}}
console.log(JSON.stringify({files:manifest.files.length,json,errors},null,2));if(errors.length)process.exitCode=1;

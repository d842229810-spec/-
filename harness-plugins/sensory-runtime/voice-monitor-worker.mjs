import fs from 'node:fs';import path from 'node:path';import {monitorVoice} from './voice-monitor.mjs';
const base=fs.realpathSync('E:/LianHome/工作室/声音设计/自检记录'),file=fs.realpathSync(process.argv[2]);
if(!file.toLowerCase().startsWith(base.toLowerCase()+path.sep)||!file.endsWith('.json.job.json')||fs.statSync(file).size>80000)throw Error('Invalid local voice-monitor job');
const args=JSON.parse(fs.readFileSync(file,'utf8'));await monitorVoice({...args,full:true,defer:false,worker:true},AbortSignal.timeout(300000));

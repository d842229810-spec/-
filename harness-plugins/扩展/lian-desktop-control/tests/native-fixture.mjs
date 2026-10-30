import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const targetFile=path.join(root,'acceptance-target.json');
const file=path.join(root,'tests','state',`${Date.now()}-native-fixture.json`);
const env={...process.env,PYTHONIOENCODING:'utf-8',PYTHONUTF8:'1'};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn('E:/DSH/插件/desktop-control-runtime/Scripts/python.exe',[path.join(root,'tests','fixture.py'),file],{env,stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let passed=false;
try{
  let fixture;
  for(let i=0;i<50;i++){await sleep(100);try{fixture=JSON.parse(fs.readFileSync(file,'utf8'));break}catch{}}
  if(!fixture)throw new Error('fixture not ready');
  fs.writeFileSync(targetFile,JSON.stringify({windowId:fixture.windowId,pid:fixture.pid,expiresAt:Date.now()+120000}));
  console.log('Native probe fixture ready. Reload plugin config.');
  for(let i=0;i<120;i++){
    await sleep(1000);
    try{
      const health=JSON.parse(fs.readFileSync('C:/Users/USER/.dsh/lian-desktop-control/health.json','utf8'));
      if(health.nativeProbe?.imageAttachment?.pass&&health.nativeProbe.imageAttachment.windowId===fixture.windowId){
        fs.writeFileSync(path.join(root,'tests','state','native-result.json'),JSON.stringify(health,null,2));
        passed=true;console.log(JSON.stringify({nativeProbe:true,skillActive:health.skillActive,paused:health.backend.paused}));break;
      }
    }catch{}
  }
  if(!passed)throw new Error('native probe did not finish');
}finally{
  fs.writeFileSync(file.replace('.json','.command.json'),JSON.stringify({close:true}));
  await sleep(400);if(child.exitCode===null)child.kill();
  if(fs.existsSync(targetFile))fs.unlinkSync(targetFile);
}

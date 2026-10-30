import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {DesktopClient} from '../client.mjs';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const python='E:/DSH/插件/desktop-control-runtime/Scripts/python.exe';
const stateDir=path.join(root,'tests','state');fs.mkdirSync(stateDir,{recursive:true});
const fixtureFile=path.join(stateDir,`${Date.now()}-fixture.json`);
const resultFile=path.join(stateDir,'integration-result.json');
if(fs.existsSync(fixtureFile))fs.unlinkSync(fixtureFile);
const env={...process.env,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'};delete env.ELECTRON_RUN_AS_NODE;
const fixture=spawn(python,[path.join(root,'tests','fixture.py'),fixtureFile],{env,windowsHide:false,stdio:['ignore','pipe','pipe']});
let stderr='';fixture.stderr.on('data',v=>stderr+=v);
const client=new DesktopClient({python,root,stateDir});
const passed=[];const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function read(){await sleep(180);return JSON.parse(fs.readFileSync(fixtureFile,'utf8'));}
function imagePoint(frame,point){const r=frame.window.rect;return {x:(point[0]-r[0])*frame.width/(r[2]-r[0]),y:(point[1]-r[1])*frame.height/(r[3]-r[1])}}
try{
  let fixtureData;
  for(let n=0;n<50;n++){
    try{const d=await read();if(d.pid){fixtureData=d;break}}catch{}
  }
  assert.ok(fixtureData,'test window must become ready: '+stderr);
  const listed=await client.request({op:'windows'});
  const window=listed.windows.find(w=>w.pid===fixtureData.pid&&w.title.startsWith('小涟桌面控制验收'));
  assert.ok(window);const windowId=window.windowId;passed.push('discover exact test window');
  await client.request({op:'control',command:'resume'});
  let frame=await client.request({op:'observe',windowId,activate:true,includeControls:true});
  assert.ok(frame.pngBase64.length>1000);assert.equal(frame.width,frame.window.rect[2]-frame.window.rect[0]);
  fs.writeFileSync(path.join(stateDir,'before.png'),Buffer.from(frame.pngBase64,'base64'));passed.push('capture real window with matching coordinates');
  async function act(args){frame=await client.request({op:'act',windowId,...args});return frame}
  await act({action:'click',observationId:frame.observationId,...imagePoint(frame,fixtureData.widgets.entry.center)});
  await act({action:'type',text:'小涟真的能用鼠标键盘 Hello 123'});
  assert.equal((await read()).state.text,'小涟真的能用鼠标键盘 Hello 123');passed.push('Unicode text reaches actual edit control');
  await act({action:'key',key:'Ctrl+A'});
  await act({action:'type',text:'鼠标、键盘、屏幕联动通过'});
  assert.equal((await read()).state.text,'鼠标、键盘、屏幕联动通过');passed.push('Ctrl+A keyboard chord');
  await act({action:'click',observationId:frame.observationId,...imagePoint(frame,fixtureData.widgets.button.center)});
  assert.equal((await read()).state.clicks,1);passed.push('physical mouse click reaches button');
  await act({action:'click',observationId:frame.observationId,...imagePoint(frame,fixtureData.widgets.canvas.center)});
  await act({action:'key',key:'Right',holdMs:700});
  assert.ok((await read()).state.moves>0);passed.push('held game key moves visible object');
  const start=imagePoint(frame,fixtureData.widgets.canvas.center);
  await act({action:'drag',observationId:frame.observationId,...start,toX:start.x+110,toY:start.y+30,holdMs:350});
  assert.ok((await read()).state.drags>0);passed.push('mouse drag reaches canvas');
  await act({action:'scroll',observationId:frame.observationId,...start,scrollY:-120});
  assert.ok((await read()).state.scrolls>0);passed.push('mouse wheel reaches canvas');
  await assert.rejects(act({action:'click',observationId:frame.observationId,x:-1,y:0}),/POINT_OUTSIDE_IMAGE/);passed.push('out-of-image click rejected');
  await assert.rejects(act({action:'click',observationId:'expired',x:10,y:10}),/OBSERVATION_EXPIRED/);passed.push('stale coordinates rejected');
  await assert.rejects(act({action:'key',key:'F8',holdMs:120}),/CONTROL_PAUSED/);
  let status=await client.request({op:'status'});assert.equal(status.paused,true);assert.equal(status.heldKeys,0);assert.equal(status.heldButtons,0);passed.push('F8 pauses and releases held input');
  await assert.rejects(act({action:'key',key:'Right'}),/CONTROL_PAUSED/);passed.push('pause persists until explicit resume');
  await client.request({op:'control',command:'resume'});
  frame=await client.request({op:'observe',windowId,activate:true});
  const focusAction=act({action:'key',key:'Right',holdMs:3000});
  const focusCheck=assert.rejects(focusAction,/TARGET_NOT_FOREGROUND|CONTROL_PAUSED/);
  await sleep(150);
  fs.writeFileSync(fixtureFile.replace('.json','.command.json'),JSON.stringify({focusAway:true}));
  await focusCheck;
  status=await client.request({op:'status'});assert.equal(status.heldKeys,0);passed.push('focus loss interrupts held key and releases it');
  await sleep(1300);
  await client.request({op:'control',command:'resume'});
  frame=await client.request({op:'observe',windowId,activate:true});
  const controller=new AbortController();
  const cancelled=client.request({op:'act',windowId,action:'key',key:'Right',holdMs:3000},{signal:controller.signal});
  const cancelCheck=assert.rejects(cancelled,/abort/i);
  await sleep(150);controller.abort();await cancelCheck;
  await sleep(150);
  status=await client.request({op:'status'});assert.equal(status.paused,true);assert.equal(status.heldKeys,0);passed.push('cancelled tool pauses and releases held key');
  await client.request({op:'control',command:'resume'});
  frame=await client.request({op:'observe',windowId,activate:true});
  fs.writeFileSync(path.join(stateDir,'after.png'),Buffer.from(frame.pngBase64,'base64'));
  status=await client.request({op:'status'});assert.equal(status.heldKeys,0);assert.equal(status.heldButtons,0);
  fs.writeFileSync(resultFile,JSON.stringify({pass:true,passed,fixtureState:(await read()).state,status,checkedAt:new Date().toISOString()},null,2));
  console.log(JSON.stringify({pass:true,checks:passed.length,resultFile}));
  // Keep fixture briefly for the native Harness image-attachment probe when requested.
  if(process.argv.includes('--keep')){
    fs.writeFileSync(path.join(root,'acceptance-target.json'),JSON.stringify({windowId,pid:fixtureData.pid,expiresAt:Date.now()+180000}));
    const deadline=Date.now()+180000;
    while(Date.now()<deadline){
      await sleep(1000);
      try{const health=JSON.parse(fs.readFileSync('C:/Users/USER/.dsh/lian-desktop-control/health.json','utf8'));if(health.nativeProbe?.imageAttachment?.pass&&health.nativeProbe.imageAttachment.windowId===windowId)break}catch{}
    }
  }
}catch(error){fs.writeFileSync(resultFile,JSON.stringify({pass:false,passed,error:error.stack,stderr},null,2));console.error(error);process.exitCode=1}
finally{
  await client.close();
  fs.writeFileSync(fixtureFile.replace('.json','.command.json'),JSON.stringify({close:true}));
  await sleep(400);
  if(fixture.exitCode===null)fixture.kill();
}

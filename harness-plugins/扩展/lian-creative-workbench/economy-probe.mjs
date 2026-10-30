import fs from 'node:fs';import {spawn} from 'node:child_process';
const STAGE='E:/DSH/安装验收/20261027-性价比感官升级';
export function economyProbe(ctx,config){if(!config.economyProbeId)return;let closed=false;const file=STAGE+'/原生低成本升级验收.json';let fixture;
 const timer=setTimeout(async()=>{try{if(JSON.parse(fs.readFileSync(file,'utf8')).id===config.economyProbeId)return}catch{}
 const data={id:config.economyProbeId,at:new Date().toISOString(),tests:[],complete:false,paidModelCalls:0};const save=()=>fs.writeFileSync(file,JSON.stringify(data,null,2));
 async function call(name,args,check){if(closed)throw Error('probe disposed');const r=await ctx.tools.execute({name,arguments:args,callId:'economy-native-'+Date.now(),signal:AbortSignal.timeout(90000)}),text=r.content.filter(x=>x.type==='text').map(x=>x.text).join('\n');let d;try{d=JSON.parse(text)}catch{d={text}}data.tests.push({name,pass:!r.isError&&!!check(d),result:d});save();if(r.isError)throw Error(name+': '+text.slice(0,500));return d}
 try{
  await call('whale_voice_selfcheck',{action:'status'},d=>d.enabled&&d.paidModelCalls===0);
  const voice=JSON.parse(fs.readFileSync(STAGE+'/voice-monitor-test.json','utf8')).audio;
  await call('whale_voice_selfcheck',{action:'read',file:voice.file},d=>d.status==='observed-by-local-model'&&d.cached&&d.expectedTextKnown);
  await call('whale_voice',{action:'status'},d=>d.profile?.candidate==='C'&&!d.expressive.defaultChanged);
  await call('whale_song',{action:'status'},d=>d.weightsReady&&d.verifiedEndToEnd&&!d.CVoiceVerified);
  const request=JSON.parse(fs.readFileSync(STAGE+'/song-request.json','utf8'));
  await call('whale_song',{action:'generate',...request},d=>d.cached&&d.actualSeconds===request.seconds&&fs.existsSync(d.file));
  await call('whale_desktop_status',{},d=>d.version==='1.4.0'&&d.backend?.capabilities?.dxgiTaskCapture);
  fixture=spawn('E:/DSH/插件/desktop-control-runtime/Scripts/python.exe',['-X','utf8',STAGE+'/desktop_game.py'],{windowsHide:true,stdio:'ignore'});fixture.once('error',()=>{});
  const sf=STAGE+'/game-state.json';for(let i=0;i<60;i++){await new Promise(r=>setTimeout(r,100));let v;try{v=JSON.parse(fs.readFileSync(sf,'utf8'))}catch{}if(v&&v.elapsed<2&&v.pid!==data.previousFixturePid){data.fixture=v;break}}
  if(!data.fixture)throw Error('game fixture not ready');const windows=await call('whale_desktop_windows',{},d=>Array.isArray(d.windows)),w=windows.windows.find(x=>x.pid===data.fixture.pid&&x.title.includes('追星小游戏'));if(!w)throw Error('game window not found');
  await call('whale_desktop_control',{command:'resume'},d=>!d.paused);
  await call('whale_desktop_activate',{windowId:w.windowId,mode:'screen'},d=>d.canInputNow);
  await new Promise(r=>setTimeout(r,600));const o=await call('whale_desktop_observe',{windowId:w.windowId,mode:'screen'},d=>d.canInputNow);const state=JSON.parse(fs.readFileSync(sf,'utf8')),scale=o.width/(o.window.rect[2]-o.window.rect[0]),box=state.box,x=Math.round((state.canvas[0]+box[0]+12-o.window.rect[0])*scale),y=Math.round((state.canvas[1]+box[1]+8-o.window.rect[1])*scale);
  const before=state.score;await call('whale_desktop_follow',{windowId:w.windowId,observationId:o.observationId,x,y,width:Math.round(40*scale),height:Math.round(40*scale),seconds:3,hz:60,threshold:.6,click:true,mode:'screen'},d=>d.controller?.capture?.backend==='dxgi'&&d.controller.traceTruncated&&d.controller.trace.length<=12&&!d.controller.stoppedReason);
  const now=JSON.parse(fs.readFileSync(sf,'utf8'));data.tests.push({name:'native-game-actual-score',pass:now.score-before>=5,scoreDelta:now.score-before,misses:now.misses});save();
  await call('whale_desktop_record',{windowId:w.windowId,seconds:1,fps:60,mode:'screen'},d=>d.capturedFrames>30&&d.capture.backend==='dxgi'&&d.timestampsTruncated&&fs.existsSync(d.fullReport));
  const all=ctx.tools.schemas().map(t=>t.name),skills=await ctx.skills.list({cwd:'E:/LianHome'});data.duplicateTools=all.filter((n,i)=>all.indexOf(n)!==i);data.skillVisible=skills.some(x=>x.name==='lian-local-singing');data.passed=data.tests.every(x=>x.pass)&&!data.duplicateTools.length&&data.skillVisible;data.complete=true;save();
 }catch(e){data.complete=true;data.passed=false;data.error=e.message;save()}finally{if(fixture)fixture.kill()}
 },4000);timer.unref?.();return()=>{closed=true;clearTimeout(timer);fixture?.kill()}
}

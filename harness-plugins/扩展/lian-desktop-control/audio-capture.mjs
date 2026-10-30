import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import {randomUUID} from 'node:crypto';
export function audioCaptureClient({root,python,stateDir}){
 let active=null;
 const activity=()=>({activeCapture:!!active,captureStarted:!!active&&fs.existsSync(active.readyFile),alwaysListening:false});
 const stop=()=>{if(active)fs.writeFileSync(active.stopFile,'stop');return {stopping:!!active,alwaysListening:false}};
 const request=(args,signal)=>{
  if(args.action==='stop')return Promise.resolve(stop());if(args.action==='record'&&active)throw Error('已有一次声音采集尚未结束，请先stop');
  const stopFile=path.join(stateDir,'audio-'+randomUUID()+'.stop'),readyFile=stopFile+'.ready';
  return new Promise((resolve,reject)=>{signal?.throwIfAborted();const c=spawn(python,['-X','utf8','-u',root+'/audio_capture.py'],{windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONUTF8:'1'}});const job={c,stopFile,readyFile};if(args.action==='record')active=job;let output='',error='';let settled=false,killTimer;
   const abort=()=>{fs.writeFileSync(stopFile,'cancelled');killTimer=setTimeout(()=>c.kill(),2500);killTimer.unref?.()};const done=(e,v)=>{if(settled)return;settled=true;clearTimeout(timer);clearTimeout(killTimer);signal?.removeEventListener('abort',abort);if(active===job)active=null;fs.rmSync(stopFile,{force:true});fs.rmSync(readyFile,{force:true});e?reject(e):resolve(v)};
   const timer=setTimeout(()=>{fs.writeFileSync(stopFile,'timeout');c.kill();done(Error('声音采集超时，已停止本次采集'))},45000);signal?.addEventListener('abort',abort,{once:true});c.stdout.on('data',b=>output+=b);c.stderr.on('data',b=>error=(error+b).slice(-2000));c.once('error',done);c.stdin.on('error',e=>done(e));c.once('exit',code=>{if(signal?.aborted){done(signal.reason??Error('采集已取消'));return}try{const v=JSON.parse(output.trim().split('\n').at(-1));if(code!==0||v.error)throw Error(v.error??error);done(null,args.action==='status'?{...v,...activity()}:v)}catch(e){done(Error('声音采集未完成：'+e.message))}});c.stdin.end(JSON.stringify({...args,stopFile,readyFile}));
  })
 };
 return {request,activity,close(){stop();const child=active?.c;if(child){const t=setTimeout(()=>{if(child.exitCode===null)child.kill()},2500);t.unref?.()}}};
}

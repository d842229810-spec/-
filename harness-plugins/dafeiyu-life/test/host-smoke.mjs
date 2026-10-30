import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {VoyageStore} from '../lib/store.mjs';
const packageRoot=path.resolve(import.meta.dirname,'..');
const entry=path.join(packageRoot,'index.js');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'whale-native-smoke-'));new VoyageStore(temp).update({enabled:false});
const effects=[],tools=new Map(),removed=[];
const ctx={
  effect(fn){const cleanup=fn();if(typeof cleanup==='function')effects.push(cleanup);return cleanup;},
  on(){return ()=>{};},get(){return undefined;},
  tools:{register(def){tools.set(def.name,def);return ()=>tools.delete(def.name);},guard(){return ()=>{};}},
  schedule:{catalog:async()=>[{id:'old',title:'自由活动 01:10',status:'active',sessionId:'owner'},{id:'keep',title:'制作视频',status:'active',sessionId:'owner'}],delete:async req=>(removed.push(req.id),{deleted:true})},
  logger:{info(){},warn(){},error(message){throw new Error(message);}},
};
try{
  const plugin=await import(pathToFileURL(entry).href);await plugin.apply(ctx,{dataDir:temp});
  assert.equal(tools.size,13);
  for(let i=0;i<30&&!fs.existsSync(path.join(temp,'旧自由活动迁移.json'));i++)await new Promise(r=>setTimeout(r,10));
  assert.deepEqual(removed,['old']);
  const status=await tools.get('whale_life_status').execute({},{});assert.equal(JSON.parse(status.result).enabled,false);
  const sample='E:/DSH/大肥鱼创作室/内容/插件验收/技术检查样片-1秒.mp4';
  const subtitle='E:/DSH/大肥鱼创作室/内容/插件验收/技术检查样片-字幕.srt';
  let mediaToolsPassed=false;
  if(fs.existsSync(sample)&&fs.existsSync(subtitle)){
    const captions=JSON.parse((await tools.get('whale_subtitles').execute({path:subtitle,query:'故意'},{})).result);assert.equal(captions.matchedCues,1);
    const media=JSON.parse((await tools.get('whale_video_preflight').execute({path:sample,target:'vertical',subtitle_path:subtitle},{})).result);assert.equal(media.video.width,360);assert.ok(media.issues.some(i=>i.code==='subtitle-overrun'));mediaToolsPassed=true;
  }
  const health=JSON.parse((await tools.get('whale_capabilities').execute({},{})).result);assert.equal(health.components.ffprobe.available,true);
  console.log(JSON.stringify({nativeApi:'0.2.1-rc.3',pluginVersion:health.pluginVersion,registeredTools:[...tools.keys()],legacyMigrationPassed:true,statusPassed:true,mediaToolsPassed,capabilityStatusPassed:true,realModelCalls:0,realShutdowns:0}));
}finally{for(const cleanup of effects.reverse())await cleanup();
  if(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(temp).startsWith('whale-native-smoke-'))fs.rmSync(temp,{recursive:true,force:true});
}

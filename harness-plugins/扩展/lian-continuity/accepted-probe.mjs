import fs from 'node:fs';import path from 'node:path';
export function acceptedProbe(ctx,config){if(!config.acceptedProbeId)return;let disposed=false;const file='E:/LianHome/安装验收/20261026-接纳功能原生验收.json';const timer=setTimeout(async()=>{if(disposed)return;try{try{if(JSON.parse(fs.readFileSync(file,'utf8')).id===config.acceptedProbeId)return}catch{}
const fixture='E:/LianHome/日志/工具验收/20261026_批量摘录验收.txt';fs.mkdirSync(path.dirname(fixture),{recursive:true});if(!fs.existsSync(fixture))fs.writeFileSync(fixture,'这是维护验收日志，不是小涟的经历。\n'.repeat(100),{flag:'wx'});
const tests=[];for(const [name,args,check]of [
 ['whale_context_pack',{action:'batch',files:[fixture],chars:400},d=>d.sourceModified===false&&d.files?.[0]?.truncated&&d.files?.[0]?.sha256?.length===64],
 ['whale_continuity',{action:'capabilities'},d=>Array.isArray(d.capabilities)],
 ['whale_memory_search',{query:'维护验收测试不存在的知识',limit:1},d=>!d.error&&d.ok!==false],
 ['whale_voice',{action:'status'},d=>!!d],
 ]){try{const r=await ctx.tools.execute({name,arguments:args,callId:'accepted-'+name,signal:AbortSignal.timeout(20000)});const t=r.content.filter(x=>x.type==='text').map(x=>x.text).join('\n');let data;try{data=JSON.parse(t)}catch{data={text:t}}tests.push({name,passed:!r.isError&&!!check(data),isError:!!r.isError,resultShape:Object.keys(data),...r.isError?{error:t.slice(0,500)}:{}})}catch(e){tests.push({name,passed:false,error:e.message})}}
fs.writeFileSync(file,JSON.stringify({id:config.acceptedProbeId,at:new Date().toISOString(),tests,modelCalls:0},null,2));
}catch(e){ctx.logger.warn('接纳功能验收失败：'+e.message)}},4000);timer.unref?.();return()=>{disposed=true;clearTimeout(timer)}}

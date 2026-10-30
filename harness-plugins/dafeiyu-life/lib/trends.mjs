import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {atomicJSON} from './store.mjs';
const metrics=['views','likes','comments','score'];
export function compareSamples(previous,current){
  const elapsedMinutes=(Date.parse(current.at)-Date.parse(previous.at))/60000;
  if(!Number.isFinite(elapsedMinutes)||elapsedMinutes<5)return {comparable:false,reason:'样本间隔不足5分钟，不能估计增速'};
  const before=new Map(previous.items.map((r,i)=>[r.url,{...r,rank:i+1}]));
  return {comparable:true,elapsedMinutes,items:current.items.map((row,i)=>{
    const old=before.get(row.url);if(!old)return {url:row.url,title:row.title,rank:i+1,newToSample:true};
    const deltas={};
    for(const metric of metrics)if(Number.isFinite(row[metric])&&Number.isFinite(old[metric])){
      const change=row[metric]-old[metric];
      deltas[metric]={change,...change>=0?{perHour:+(change*60/elapsedMinutes).toFixed(2)}:{counterResetOrCorrection:true}};
    }
    return {url:row.url,title:row.title,rank:i+1,rankChange:old.rank-(i+1),newToSample:false,deltas};
  }),notice:'仅同一公开样本的变化；首次入样不等于新作品，互动增速不是爆款概率。'};
}
export function recordTrend(store,source,items,now=new Date()){
  if(!['bilibili','hackernews'].includes(source))throw new Error('未知趋势样本来源');
  const dir=path.join(store.root,'热点样本',source);fs.mkdirSync(dir,{recursive:true});
  const files=fs.readdirSync(dir).filter(f=>f.endsWith('.json')).sort();
  const current={source,at:now.toISOString(),items},key=createHash('sha256').update(current.at).digest('hex').slice(0,8);
  const rows=files.slice(-128).flatMap(file=>{try{return [JSON.parse(fs.readFileSync(path.join(dir,file),'utf8'))];}catch{return [];}});
  const previous=rows.reverse().find(r=>Date.parse(current.at)-Date.parse(r.at)>=300000);
  atomicJSON(path.join(dir,`${current.at.replace(/[:.]/g,'-')}-${key}.json`),current);
  // Compare only a bounded recent history. Leave archive pruning to the owner.
  return {sampleAt:current.at,previousSampleAt:previous?.at??null,
    comparison:previous?compareSamples(previous,current):{comparable:false,reason:'尚无间隔至少5分钟的历史样本'},
    totalStoredSamples:files.length+1};
}

// Sampling adapted from icyaaaww/dsh-bili-vision uniform_indices (MIT).
// Local changes: JS port, explicit range and independent frames.
export function rangePlan(start,end,duration,count=6,timestamps=[]){
 const a=start??0,b=Math.min(end??duration,duration);
 if(!Number.isFinite(a)||!Number.isFinite(b)||a<0||b<=a)throw new Error('时间范围须满足 0 <= start < end <= 视频时长');
 const n=Math.max(1,Math.min(20,Math.floor(count))),last=Math.max(a,b-Math.min(.1,(b-a)/100));
 const times=timestamps.length?timestamps.filter(t=>t>=a&&t<b):Array.from({length:n},(_,i)=>n===1?(a+last)/2:a+(last-a)*i/(n-1));
 if(!times.length)throw new Error('指定时间戳全部在所选片段之外');
 return [...new Set(times.map(t=>Math.round(t*1000)/1000))].slice(0,n).map(time=>({time,requested_time:time,reason:'focused range coverage',text:''}));
}
export function scopeEvidence(data,start,end){
 if(start===undefined&&end===undefined)return data;
 const a=start??0,b=Math.min(end??data.metadata.duration,data.metadata.duration);
 const transcript=data.transcript??{},segments=(transcript.segments??[]).filter(s=>(s.end??s.to)>a&&(s.start??s.from)<b);
 const d={...data,range:{start:a,end:b},transcript:{...transcript,text:segments.map(s=>s.text??s.content??'').join('\n'),segments,total_segments:segments.length,scope:'selected-range'}};
 if(data.danmaku)d.danmaku={...data.danmaku,samples:(data.danmaku.samples??[]).filter(s=>s.time>=a&&s.time<b),top_messages:[],note:'仅筛选接口已返回的弹幕样本，并非完整历史弹幕。'};
 return d;
}
export function addCoverage(data){
 const times=(data.frames?.frames??[]).filter(f=>f.has_image).map(f=>f.time).sort((a,b)=>a-b),a=data.range?.start??0,b=data.range?.end??data.metadata?.duration??0,all=[a,...times,b];
 return {...data,coverage:{frameTimes:times,maxUnobservedSeconds:Math.max(0,...all.slice(1).map((t,i)=>t-all[i])),notice:'抽样不代表逐帧看完，OCR不是音频原文。'}};
}

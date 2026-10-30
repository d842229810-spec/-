import fs from 'node:fs';import {createHash} from 'node:crypto';
const report='E:/LianHome/安装验收/20261026-全插件技能审查/能力验收记录.json';
export function capabilityView({includeHistory=false}={}){let data;try{data=JSON.parse(fs.readFileSync(report,'utf8'))}catch{data={capabilities:[],notice:'尚未记录验收证据'}}
 const history=data.capabilities.filter(x=>x.recordState==='historical');const current=data.capabilities.filter(x=>x.recordState!=='historical');
 return {...data,capabilities:includeHistory?data.capabilities:current,historicalCount:history.length,historyAvailable:true,modelCalls:0,notice:'能力存在、工具注册、测试通过与完整流程验收分别记录；记录不证明将来每次均成功。'};}
export function evidence(path){try{const b=fs.readFileSync(path);return{path,sha256:createHash('sha256').update(b).digest('hex')}}catch{return{path,missing:true}}}
export function renderCapabilities(escape){return '<article><h2>能力验收记录</h2><p>沿用当前看板，只查看实际证据，不触发模型评测。</p>'+capabilityView().capabilities.map(x=>'<p><strong>'+escape(x.name)+'</strong> · '+escape(x.status)+'<br>来源：'+escape(x.provider)+'<br>实际验证：'+escape(x.lastVerifiedAt??'尚未实测')+'<br>'+escape(x.result)+'<br>待确认：'+escape(x.remaining??'无新增待确认')+'</p>').join('')+'</article>'}

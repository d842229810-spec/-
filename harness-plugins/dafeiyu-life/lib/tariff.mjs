export const BILLING_VERSION='deepseek-flash-20261026';
// Official CNY / million-token snapshot rechecked 2026-10-27; review through 11-30.
// Amounts returned in micro-CNY, rounded UP per request. No API credentials.
export const PRICE_SNAPSHOT=Object.freeze({verifiedAt:'2026-10-27',validThrough:'2026-11-30',source:'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/',serviceSource:'https://api-docs.deepseek.com/zh-cn/guides/search/',harnessServiceBillingStarts:'2026-11-01',serviceUnitMicros:5000});
export function tariffCost(usage,at){
 const values=['inputTokens','outputTokens','cacheReadTokens','cacheWriteTokens'].map(k=>usage?.[k]??(['cacheReadTokens','cacheWriteTokens'].includes(k)?0:NaN));
 if(!values.every(n=>Number.isSafeInteger(n)&&n>=0)||!values.some(Boolean))throw new Error('缺少完整可计价用量');
 const date=new Date(at);if(!Number.isFinite(date.getTime()))throw new Error('缺少请求计价时间');
 const bj=new Date(date.getTime()+8*3600000),day=bj.toISOString().slice(0,10),minute=bj.getUTCHours()*60+bj.getUTCMinutes(),weekday=bj.getUTCDay();
 if(day<'2026-10-24'||day>PRICE_SNAPSHOT.validThrough)throw new Error('用量超出本次已核对的价格日期');
 const peak=weekday>=1&&weekday<=5&&((minute>=540&&minute<720)||(minute>=840&&minute<1080));
 const [input,output,cache,write]=values,factor=peak?2:1;
 const micros=Math.ceil(((input+write)*100+cache*2+output*400)*factor/100);
 if(!Number.isSafeInteger(micros))throw new Error('金额超出可计量范围');
 return {micros,version:BILLING_VERSION,tariff:peak?'weekday-peak-calendar-conservative':'off-peak',day,notice:'按完整usage及官方价格计算，非供应商扣款回执；工作日峰段未维护法定假日表时保守按峰价。'};
}
export function serviceTariff(name,args={},at=new Date()){
 if(!['web_search','web_fetch'].includes(name))return null;
 const d=new Date(at);if(!Number.isFinite(d.getTime()))throw Error('缺少服务请求时间');const day=new Date(d.getTime()+8*3600000).toISOString().slice(0,10);
 if(day<'2026-10-24'||day>PRICE_SNAPSHOT.validThrough)throw Error('搜索/抓取价格待复核');
 const units=name==='web_search'?(Array.isArray(args.queries)?args.queries.length:1):1;
 if(!Number.isInteger(units)||units<1||units>4)throw Error('无法确认搜索请求数量');
 return {name,units,unitMicros:day<PRICE_SNAPSHOT.harnessServiceBillingStarts?0:5000,micros:units*(day<PRICE_SNAPSHOT.harnessServiceBillingStarts?0:5000),day,version:BILLING_VERSION,basis:'harness-per-query-conservative-upper-bound',supplierInvoice:false};
}
export function serviceResultDecision(result,name='web_search'){
 if(result?.isError)return 'unknown';const text=(result?.content??[]).filter(x=>x.type==='text').map(x=>x.text??'').join('\n');
 try{const data=JSON.parse(text);if(name==='web_search'&&Array.isArray(data.results)&&data.results.length===0)return 'empty';if(data.status&&Number(data.status)>=400)return 'unknown';}catch{}
 return text.trim()?'nonempty-upper-bound':'unknown';
}

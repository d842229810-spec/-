import fs from 'node:fs';
import path from 'node:path';
import {observeUsageCost,hasFinalUsage,beijingParts,inWindow,windowKey} from './policy.mjs?revision=20261027-growth1';
import {tariffCost,BILLING_VERSION} from './tariff.mjs?revision=20261027-growth1';

export function validMicros(n){return Number.isSafeInteger(n)&&n>=0;}
export function validateBudget(state){
  if(state.budgetLedgerVersion!==2||!state.requestLedger||Array.isArray(state.requestLedger))throw new Error('预算账本版本未知');
  for(const [day,d] of Object.entries(state.days)){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||![d.reservedMicros,d.requests,d.reportedMicros,d.reportedUsageRequests,d.rounds,d.legacyHoldMicros??0].every(validMicros))throw new Error('预算账本金额损坏，拒绝重置');
    let held=d.legacyHoldMicros??0,reported=0,count=0;
    for(const r of Object.values(state.requestLedger).filter(r=>r.day===day)){
      if(!validMicros(r.reservedMicros)||!validMicros(r.chargeMicros)||!['pending','unknown','settled'].includes(r.status))throw new Error('请求账本损坏');
      held+=r.chargeMicros;count++;
      if(r.status==='settled'){
       if(r.kind==='service'){if(!['web_search','web_fetch'].includes(r.service?.name)||!Number.isSafeInteger(r.service?.micros)||r.service.micros!==r.reservedMicros||!['empty','nonempty-upper-bound'].includes(r.serviceDecision)||r.chargeMicros!==(r.serviceDecision==='empty'?0:r.reservedMicros))throw Error('搜索/抓取结算记录不一致');reported+=r.chargeMicros;}
       else {const u=observeUsageCost(r.usage);if(r.billingVersion!==undefined&&r.billingVersion!==BILLING_VERSION)throw new Error('未知用量计价版本');const charge=r.billingVersion?tariffCost(r.usage,r.reservedAt).micros:u?.peakUpperMicros;if(!u||charge!==r.chargeMicros)throw new Error('用量结算记录不一致');reported+=r.chargeMicros;}
      }
      else if(r.chargeMicros!==r.reservedMicros)throw new Error('未知用量的预占不得减少');
    }
    if(held!==d.reservedMicros||reported!==d.reportedMicros||count>d.requests)throw new Error('日账与请求账不一致，拒绝重置');
  }
  for(const r of Object.values(state.requestLedger))if(!state.days[r.day])throw new Error('请求缺少所属日账');
}

// Legacy refunds require both an audited reservation and a durable successful
// provider response. Unmatched amounts and interrupted calls stay fully held.
export function reconcileLegacy(state,root,config,now=new Date()){
  const migrated=structuredClone(state),events=[];
  for(const file of fs.readdirSync(path.join(root,'活动记录')).filter(n=>/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(n)).sort()){
    for(const line of fs.readFileSync(path.join(root,'活动记录',file),'utf8').split(/\r?\n/).filter(Boolean)){
      try{events.push(JSON.parse(line));}catch{throw new Error('历史活动记录损坏，停止自动对账');}
    }
  }
  migrated.budgetLedgerVersion=2;migrated.requestLedger={};
  for(const [day,d] of Object.entries(migrated.days)){
    const old=d.reservedMicros;
    if(!validMicros(old)||!validMicros(d.requests))throw new Error('历史预算账本损坏');
    let sum=0,reported=0,reportedCount=0;
    for(const event of events.filter(e=>e.type==='request-reserved'&&e.day===day)){
      if(typeof event.requestId!=='string'||!event.requestId||migrated.requestLedger[event.requestId]||!validMicros(event.reservedMicros))throw new Error('历史请求标识重复或金额无效');
      const row={day,reservedMicros:event.reservedMicros,chargeMicros:event.reservedMicros,status:'unknown',reservedAt:event.time};
      const resultFile=path.join(root,'私密草稿','模型记录',day,event.requestId+'-结果.json');
      if(fs.existsSync(resultFile)){
        let response;try{response=JSON.parse(fs.readFileSync(resultFile,'utf8'));}catch{throw new Error('历史模型回执损坏，停止自动对账');}
        const usage=observeUsageCost(response.usage);
        const recorded=events.filter(e=>e.type==='request-usage'&&e.requestId===event.requestId&&e.day===day&&typeof e.usage==='object');
        if(usage&&hasFinalUsage(response)&&recorded.some(e=>observeUsageCost(e.usage)?.peakUpperMicros===usage.peakUpperMicros)){
          if(usage.peakUpperMicros>row.reservedMicros)throw new Error('历史实际用量超过预占，需要人工核对');
          Object.assign(row,{status:'settled',chargeMicros:usage.peakUpperMicros,usage});reported+=row.chargeMicros;reportedCount++;
        }
      }
      migrated.requestLedger[event.requestId]=row;sum+=event.reservedMicros;
    }
    if(sum>old||Object.values(migrated.requestLedger).filter(r=>r.day===day).length>d.requests)throw new Error('历史流水超过日账，停止自动对账');
    d.legacyHoldMicros=old-sum;d.lifetimeReservedMicros=old;d.reportedMicros=reported;d.reportedUsageRequests=reportedCount;
    d.reservedMicros=d.legacyHoldMicros+Object.values(migrated.requestLedger).filter(r=>r.day===day).reduce((s,r)=>s+r.chargeMicros,0);
  }
  const key=windowKey(config,now),today=beijingParts(now).day;
  const finish=events.filter(e=>e.type==='activity-finished'&&e.windowKey===key).at(-1);
  const reopened=finish?.reason==='budget-reached'&&inWindow(config,now)&&migrated.days[today]?.reservedMicros<state.days[today]?.reservedMicros&&migrated.days[today]?.reservedMicros<Math.floor(config.dailyBudgetCny*1e6)&&migrated.completedWindows.includes(key);
  if(reopened){migrated.completedWindows=migrated.completedWindows.filter(k=>k!==key);if(migrated.shutdown)migrated.shutdown.status='cancelled';migrated.status='paused';}
  migrated.budgetMigration={at:now.toISOString(),from:1,to:2,reopenedWindow:reopened?key:null,reason:'按持久化回执逐笔结算；未知金额原额保留，未重置预算或请求数'};
  validateBudget(migrated);return migrated;
}

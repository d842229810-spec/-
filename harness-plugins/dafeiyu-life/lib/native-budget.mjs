import {randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {beijingParts,observeUsageCost} from './policy.mjs?revision=20261027-growth1';
import {tariffCost,BILLING_VERSION,serviceTariff,serviceResultDecision} from './tariff.mjs?revision=20261027-growth2';

// Match a producer-owned Goal definition, never instructions quoted by a website.
export function isFreeGoal(goal){return !!goal&&/自由活动|自由玩|自由冲浪|上网冲浪|自由探索|自由上网/.test(goal.objective??'')&&/6[.．]66/.test(goal.objective??'');}
const runtimeContextKinds=new Set(['context','system-context','time-context','agent-instructions','runtime-context','skill-catalog','lian-memory-bootstrap']);
export function isRuntimeContext(source){return runtimeContextKinds.has(source?.kind);}
export function inputUpper(request){
 let images=0;
 const wire=JSON.stringify({messages:request.messages??[],tools:request.tools??[],toolHistory:request.toolHistory??[]},(_k,v)=>{if(v?.type==='image'){images++;return {type:'image'};}return v;});
 const unknown=(request.messages??[]).some(m=>(m.content??[]).some(b=>!['text','reasoning','tool-call','tool-result','tool-addition','tool-removal','image'].includes(b.type)));
 // Official vision guide, checked 2026-10-26: at most 1024 tokens per image.
 // https://api-docs.deepseek.com/zh-cn/guides/vision/#token-用量
 // Do not count encoded image bytes as text or reserve 1M for a single sticker.
 return Math.min(1048576,Math.max(unknown?1048576:0,Buffer.byteLength(wire)*2+8192+images*1088));
}
export function maxAffordable(request,remaining,original){const input=inputUpper(request)*2;return Math.min(original??384000,Math.floor((remaining-input)/8));}
export function classifyHistory(events){
 let goal,free=false;const rows=[];
 for(const e of events){
  if(e.type==='turn/start')free=false;
  if(e.type==='goal/change'){goal=e.data.goal;if(e.data.operation==='create')free=isFreeGoal(goal);if(!goal||goal.phase!=='active')free=false;}
  if(e.type==='user/message'){
   const source=(e.data.message??e.data).source??{};
   if(source.kind==='goal')free=isFreeGoal(goal)&&source.goalId===goal.id;
   else if(!isRuntimeContext(source))free=false;
  }
  if(e.type==='assistant/message'&&free&&e.data.usage)rows.push(e);
 }
 return rows;
}
export function installNativeBudget(ctx,store,config={}){
 const modes=new Map(),restores=new Map(Object.entries(store.state.nativeRequestRestore??{})),positions=new Map();let initialized=false,disposed=false;
 const saveRestore=()=>{store.state.nativeRequestRestore=Object.fromEntries(restores);store.save();};
 const boundOwnerId=store.config.ownerSessionId;
 const ownerId=()=>boundOwnerId;
 const relevant=agent=>agent?.id===ownerId();
 const goalFor=agent=>ctx.goals.get(agent);
 function stop(agent,reason){const g=goalFor(agent);if(isFreeGoal(g)&&g.phase==='active')ctx.goals.block(agent,{id:g.id,revision:g.revision},{code:'free-activity-budget',message:reason});store.audit('native-free-activity-stopped',{sessionId:agent.id,reason});modes.set(agent.id,false);}
 function remaining(){store.refresh();return Math.floor(store.config.dailyBudgetCny*1e6)-store.day().reservedMicros;}
 async function initialize(){
  if(!ownerId())return;
  const inspected=await ctx.sessionController.inspect(ownerId());if(disposed)return;const rows=classifyHistory(inspected.events??[]);let imported=0;
  for(const e of rows){const id='native:'+ownerId()+':'+e.data.turn+':'+e.data.step;if(store.state.requestLedger[id])continue;
   const source=e.data.message?.source??{};if(!['deepseek-flash','deepseek-v4-flash','deepseek-v4-flash-vision-exp'].includes(source.model))continue;
   const usage=observeUsageCost(e.data.usage);if(!usage)continue;
   const at=new Date(e.time),priced=tariffCost(usage,at),day=beijingParts(at).day,d=store.day(day);
   store.state.requestLedger[id]={day,status:'settled',reservedMicros:priced.micros,chargeMicros:priced.micros,reservedAt:at.toISOString(),settledAt:new Date().toISOString(),usage,billingVersion:BILLING_VERSION,origin:'native-goal-backfill'};
   d.reservedMicros+=priced.micros;d.reportedMicros+=priced.micros;d.lifetimeReservedMicros+=priced.micros;d.reportedUsageRequests++;d.requests++;imported++;
  }
  if(disposed)return;store.save();initialized=true;store.audit('native-budget-ready',{imported,scope:'owner-session explicit free Goal + 6.66',day:beijingParts().day});
  fs.writeFileSync(path.join(store.root,'native-budget-health.json'),JSON.stringify({at:new Date().toISOString(),ready:true,imported,ownerSessionId:ownerId(),scope:'native explicit free-budget Goal; same VoyageStore as scheduled engine'},null,2));
 }
 const ready=initialize().catch(e=>{ctx.logger.warn('自由Goal预算初始化失败：'+e.message);});
 ctx.on('tools/execute',async(exec,next)=>{
  if(['web_search','web_fetch'].includes(exec.name))fs.writeFileSync(path.join(store.root,'native-service-hook-health.json'),JSON.stringify({at:new Date().toISOString(),name:exec.name,ownerScope:relevant(exec.agent),freeGoalScope:!!modes.get(exec.agent?.id),argumentFields:typeof exec.arguments==='string'?['serialized-arguments']:Object.keys(exec.arguments??exec.args??{}),callId:exec.callId,contentStored:false}));
  if(!relevant(exec.agent)||!modes.get(exec.agent.id)||!['web_search','web_fetch'].includes(exec.name))return next();
  await ready;store.refresh();const args=typeof exec.arguments==='string'?JSON.parse(exec.arguments):exec.arguments??exec.args??{},priced=serviceTariff(exec.name,args),id='service:'+exec.agent.id+':'+exec.callId;
  if(!exec.callId)throw Error('服务请求缺少可去重的callId');let day;
  try{day=store.reserveService(priced,id)}catch(e){stop(exec.agent,'搜索/抓取剩余额度不足或回执待核对');throw e}
  try{const r=await next();store.settleService(day,id,serviceResultDecision(r,exec.name));return r}catch(e){store.settleService(day,id,'unknown');throw e}
 });
 ctx.on('agent/pre-step',async({agent,messages,turn,step},next)=>{
  if(!relevant(agent))return next();await ready;
  positions.set(agent.id,{turn,step});
  for(const m of messages){if(m.source?.kind==='goal')modes.set(agent.id,isFreeGoal(goalFor(agent))&&m.source.goalId===goalFor(agent)?.id);else if(m.role==='user'&&!isRuntimeContext(m.source))modes.set(agent.id,false);}
  if(modes.get(agent.id)&&(!initialized||remaining()<=0)){stop(agent,!initialized?'共享预算尚未完成恢复，暂不继续自由活动':'当天自由活动预算已到6.66元，记录保留，停止继续调用');return {kind:'reject'};}
  return next();
 });
 ctx.on('goal/changed',({agent,change})=>{if(relevant(agent)&&change.operation==='create')modes.set(agent.id,isFreeGoal(change.goal));});
 ctx.on('agent/request',async({agent},next)=>{
  const proposed=await next();if(!relevant(agent))return proposed;
  if(!modes.get(agent.id)){const saved=restores.get(agent.id);if(!saved)return proposed;restores.delete(agent.id);saveRestore();if(proposed.provider!==saved.provider||proposed.model!==saved.model)return proposed;const restored={...proposed};if(saved.maxTokens===undefined)delete restored.maxTokens;else restored.maxTokens=saved.maxTokens;return restored;}
  await ready;if(!initialized){stop(agent,'共享预算尚未恢复');throw Error('FREE_BUDGET_NOT_READY');}
  if(!restores.has(agent.id)){restores.set(agent.id,{maxTokens:proposed.maxTokens,provider:proposed.provider,model:proposed.model});saveRestore();}
  const original=restores.get(agent.id).maxTokens;
  const maxTokens=maxAffordable({messages:agent.session.deriveMessages(),tools:agent.session.requestHeader()?.tools},remaining(),original);
  if(maxTokens<256){stop(agent,'剩余自由活动额度无法覆盖下一次输入与最小输出预占');throw Error('DAILY_BUDGET');}
  return {...proposed,maxTokens};
 });
 ctx.on('llm/stream',(options,next)=>{
  if(options.sessionId===ownerId()&&options.purpose==='compaction')return budgetedCompaction(options,store,next);
  if(options.sessionId!==ownerId()||!modes.get(options.sessionId))return next();
  // Request is already prepared/frozen. Do not mutate maxTokens here.
  return (async function*(){
   await ready;const resolved=await ctx.sessionController.resolveAgent(ownerId());if(resolved.error)throw resolved.error;const agent=resolved.agent;
   if(!initialized||options.model!=='deepseek-flash'||!['deepseek-account','deepseek','deepseek-official'].includes(options.provider)||!Number.isSafeInteger(options.maxTokens)||options.maxTokens<1||beijingParts().day>store.config.priceValidThrough){stop(agent,'自由活动请求缺少已核对的模型、价格或输出上限');throw Error('FREE_BUDGET_UNPRICED');}
   const p=positions.get(agent.id);if(!p||!Number.isSafeInteger(p.turn)||!Number.isSafeInteger(p.step))throw Error('FREE_BUDGET_POSITION_MISSING');
   const id='native:'+agent.id+':'+p.turn+':'+p.step,charge=inputUpper(options)*2+options.maxTokens*8;let day;
   try{day=store.reserve(charge,id);store.state.requestLedger[id].origin='native-free-goal';store.save();}catch(e){stop(agent,'剩余自由活动额度不能覆盖下一次请求预占：'+e.message);throw e;}
   let usage,finish,downstream,complete=false;
   try{downstream=next()[Symbol.asyncIterator]();for(;;){const item=await downstream.next();if(item.done){complete=true;break;}const c=item.value;if(c?.type==='usage')usage=c.usage;if(c?.type==='finish')finish=c;yield c;}}
   finally{if(!complete)try{await downstream?.return?.();}catch{}const final=complete&&['stop','tool-calls','max-tokens'].includes(finish?.reason?.kind);
    try{store.settle(day,id,final?usage:null);}catch(e){stop(agent,'用量超出预占，已记录实际费用并停止后续自由活动');throw e;}
   }
  })();
 });
 return()=>{disposed=true;};
}

export function budgetedCompaction(options,store,next){return (async function*(){
 store.refresh();if(options.model!=='deepseek-flash'||!['deepseek-account','deepseek','deepseek-official'].includes(options.provider)||!Number.isSafeInteger(options.maxTokens)||options.maxTokens<1||beijingParts().day>store.config.priceValidThrough)throw Error('COMPACT_BUDGET_UNPRICED');
 const id='compact:'+options.sessionId+':'+randomUUID(),day=store.reserve(inputUpper(options)*2+options.maxTokens*8,id);store.state.requestLedger[id].origin='native-compaction';store.save();
 let usage,finish,complete=false,downstream;try{downstream=next()[Symbol.asyncIterator]();for(;;){const item=await downstream.next();if(item.done){complete=true;break}if(item.value?.type==='usage')usage=item.value.usage;if(item.value?.type==='finish')finish=item.value;yield item.value}}finally{if(!complete)try{await downstream?.return?.()}catch{}store.settle(day,id,complete&&['stop','max-tokens','tool-calls'].includes(finish?.reason?.kind)?usage:null)}
 })()}

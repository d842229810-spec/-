import fs from 'node:fs';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';import {spawn} from 'node:child_process';import {createHash} from 'node:crypto';
import {GroupBudget,affordable,reserveFor} from './community-budget.mjs?revision=20261027-growth1';
import {serviceTariff,serviceResultDecision} from '../../../dafeiyu-life/lib/tariff.mjs?revision=20261027-growth2';
import {sendVoice} from './voice-send.mjs?revision=20261027-monitor-final2';
export function communityActive(row,now=Date.now()){return row?.自由发言===true&&now>=Number(row.自由生效时间??0)*1000;}
export function installCommunity(ctx,{directory,getConfig,getGrant,normalize,clearTurn,markVoiceSent=()=>{},log}){
 const ledger=new GroupBudget(path.join(directory,'qq-community.sqlite')),positions=new Map(),root=path.dirname(fileURLToPath(import.meta.url));let disposed=false;
 const binding=id=>(getConfig().绑定??[]).find(r=>r.类型==='群'&&normalize(r.会话)===normalize(id));
 const grant=id=>getGrant(normalize(id));
 const budgeted=id=>{const r=binding(id),g=grant(id);return communityActive(r)&&g?.community===true?{row:r,grant:g}:null;};
 const cap=r=>Math.floor(Math.min(.5,Number(r.日额度??.5))*1e6);
 function stop(agent,reason){const g=grant(agent.id);if(g)g.quiet=true;log(reason);setImmediate(()=>{if(!disposed)agent.cancel?.({kind:'user'},{keepInbox:true});});}
 ctx.on('tools/execute',async(exec,next)=>{
  if(!exec.agent||!['web_search','web_fetch'].includes(exec.name))return next();const b=budgeted(exec.agent.id);if(!b)return next();
  const args=typeof exec.arguments==='string'?JSON.parse(exec.arguments):exec.arguments??exec.args??{},id='service:'+exec.agent.id+':'+exec.callId;if(!exec.callId)throw Error('群服务请求缺少callId');
  try{ledger.reserveService(id,b.row.号码,serviceTariff(exec.name,args),cap(b.row))}catch(e){stop(exec.agent,'群自由交流搜索/抓取额度不足或价格待核对');throw e}
  try{const result=await next();ledger.settleService(id,serviceResultDecision(result,exec.name));return result}catch(e){ledger.settleService(id,'unknown');throw e}
 });
 ctx.on('agent/pre-step',({agent,turn,step},next)=>{if(binding(agent.id))positions.set(normalize(agent.id),{turn,step});return next();});
 ctx.on('agent/request',async({agent},next)=>{const proposed=await next(),b=budgeted(agent.id),sid=normalize(agent.id);if(!b){const old=ledger.restoreLimit(sid);if(!old||old.model!==proposed.model||old.provider!==proposed.provider)return proposed;const out={...proposed};if(old.maxTokens===undefined)delete out.maxTokens;else out.maxTokens=old.maxTokens;return out;}
  if(!ledger.hasLimit(sid))ledger.saveLimit(sid,{provider:proposed.provider,model:proposed.model,maxTokens:proposed.maxTokens});
  const n=affordable({messages:agent.session.deriveMessages(),tools:agent.session.requestHeader()?.tools},cap(b.row)-ledger.spent(b.row.号码),ledger.limit(sid)?.maxTokens);
  if(n<128){stop(agent,'群自由交流剩余额度不足以覆盖下一次请求，停止本回合');throw Error('GROUP_DAILY_BUDGET');}return {...proposed,maxTokens:n};
 });
 ctx.on('llm/stream',(options,next)=>{const b=budgeted(options.sessionId);if(!b)return next();return(async function*(){
  if(!['deepseek-account','deepseek','deepseek-official'].includes(options.provider)||options.model!=='deepseek-flash'||!Number.isSafeInteger(options.maxTokens))throw Error('群自由交流缺少已核对的模型与输出上限');
  const p=positions.get(normalize(options.sessionId));if(!p)throw Error('群请求缺少原生轮次');const id=options.sessionId+':'+p.turn+':'+p.step;
  ledger.reserve(id,b.row.号码,reserveFor(options,options.maxTokens),cap(b.row));let usage,finish,iterator,done=false;
  try{iterator=next()[Symbol.asyncIterator]();for(;;){const x=await iterator.next();if(x.done){done=true;break;}if(x.value?.type==='usage')usage=x.value.usage;if(x.value?.type==='finish')finish=x.value.reason;yield x.value;}}
  finally{if(!done)try{await iterator?.return?.();}catch{}ledger.settle(id,usage,done&&['stop','tool-calls','max-tokens'].includes(finish?.kind));}
 })();});
 const api={active:communityActive,available:row=>!ledger.blocked(row.号码)&&ledger.spent(row.号码)<cap(row),status:row=>({dailyBudgetCny:cap(row)/1e6,committedCny:ledger.spent(row.号码)/1e6,requiresReconciliation:ledger.blocked(row.号码)}),dispose(){disposed=true;ledger.close();}};
 async function registerTools(){if(!ctx.tools?.register)return;const sdk=path.join(path.dirname(process.execPath),'resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-tools/lib/index.js');const {defineTool}=await import(pathToFileURL(sdk).href);if(disposed)return;
  function tool(name,description,parameters,run){ctx.effect(()=>ctx.tools.register(defineTool({name,description,parameters,output:{schema:{type:'string'},render:(_a,v)=>[{type:'text',text:v}]},async execute(a,e){return JSON.stringify(await run(a,e));}})));}
  tool('whale_group_quiet','群聊中可以主动接话，也可以选择安静旁听；本工具结束当前QQ群回合且不向群里发文字。',{reason:{type:'string'}},(a,e)=>{const g=grant(e.agent?.id);if(!g)throw Error('当前不是QQ群消息回合');g.quiet=true;stop(e.agent,'小涟选择本轮旁听');return {quiet:true};});
  tool('whale_qq_voice','用正式C慵懒机灵声线把回复合成为语音条，发送到当前已绑定QQ聊天。只接收要说的文字，不接受任意号码、URL或本地文件；发送成功后只跳过与语音完全相同的文字，仍可补充新文字或图片。',{text:{type:'string',required:true}},async(a,e)=>{
   const id=e.agent?.id;if(!id)throw Error('须从已绑定的聊天会话发送');
   const b=(getConfig().绑定??[]).find(r=>normalize(r.会话)===normalize(id));if(!b||b.类型==='群'&&!grant(id))throw Error('当前没有绑定聊天回合');
   const turn=e.agent.phase?.turn,requestId=normalize(id)+':'+String(turn??e.callId)+':'+createHash('sha256').update(String(a.text)).digest('hex');
   const result=await sendVoice({text:a.text,config:getConfig(),binding:b,signal:e.signal,requestId,receiptFile:path.join(directory,'qq-voice.sqlite')});markVoiceSent(normalize(id),turn,a.text);return result;
  });
  tool('whale_meme','列出公开鲸鱼娘表情素材，或用素材ID和短句生成PNG/GIF表情包。返回Markdown图片路径，放入最终回复即可由原QQ桥发送；不接受任意本地文件。',{action:{type:'string',enum:['list','create'],required:true},asset:{type:'string'},text:{type:'string'},animated:{type:'boolean'}},async(a,e)=>{
   const publicRoot=path.join(root,'../public-stickers'),catalog=JSON.parse(fs.readFileSync(path.join(publicRoot,'catalog.json'),'utf8'));if(a.action==='list')return {assets:catalog.assets};
   if(!catalog.assets.some(x=>x.id===a.asset)||typeof a.text!=='string'||a.text.length>80||!a.text.trim())throw Error('请选择素材ID和1至80字短句');
   const python='C:/Users/USER/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',payload=JSON.stringify({asset:a.asset,text:a.text,animated:!!a.animated});
   const result=await new Promise((resolve,reject)=>{const child=spawn(python,['-X','utf8',path.join(root,'../render-meme.py')],{windowsHide:true,stdio:['pipe','pipe','pipe']});let stdout='',stderr='';const timer=setTimeout(()=>{child.kill();reject(Error('表情渲染超时'));},30000);child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);child.on('error',e=>{clearTimeout(timer);reject(e)});child.on('exit',code=>{clearTimeout(timer);if(code!==0)reject(Error('表情渲染失败：'+stderr.slice(-300)));else try{resolve(JSON.parse(stdout))}catch{reject(Error('表情结果格式错误'))}});child.stdin.end(payload);});
   const g=grant(e.agent?.id);if(g)g.imagePaths=[...(g.imagePaths??[]),result.file];return {...result,markdown:'![小涟表情]('+result.file.replaceAll('\\','/')+')'};
  });
  if(ctx.tools.execute){const t=setTimeout(async()=>{if(disposed)return;const tests=[];for(const args of [{action:'list'},{action:'create',asset:'lian-q-07',text:'我先听听你们聊',animated:false}])try{const result=await ctx.tools.execute({name:'whale_meme',arguments:args,callId:'meme-native-'+Date.now(),signal:AbortSignal.timeout(30000)});tests.push({action:args.action,isError:!!result.isError});}catch(e){tests.push({action:args.action,error:e.message});}fs.writeFileSync('E:/LianHome/安装验收/20261026-群表情原生工具验收.json',JSON.stringify({at:new Date().toISOString(),tests,modelCalls:0,sentMessages:0},null,2));},1500);t.unref?.();ctx.effect(()=>()=>clearTimeout(t));}
 }
 void registerTools().catch(e=>log('群表情工具注册失败：'+e.message));return api;
}

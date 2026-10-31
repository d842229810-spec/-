import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const run=promisify(execFile),exe='E:/DSH/插件/browserskill-runtime/bin/bsk.exe';
export const SEARCH_POLL_DELAYS=Object.freeze([0,250,500,1000,1500,2000]);
const bounded=(value,max=360)=>String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/((?:cookie|authorization|token|api[_-]?key|secret|password)\s*[:=]\s*)[^\s,;]+/ig,'$1[redacted]').slice(0,max);
const fault=(code,message,hint,diagnostic)=>Object.assign(new Error(message),{code,...hint?{hint}:{},...diagnostic?{diagnostic}:{}});

// execFile errors contain the entire command. Only retain selected CLI fields;
// never propagate that command, stdout, stderr or arbitrary error properties.
export function browserCliError(error){
 let payload;
 for(const raw of [error?.stdout,error?.stderr])try{const parsed=JSON.parse(String(raw??'').trim());if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed)&&typeof parsed.code==='string'){payload=parsed;break}}catch{}
 const code=/^[\w.-]{1,80}$/.test(payload?.code??'')?payload.code:'BROWSER_CLI_FAILED';
 const message=payload?.message?bounded(payload.message):'BrowserSkill命令未完成';
 return fault(code,message,payload?.hint?bounded(payload.hint):'检查BrowserSkill服务与扩展连接状态；不自动重放操作。',{
  cliExitCode:Number.isInteger(payload?.exit_code)?payload.exit_code:Number.isInteger(error?.code)?error.code:null,
  reason:typeof payload?.data?.reason==='string'?bounded(payload.data.reason,120):null,
 });
}

async function bsk(args,signal){
 let output;
 try{output=await run(exe,[...args,'--json'],{windowsHide:true,timeout:30000,maxBuffer:300000,signal});}
 catch(error){signal?.throwIfAborted();throw browserCliError(error)}
 signal?.throwIfAborted();
 try{return JSON.parse(output.stdout)}catch{throw fault('BROWSER_INVALID_RESPONSE','BrowserSkill没有返回可解析的JSON','检查本机CLI版本及服务状态；没有把无效回执当成空搜索结果。')}
}

export function abortableDelay(ms,signal){
 signal?.throwIfAborted();if(ms<=0)return Promise.resolve();
 return new Promise((resolve,reject)=>{
  let timer;
  const clear=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort)};
  const abort=()=>{clear();reject(signal.reason)};
  timer=setTimeout(()=>{clear();resolve()},ms);signal?.addEventListener('abort',abort,{once:true});
  if(signal?.aborted)abort();
 });
}

export function normalizeSearchVideos(rows){
 const seen=new Set(),items=[];
 for(const row of rows??[]){
  if(!row||typeof row.url!=='string')continue;
  let url;try{url=new URL(row.url,'https://www.bilibili.com/')}catch{continue}
  if(url.protocol!=='https:'||!['www.bilibili.com','bilibili.com'].includes(url.hostname)||url.username||url.password||url.port)continue;
  const bvid=url.pathname.match(/^\/video\/(BV[A-Za-z0-9]{10})(?:\/|$)/)?.[1],title=String(row.title??'').trim();
  if(!bvid||!title||seen.has(bvid))continue;
  seen.add(bvid);items.push({url:'https://www.bilibili.com/video/'+bvid,title:title.slice(0,250),bvid});if(items.length===6)break;
 }
 return items;
}

export async function pollSearchResults(collect,signal,{wait=abortableDelay,delays=SEARCH_POLL_DELAYS}={}){
 let observations=0,last;
 for(const delay of delays){
  signal?.throwIfAborted();await wait(delay,signal);signal?.throwIfAborted();
  const result=await collect();signal?.throwIfAborted();observations++;
  // evaluate uses exit code 0 even when the page expression throws.
  if(result?.ok===false)throw fault('BROWSER_SCRIPT_FAILED','BrowserSkill页面读取失败：'+bounded(result.error?.text??'脚本未完成'),'页面脚本失败，不是搜索无结果；请保留错误或改用浏览器观察结果。');
  const data=result?.value;
  if(!data||typeof data!=='object'||Array.isArray(data)||!Array.isArray(data.items))throw fault('BROWSER_INVALID_RESPONSE','BrowserSkill搜索读取回执缺少items数组','没有把缺失或不兼容的回执当成空搜索结果。');
  if(data.verificationRequired)throw fault('BILIBILI_MANUAL_VERIFICATION_REQUIRED','B站搜索要求人工验证，已停止本次读取','由用户在已有浏览器中完成验证；不绕过、不自动重试。');
  let page;
  if(data.url){
   try{page=new URL(data.url)}catch{throw fault('BROWSER_UNEXPECTED_PAGE','搜索窗口没有返回有效页面地址','保留窗口状态，检查是否被导航到其他页面。')}
   if(page.protocol!=='https:'||page.username||page.password||page.port||page.hostname!=='search.bilibili.com')throw fault('BROWSER_UNEXPECTED_PAGE','搜索窗口没有停留在B站搜索页','检查登录、验证或页面跳转，不把其他页面当作搜索结果。',{page:bounded(page.origin+page.pathname,180)});
  }
  const items=normalizeSearchVideos(data.items);if(items.length)return items;
  if(data.items.length)throw fault('BROWSER_RESULT_FORMAT_UNRECOGNIZED','搜索页有候选链接，但没有可识别的正规BV结果','页面结构或链接格式可能变化，请保留观察证据。',{candidateCount:data.items.length});
  if(data.empty===true)return [];
  last={readyState:bounded(data.readyState,30),...page?{page:bounded(page.origin+page.pathname,180)}:{}};
 }
 throw fault('BROWSER_PAGE_NOT_READY','B站搜索页在本次有限等待内没有出现结果或明确的无结果提示','页面可能仍在加载；可以稍后观察当前搜索页，不要据此断言B站接口整体宕机。',{observations,pollBudgetMs:delays.reduce((sum,n)=>sum+n,0),...last});
}

export const SEARCH_OBSERVATION_EXPRESSION=`(()=>{
 const items=[...document.querySelectorAll('a[href*="/video/BV"]')].map(a=>({url:a.href,title:a.querySelector('h3')?.textContent||a.getAttribute('title')||''})).filter(x=>x.title.trim());
 const sample=(document.body?.innerText||'').slice(0,8000),emptyNode=document.querySelector('.search-empty,.search-result-empty,.empty-content,.bili-empty');
 const emptyText=emptyNode?.innerText||'';
 const visibleChallenge=[...document.querySelectorAll('.geetest_panel,.geetest_holder,#bili-verify,.bili-captcha,.bili-verify')].some(node=>{const r=node.getBoundingClientRect(),s=getComputedStyle(node);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&s.opacity!=='0'});
 const challengeTitle=/安全验证|人机验证|验证中心/.test(document.title||'');
 const explicitPrompt=/请完成(?:以下|安全|人机)?验证|请先通过验证|验证后继续|请进行安全验证|请求被拦截|访问过于频繁/.test(sample);
 return {items:items.slice(0,20),url:location.href,readyState:document.readyState,
  verificationRequired:visibleChallenge||(items.length===0&&(challengeTitle||(sample.length<1200&&explicitPrompt))),
  empty:items.length===0&&(/没有找到相关|未找到相关|暂无搜索结果|没有相关结果|没有搜索到|搜索结果为空|什么都没有找到/.test(sample)||/没有找到|未找到|暂无|什么都没有/.test(emptyText))};
})()`;

export async function browserSearch(query,signal,{transport=bsk,browserId,wait=abortableDelay,delays=SEARCH_POLL_DELAYS}={}){
 const bsk=transport;let session;
 try{
  signal?.throwIfAborted();
  const inventory=await bsk(['browsers'],signal),rows=Array.isArray(inventory)?inventory:inventory.browsers??[];
  const id=row=>row.browser_id??row.browserId??row.browser_instance_id??row.extension_instance_id??row.instance_id??row.instanceId??row.id;
  const connected=rows.filter(row=>id(row)&&row.connected!==false),chosen=browserId?connected.find(row=>id(row)===browserId):(connected.length===1?connected[0]:null);
  if(!chosen){
   let status;try{status=await bsk(['status'],signal)}catch{}signal?.throwIfAborted();
   const skew=status?.version_skew_browsers??status?.versionSkewBrowsers??[],versionMismatch=Array.isArray(skew)&&skew.length>0;
   const code=versionMismatch?'BROWSER_VERSION_SKEW':connected.length?'BROWSER_SELECTION_REQUIRED':'BROWSER_NOT_CONNECTED',hint=versionMismatch?'浏览器扩展与CLI/daemon协议不兼容；同步升级正在使用的bsk可执行文件并重启daemon，等待扩展重连。':connected.length?'指定browserInstanceId以选择已有授权实例。':'打开已安装扩展并等待显示已连接。';
   throw fault(code,code+': '+hint+' 本次可用公开搜索备用路线。',hint,{daemonVersion:status?.daemon_version??null,protocolVersion:status?.protocol_version??null,connectedCount:connected.length,versionSkewCount:Array.isArray(skew)?skew.length:0});
  }
  signal?.throwIfAborted();
  const started=await bsk(['session','start','--browser',id(chosen),'--name','小涟·B站只读搜索'],signal);session=started.session_id;
  if(!session)throw fault('BROWSER_SESSION_NOT_STARTED','BrowserSkill没有建立独立搜索窗口','检查本机服务是否完整返回session_id。');
  signal?.throwIfAborted();
  await bsk(['navigate','--session',session,'https://search.bilibili.com/all?keyword='+encodeURIComponent(query)],signal);
  return await pollSearchResults(()=>bsk(['evaluate','--session',session,SEARCH_OBSERVATION_EXPRESSION],signal),signal,{wait,delays});
 }finally{if(session)try{await bsk(['session','stop',session],AbortSignal.timeout(5000))}catch{}}
}

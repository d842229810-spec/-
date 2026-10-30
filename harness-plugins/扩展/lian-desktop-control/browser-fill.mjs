import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {randomUUID,createHash} from 'node:crypto';
const run=promisify(execFile),exe='E:/DSH/插件/browserskill-runtime/bin/bsk.exe',hash=s=>createHash('sha256').update(s).digest('hex'),norm=s=>String(s??'').replaceAll('\r\n','\n').replaceAll('\u00a0',' ');
async function bsk(args,signal){const r=await run(exe,[...args,'--json'],{windowsHide:true,signal,timeout:20000,maxBuffer:400000});return JSON.parse(r.stdout)}
export async function reliableFill(a,{desktop,signal}){
 if(!a.session||!a.selector||typeof a.value!=='string'||a.value.length>4000)throw Error('需要现有BrowserSkill session、明确CSS selector及4000字内value；不自动发送。');
 const base=['--session',a.session,...(a.tabId?['--tab-id',String(a.tabId)]:[])],attempts=[],selector=JSON.stringify(a.selector);
 const evaluate=async expression=>(await bsk(['evaluate',...base,expression],signal)).value;
 const inspect=()=>evaluate(`(()=>{const editors=[...document.querySelectorAll(${selector})].filter(e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0),e=editors.length===1?editors[0]:null;return {url:location.href,exists:!!e,matches:editors.length,richText:!!e&&e.isContentEditable,transient:!!e&&(e.id==='pending-home-input'||e.getAttribute('aria-busy')==='true'),editable:!!e&&(e.isContentEditable||['TEXTAREA','INPUT'].includes(e.tagName))&&!e.disabled&&!e.readOnly,active:!!e&&(e===document.activeElement||e.contains(document.activeElement)),focused:document.hasFocus(),value:e?(e.value??e.innerText??e.textContent):null}})()`);
 let state=await inspect();const initialUrl=state.url,readyUntil=Date.now()+Math.min(30000,Math.max(500,a.readyTimeoutMs??15000));while((!state.exists||!state.editable||state.transient)&&Date.now()<readyUntil){signal?.throwIfAborted();if(state.matches>1)throw Error('AMBIGUOUS_EDITOR: 匹配到多个可见编辑框，请用更明确的CSS选择器。');await new Promise(r=>setTimeout(r,350));state=await inspect();if(state.url!==initialUrl)throw Error('PAGE_CHANGED: 等待编辑框期间发生跳转，请重新观察。')}
 if(!state.exists||!state.editable||state.transient)throw Error('EDITOR_NOT_READY: 尚未出现可操作的正式编辑框，可能仍在加载/登录/验证；已等待，未尝试盲打。请重新观察页面并选实际编辑根元素，避免pending占位框。');const url=state.url;
 const verify=s=>s.url===url&&s.exists&&(norm(s.value)===norm(a.value)||(s.richText&&(norm(s.value)===norm(a.value)+'\n'||(a.value===''&&/^\n*$/.test(norm(s.value))))));
 const done=(mode,s)=>({success:true,mode,characters:a.value.length,readbackCharacters:String(s.value??'').length,richTextStructuralNewlineNormalized:norm(s.value)!==norm(a.value),valueSha256:hash(norm(s.value)),verifiedByReadback:true,sent:false,attempts,debugCaptureStarted:false});
 if(verify(state))return done('already-filled',state);
 // Wait for the chosen editor to survive a short quiet interval, not for the whole SPA to stop rendering.
 const stable=await evaluate(`new Promise(resolve=>{let timer;const finish=()=>{observer.disconnect();clearTimeout(timer);clearTimeout(cap);resolve(true)};const observer=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(finish,300)});const e=document.querySelector(${selector});if(e)observer.observe(e,{childList:true,subtree:true,characterData:true});const cap=setTimeout(finish,1500);timer=setTimeout(finish,300)})`);attempts.push({action:'editor-stability-wait',completed:!!stable});
 try{await bsk(['fill',...base,a.selector,'--value',a.value,'--timeout','8s'],signal);attempts.push({action:'native-fill',ok:true})}catch(e){let detail;try{const j=JSON.parse(e.stdout);detail=j.error?.message??j.message??j.error}catch{}detail=String(e.stderr||detail||'浏览器原生填写未完成，错误码 '+e.code);attempts.push({action:'native-fill',ok:false,reason:(a.value?detail.replaceAll(a.value,'[待填文字]'):detail).slice(-350)})}
 state=await inspect();if(verify(state))return done('native-fill-readback',state);
 if(state.url!==url)throw Error('PAGE_CHANGED: 输入期间页面发生跳转，已停止；请重新观察当前页面。');
 const marker='涟输入定位-'+randomUUID().slice(0,8);let originalTitle,windowId;
 try{
  originalTitle=await evaluate(`(()=>{const old=document.title;document.title=${JSON.stringify(marker)};return old})()`);
  let matches=[];for(let n=0;n<7;n++){signal?.throwIfAborted();const listed=await desktop.request({op:'windows'},{signal});matches=listed.windows.filter(w=>w.title.includes(marker));if(matches.length)break;await new Promise(r=>setTimeout(r,150))}
  if(matches.length!==1)throw Error('无法唯一对应浏览器原生窗口；请将任务窗口显示出来，再重新观察。');windowId=matches[0].windowId;
  await desktop.request({op:'observe',windowId,activate:true},{signal});attempts.push({action:'explicit-window-activation',ok:true});
  await bsk(['focus',...base,a.selector],signal);state=await inspect();
  if(state.url!==url||!state.active||!state.focused||!state.editable)throw Error('编辑框未获得可核对的焦点；请手动点入该输入框后再试。');
  await desktop.request({op:'act',windowId,action:'key',key:'Ctrl+A'},{signal});state=await inspect();
  if(state.url!==url||!state.active||!state.focused)throw Error('选择文字后焦点变化，已停止，没有继续输入。');
  await desktop.request(a.value?{op:'act',windowId,action:'type',text:a.value}:{op:'act',windowId,action:'key',key:'Backspace'},{signal});attempts.push({action:'real-unicode-keyboard',ok:true});state=await inspect();
  if(verify(state))return done('real-keyboard-readback',state);
  return {success:false,mode:'real-keyboard-readback-mismatch',sent:false,attempts,actualCharacters:String(state.value??'').length,expectedCharacters:a.value.length,retryAutomatically:false,next:'页面在输入中改变了编辑框或焦点。已停止，先观察现有内容再处理，避免重复整段。'};
 }catch(e){return {success:false,sent:false,attempts,retryAutomatically:false,error:String(e.message).slice(0,700),next:'重新观察当前页面，确认编辑根元素与任务窗口；必要时手动点入编辑框。不会自动回车或提交。'}}
 finally{if(originalTitle!==undefined)try{await bsk(['evaluate',...base,`(()=>{if(document.title===${JSON.stringify(marker)})document.title=${JSON.stringify(originalTitle)}})()`],AbortSignal.timeout(3000))}catch{}}
}

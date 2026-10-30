import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile),exe='E:/DSH/插件/browserskill-runtime/bin/bsk.exe';
async function bsk(args,signal){const r=await run(exe,[...args,'--json'],{windowsHide:true,timeout:30000,maxBuffer:300000,signal});return JSON.parse(r.stdout)}
export async function browserSearch(query,signal){
 let session;try{
  const started=await bsk(['session','start','--browser','087940ca','--name','小涟·B站只读搜索'],signal);session=started.session_id;
  if(!session)throw Error('BrowserSkill没有建立独立搜索窗口');
  await bsk(['navigate','--session',session,'https://search.bilibili.com/all?keyword='+encodeURIComponent(query)],signal);
  const expression=`(()=>{const items=[...document.querySelectorAll('a[href*="/video/BV"]')].map(a=>({url:a.href,title:a.querySelector('h3')?.textContent||a.getAttribute('title')||''})).filter(x=>x.title.trim());return {items:items.slice(0,20),verificationRequired:/安全验证|验证码|验证后继续/.test(document.body.innerText.slice(0,4000))}})()`;
  let result=await bsk(['evaluate','--session',session,expression],signal);let data=result.value;
  if(!data?.items?.length&&!data?.verificationRequired){await new Promise((resolve,reject)=>{const t=setTimeout(resolve,700);signal?.addEventListener('abort',()=>{clearTimeout(t);reject(signal.reason)},{once:true})});result=await bsk(['evaluate','--session',session,expression],signal);data=result.value;}
  if(data?.verificationRequired)throw Error('B站搜索要求人工验证，已停止本次读取');
  const seen=new Set();return (data?.items??[]).filter(x=>{const m=x.url.match(/^https:\/\/www\.bilibili\.com\/video\/(BV[A-Za-z0-9]{10})/);if(!m||seen.has(m[1]))return false;seen.add(m[1]);x.bvid=m[1];x.url='https://www.bilibili.com/video/'+m[1];x.title=x.title.trim().slice(0,250);return true}).slice(0,6);
 }finally{if(session)try{await bsk(['session','stop',session],AbortSignal.timeout(5000))}catch{}}
}

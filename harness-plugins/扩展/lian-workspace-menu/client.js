window.__ModuleLoader__.load({id:"@local/lian-workspace-menu",factory:(require)=>{const exports={};
const packageName='@local/lian-workspace-menu';
const codec=(name,parse)=>{const schema={parse};return {mode:'strict',typeSymbol:packageName+'#'+name,schema,create:()=>schema};};
const json=codec('JSON',v=>{if(typeof v!=='string'||v.length>1000000)throw Error('Expected bounded JSON text');JSON.parse(v);return v;});
const descriptors=['getPartitions','setPartition'].map(method=>({id:packageName+'#lianWorkspaceMenu/'+method,service:'lianWorkspaceMenu',namespace:'lianWorkspaceMenu',method,invocation:{kind:'direct'},parameters:method==='getPartitions'?[]:[{name:'input',wire:'input',source:'json',codec:json}],result:json}));
const TYPERT={package:packageName,face:'host',schemas:[],invocations:descriptors,model:{services:[],events:[],objects:[]}};


// Presentation-only membership. Never changes session cwd, native membership or files.
function projectPartitions(snapshot, assignments) {
 const valid=new Set(snapshot.items.map(w=>w.workspaceId));
 const active=Object.fromEntries(Object.entries(assignments).filter(([,v])=>v===null||valid.has(v)));
 if(!Object.keys(active).length)return snapshot;
 const items=snapshot.items.map(w=>({...w,sessionIds:w.sessionIds.filter(id=>!Object.hasOwn(active,id))}));
 for(const [id,target] of Object.entries(active))if(target!==null)items.find(w=>w.workspaceId===target).sessionIds.push(id);
 return {...snapshot,items};
}

const React=require('react'),P=require('@deepseek-ai/dsh-client-ui-primitives');
const h=React.createElement;
exports.inject=['slots','remote','workspaces','sessions'];
exports.apply=async function(ctx){
 const unmount=await ctx.remote.$mount({package:packageName,descriptors});ctx.effect(()=>unmount);
 const api=ctx.get('remote.lianWorkspaceMenu'),model=ctx.workspaces.list;
 if(!api||typeof model.invalidate!=='function'||typeof model.getSnapshot!=='function')throw Error('工作区分区适配不支持此 Harness 版本');
 let data={revision:0,assignments:{}},alive=true,cachedBase,cachedData,cachedView;
 const originalGet=model.getSnapshot;
 const projectedGet=()=>{const base=originalGet.call(model);if(base!==cachedBase||data!==cachedData){cachedBase=base;cachedData=data;cachedView=projectPartitions(base,data.assignments);}return cachedView;};
 model.getSnapshot=projectedGet;
 ctx.effect(()=>()=>{alive=false;if(model.getSnapshot===projectedGet)model.getSnapshot=originalGet;model.invalidate(true);});
 async function rpc(method,...args){const r=await api[method](...args);if(!r.ok)throw Error(r.error?.message||'本地分区服务未响应');return JSON.parse(r.value);}
 function install(next){if(!alive)return;data=next;model.invalidate(true);}
 async function refresh(){install(await rpc('getPartitions'));}
 await refresh();
 ctx.on('connection/reset',()=>void refresh().catch(e=>console.warn('分区刷新失败',e.message)));
 let request=null;const listeners=new Set();const requestStore={getSnapshot:()=>request,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}};
 function setRequest(v){request=v;for(const fn of listeners)fn();}
 function MenuItem({sessionId,displayTitle,useMenuOpenState}){
  const [,setMenuOpen]=useMenuOpenState();
  return h(P.MenuItemButton,{icon:h(P.IconFolderCloseRegular,{}),onSelect:()=>{setMenuOpen(false);setRequest({sessionId,displayTitle});}},'移动到分区…');
 }
 function Dialog(){
  const r=React.useSyncExternalStore(requestStore.subscribe,requestStore.getSnapshot);
  return r?h(Form,{key:r.sessionId,request:r}):null;
 }
 function Form({request:r}){
  const [busy,setBusy]=React.useState(false),[error,setError]=React.useState(''),[ready,setReady]=React.useState(false);
  const snapshot=React.useSyncExternalStore(model.subscribe.bind(model),model.getSnapshot);
  React.useEffect(()=>{let live=true;refresh().then(()=>{if(live)setReady(true)}).catch(e=>{if(live)setError(e.message)});return()=>{live=false}},[]);
  const current=snapshot.items.find(w=>w.sessionIds.includes(r.sessionId));
  async function move(workspaceId,reset=false){setBusy(true);setError('');try{install(await rpc('setPartition',JSON.stringify({action:reset?'reset':'move',sessionId:r.sessionId,workspaceId,revision:data.revision})));setRequest(null);}catch(e){setError(e.message);await refresh().catch(()=>{});}finally{setBusy(false)}}
  const button=(label,id,reset=false)=>h('button',{key:reset?'reset':id??'ungrouped',type:'button',disabled:busy||!ready,onClick:()=>move(id,reset),style:{display:'block',width:'100%',textAlign:'left',padding:'12px',margin:'6px 0',border:'1px solid var(--dsw-alias-border-l4,#ddd)',borderRadius:'8px',background:'transparent',color:'inherit',cursor:'pointer'}},label);
  return h(P.Modal,{open:true,title:'移动到分区 · '+r.displayTitle,closeLabel:'取消',onClose:()=>{if(!busy)setRequest(null)}},
   h('p',null,'当前分区：'+(current?.title||current?.path||'未分组')),
   h('p',{style:{fontSize:13,color:'var(--dsw-alias-label-secondary)'}},'只整理侧栏，不移动文件、不改变工作目录，也不会向小涟发消息。'),
   h('div',{style:{maxHeight:'45vh',overflowY:'auto'}},snapshot.items.map(w=>button((current?.workspaceId===w.workspaceId?'✓ ':'')+(w.title||w.path),w.workspaceId))),
   button('未分组',null),button('恢复原始归属',null,true),
   !ready&&!error?h('p',{role:'status'},'正在读取本地分区…'):null,
   error?h('p',{role:'alert',style:{color:'#c33'}},error):null);
 }
 ctx.slots.inject('sidebar.workspaces.session.menu.item',()=>ctx.slots.register({name:'sidebar.workspaces.session.menu.item',id:'lian-move-partition',order:250},MenuItem));
 ctx.slots.inject('shell.overlay',()=>ctx.slots.register({name:'shell.overlay',id:'lian-partition-dialog'},Dialog));
 // Route right-click to the existing row menu, retaining its other native actions.
 const contextmenu=e=>{const row=e.target.closest?.('[data-row-key^="session:"][role="treeitem"]');if(!row)return;
  const button=[...row.querySelectorAll('button[aria-label]')].find(b=>/^会话“.*”的操作$|^Session actions for /.test(b.getAttribute('aria-label')||''));
  if(!button)return;e.preventDefault();e.stopPropagation();button.click();};
 document.addEventListener('contextmenu',contextmenu,true);ctx.effect(()=>()=>document.removeEventListener('contextmenu',contextmenu,true));
 // Refresh only when the app regains focus; no timer and no model request.
 const focus=()=>void refresh().catch(e=>console.warn('分区刷新失败',e.message));window.addEventListener('focus',focus);ctx.effect(()=>()=>window.removeEventListener('focus',focus));
};

return exports;}});

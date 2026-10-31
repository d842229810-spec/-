// Only a completed turn exclusively admitted from a correlated bridge message may become a mail reply.
const sid=x=>String(x??'').replace(/^session-/,'');
const textOf=m=>Array.isArray(m?.content)?m.content.filter(b=>b?.type==='text'&&typeof b.text==='string').map(b=>b.text).join('\n').trim():'';
export function createNativeReplyCapture({mail,owner,logger=console,onCaptured=()=>{},contextSources=['lian-memory-bootstrap']}={}){
 const pending=new Map(),turns=new Map();let currentTurn=null;
 // Audited host/plugin context: these are not additional user or QQ requests.
 const isContext=m=>{const s=m.source??{};return contextSources.includes(s.kind)||(s.kind==='reme-memory'&&s.form==='instructions')||(['runtime-context','time-context'].includes(s.kind)&&s.form==='snapshot')||(s.kind==='runtime-context'&&textOf(m)==='Current runtime context: none. Earlier runtime-context snapshots no longer apply.');};
 for(const v of mail.list())if(!v.reply&&v.receipt?.messageId&&['accepted','delivery-unknown'].includes(v.receipt.state)&&!['replied','needs-attention'].includes(v.receipt.responseState))pending.set(v.receipt.messageId,v.message.id);
 const update=(id,patch)=>{const v=mail.get(id);mail.receipt(id,{...v.receipt,...patch});};
 function register(id,messageId){if(typeof messageId!=='string'||!messageId)throw Error('MISSING_BRIDGE_MESSAGE_ID');if([...pending].some(([mid,lid])=>lid===id&&mid!==messageId))throw Error('AMBIGUOUS_BRIDGE_MESSAGE_ID');pending.set(messageId,id);}
 function onEvent(session,event){
  if(sid(session?.id)!==sid(owner)||pending.size===0)return;
  const d=event?.data??{};if(['turn/start','step/start'].includes(event.type)){currentTurn=d.turn??event.turn??null;return;}const turn=d.turn??event.turn??currentTurn;if(turn===undefined||turn===null)return;const message=d.message??d;if(event.type==='turn/end'&&currentTurn===turn)currentTurn=null;
  try{
   if(event.type==='user/message'){
    const t=turns.get(turn)??{letters:new Set(),other:false,otherSources:[],text:'',assistantMessageId:null};turns.set(turn,t);
    const id=message.source?.kind==='cen-lian-mail'?pending.get(message.id):null;
    if(id){t.letters.add(id);update(id,{responseState:'processing',turn});}
    else if(!isContext(message)){t.other=true;t.otherSources.push(message.source?.kind??'unattributed');}
    return;
   }
   const t=turns.get(turn);if(!t)return;if(!t.letters.size){if(event.type==='turn/end')turns.delete(turn);return;}
   if(event.type==='assistant/message'){
    const hasCall=message.content?.some(b=>['tool-call','tool_use','tool-call-request'].includes(b?.type));
    t.text=d.interrupted||hasCall?'':textOf(message);t.assistantMessageId=message.id??null;return;
   }
   if(event.type!=='turn/end')return;
   turns.delete(turn);
   const ids=[...t.letters],exclusive=!t.other&&ids.length===1,completed=d.reason?.kind==='completed';
   for(const id of ids){
    try{
     const v=mail.get(id);
     if(v.reply)continue; // Explicit whale_codex replies already own their delivery.
     if(!exclusive){update(id,{responseState:'needs-attention',responseReason:'mixed-input-turn',responseOtherSources:[...new Set(t.otherSources)],turn});continue;}
     if(!completed||!t.text){update(id,{responseState:'needs-attention',responseReason:completed?'no-final-text':'turn-not-completed',turn});continue;}
     mail.reply(id,t.text,{kind:'harness-completed-turn',sessionId:String(session.id),turn,messageId:t.assistantMessageId});
     update(id,{responseState:'replied',responseTransport:'native-final-text',turn});
     void Promise.resolve(onCaptured(id)).catch(e=>logger.warn?.('Bridge reply notification: '+e.message));
    }finally{for(const [mid,lid]of pending)if(lid===id)pending.delete(mid);}
   }
  }catch(e){logger.warn?.('Bridge final reply capture: '+e.message);}
 }
 return {register,onEvent,currentReplyId(){const t=turns.get(currentTurn);if(!t||t.other||t.letters.size!==1)return null;const id=[...t.letters][0];const v=mail.get(id);return !v.reply&&['accepted','delivery-unknown'].includes(v.receipt.state)?id:null;},close(){pending.clear();turns.clear();}};
}

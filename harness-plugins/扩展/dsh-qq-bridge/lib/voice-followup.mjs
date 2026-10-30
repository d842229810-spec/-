// Avoid exact speech echoes while allowing additional text and images.
export class VoiceFollowup {
 constructor(){this.turns=new Map()}
 remember(session,turn,text){if(!Number.isSafeInteger(turn))return;const key=session+':'+turn;this.turns.set(key,[...(this.turns.get(key)??[]),String(text).trim()]);while(this.turns.size>100)this.turns.delete(this.turns.keys().next().value)}
 isEcho(session,turn,text){const key=session+':'+turn,voices=this.turns.get(key);this.turns.delete(key);return !!voices?.includes(String(text??'').trim())}
}

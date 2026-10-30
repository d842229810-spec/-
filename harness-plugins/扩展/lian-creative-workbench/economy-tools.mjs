import fs from 'node:fs';
import {monitorVoice,monitorStatus,expectedVoiceText} from '../../sensory-runtime/voice-monitor.mjs?revision=20261028-selftest2';
import {musicStatus,createSong} from '../../music-runtime/client.mjs?revision=20261028-selftest2';
export function registerEconomyTools(tool){
 tool('whale_voice_selfcheck','读取已生成语音的本地自检，或显式回听。生成/QQ发送时每条轻检，部分语音后台回听；pending不能称已经听过。check先查缓存，full=true要求本地转写/语气观察（可能数十秒），read仅读已有记录。expectedText省略时从同名配音元数据取原稿；报告保存在本地。不会生成或重复发送。',{action:{type:'string',enum:['status','read','check'],required:true},file:{type:'string'},expectedText:{type:'string'},full:{type:'boolean'}},async(a,e)=>{
  if(a.action==='status')return monitorStatus();let text=a.expectedText;
  if(text===undefined)text=expectedVoiceText(a.file);
  return monitorVoice({file:a.file,expectedText:text??'',full:a.full===true,mode:a.action==='read'?'read':'check'},e.signal);
 });
 tool('whale_song','本地ACE-Step原创短曲试听，10至30秒，默认24秒、单样本。提供caption风格描述和lyrics分段歌词，空歌词生成伴奏。复用同参数结果、按需占用显卡、用后退出，不另花付费API token。当前生成歌手尚非已验收C音色，不能称用C唱歌；需实际回听歌词/旋律。',{action:{type:'string',enum:['status','generate'],required:true},caption:{type:'string'},lyrics:{type:'string'},seconds:{type:'number'},bpm:{type:'integer'},seed:{type:'integer'}},(a,e)=>a.action==='status'?musicStatus():createSong(a,e.signal));
}

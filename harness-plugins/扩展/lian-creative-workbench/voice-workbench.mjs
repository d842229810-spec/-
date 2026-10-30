import fs from 'node:fs';import {root,readVoiceProfile,synthesizeVoice} from '../../voice-design-runtime/client.mjs?revision=20261028-selftest2';
import {monitorStatus} from '../../sensory-runtime/voice-monitor.mjs?revision=20261028-selftest2';
import {expressiveStatus,expressiveAudition} from '../../index-tts-runtime/client.mjs?revision=20261028-selftest2';
export function registerVoiceTool(ctx,tool){
 tool('whale_voice','读取正式C声线或生成口播。synthesize沿用已选正式引擎；audition只试听旧A/B/C。expressive-audition使用新IndexTTS-2.5、固定C参考，显式style选serious等；小涟暂不接受旧tired参数，restrained是去悲伤/不拖慢的新候选；尚未共同试听，不改默认引擎，不称权重训练。发QQ语音继续whale_qq_voice。',{action:{type:'string',enum:['status','list','synthesize','audition','expressive-audition'],required:true},candidate:{type:'string',enum:['A','B','C']},style:{type:'string',enum:['casual','pleased','serious','tired','restrained']},text:{type:'string'}},async(a,e)=>{
  if(a.action==='expressive-audition'){if(a.candidate&&a.candidate!=='C')throw Error('情感候选固定C参考');return expressiveAudition(a,e.signal)}
  if(['status','list'].includes(a.action)){const file='E:/LianHome/工作室/声音设计/20261026_原创候选/候选音色.json';return {candidates:JSON.parse(fs.readFileSync(file,'utf8')),baseReady:fs.existsSync(root+'/models/Qwen3-TTS-Base/verified-model.json'),selected:true,profile:readVoiceProfile(),expressive:expressiveStatus(),selfCheck:monitorStatus(),deepseekApiCalls:0};}
  return synthesizeVoice(a,e.signal);
 });
}

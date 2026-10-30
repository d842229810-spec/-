import fs from 'node:fs';import path from 'node:path';import {createHash,randomUUID} from 'node:crypto';import {DatabaseSync} from 'node:sqlite';
import {synthesizeVoice,readVoiceProfile} from '../../../voice-design-runtime/client.mjs?revision=20261027-monitor-final2';
export async function sendVoice({text,config,binding,signal,requestId=randomUUID(),receiptFile='C:/Users/USER/.dsh/qq-voice.sqlite',synthesize=synthesizeVoice,fetchImpl=fetch}){
 if(!config.总开关||config.试运行)throw Error('QQ发送当前未启用真实发送');
 if(!binding||!['私聊','群'].includes(binding.类型))throw Error('只向当前已经绑定的聊天发送语音');
 if(binding.类型==='私聊'&&String(binding.号码)!==String(config.私聊QQ))throw Error('私聊语音仅发给已绑定用户');
 if(!(binding.类型==='群'?config.转群:config.转私聊))throw Error('当前聊天的QQ发送未启用');
 const origin=new URL(config.NapCat);if(origin.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(origin.hostname))throw Error('QQ后端必须使用现有本机连接');
 const headers={'content-type':'application/json',authorization:'Bearer '+config.令牌};
 const login=await(await fetchImpl(new URL('/get_login_info',origin),{method:'POST',redirect:'error',headers,body:'{}',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(10000)]):AbortSignal.timeout(10000)})).json();
 if(login.status!=='ok'||!config.机器人QQ||String(login.data?.user_id)!==String(config.机器人QQ))throw Error('QQ后端登录账号与绑定的小涟账号不符');
 fs.mkdirSync(path.dirname(receiptFile),{recursive:true});const db=new DatabaseSync(receiptFile);db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS receipts(id TEXT PRIMARY KEY,status TEXT,result TEXT,at TEXT)');
 const previous=db.prepare('SELECT * FROM receipts WHERE id=?').get(requestId);if(previous?.status==='failed-before-send'){db.prepare('DELETE FROM receipts WHERE id=? AND status=?').run(requestId,'failed-before-send');}else if(previous){db.close();if(previous.status==='sent')return {...JSON.parse(previous.result),reusedReceipt:true};throw Error('这条语音已有准备/发送记录，结果未确认时先查QQ历史，不自动重复发送');}
 try{
 db.prepare('INSERT INTO receipts VALUES(?,?,NULL,?)').run(requestId,'preparing',new Date().toISOString());
 const profile=readVoiceProfile(),audio=await synthesize({action:'synthesize',text},signal);
 if(!audio.selected||audio.profileId!==profile.id||audio.candidate!==profile.candidate||audio.referenceSha256!==profile.referenceSha256)throw Error('语音与正式声线不匹配');
 const root=fs.realpathSync('E:/LianHome/工作室/声音设计/配音输出'),file=fs.realpathSync(audio.file);
 if(!file.toLowerCase().startsWith(root.toLowerCase()+path.sep)||path.extname(file).toLowerCase()!=='.wav')throw Error('语音输出路径不符');
 const bytes=fs.readFileSync(file);if(bytes.length>30*1024*1024||bytes.toString('ascii',0,4)!=='RIFF'||createHash('sha256').update(bytes).digest('hex')!==audio.sha256)throw Error('语音文件校验失败');
 const action=binding.类型==='群'?'send_group_msg':'send_private_msg',body={...(binding.类型==='群'?{group_id:Number(binding.号码)}:{user_id:Number(binding.号码)}),message:[{type:'record',data:{file:'base64://'+bytes.toString('base64')}}]};
 db.prepare('UPDATE receipts SET status=? WHERE id=?').run('delivery-unknown',requestId);
 const response=await fetchImpl(new URL('/'+action,origin),{method:'POST',redirect:'error',headers,body:JSON.stringify(body),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(90000)]):AbortSignal.timeout(90000)});const receipt=await response.json();
 if(receipt.status!=='ok'||receipt.retcode!==0||!receipt.data?.message_id)throw Error('QQ未确认语音发送成功：'+String(receipt.retcode??receipt.status));
 const result={sent:true,messageId:String(receipt.data.message_id),chatType:binding.类型,chatId:String(binding.号码),file:audio.file,profileId:profile.id,candidate:profile.candidate,durationSeconds:audio.durationSeconds,selfCheck:audio.selfCheck,localVoiceModel:true,deepseekApiCalls:0,notice:'这是OneBot发送回执，手机实际可播放性仍以接收端验收为准。'};db.prepare('UPDATE receipts SET status=?,result=? WHERE id=?').run('sent',JSON.stringify(result),requestId);return result;
 }catch(error){db.prepare('UPDATE receipts SET status=? WHERE id=? AND status=?').run('failed-before-send',requestId,'preparing');throw error;}finally{db.close();}
}

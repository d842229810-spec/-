import {afterSynthesis} from '../sensory-runtime/voice-monitor.mjs?revision=20261028-selftest2';
import fs from 'node:fs';import {spawn} from 'node:child_process';
export const root='E:/DSH/插件/voice-design-runtime';
export const readVoiceProfile=()=>JSON.parse(fs.readFileSync(root+'/selected-voice.json','utf8'));
export function voiceFailure(stderr){return stderr.split(/\r?\n/).filter(s=>/^[A-Za-z]+(?:Error|Exception)(?::|$)/.test(s.trim())).at(-1)?.trim()??'本地合成进程异常退出，请查本机诊断日志';}
async function synthesizeRaw(args,signal){
 if(typeof args.text!=='string'||!args.text.trim()||args.text.length>1200)throw Error('配音文本须为1至1200字，长文可分批合成');
 return new Promise((resolve,reject)=>{const child=spawn(root+'/.venv/Scripts/python.exe',['-X','utf8','-u',root+'/voice.py'],{windowsHide:true,stdio:['pipe','pipe','pipe'],signal});let stdout='',stderr='',finished=false;const done=(error,result)=>{if(finished)return;finished=true;clearTimeout(timer);error?reject(error):resolve(result)};const timer=setTimeout(()=>{child.kill();done(Error('配音超时，已有输出保留'));},600000);child.stdout.on('data',b=>{stdout+=b;if(stdout.length>2000000){child.kill();done(Error('配音输出异常'))}});child.stderr.on('data',b=>stderr=(stderr+b).slice(-4000));child.on('error',err=>done(err));child.stdin.on('error',err=>done(err));child.on('exit',code=>{if(code!==0)return done(Error('本地配音未完成：'+voiceFailure(stderr)));try{done(null,JSON.parse(stdout.trim().split('\n').at(-1)))}catch{done(Error('配音结果格式异常'))}});child.stdin.end(JSON.stringify(args));});
}

export async function synthesizeVoice(args,signal){const audio=await synthesizeRaw(args,signal);return afterSynthesis(audio,args.text,signal)}

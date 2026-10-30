import {hashMedia} from './proof-common.mjs';
import fs from 'node:fs';import path from 'node:path';
import {createRenderRunner} from './render-runner.mjs';
import {HOME,LIB,PROJECTS,RUNTIME,readRegistry,assertProject,bundleAssets} from './library.mjs';
import {runProcess,mediaBinary} from '../../dafeiyu-life/lib/media.mjs';
const NODE='E:/DSH/本体/resources/runtime/primary-runtime/dependencies/node/bin/node.exe';
export function createProject(name='制作环境验收_20261026'){
 if(!/^[^<>:"/\\|?*\x00-\x1f]{1,80}$/.test(name)||['.','..'].includes(name)||/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(name))throw new Error('项目名称无效');
 fs.mkdirSync(PROJECTS,{recursive:true});const project=path.join(PROJECTS,name);if(fs.existsSync(project))throw new Error('项目已存在，不覆盖；可以直接使用该项目');
 fs.mkdirSync(project);fs.cpSync(path.join(RUNTIME,'template'),project,{recursive:true});fs.mkdirSync(path.join(project,'public/assets'),{recursive:true});
 setupProject(project);
 const r=readRegistry(),character=r.assets.find(a=>a.id===r.defaults.character),voice=r.assets.find(a=>a.id===r.defaults.voice);
 fs.copyFileSync(character.path,path.join(project,'public/assets/character.png'));fs.copyFileSync(voice.path,path.join(project,'public/assets/voice.wav'));
 const props={scenes:[{headline:'涟的创作桌',caption:'制作环境验收 · 回放已有声音样本',image:'assets/character.png',durationSeconds:3},{headline:'同一个角色，\n不同的镜头。',caption:'固定角色 · 独立参考图',image:'assets/character.png',durationSeconds:3},{headline:'把素材，\n接成故事。',caption:'本地Remotion导出 · 非正式故事成片',image:'assets/character.png',durationSeconds:3}],audio:'assets/voice.wav',captions:[]};
 fs.writeFileSync(path.join(project,'video.props.json'),JSON.stringify(props,null,2));
 fs.writeFileSync(path.join(project,'script.md'),'# 制作环境验收样片\n\n这是一段本地工具验收，不是小涟新经历或正式故事。\n\n画面演示角色贴图、场景切换和版面变化；声音回放素材库当前正式参考，不冒充新配音。屏幕文字是制作说明，不是逐字字幕。\n');
 fs.writeFileSync(path.join(project,'project.json'),JSON.stringify({version:1,engine:'remotion',runtimeVersion:'4.0.538',composition:'LianFilm',purpose:'installation-sample',characterProfile:r.characterProfile,voiceReference:r.defaults.voice,createdAt:new Date().toISOString()},null,2));
 bundleAssets(project,[],{includeVoice:true});return {project,props:path.join(project,'video.props.json'),entry:path.join(project,'src/index.jsx')};
}
export function setupProject(project){
 const p=assertProject(project);
 const file=path.join(p,'package.json');
 if(!fs.existsSync(file))fs.writeFileSync(file,JSON.stringify({name:'lian-remotion-film',version:'1.0.0',private:true,type:'module',scripts:{studio:'remotion studio src/index.jsx',render:'remotion render src/index.jsx LianFilm out/preview.mp4 --props=video.props.json'},dependencies:JSON.parse(fs.readFileSync(path.join(RUNTIME,'package.json'),'utf8')).dependencies},null,2));
 const modules=path.join(p,'node_modules');if(!fs.existsSync(modules))fs.symlinkSync(path.join(RUNTIME,'node_modules'),modules,'junction');
 return {project:p,sharedRuntime:RUNTIME};
}
const runRender=createRenderRunner({node:NODE,script:path.join(RUNTIME,'render.mjs'),cwd:RUNTIME});
export function renderProject(project,options={}){
 options.signal?.throwIfAborted();return runRender(assertProject(project),options);
}
export async function inspectVideo(project,{signal}={}){
 const p=assertProject(project),file=path.join(p,'out/preview.mp4'),sourceSha256=await hashMedia(file);
 const probe=await runProcess(mediaBinary('ffprobe'),['-v','error','-show_format','-show_streams','-of','json',file],{signal});const data=JSON.parse(probe.stdout),video=data.streams.find(s=>s.codec_type==='video'),audio=data.streams.find(s=>s.codec_type==='audio'),duration=Number(data.format.duration);
 const analysis=await runProcess(mediaBinary('ffmpeg'),['-hide_banner','-nostats','-i',file,'-vf','blackdetect=d=0.25:pix_th=0.10',...(audio?['-af','silencedetect=n=-45dB:d=0.4,volumedetect']:[]),'-f','null','-'],{signal,timeoutMs:120000,maxBytes:2000000});
 const props=JSON.parse(fs.readFileSync(path.join(p,'video.props.json'),'utf8')),issues=[];
 for(const c of props.captions??[])if(!Number.isFinite(c.startMs)||!Number.isFinite(c.endMs)||c.startMs<0||c.endMs<=c.startMs||c.endMs>duration*1000+100)issues.push('字幕时间超出实际成片或无效');
 const sourceUnchanged=await hashMedia(file)===sourceSha256;if(!sourceUnchanged)issues.push('检查期间成片已变化');
 const value={file,sourceSha256,sourceUnchanged,checkedAt:new Date().toISOString(),durationSeconds:duration,width:video?.width,height:video?.height,fps:video?.avg_frame_rate,videoCodec:video?.codec_name,audioPresent:!!audio,audioCodec:audio?.codec_name,meanVolumeDb:analysis.stderr.match(/mean_volume:\s*([^\s]+) dB/)?.[1]??null,maxVolumeDb:analysis.stderr.match(/max_volume:\s*([^\s]+) dB/)?.[1]??null,blackSegments:[...analysis.stderr.matchAll(/black_start:([\d.]+) black_end:([\d.]+) black_duration:([\d.]+)/g)].map(m=>({start:+m[1],end:+m[2],duration:+m[3]})),silenceDurations:[...analysis.stderr.matchAll(/silence_duration:\s*([\d.]+)/g)].map(m=>+m[1]),issues,technicalPassed:!!video&&duration>0&&!issues.length,notice:'技术检查不评判故事、表演、声音自然度或审美；仍须看帧并听成片。'};
 fs.writeFileSync(path.join(p,'out/technical-review.json'),JSON.stringify(value,null,2));return value;
}

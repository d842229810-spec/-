import {codeIdentity,singleFlight,hostVersions} from '../../lian-shared/health-evidence.mjs';
import {resolveOpenDesign} from '../../opendesign-runtime/resolve.mjs?revision=selftest2';
import {registerEconomyTools} from './economy-tools.mjs?revision=20261028-selftest2';
import {voiceHookProbe} from './voice-hook-probe.mjs';
import {economyProbe} from './economy-probe.mjs?revision=20261027-economy-final1';
import {sensoryFollowupProbe} from './sensory-followup-probe.mjs?revision=5';
import {sensoryProbe} from './sensory-probe.mjs';
import {registerWriting} from './writing.mjs?revision=20261028-private2';
import fs from 'node:fs';import path from 'node:path';import {homedir} from 'node:os';import {pathToFileURL,fileURLToPath} from 'node:url';import {spawn} from 'node:child_process';
import {createMotion,renderMotion,motionPreview,closeMotion,portReady} from './workers.mjs?revision=selftest1';import {inspectComment} from './comments.mjs';import {runProcess,mediaBinary} from '../../dafeiyu-life/lib/media.mjs';
import {scheduleProbe} from './probe.mjs';
import {scheduleHistoryProbe} from './history-probe.mjs';
import {scheduleCostReconciliation} from './cost-reconcile.mjs';
import {scheduleNetworkProbe} from './network-probe.mjs';
import {registerVoiceTool} from './voice-workbench.mjs?revision=20261028-selftest2';
const root=path.dirname(fileURLToPath(import.meta.url)),sdk=path.join(path.dirname(process.execPath),'resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-tools/lib/index.js'),{defineTool}=await import(pathToFileURL(sdk).href);
export const name='lian-creative-workbench';export const inject=['tools','skills','attachments'];const skills=['lian-opendesign','lian-motion-canvas','lian-blender-character','lian-natural-comments','lian-voice-profile','lian-writing-workshop','lian-local-singing'];
const resources='E:/AI/OpenDesign/resources/open-design',dirs={craft:'craft',systems:'design-systems',templates:'design-templates',skills:'skills'};
export function apply(ctx,config={}){
 ctx.effect(()=>economyProbe(ctx,config));
 ctx.effect(()=>voiceHookProbe(ctx,config));
 ctx.effect(()=>sensoryProbe(ctx,config));
 ctx.effect(()=>sensoryFollowupProbe(ctx,config));
 ctx.effect(()=>scheduleProbe(ctx,config));
 ctx.effect(()=>scheduleHistoryProbe(ctx,config));
 ctx.effect(()=>scheduleCostReconciliation(ctx,config));
 ctx.effect(()=>scheduleNetworkProbe(ctx,config));
 for(const name of skills){const dir=path.join(root,'skills',name),file=path.join(dir,'SKILL.md'),text=fs.readFileSync(file,'utf8');ctx.skills.register({name,description:text.match(/^description:\s*(.*)$/m)?.[1],source:'plugin',provider:'lian-creative-workbench',path:file,resourceBase:{kind:'directory',path:dir},content:text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/,''),metadata:{},invocation:{modelInvocable:true,userInvocable:true}});}
 function tool(name,description,parameters,fn){ctx.effect(()=>ctx.tools.register(defineTool({name,description,parameters,timeoutMs:600000,output:{schema:{type:'string'},render:(_a,v)=>{const {attachedImages=[],...data}=JSON.parse(v);return [{type:'text',text:JSON.stringify(data)},...attachedImages.map(attachment=>({type:'image',attachment}))]}},async execute(a,e){return JSON.stringify(await fn(a,e))}})));}
 const healthFile=path.join(homedir(),'.dsh/lian-creative-workbench-health.json'),identity=codeIdentity(import.meta.url,{version:'1.4.1',dependencies:{...hostVersions()}});let disposed=false,statusInFlight;
 async function openDesignStatus(start=false){
 let spec;try{spec=await resolveOpenDesign({start})}catch(e){return {applicationApiReady:false,mcpReady:false,state:'application-api-unavailable',error:e.message,transport:'stdio',notice:'stdio没有独立监听端口；应用进程存在不等于API或MCP就绪'}}
 try{const r=await ctx.tools.execute({name:'mcp__lian_opendesign__list_projects',arguments:{},callId:'od-health-'+Date.now(),signal:AbortSignal.timeout(45000)});return {applicationApiReady:true,mcpReady:!r.isError,daemonUrl:spec.daemonUrl,transport:'stdio',state:r.isError?'mcp-unavailable':'ready',error:r.isError?r.content?.filter(c=>c.type==='text').map(c=>c.text).join('').slice(0,500):undefined}}catch(e){return {applicationApiReady:true,mcpReady:false,daemonUrl:spec.daemonUrl,transport:'stdio',state:'mcp-unavailable',error:e.message}}
 }
 async function collectStatus(){const names=ctx.tools.schemas().map(t=>t.name),catalog=await ctx.skills.list({cwd:'E:/LianHome'});const value={plugin:name,version:'1.4.1',checkedAt:new Date().toISOString(),observedAt:new Date().toISOString(),code:identity,verificationScope:'live-dependency-reachability-not-artifact-quality',pid:process.pid,installed:{opendesign:'0.26.1',motionCanvas:'3.17.2',blender:'5.2.3 LTS',blenderMCP:'2.2.4'},nativeTools:{opendesign:names.filter(n=>n.startsWith('mcp__lian_opendesign__')),blender:names.filter(n=>n.startsWith('mcp__lian_blender__'))},skills:skills.map(name=>({name,visible:catalog.some(s=>s.name===name)})),openDesign:await openDesignStatus(false),sharedBlender:{hub:await portReady(9877),application:await portReady(9876),serialized:true},outputRulesModified:false,personaModified:false,paidModelCallsByPlugin:0};if(!disposed)fs.writeFileSync(healthFile,JSON.stringify(value,null,2));return value;}
 const status=singleFlight(collectStatus);
 tool('whale_creative_workbench_status','核对OpenDesign、Motion Canvas与Blender的实际工具注册、技能和共享服务状态；不调用模型。',{},status);
 registerVoiceTool(ctx,tool);
 registerEconomyTools(tool);
 registerWriting(tool);
 tool('whale_design_reference','列举或读取OpenDesign自带的设计系统、模板、技能和通用设计方法。kind选craft/systems/templates/skills；不填id时列目录。file是目录内相对文件，不自动运行其中脚本。',{kind:{type:'string',enum:Object.keys(dirs),required:true},id:{type:'string'},file:{type:'string'}},a=>{const base=fs.realpathSync(path.join(resources,dirs[a.kind]));if(!a.id)return {kind:a.kind,entries:fs.readdirSync(base,{withFileTypes:true}).map(e=>({id:e.name,directory:e.isDirectory()}))};const target=fs.realpathSync(path.resolve(base,a.id,a.file??(a.kind==='systems'?'DESIGN.md':'SKILL.md')));if(!target.toLowerCase().startsWith(base.toLowerCase()+path.sep))throw new Error('请选择资源目录内的文件');if(fs.statSync(target).size>500000)throw new Error('请选择具体小文件读取');return {file:target,text:fs.readFileSync(target,'utf8')};});
 tool('whale_opendesign_open','启动OpenDesign并等待应用API与原生MCP只读调用就绪，失败返回分层诊断。',{},()=>openDesignStatus(true));
 tool('whale_blender_studio','查看共享Blender服务，或启动Blender并核对插件。完整建模、截图、导入与Python能力用mcp__lian_blender__工具；Codex与Harness复用同一个串行服务。',{action:{type:'string',enum:['status','start'],required:true}},async a=>a.action==='status'?{hub:await portReady(9877),application:await portReady(9876),projects:'E:/LianHome/工作室/3D工程'}:ctx.tools.execute({name:'mcp__lian_blender__get_addon_status',arguments:{},callId:'blender-start-'+Date.now(),signal:AbortSignal.timeout(90000)}));
 tool('whale_motion_canvas','创建、预览、渲染Motion Canvas原生矢量动画，或抽取实际视频单帧。保留原生时间事件、矢量形状、公式和代码动画；导出文件可以接入Remotion/FFmpeg合成。',{action:{type:'string',enum:['create','preview','render','frame','close-preview'],required:true},name:{type:'string'},project:{type:'string',description:'作品根目录内的项目名或绝对路径'},projectId:{type:'string'},width:{type:'integer'},height:{type:'integer'},fps:{type:'number'},time:{type:'number'}},async(a,e)=>{a={...a,project:a.project??a.projectId};if(a.action==='create')return createMotion(a.name);if(a.action==='preview')return motionPreview(a.project);if(a.action==='close-preview')return closeMotion();if(a.action==='render')return renderMotion(a.project,{...a,signal:e.signal});const {motionProject}=await import('./workers.mjs?revision=selftest1');const p=motionProject(a.project),file=path.join(p,'out/preview.mp4'),image=path.join(p,'out/frame-preview.png');if(!Number.isFinite(a.time??0)||(a.time??0)<0)throw new Error('抽帧秒数无效');await runProcess(mediaBinary('ffmpeg'),['-v','error','-y','-ss',String(a.time??0),'-i',file,'-frames:v','1',image],{signal:e.signal});return {file:image,time:a.time??0,attachedImages:[await ctx.attachments.saveImage({data:fs.readFileSync(image),mediaType:'image/png',name:'motion-frame.png'})]};});
 tool('whale_comment_voice','对评论草稿给出可复核的总结腔、升华、过度联想和证据类型提示；不输出AI概率，不自动改稿、发送或阻拦评论。',{text:{type:'string',required:true},anchor:{type:'string'},evidenceKind:{type:'string',enum:['frame','video','audio','transcript','comments','metadata','unknown']},replyTo:{type:'string'}},inspectComment);
 ctx.effect(()=>{const t=setInterval(()=>void status().catch(()=>{}),15000);t.unref?.();setTimeout(()=>void status().catch(()=>{}),2000).unref?.();return()=>{disposed=true;clearInterval(t);closeMotion()}});
}

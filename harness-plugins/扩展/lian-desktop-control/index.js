import fs from 'node:fs';
import path from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {DesktopClient,renderResult,attachScreenshot} from './client.mjs?revision=20261027-focus2';
import {reliableFill} from './browser-fill.mjs?revision=20261027-input3';
import {audioCaptureClient} from './audio-capture.mjs?revision=20261028-growth3';
import {captureAV} from './av-sync.mjs?revision=20261027-growth2';

const root=path.dirname(fileURLToPath(import.meta.url));
const sdk=path.join(path.dirname(process.execPath),'resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-tools/lib/index.js');
const {defineTool}=await import(pathToFileURL(sdk).href);
export const name='lian-desktop-control';
export const inject=['tools','skills','attachments'];
export function apply(ctx,config={}) {
  const stateDir=path.join(process.env.DSH_HOME||path.join(homedir(),'.dsh'),'lian-desktop-control');
  const healthFile=path.join(stateDir,'health.json');
  const client=new DesktopClient({root,stateDir,python:config.python??'E:/DSH/插件/desktop-control-runtime/Scripts/python.exe'});
  const audio=audioCaptureClient({root,stateDir,python:config.python??'E:/DSH/插件/desktop-control-runtime/Scripts/python.exe'});
  const tools=[];let closed=false,probe=null,queue=Promise.resolve();
  // One active action per desktop; failed requests do not poison the queue.
  function serial(fn){const pending=queue.then(fn,fn);queue=pending.catch(()=>{});return pending;}
  function register(toolName,description,parameters,fn,{concurrent=false,timeoutMs=25000}={}){
    tools.push(toolName);
    ctx.effect(()=>ctx.tools.register(defineTool({name:toolName,description,parameters,
      output:{schema:{type:'string'},render:renderResult},timeoutMs,
      async execute(args,exec){
        const run=async()=>{
          if(exec.signal?.aborted)throw exec.signal.reason;
          const result=await fn(args,exec);
          return JSON.stringify(await attachScreenshot(ctx.attachments,result));
        };
        return concurrent?run():serial(run);
      }})));
  }
  const windowId={type:'string',required:true,description:'从whale_desktop_windows返回的windowId，含窗口句柄与进程号'};
  const mode={type:'string',enum:['window','screen'],description:'默认window使用PrintWindow；黑屏时用screen截取前台窗口所在屏幕区域（可能包含覆盖物）'};
  register('whale_desktop_windows','枚举当前Windows桌面的可见窗口、进程、位置和前台状态；用返回的windowId选择准确对象。',{},(_a,e)=>client.request({op:'windows'},{signal:e.signal}));
  register('whale_desktop_observe','观察指定桌面窗口，直接返回可见图片附件及坐标。activate=true可恢复并置前；普通观察不抢焦点。窗口黑屏可尝试mode=screen。',{windowId,activate:{type:'boolean'},mode,region:{type:'object',additionalProperties:false,properties:{x:{type:'integer'},y:{type:'integer'},width:{type:'integer'},height:{type:'integer'}},description:'局部高清观察：相对整个窗口左上角的物理像素矩形；返回图片像素用于后续动作。'},maxDimension:{type:'integer',description:'256..1280；默认1280，细节用region裁剪，不能混用窗口与图片坐标'},includeControls:{type:'boolean',description:'补充传统Windows子控件文字，不等同于完整UIA/OCR'}},(a,e)=>client.request({op:'observe',...a},{signal:e.signal}));
  register('whale_desktop_cursor','只读查询当前真实鼠标位置，不移动、不点击、不激活窗口；暂停输入时也可读。后台10Hz仅保留100点内存，不唤醒模型。给observationId会按对应图片几何映射，窗口变化返回失效。',{windowId:{type:'string'},observationId:{type:'string'}},(a,e)=>client.request({op:'cursor',...a},{signal:e.signal}),{concurrent:true});
  register('whale_desktop_precision_drag','在前台窗口中抓住可见对象，以局部纹理跟踪及实际光标反馈小步拖动。x/y/width/height选新截图中对象内部独特且稳定的纹理；toX/toY是该纹理中心的目标，不是鼠标落点。grabX/Y默认纹理中心，可另选实际抓取点。保持抓取偏移，先验证对象跟随；低置信度/失焦/接手即释放，最多12秒40步。不能证明游戏吸附，检查返回截图。',{
    windowId,observationId:{type:'string',required:true},x:{type:'integer',required:true},y:{type:'integer',required:true},width:{type:'integer',required:true},height:{type:'integer',required:true},
    grabX:{type:'number'},grabY:{type:'number'},toX:{type:'number',required:true},toY:{type:'number',required:true},tolerance:{type:'number',description:'图片像素0.5..10默认2'},seconds:{type:'number',description:'0.5..12默认8'},threshold:{type:'number',description:'0.7..0.99默认0.85'}
  },(a,e)=>client.request({op:'precision-drag',...a},{signal:e.signal,timeoutMs:20000}),{timeoutMs:25000});
  register('whale_desktop_activate','显式恢复并激活指定窗口，复核实际前台HWND后返回新截图。Windows拒绝时说明尝试与下一步，不发送点击/文字；普通截图成功不表示能操作。',{windowId,mode},(a,e)=>client.request({op:'observe',...a,activate:true},{signal:e.signal}));
  register('whale_browser_fill','可靠填写现有BrowserSkill任务窗口的输入框：等待编辑区稳定，原生fill后读回；失败时唯一对应浏览器窗口并显式激活，核对编辑焦点后用真实键盘降级，再读回。只填草稿，不回车/发送，不开启抓包。请用当前实际CSS编辑根元素，如contenteditable=true，旧@e引用不适用于本工具。',{session:{type:'string',required:true},selector:{type:'string',required:true},value:{type:'string',required:true},tabId:{type:'integer'},readyTimeoutMs:{type:'integer',description:'正式编辑框就绪等待，默认15000、最多30000毫秒；不对占位框盲打'}},(a,e)=>reliableFill(a,{desktop:client,signal:e.signal}),{timeoutMs:90000});
  register('whale_desktop_act','操作指定前台窗口并返回操作后新截图。click/move/drag/scroll坐标使用最近观察图片及observationId；key支持Ctrl+A、Right等，holdMs支持短时按住；type发送Unicode文字。F8可紧急暂停。',{
    windowId,action:{type:'string',required:true,enum:['click','move','drag','scroll','key','type']},
    observationId:{type:'string'},x:{type:'number'},y:{type:'number'},toX:{type:'number'},toY:{type:'number'},
    button:{type:'string',enum:['left','right','middle']},count:{type:'integer'},key:{type:'string'},text:{type:'string'},
    holdMs:{type:'number',description:'单次0至5000毫秒；游戏长按后会自动释放并观察。拖动默认至少150毫秒'},
    scrollX:{type:'integer',description:'向右为正，常用120'},scrollY:{type:'integer',description:'向上为正，向下为负，常用-120'},mode
  },(a,e)=>client.request({op:'act',...a},{signal:e.signal}));
  register('whale_desktop_control','暂停、恢复或释放电脑输入。pause/release立即发出本地暂停信号；恢复必须显式resume。',{
    command:{type:'string',required:true,enum:['pause','resume','release']}
  },async(a,e)=>{if(a.command!=='resume')client.pause();return client.request({op:'control',...a},{signal:e.signal})},{concurrent:true});
  register('whale_desktop_batch','按本地时间线平滑移动、拖动、相对移动和组合键按住/释放；一次最多128步/15秒，结束或失焦释放全部输入，不逐步调用模型。atMs为最早开始时间，事件顺序执行，actualMs记录实际开始；不是硬实时。坐标沿用新截图。F8或用户实际键鼠接手即停止。',{
    windowId,observationId:{type:'string',required:true},mode,
    events:{type:'array',required:true,items:{type:'object',additionalProperties:false,properties:{action:{type:'string',enum:['move','relative','keydown','keyup','buttondown','buttonup','type','scroll']},atMs:{type:'number'},durationMs:{type:'number'},x:{type:'number'},y:{type:'number'},dx:{type:'number'},dy:{type:'number'},key:{type:'string'},text:{type:'string'},button:{type:'string',enum:['left','right','middle']},scrollX:{type:'number'},scrollY:{type:'number'}}}}
  },(a,e)=>client.request({op:'batch',...a},{signal:e.signal,timeoutMs:25000}),{timeoutMs:30000});
  register('whale_desktop_follow','对最近截图里选出的有纹理矩形目标做短时本地模板跟踪、移动或点击，最多15秒、请求最高60Hz；主屏幕内screen模式默认DXGI，真实频率看actualHz；匹配丢失/失焦/接手即停。适合固定外观的小型游戏目标，不能当成通用游戏智能或人物身份识别。默认只跟随，不点击。',{
    windowId,observationId:{type:'string',required:true},x:{type:'integer',required:true},y:{type:'integer',required:true},width:{type:'integer',required:true},height:{type:'integer',required:true},seconds:{type:'number'},hz:{type:'number'},captureBackend:{type:'string',enum:['dxgi','gdi']},threshold:{type:'number'},click:{type:'boolean'},mode
  },(a,e)=>client.request({op:'follow',...a},{signal:e.signal,timeoutMs:25000}),{timeoutMs:30000});
  register('whale_desktop_record','按需录制已选前台窗口的短视频供动作分析，默认5秒12fps、最多60秒60fps；screen默认DXGI，跨屏或负坐标请显式用captureBackend=gdi；返回实际帧时间、文件和覆盖范围，audio=true时同时短录系统播放声音并返回共同主机时钟映射（最多30秒），不常驻录屏。失焦/F8/用户接手提前结束并标partial。',{
    windowId,audio:{type:'boolean'},seconds:{type:'number'},fps:{type:'number'},captureBackend:{type:'string',enum:['dxgi','gdi']},mode
  },(a,e)=>a.audio?captureAV(a,{client,audio,signal:e.signal}):client.request({op:'record',...a},{signal:e.signal,timeoutMs:75000}),{timeoutMs:80000});
  register('whale_audio_capture','按需采集Windows正在播放的声音，默认8秒、最多30秒，完成后停止。默认system-playback为系统输出混音，可能有其他应用声音；显式source=microphone才录麦克风。status查设备，stop停止本插件本次采集；文件交whale_hear继续听，不以文件存在表示已听懂。',{
    action:{type:'string',required:true,enum:['status','record','stop']},source:{type:'string',enum:['system-playback','microphone']},seconds:{type:'number'},device:{type:'string'}
  },(a,e)=>audio.request(a,e.signal),{concurrent:true,timeoutMs:50000});
  async function health(){
    let status;try{status=await client.request({op:'status'},{timeoutMs:6000})}catch(error){status={error:error.message}}
    const activeSkill=await ctx.skills.get('lian-desktop-control',{cwd:'E:/LianHome'});
    const value={plugin:name,version:'1.5.0',checkedAt:new Date().toISOString(),harnessPid:process.pid,registered:true,tools:[...tools],skill:'lian-desktop-control',skillActive:activeSkill?.path===path.join(root,'skills','lian-desktop-control','SKILL.md'),backend:status,nativeProbe:probe};
    if(!closed){const {cursor,...backendHealth}=status;fs.writeFileSync(healthFile,JSON.stringify({...value,backend:backendHealth,cursorSampler:cursor?.sampler?{running:cursor.sampler.running,requestedHz:cursor.sampler.requestedHz,samplesTaken:cursor.sampler.samplesTaken}:undefined},null,2));}
    return value;
  }
  register('whale_desktop_status','检查桌面控制后端、暂停状态、按键释放与Harness插件加载情况。',{},health,{concurrent:true});
  const skillRoot=path.join(root,'skills','lian-desktop-control');
  ctx.skills.register({name:'lian-desktop-control',description:'使用Windows窗口截图、真实鼠标和键盘操作桌面软件或图形游戏，检查交互效果；网页任务优先使用已有浏览器工具。',source:'plugin',provider:name,path:path.join(skillRoot,'SKILL.md'),resourceBase:{kind:'directory',path:skillRoot},content:fs.readFileSync(path.join(skillRoot,'SKILL.md'),'utf8'),metadata:{},invocation:{modelInvocable:true,userInvocable:true}});
  ctx.effect(()=>{
    const initial=setTimeout(async()=>{
      try{
        const result=await ctx.tools.execute({name:'whale_desktop_windows',arguments:{},callId:'desktop-native-discovery-probe',signal:AbortSignal.timeout(10000)});
        const value=JSON.parse(result.content.filter(x=>x.type==='text').map(x=>x.text).join('\n'));
        probe={pass:!result.isError&&Array.isArray(value.windows),tool:'whale_desktop_windows',windowCount:value.windows?.length,modelCalls:0};
        const targetFile=path.join(root,'acceptance-target.json');
        if(fs.existsSync(targetFile)){
          const target=JSON.parse(fs.readFileSync(targetFile,'utf8'));
          const fixture=value.windows.find(w=>w.windowId===target.windowId&&w.pid===target.pid&&w.title==='小涟桌面控制验收 · 独立测试窗口');
          if(fixture&&target.expiresAt>Date.now()){
            await ctx.tools.execute({name:'whale_desktop_control',arguments:{command:'resume'},callId:'desktop-acceptance-resume',signal:AbortSignal.timeout(10000)});
            const imageResult=await ctx.tools.execute({name:'whale_desktop_observe',arguments:{windowId:fixture.windowId},callId:'desktop-native-image-probe',signal:AbortSignal.timeout(10000)});
            const imageBlock=imageResult.content.find(x=>x.type==='image');
            probe.imageAttachment={pass:!imageResult.isError&&Boolean(imageBlock?.attachment?.attachmentId),tool:'whale_desktop_observe',windowId:fixture.windowId,width:imageBlock?.attachment?.width,height:imageBlock?.attachment?.height,modelCalls:0};
          }
        }
      }catch(error){probe={pass:false,error:error.message}}
      await health();
    },1500);initial.unref?.();
    const timer=setInterval(()=>void health().catch(e=>ctx.logger.warn(e.message)),30000);timer.unref?.();
    return()=>{closed=true;clearTimeout(initial);clearInterval(timer);audio.close();void client.close()};
  });
  ctx.logger.info('小涟桌面观察与鼠标键盘工具已加载，F8紧急暂停。');
}

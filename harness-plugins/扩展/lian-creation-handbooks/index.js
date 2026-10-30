import fs from 'node:fs';
import path from 'node:path';
import {homedir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {definition,readChapter,chapters,skillRoot,packageRoot} from './knowledge.mjs';
const sdk=path.join(path.dirname(process.execPath),'resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-tools/lib/index.js');
const {defineTool}=await import(pathToFileURL(sdk).href);
export const name='lian-creation-handbooks';
export const inject=['skills','tools'];
export function apply(ctx,config={}){
  ctx.skills.register(definition());
  function tool(name,description,parameters,execute){ctx.effect(()=>ctx.tools.register(defineTool({name,description,parameters,output:{schema:{type:'string'},render:(_a,v)=>[{type:'text',text:v}]},async execute(args){return JSON.stringify(await execute(args));}})));}
  tool('whale_creation_read','按需读取V4.6.1纯创作方法与案例：workflow共同方法、literature文学对白、visual视觉、video导演、platform当前Harness衔接。section可指定返回的章节标题。只读取本机资料，不调用生成服务。',{topic:{type:'string',enum:Object.keys(chapters),required:true},section:{type:'string'}},a=>readChapter(a.topic,a.section));
  const healthFile=config.healthFile??path.join(process.env.DSH_HOME||path.join(homedir(),'.dsh'),'lian-creation-handbooks-health.json');
  let closed=false,nativeToolProbe;
  async function report(){
    const active=await ctx.skills.get('creation-handbooks',{cwd:'E:/LianHome'});
    const catalog=await ctx.skills.list({cwd:'E:/LianHome'});
    const health={checkedAt:new Date().toISOString(),pid:process.pid,version:'4.6.1',plugin:name,registered:true,skillName:'creation-handbooks',activePath:active?.path,activeProvider:active?.provider,activeFromPlugin:active?.path===path.join(skillRoot,'SKILL.md'),visibleEntries:catalog.filter(s=>s.name==='creation-handbooks').length,chapters:Object.keys(chapters),tools:['whale_creation_read','whale_creation_status'],nativeToolProbe,personaIncluded:false,modelCalls:0,personaFilesModified:false,outputRulesModified:false,originalUserSkillPreserved:true,dataset:JSON.parse(fs.readFileSync(path.join(packageRoot,'dataset.json'),'utf8'))};
    if(!closed){fs.mkdirSync(path.dirname(healthFile),{recursive:true});fs.writeFileSync(healthFile,JSON.stringify(health,null,2));}
    return health;
  }
  tool('whale_creation_status','核对V4.6.1创作方法插件是否生效、实际选中的技能路径和去重结果，不调用模型。',{},report);
  async function probe(){
    try{
      const settings=JSON.parse(fs.readFileSync('E:/DSH/涟的探索/settings.json','utf8'));
      const agent=ctx.get('agents')?.get(settings.ownerSessionId);
      const result=await ctx.tools.execute({name:'whale_creation_read',arguments:{topic:'literature',section:'场景和中文交流'},callId:'creation-handbooks-install-probe',signal:AbortSignal.timeout(5000),...(agent?{agent}:{})});
      const texts=(result.content??[]).filter(b=>b.type==='text').map(b=>b.text).join('\n');
      nativeToolProbe={calledTool:'whale_creation_read',topic:'literature',section:'场景和中文交流',pass:!result.isError&&texts.includes('对白先处理对方刚说的话'),returnedCharacters:texts.length,modelRequests:0,paidRequests:0};
    }catch(error){nativeToolProbe={pass:false,error:String(error.message),modelRequests:0,paidRequests:0};}
  }
  ctx.effect(()=>{const run=()=>void report().catch(e=>ctx.logger.warn('创作方法库状态检查：'+e.message));const t=setTimeout(()=>void probe().then(run),1500);t.unref?.();const interval=setInterval(run,30000);interval.unref?.();return()=>{closed=true;clearTimeout(t);clearInterval(interval)}});
  ctx.logger.info('V4.6.1创作方法库已接入：沿用creation-handbooks入口，只加载方法与案例。');
}

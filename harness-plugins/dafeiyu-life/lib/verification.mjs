import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {atomicJSON} from './store.mjs';
import {reserveMicros,observeUsageCost,hasFinalUsage} from './policy.mjs';

// An owner-created local request triggers a fixed, harmless integration check.
// It cannot accept arbitrary prompts, run external tools, publish, or shut down.
export async function verifyHost(store,modelCall){
  const requestFile=path.join(store.root,'verification-request.json');
  if(!fs.existsSync(requestFile))return;
  const input=JSON.parse(fs.readFileSync(requestFile,'utf8'));
  if(input.operation!=='verify-native-model-and-tool'||!/^owner-check-[0-9-]{10,30}$/.test(input.id??''))throw new Error('未知验收请求');
  const file=path.join(store.root,'验收结果.json');
  if(fs.existsSync(file)&&JSON.parse(fs.readFileSync(file,'utf8')).id===input.id)return;
  const result={id:input.id,status:'running',startedAt:new Date().toISOString(),modelCalls:0,toolEchoPassed:false,realShutdowns:0,publications:0};
  atomicJSON(file,result); // Crash recovery never repeats a possibly charged check.
  const messages=[{role:'user',content:[{type:'text',text:'这是本机组件验收。请先调用verification_echo工具，value必须是HARNESS_TOOL_OK。收到工具结果后只回复HARNESS_MODEL_OK。不要调用其他工具。'}]}];
  const tools=[{name:'verification_echo',description:'本机验收回声，无外部动作。',parameters:{type:'object',properties:{value:{type:'string'}},required:['value'],additionalProperties:false}}];
  try{
    for(let step=0;step<3;step++){
      const request={model:'deepseek-flash',maxTokens:512,messages,tools};
      const id=randomUUID(),day=store.reserve(reserveMicros(request,store.config),id);
      atomicJSON(path.join(store.root,'私密草稿',`验收请求-${input.id}-${step}.json`),request);
      let response;result.modelCalls++;
      try{response=await modelCall(request,new AbortController().signal);}
      catch(e){store.settle(day,id,null);throw e;}
      store.settle(day,id,hasFinalUsage(response)?observeUsageCost(response.usage):null);
      if(!response.finish||['error','aborted'].includes(response.finish.kind))throw new Error('模型验收未完成：'+JSON.stringify(response.finish));
      messages.push(response.message);
      const calls=response.message.content.filter(b=>b.type==='tool-call');
      if(!calls.length){
        const text=response.message.content.filter(b=>b.type==='text').map(b=>b.text).join('');
        if(result.toolEchoPassed&&text.trim()==='HARNESS_MODEL_OK'){result.status='passed';break;}
        throw new Error('验收未收到预期的工具调用或最终回声');
      }
      for(const call of calls){
        const args=JSON.parse(call.arguments);
        if(call.name!=='verification_echo'||args.value!=='HARNESS_TOOL_OK')throw new Error('验收工具或参数不匹配');
        result.toolEchoPassed=true;
        messages.push({role:'tool',toolCallId:call.id,source:{kind:'tool',callId:call.id},content:[{type:'text',text:'HARNESS_TOOL_OK'}],isError:false});
      }
    }
    if(result.status!=='passed')throw new Error('验收达到最多三次请求仍未完成');
  }catch(e){result.status='failed';result.error=String(e.message??e).slice(0,700);}
  result.finishedAt=new Date().toISOString();atomicJSON(file,result);
  store.state.lastVerification=result;store.save();store.audit('host-verification',result);
  return result;
}

export async function verifyBrowser(store,browser,owner){
  const requestFile=path.join(store.root,'browser-verification-request.json');
  if(!fs.existsSync(requestFile))return;
  const input=JSON.parse(fs.readFileSync(requestFile,'utf8'));
  if(input.operation!=='verify-bound-browser-read'||!/^owner-check-[0-9-]{10,30}$/.test(input.id??''))throw new Error('未知浏览器验收请求');
  const file=path.join(store.root,'浏览器验收结果.json');
  if(fs.existsSync(file)&&JSON.parse(fs.readFileSync(file,'utf8')).id===input.id)return;
  const result={id:input.id,status:'running',ownerConnected:!!owner,startedAt:new Date().toISOString(),publications:0,realShutdowns:0};
  atomicJSON(file,result);
  try{
    if(!owner)throw new Error('尚未连接原有用户会话');
    await browser.call('browser_tabs',{action:'list'},owner,new AbortController().signal);
    result.status='passed';result.readOnlyTool='browser_tabs';
  }catch(e){result.status='failed';result.error=String(e.message??e).slice(0,700);}
  result.finishedAt=new Date().toISOString();atomicJSON(file,result);store.audit('browser-verification',result);
  return result;
}
export async function verifyBilibili(store,reader){
  const request=path.join(store.root,'bilibili-verification-request.json');if(!fs.existsSync(request))return;
  const input=JSON.parse(fs.readFileSync(request,'utf8'));
  if(input.operation!=='verify-bilibili-read-only'||!/^owner-check-[0-9-]{10,30}$/.test(input.id??''))throw new Error('未知B站只读验收请求');
  const file=path.join(store.root,'B站宿主验收.json');if(fs.existsSync(file)&&JSON.parse(fs.readFileSync(file,'utf8')).id===input.id)return;
  const result={id:input.id,status:'running',startedAt:new Date().toISOString(),publications:0,modelCalls:0,realShutdowns:0};atomicJSON(file,result);
  try{
    const r=await reader.search('视频剪辑',AbortSignal.timeout(60000));
    result.status='passed';result.search={items:r.items.length,mode:r.fallback?.mode??'bilibili-api'};
  }catch(e){result.status='failed';result.error=String(e.message??e).slice(0,350);}
  result.finishedAt=new Date().toISOString();atomicJSON(file,result);store.audit('bilibili-host-verification',result);return result;
}

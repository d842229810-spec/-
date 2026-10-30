import fs from 'node:fs';import {resolveOpenDesign} from './resolve.mjs';
import {Client} from '../shared-mcp-runtime/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {StdioClientTransport} from '../shared-mcp-runtime/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
import {Server} from '../shared-mcp-runtime/node_modules/@modelcontextprotocol/sdk/dist/esm/server/index.js';
import {StdioServerTransport} from '../shared-mcp-runtime/node_modules/@modelcontextprotocol/sdk/dist/esm/server/stdio.js';
import {ListToolsRequestSchema,CallToolRequestSchema} from '../shared-mcp-runtime/node_modules/@modelcontextprotocol/sdk/dist/esm/types.js';
const root='E:/DSH/插件/opendesign-runtime';let client,transport,connecting;
const health=(state,detail={})=>fs.writeFileSync(root+'/connection-health.json',JSON.stringify({state,at:new Date().toISOString(),pid:process.pid,...detail},null,2));
async function ensure(){
 if(client)return client;if(connecting)return connecting;
 connecting=(async()=>{let next,t;try{const spec=await resolveOpenDesign({start:true});const args=[...spec.args];if(!args.includes('--daemon-url'))args.push('--daemon-url',spec.daemonUrl);
 const env=Object.fromEntries(Object.entries({...process.env,...spec.env}).filter(([k,v])=>v!==undefined&&k!=='ELECTRON_RUN_AS_NODE'));
 next=new Client({name:'lian-opendesign-project-adapter',version:'1.2.0'});t=new StdioClientTransport({command:process.execPath,args,env,stderr:'inherit'});
 next.onclose=()=>{if(client===next){client=undefined;health('disconnected')}};await next.connect(t,{timeout:30000});client=next;transport=t;health('connected',{daemonUrl:spec.daemonUrl});return next;
 }catch(e){await next?.close().catch(()=>{});await t?.close().catch(()=>{});health('connection-failed',{error:e.message});throw e}finally{connecting=undefined}})();return connecting;
}
async function invoke(params){const c=await ensure();try{return await c.callTool(params,undefined,{timeout:600000})}catch(e){if(/not connected|closed/i.test(e.message)){if(client===c)client=undefined;await c.close().catch(()=>{});health('disconnected',{error:e.message});if(['list_projects','get_active_context'].includes(params.name))return (await ensure()).callTool(params,undefined,{timeout:30000});throw Error('OpenDesign连接中断，操作结果未知；请先查询项目状态，不自动重发写入。')}throw e}}
function classify(project){if(!project||typeof project!=='object'||!project.id)return project;let registry={};try{registry=JSON.parse(fs.readFileSync(root+'/project-purpose.json','utf8')).projects??{}}catch{}const row=registry[project.id],purpose=['test','production'].includes(row?.purpose)?row.purpose:'unknown';return {...project,projectPurpose:purpose,purposeLabel:{test:'验收测试工程',production:'正式创作工程',unknown:'未标用途'}[purpose],purposeSource:row?'local-explicit-project-registry':'unclassified',...(purpose==='test'?{notice:'联通/功能验收工程，不能据此声称已完成正式作品。'}:{})}}
function enrich(name,result){if(!['list_projects','get_project'].includes(name))return result;const convert=d=>{if(Array.isArray(d?.projects))return {...d,projects:d.projects.map(classify)};if(d?.project)return {...d,project:classify(d.project)};return classify(d)};return {...result,...(result.structuredContent?{structuredContent:convert(result.structuredContent)}:{}),content:result.content?.map(c=>{if(c.type!=='text')return c;try{return {...c,text:JSON.stringify(convert(JSON.parse(c.text)),null,2)}}catch{return c}})}}
const server=new Server({name:'lian-opendesign',version:'1.1.0'},{capabilities:{tools:{}}});
server.setRequestHandler(ListToolsRequestSchema,async()=>{const r=await (await ensure()).listTools();return {...r,tools:r.tools.map(t=>t.name==='list_projects'?{...t,description:t.description+' 返回中projectPurpose为本地明确登记的test/production/unknown；测试工程不代表正式创作成果。'}:t)}});
server.setRequestHandler(CallToolRequestSchema,r=>invoke(r.params).then(result=>enrich(r.params.name,result)));
await server.connect(new StdioServerTransport());process.stdin.once('end',()=>void Promise.resolve(client?.close()).then(()=>process.exit(0)));

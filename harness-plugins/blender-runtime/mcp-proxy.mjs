import fs from 'node:fs';import {spawn} from 'node:child_process';
import net from 'node:net';
import {Client} from '../shared-mcp-runtime/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import {StreamableHTTPClientTransport} from '../shared-mcp-runtime/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js';
import {Server} from '../shared-mcp-runtime/node_modules/@modelcontextprotocol/sdk/dist/esm/server/index.js';
import {StdioServerTransport} from '../shared-mcp-runtime/node_modules/@modelcontextprotocol/sdk/dist/esm/server/stdio.js';
import {ListToolsRequestSchema,CallToolRequestSchema} from '../shared-mcp-runtime/node_modules/@modelcontextprotocol/sdk/dist/esm/types.js';
const root='E:/DSH/插件/blender-runtime',url='http://127.0.0.1:9877/mcp';
async function alive(){return new Promise(resolve=>{const s=net.createConnection({host:'127.0.0.1',port:9877});let done=false;const finish=v=>{if(done)return;done=true;s.destroy();resolve(v)};s.once('connect',()=>finish(true));s.once('error',()=>finish(false));s.setTimeout(700,()=>finish(false))})}
if(!await alive()){
 const fd=fs.openSync(root+'/hub.log','a'),env={...process.env,BLENDER_MCP_DISABLE_TELEMETRY:'1',PYTHONUTF8:'1'};delete env.ELECTRON_RUN_AS_NODE;
 const child=spawn(root+'/.venv/Scripts/python.exe',[root+'/hub.py'],{cwd:root,env,windowsHide:true,detached:true,stdio:['ignore',fd,fd]});fs.closeSync(fd);child.on('error',e=>console.error(e.message));child.unref();
 let ready=false;for(let i=0;i<100;i++){if(await alive()){ready=true;break}await new Promise(r=>setTimeout(r,300))}if(!ready)throw new Error('共享Blender服务未就绪，请检查hub.log');
}
const upstream=new Client({name:'lian-shared-blender-proxy',version:'1.0.0'}),transport=new StreamableHTTPClientTransport(new URL(url));await upstream.connect(transport);
const server=new Server({name:'lian-blender',version:'1.0.0'},{capabilities:{tools:{}}});server.setRequestHandler(ListToolsRequestSchema,async()=>{const r=await upstream.listTools();return {...r,tools:r.tools.map(t=>{if(t.name!=='get_scene_info')return t;const fields=['location','rotation','scale','size','ground','parent','details','materials','modifiers','animation','hidden','children','topology','weights','settings'];return {...t,description:'场景查询。fields仅允许：'+fields.join(', ')+ '。默认location,size,children,hidden。placement/contents/health是上游文档分组标题，不是合法字段。例：fields:["location","materials"],limit:5。需要画面用look。\n'+t.description,inputSchema:{...t.inputSchema,properties:{...t.inputSchema.properties,fields:{type:'array',items:{type:'string',enum:fields},description:'选择具体字段；不接受placement/contents/health分组标题。'}}}}})}});server.setRequestHandler(CallToolRequestSchema,r=>upstream.callTool(r.params,undefined,{timeout:600000}));
await server.connect(new StdioServerTransport());process.stdin.once('end',()=>void upstream.close().then(()=>process.exit(0)));

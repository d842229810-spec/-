import fs from 'node:fs';
import path from 'node:path';
import { Client } from '../seedance-2-mcp-main/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport } from '../seedance-2-mcp-main/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
const root='E:/DSH/插件/dafeiyu-toolbox';
const test='E:/DSH/大肥鱼创作室/测试';
const ffbin='C:/Users/USER/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.2-full_build/bin';
const checks=[
  ['browser', 'E:/AI/codex/node.exe', [root+'/node_modules/@playwright/mcp/cli.js','--browser','chrome','--user-data-dir','E:/DSH/大肥鱼创作室/browser-profile','--output-dir',test], {name:'browser_navigate',arguments:{url:'about:blank'}}],
  ['ffkit',root+'/.venv/Scripts/python.exe',['-m','ff_kit.mcp.server'],{name:'ffkit_transcode',arguments:{input_path:test+'/source.mp4',output_path:test+'/ffkit-verified.mp4',resolution:'180x320'}}],
  ['tts',root+'/.venv/Scripts/python.exe',[root+'/tts_launcher.py'],{name:'tts',arguments:{text:'你好，我是大肥鱼。这是一段配音测试。',voice:'zh-CN-YunxiNeural',srt_enable:true}}],
  ['seedance','E:/AI/codex/node.exe',[root+'/seedance-launcher.mjs'],{name:'seedance_usage_guide',arguments:{}}]
];
const results=[];
for(const [name,command,args,call] of checks){
  const client=new Client({name:'dafeiyu-install-verifier',version:'1.0.0'});
  const transport=new StdioClientTransport({command,args,env:{...process.env,PYTHONUTF8:'1',PATH:ffbin+';'+process.env.PATH},stderr:'pipe'});
  let stderr='';
  try {
    await client.connect(transport,{timeout:30000});
    transport.stderr?.on('data',d=>{stderr+=d.toString();});
    const list=await client.listTools();
    const result=await client.callTool(call,undefined,{timeout:65000});
    const row={name,tools:list.tools.map(t=>t.name),toolCount:list.tools.length,isError:result.isError||false,resultPreview:JSON.stringify(result.content).slice(0,name==='seedance'?120:1600)};
    results.push(row);console.log(JSON.stringify(row));
    if(name==='browser') await client.callTool({name:'browser_close',arguments:{}},undefined,{timeout:15000});
  } catch(error){const row={name,error:String(error),stderr:stderr.slice(-1500)};results.push(row);console.log(JSON.stringify(row));}
  finally {await client.close().catch(()=>{});await transport.close().catch(()=>{});}
}
fs.writeFileSync(path.join(test,'mcp-verification.json'),JSON.stringify(results,null,2));

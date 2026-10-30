import fs from 'node:fs';import {spawn,execFile} from 'node:child_process';import {promisify} from 'node:util';
const exec=promisify(execFile),root='E:/DSH/插件/opendesign-runtime';
async function read(url){try{const r=await fetch(url+'/api/mcp/install-info',{signal:AbortSignal.timeout(1500)});if(!r.ok)return null;const d=await r.json();if(!d.cliExists||!d.command?.toLowerCase().startsWith('e:\\ai\\opendesign')&&!d.command?.toLowerCase().startsWith('e:/ai/opendesign'))return null;return d}catch{return null}}
export async function resolveOpenDesign({start=true}={}){
 let cached;try{cached=JSON.parse(fs.readFileSync(root+'/mcp-launch.json','utf8'));const live=await read(cached.daemonUrl);if(live)return live}catch{}
 let launched=false;
 for(let attempt=0;attempt<(start?30:1);attempt++){
  const ps="$ids=@(Get-Process | Where-Object { $_.Path -like 'E:\\AI\\OpenDesign\\*' } | Select-Object -ExpandProperty Id); @(netstat.exe -ano -p tcp | ForEach-Object { $parts=$_.Trim() -split '\\s+'; if($parts.Length -eq 5 -and $parts[1] -like '127.0.0.1:*' -and $parts[3] -eq 'LISTENING' -and $ids -contains [int]$parts[4]) { [int]($parts[1] -split ':')[-1] } }) | ConvertTo-Json -Compress";
  const {stdout}=await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',ps],{windowsHide:true,timeout:15000});let ports;try{ports=JSON.parse(stdout.trim()||'[]')}catch{ports=[]}if(!Array.isArray(ports))ports=[ports];for(const port of ports){const spec=await read('http://127.0.0.1:'+port);if(spec){fs.writeFileSync(root+'/mcp-launch.json',JSON.stringify(spec,null,2));return spec;}}
  if(!start)break;if(!launched){const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;const args=JSON.parse(cached?.env?.OD_MCP_BOOTSTRAP_ARGS??'["--headless"]'),command=cached?.env?.OD_MCP_BOOTSTRAP_COMMAND??'E:/AI/OpenDesign/Open Design.exe';const c=spawn(command,args,{env,windowsHide:true,detached:true,stdio:'ignore'});c.on('error',()=>{});c.unref();launched=true;}await new Promise(r=>setTimeout(r,700));
 }throw new Error('OpenDesign后台未就绪，请打开已安装的工作台后重试');
}

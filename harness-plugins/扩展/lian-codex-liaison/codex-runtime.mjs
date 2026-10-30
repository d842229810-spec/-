import fs from 'node:fs';import path from 'node:path';
export function resolveCodexExecutable({envPath=process.env.CODEX_APP_RUNTIME_CLI_PATH,binRoot=path.join(process.env.LOCALAPPDATA??'C:/Users/USER/AppData/Local','OpenAI/Codex/bin')}={}){
 const present=p=>{try{return typeof p==='string'&&fs.statSync(p).isFile();}catch{return false;}};
 if(present(envPath))return envPath;
 try{
  const hits=fs.readdirSync(binRoot).map(name=>path.join(binRoot,name,'codex.exe')).filter(present);
  hits.sort((a,b)=>fs.statSync(b).mtimeMs-fs.statSync(a).mtimeMs||a.localeCompare(b));
  if(hits.length)return hits[0];
 }catch{}
 return null;
}

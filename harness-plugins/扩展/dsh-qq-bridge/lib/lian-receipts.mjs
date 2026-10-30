import fs from 'node:fs';
import path from 'node:path';
export function openReceipts(root,now=Date.now()){
  const file=path.join(root,'qq-bridge-receipts.json');
  let data={version:1,startedAt:Math.floor(now/1000),items:{}};
  try{const old=JSON.parse(fs.readFileSync(file,'utf8'));if(old.version===1&&old.items)data=old;}catch{}
  function save(){fs.mkdirSync(root,{recursive:true});const keys=Object.keys(data.items);for(const k of keys.slice(0,Math.max(0,keys.length-2000)))delete data.items[k];const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(data,null,2));fs.renameSync(tmp,file);}
  save();
  return {startedAt:data.startedAt,has:key=>Object.hasOwn(data.items,key),claim(key){data.items[key]={state:'dispatching',at:Date.now()};save();},accepted(key){data.items[key]={state:'accepted',at:Date.now()};save();},release(key){delete data.items[key];save();}};
}

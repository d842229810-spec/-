import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {VoyageStore,atomicJSON} from './lib/store.mjs';
import {ROOT,validateConfig} from './lib/policy.mjs';
import {capabilityStatus} from './lib/health.mjs';
const store=new VoyageStore(ROOT),[command,...args]=process.argv.slice(2);
if(!command||command==='status')console.log(JSON.stringify(store.status(),null,2));
else if(command==='health')console.log(JSON.stringify(await capabilityStatus(store),null,2));
else if(command==='pause'){store.update({enabled:false});console.log('已暂停自由活动，并阻止待执行的自动关机。');}
else if(command==='resume'){store.update({enabled:true});console.log('已启用；只在配置时段内活动，不会立即在时段外开始。');}
else if(command==='window'){store.update({windowStart:args[0],windowEnd:args[1]});console.log('北京时间活动时段已改为 '+args[0]+'—'+args[1]);}
else if(command==='cancel-shutdown'){
  atomicJSON(path.join(ROOT,'cancel-shutdown.json'),{requestedAt:new Date().toISOString()});console.log('已请求取消本次关机倒计时。');
}else if(command==='bind-account'){
  const [platform,accountLabel,rulesVerifiedAt]=args;
  if(!store.config.publishPlatforms.includes(platform)||!accountLabel||!/^\d{4}-\d{2}-\d{2}$/.test(rulesVerifiedAt??''))throw new Error('用法：bind-account 平台域名 本人公开账号名 YYYY-MM-DD（实际核对平台规则的日期）');
  store.update({accountBindings:{...(store.config.accountBindings??{}),[platform]:{accountLabel,rulesVerifiedAt}}});console.log('已保存本人账号绑定，发布时还会核对当前页面。');
}else if(command==='approve-file'){
  const file=fs.realpathSync(args[0]),base=fs.realpathSync(store.config.publicOutbox);
  if(!file.toLowerCase().startsWith(base.toLowerCase()+path.sep))throw new Error('请先把审阅通过的文件放进公开待发目录');
  const target=path.join(ROOT,'文件公开许可.json'),data=fs.existsSync(target)?JSON.parse(fs.readFileSync(target,'utf8')):{};
  data[file]={sha256:createHash('sha256').update(fs.readFileSync(file)).digest('hex'),reviewedAt:new Date().toISOString(),reviewer:'local-owner'};atomicJSON(target,data);console.log('已记录本机用户的文件公开许可；文件变化后许可自动失效。');
}else {console.log('用法：status | health | pause | resume | window 00:00 05:00 | cancel-shutdown | bind-account 域名 账号名 YYYY-MM-DD | approve-file 文件');process.exitCode=1;}

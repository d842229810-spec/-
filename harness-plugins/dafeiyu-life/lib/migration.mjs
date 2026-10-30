import fs from 'node:fs';
import path from 'node:path';
import {atomicJSON} from './store.mjs';
export async function migrateFreeActivity(ctx,store){
  const marker=path.join(store.root,'旧自由活动迁移.json');if(fs.existsSync(marker))return JSON.parse(fs.readFileSync(marker,'utf8'));
  const catalog=await ctx.schedule.catalog();
  const candidates=catalog.filter(t=>t.status==='active'&&/^自由活动(?:\s|[·：:]|$)/.test(t.title));
  const backup={at:new Date().toISOString(),reason:'替换为00:00—05:00、每日6.66元的常驻控制器，避免旧定时器绕过账本',tasks:candidates,removed:[]};
  atomicJSON(path.join(store.root,'私密草稿','旧自由活动任务备份.json'),backup);
  for(const task of candidates){const result=await ctx.schedule.delete({sessionId:task.sessionId,id:task.id});if(!result.deleted)throw new Error('旧自由活动任务未能停止，先暂停新控制器以免重复计费');backup.removed.push({id:task.id,title:task.title,sessionId:task.sessionId});}
  if(candidates.length&&!store.config.ownerSessionId)store.update({ownerSessionId:candidates.at(-1).sessionId});
  atomicJSON(marker,{...backup,tasks:candidates.map(t=>({id:t.id,title:t.title,sessionId:t.sessionId})),preservedOtherTasks:catalog.length-candidates.length});
  return backup;
}

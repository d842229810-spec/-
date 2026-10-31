import fs from 'node:fs';
export const MAINTENANCE_LEASE='E:/DSH/安装验收/20261031-插件质量修复/maintenance-lease.json';
export function maintenanceStatus({file=MAINTENANCE_LEASE,now=new Date()}={}){
 try{const v=JSON.parse(fs.readFileSync(file,'utf8')),expires=Date.parse(v.expiresAt),at=now instanceof Date?now.getTime():Number(now);if(v.holdModelWakeups!==true||!Number.isFinite(expires)||!Number.isFinite(at))return {held:false,invalidLease:true};return expires>at?{held:true,expiresAt:new Date(expires).toISOString(),remainingMs:expires-at,reason:'local-maintenance-lease'}:{held:false};}catch(e){return {held:false,...(e.code==='ENOENT'?{}:{invalidLease:true})};}
}

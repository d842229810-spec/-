// Candidate only. Does not register with Harness or modify the running plugin.
export function selectBiliStream(rows,{highestQuality=false}={}){
  const ordered=[...(rows??[])].sort((a,b)=>highestQuality?((b.id??0)-(a.id??0)||(a.bandwidth??0)-(b.bandwidth??0)):((a.bandwidth??Infinity)-(b.bandwidth??Infinity)));
  for(const row of ordered){
    for(const raw of [row.baseUrl??row.base_url??row.url,...(row.backupUrl??row.backup_url??[])]){
      if(!raw)continue;
      try{const u=new URL(raw);if(u.protocol==='http:')u.protocol='https:';
        if(u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&/\.(bilivideo\.com|bilivideo\.cn|hdslb\.com)$/.test(u.hostname))return {url:u.href,bandwidth:row.bandwidth,quality:row.id,host:u.hostname};
      }catch{}
    }
  }
  throw new Error('没有找到可用的B站标准HTTPS备用媒体地址');
}

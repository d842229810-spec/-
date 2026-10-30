// Browser-origin and DNS-rebinding checks. This is transport protection;
// it does not change chat/content permissions or the bound QQ identities.
export function localRequestReason(req,{readOnly=false}={}){
 const headers=req.headers??{},host=String(headers.host??'').toLowerCase();
 if(!/^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d{1,5})?$/.test(host))return '需要本机地址';
 if(headers['sec-fetch-site']==='cross-site')return '拒绝外站请求本机设置接口';
 if(headers.origin){let origin;try{origin=new URL(headers.origin)}catch{return '无效来源'}
  if(!['http:','https:'].includes(origin.protocol)||origin.host.toLowerCase()!==host)return '来源与本机界面不一致';
 }
 if(!readOnly&&req.method!=='POST')return '设置变更需要POST';
 if(!readOnly&&!String(headers['content-type']??'').toLowerCase().startsWith('application/json'))return '设置变更需要JSON';
}

import {lianFetch} from '../dafeiyu-life/lib/bili-network.mjs';
const regularHosts=new Set(['bilibili.com','www.bilibili.com']);
function checked(raw){const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password||u.port||(!regularHosts.has(u.hostname)&&u.hostname!=='b23.tv'))throw Error('仅支持B站正规HTTPS视频和b23.tv短链');return u;}
export async function resolveBiliVideo(raw,{signal,transport=lianFetch}={}){
 const text=String(raw??'').trim();if(/^BV[A-Za-z0-9]{10}$/.test(text))return {bvid:text,url:'https://www.bilibili.com/video/'+text,page:1,shortLink:false};
 let u;try{u=checked(text)}catch{throw Error('请提供B站BV号、正规视频链接或b23.tv短链');}
 const shortLink=u.hostname==='b23.tv';
 for(let n=0;n<5;n++){
  signal?.throwIfAborted();const bvid=regularHosts.has(u.hostname)&&u.pathname.match(/^\/video\/(BV[A-Za-z0-9]{10})\/?$/)?.[1];
  if(bvid){const page=Number(u.searchParams.get('p')??1);if(!Number.isInteger(page)||page<1)throw Error('分P页码应为正整数');return {bvid,url:'https://www.bilibili.com/video/'+bvid,page,shortLink};}
  if(u.hostname!=='b23.tv')throw Error('短链未指向B站正规视频');
  if(!/^\/[A-Za-z0-9]+\/?$/.test(u.pathname))throw Error('b23.tv短链路径无效');
  const response=await transport(u.href,{redirect:'manual',signal,headers:{accept:'text/html'}});
  const location=response.headers?.get('location');try{await response.body?.cancel?.()}catch{}
  if(![301,302,303,307,308].includes(response.status)||!location)throw Error('B站短链未返回可核对的视频跳转');
  u=checked(new URL(location,u).href);
 }
 throw Error('B站短链跳转次数超过上限');
}

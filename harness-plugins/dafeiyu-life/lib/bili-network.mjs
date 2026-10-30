import https from 'node:https';import dns from 'node:dns/promises';import {Readable,Transform} from 'node:stream';import {createGunzip,createBrotliDecompress,inflateSync,inflateRawSync} from 'node:zlib';
import {isPublicIP} from './policy.mjs';
import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';
const require=createRequire('C:/Users/USER/.dsh/profiles/desktop/package.json'),{HttpsProxyAgent}=require('https-proxy-agent');
let proxyCache,proxyChecked=0;const agents=new Map();
export function validateLocalProxy(value){if(!value)return null;let u;try{u=new URL(value.includes('://')?value:'http://'+value)}catch{return null}if(!['http:','https:'].includes(u.protocol)||!['127.0.0.1','[::1]'].includes(u.hostname)||u.username||u.password||u.search||u.hash||u.pathname!=='/')return null;return u.href}
export function existingLocalProxy(){
 const env=process.env.HTTPS_PROXY||process.env.https_proxy||process.env.HTTP_PROXY||process.env.http_proxy;if(env)return validateLocalProxy(env);
 if(Date.now()-proxyChecked<30000)return proxyCache;proxyChecked=Date.now();proxyCache=null;
 if(process.platform==='win32')try{const key='HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings',enabled=execFileSync('reg.exe',['query',key,'/v','ProxyEnable'],{encoding:'utf8',windowsHide:true,timeout:3000});if(/REG_DWORD\s+0x1\b/i.test(enabled)){const raw=execFileSync('reg.exe',['query',key,'/v','ProxyServer'],{encoding:'utf8',windowsHide:true,timeout:3000}).match(/REG_SZ\s+(.+)/)?.[1]?.trim();const selected=raw?.includes('=')?raw.split(';').find(x=>x.startsWith('https='))?.slice(6):raw;proxyCache=validateLocalProxy(selected)}}catch{}
 return proxyCache;
}
export function publicAddress(answers){return answers.filter(a=>isPublicIP(a.address)).find(a=>a.family===4)??answers.find(a=>isPublicIP(a.address));}
const roots=['bilibili.com','b23.tv','hdslb.com','bilivideo.com','bilivideo.cn','biliimg.com'];
export function decodeDeflate(bytes){try{return inflateSync(bytes,{maxOutputLength:8*1024*1024})}catch(error){if(error.code!=='Z_DATA_ERROR')throw error;return inflateRawSync(bytes,{maxOutputLength:8*1024*1024})}}
export function mediaURL(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443')||!roots.some(d=>u.hostname===d||u.hostname.endsWith('.'+d)))throw new Error('不是B站公开媒体地址');return u}
export async function lianFetch(input,options={},redirects=0){
  const u=mediaURL(input),proxy=existingLocalProxy();let selected;
  if(!proxy){selected=publicAddress(await dns.lookup(u.hostname,{all:true}));if(!selected)throw new Error('媒体域名没有可固定连接的公网地址；已有本机代理未启用，可用已登录浏览器读取');}
  if(redirects>3)throw new Error('媒体重定向过多');let agent;if(proxy){if(!agents.has(proxy))agents.set(proxy,new HttpsProxyAgent(proxy));agent=agents.get(proxy);}
  const headers=Object.fromEntries(new Headers(options.headers).entries());if(u.hostname!=='api.bilibili.com')delete headers.cookie;delete headers.authorization;headers['accept-encoding']='identity';
  return new Promise((resolve,reject)=>{const req=https.request(u,{method:options.method??'GET',headers,signal:options.signal??AbortSignal.timeout(120000),...(agent?{agent}:{lookup:(_h,o,cb)=>o?.all?cb(null,[selected]):cb(null,selected.address,selected.family)})},res=>{
    if(res.statusCode>=300&&res.statusCode<400&&res.headers.location){res.resume();if(options.redirect==='error'){reject(new Error('媒体请求发生重定向'));return}resolve(lianFetch(new URL(res.headers.location,u),{...options,headers},redirects+1));return}
    let stream=res;const encoding=String(res.headers['content-encoding']??'').toLowerCase();if(encoding==='gzip')stream=res.pipe(createGunzip());else if(encoding==='br')stream=res.pipe(createBrotliDecompress());else if(encoding==='deflate'){
      const chunks=[];let compressed=0;stream=res.pipe(new Transform({transform(chunk,_e,done){compressed+=chunk.length;if(compressed>8*1024*1024)return done(new Error('压缩正文超过本次容量'));chunks.push(chunk);done()},flush(done){try{this.push(decodeDeflate(Buffer.concat(chunks)));done()}catch(e){done(e)}}}));
    }
    const media=/video|audio|octet-stream/i.test(String(res.headers['content-type'])),cap=media?128*1024*1024:8*1024*1024;let bytes=0;
    const bounded=new Transform({transform(chunk,_e,done){bytes+=chunk.length;if(bytes>cap){req.destroy();done(new Error('媒体读取超过本次容量'));return}done(null,chunk)}});stream.on('error',e=>bounded.destroy(e));stream.pipe(bounded);
    const outHeaders={...res.headers};delete outHeaders['content-encoding'];delete outHeaders['content-length'];delete outHeaders['set-cookie'];
    outHeaders['x-lian-network-route']=proxy?'owner-local-proxy':'pinned-public-address';resolve(new Response(Readable.toWeb(bounded),{status:res.statusCode,headers:outHeaders}));
  });req.on('error',reject);if(options.body)req.write(options.body);req.end()});
}

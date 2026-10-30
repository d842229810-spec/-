import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import dns from 'node:dns/promises';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {isPublicIP} from './policy.mjs';
import {decodeHTTPBody} from './sources.mjs';
const home=path.join(os.homedir(),'.dsh','lian-bilibili');
function secretWrite(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.'+randomUUID()+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value),{mode:0o600,flag:'wx'});fs.renameSync(tmp,file);}
export function authRecord(dir=home){try{const value=JSON.parse(fs.readFileSync(path.join(dir,'credentials.json'),'utf8'));return typeof value.sessdata==='string'&&value.sessdata.length>0&&!/[\r\n;]/.test(value.sessdata)&&typeof value.bili_jct==='string'&&value.bili_jct.length>0&&!/[\r\n;]/.test(value.bili_jct)&&/^\d+$/.test(value.uid)?value:null;}catch{return null;}}
export function bilibiliCookie(){return authRecord()?.sessdata??process.env.BILIBILI_SESSDATA;}
export function parseLoginCookies(lines,url=''){
  const pairs=new Map();try{for(const [k,v]of new URL(url).searchParams)pairs.set(k,v);}catch{}
  for(const line of lines??[]){const m=/^([^=;]+)=([^;]*)/.exec(line);if(m){let value;try{value=decodeURIComponent(m[2]);}catch{value=m[2];}pairs.set(m[1],value);}}
  const sessdata=pairs.get('SESSDATA'),bili_jct=pairs.get('bili_jct'),uid=pairs.get('DedeUserID');
  if(!sessdata||!bili_jct||!/^\d+$/.test(uid??''))throw new Error('登录回执缺少完整凭据，未保存');return {sessdata,bili_jct,uid};
}
export async function authGET(operation,key){
  if(!['generate','poll'].includes(operation)||operation==='poll'&&!/^[a-f0-9]{20,100}$/i.test(key??''))throw new Error('无效扫码操作');
  const u=new URL('https://passport.bilibili.com/x/passport-login/web/qrcode/'+operation);
  if(operation==='poll')u.searchParams.set('qrcode_key',key);else u.searchParams.set('source','main-fe-header');
  const answers=await dns.lookup(u.hostname,{all:true});if(!answers.length||answers.some(a=>!isPublicIP(a.address)))throw new Error('登录站点DNS校验失败');const selected=answers.find(a=>a.family===4)??answers[0];
  return new Promise((resolve,reject)=>{const req=https.get(u,{signal:AbortSignal.timeout(15000),headers:{'User-Agent':'Mozilla/5.0','Referer':'https://www.bilibili.com/'},lookup:(_h,opts,cb)=>opts?.all?cb(null,[selected]):cb(null,selected.address,selected.family)},res=>{
    if(res.statusCode!==200){res.resume();reject(new Error('登录服务返回HTTP '+res.statusCode));return;}
    const chunks=[];let size=0;res.on('data',c=>{size+=c.length;if(size>150000){req.destroy(new Error('登录回执过大'));return;}chunks.push(c);});res.on('error',()=>reject(new Error('登录回执读取失败')));
    res.on('end',()=>{try{const body=JSON.parse(decodeHTTPBody(Buffer.concat(chunks),String(res.headers['content-encoding']??''),150000));resolve({body,cookies:res.headers['set-cookie']??[]});}catch{reject(new Error('登录回执格式无效'));}});
  });req.on('error',()=>reject(new Error('登录请求中断或超时，请重新扫码')));});
}
export class BilibiliAuth{
  constructor({dir=home,request=authGET}={}){this.dir=dir;this.request=request;}
  status(){const auth=authRecord(this.dir);let pending;try{pending=JSON.parse(fs.readFileSync(path.join(this.dir,'pending.json'),'utf8'));}catch{}
    return {authenticated:!!auth,accountUid:auth?.uid??null,pending:!!pending&&Date.parse(pending.expiresAt)>Date.now(),qrImage:pending?.image??null};}
  async start(){
    const {body}=await this.request('generate');if(body.code!==0||!body.data?.url||!body.data?.qrcode_key)throw new Error('无法生成登录二维码');
    const u=new URL(body.data.url);if(u.protocol!=='https:'||!(u.hostname==='bilibili.com'||u.hostname.endsWith('.bilibili.com')))throw new Error('登录二维码目标不是B站');
    const require=createRequire(path.join(os.homedir(),'.dsh','profiles','desktop','package.json')),QRCode=require('qrcode');
    fs.mkdirSync(this.dir,{recursive:true});const image=path.join(this.dir,'login-'+randomUUID()+'.png');
    await QRCode.toFile(image,u.href,{width:420,margin:3,errorCorrectionLevel:'M'});
    const pending={key:body.data.qrcode_key,image,expiresAt:new Date(Date.now()+180000).toISOString()};secretWrite(path.join(this.dir,'pending.json'),pending);
    return {status:'waiting-scan',qrImage:image,expiresAt:pending.expiresAt,notice:'用手机B站扫码并确认；二维码仅在本机生成，不向外部二维码服务发送登录信息。'};
  }
  async poll(){
    let pending;try{pending=JSON.parse(fs.readFileSync(path.join(this.dir,'pending.json'),'utf8'));}catch{throw new Error('没有待确认的扫码会话');}
    if(Date.parse(pending.expiresAt)<=Date.now())return {status:'expired'};
    const {body,cookies}=await this.request('poll',pending.key);if(body.code!==0)throw new Error('登录确认服务异常');
    if(body.data?.code===86101)return {status:'waiting-scan'};if(body.data?.code===86090)return {status:'scanned-awaiting-confirmation'};if(body.data?.code===86038)return {status:'expired'};
    if(body.data?.code!==0)throw new Error('登录尚未成功，未保存凭据');
    const value=parseLoginCookies(cookies,body.data.url);secretWrite(path.join(this.dir,'credentials.json'),{...value,loggedInAt:new Date().toISOString()});
    secretWrite(path.join(this.dir,'pending.json'),{...pending,key:'',expiresAt:new Date(0).toISOString()});
    return {status:'authenticated',accountUid:value.uid,notice:'凭据已保存在本机私密目录，未返回给模型或公开输出。'};
  }
}

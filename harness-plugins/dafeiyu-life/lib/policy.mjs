import net from 'node:net';
export const ROOT = 'E:/DSH/涟的探索';
export const DEFAULTS = Object.freeze({
  enabled: true, timeZone: 'Asia/Shanghai', windowStart: '00:00', windowEnd: '05:00',
  dailyBudgetCny: 6.66, cooldownSeconds: 300, maxStepsPerRound: 8, maxOutputTokens: 4096,
  bilibiliCommentsEnabled: false, bilibiliCommentIntervalSeconds: 30,
  maxRequestBytes: 180000, maxRequestsPerDay: 1000, shutdownAfterActivity: false,
  shutdownDelaySeconds: 60, model: 'deepseek-flash',
  priceVerifiedAt: '2026-10-27', priceValidThrough: '2026-11-30',
  topics: ['视频叙事与剪辑', 'AI与科技知识', '普通人的生活观察', '创作者表达方法'],
  privateRoots: ['E:/LianHome', 'E:/DSH/大肥鱼创作室'],
  privateIdentifiers: ['阿水'],
  publishPlatforms: ['douyin.com', 'kuaishou.com', 'bilibili.com', 'tiktok.com', 'youtube.com'],
  publicOutbox: ROOT + '/公开待发',
});
export function beijingParts(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map(p => [p.type, p.value]));
  return {day: `${p.year}-${p.month}-${p.day}`, minute: +p.hour * 60 + +p.minute, second: +p.second};
}
export function clockMinute(value) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error('时间须为HH:MM');
  const [h,m] = value.split(':').map(Number); return h * 60 + m;
}
export function inWindow(config, now = new Date()) {
  const a=clockMinute(config.windowStart), b=clockMinute(config.windowEnd), m=beijingParts(now).minute;
  if(a===b) return false;
  return a < b ? m >= a && m < b : m >= a || m < b;
}
export function windowKey(config, now = new Date()) {
  const p=beijingParts(now), a=clockMinute(config.windowStart), b=clockMinute(config.windowEnd);
  if(a>b && p.minute<b) return beijingParts(new Date(now.getTime()-86400000)).day;
  return p.day;
}
export function millisecondsToEnd(config, now = new Date()) {
  if(!inWindow(config,now)) return 0;
  const p=beijingParts(now); let delta=clockMinute(config.windowEnd)-p.minute;
  if(delta<=0) delta+=1440;
  return delta*60000-p.second*1000-now.getMilliseconds();
}
export function validateConfig(config) {
  if(config.usageBilling!==undefined&&config.usageBilling!=='deepseek-flash-20261026')throw new Error('未知用量计价模式');
  if(typeof config.enabled!=='boolean'||typeof config.shutdownAfterActivity!=='boolean')throw new Error('启停和关机选项须为布尔值');
  if(!Number.isFinite(config.bilibiliCommentIntervalSeconds)||config.bilibiliCommentIntervalSeconds<30||config.bilibiliCommentIntervalSeconds>3600)throw new Error('B站评论最小间隔须为30至3600秒');
  if(typeof config.bilibiliCommentsEnabled!=='boolean')throw new Error('B站评论开关须为布尔值');
  if(!Array.isArray(config.topics)||config.topics.length===0||config.topics.length>20||config.topics.some(x=>typeof x!=='string'||!x.trim()||x.length>150))throw new Error('兴趣起点必须是有限的非空文本列表');
  clockMinute(config.windowStart);clockMinute(config.windowEnd);
  if(config.windowStart===config.windowEnd) throw new Error('活动起止时间不能相同');
  if(config.timeZone!=='Asia/Shanghai')throw new Error('当前时区固定为Asia/Shanghai');
  for(const [key,min,max] of [['dailyBudgetCny',0.01,6.66],['cooldownSeconds',30,3600],['maxStepsPerRound',2,16],['maxOutputTokens',512,4096],['maxRequestsPerDay',1,2000],['shutdownDelaySeconds',60,600],['maxRequestBytes',10000,180000]]) {
    if(!Number.isFinite(config[key])||config[key]<min||config[key]>max)throw new Error(`${key}超出允许范围`);
  }
  if(config.model!=='deepseek-flash') throw new Error('自主活动只使用已计价的deepseek-flash');
  return config;
}
// 身份证第 18 位是校验位；纯数字的长 ID（平台项目号、素材号）通常过不了校验。
// 这样既不放过真实证件号，也不会把「打开自己的项目」当成泄露隐私。
function hasValidIdNumber(s){
  const hits=s.match(/[1-9]\d{16}[\dXx]/g)??[];
  const w=[7,9,10,5,8,4,2,1,6,3,7,9,10,5,8,4,2], map='10X98765432';
  for(const hit of hits){
    const body=hit.slice(0,17);
    // 出生日期段必须像真的日期（1900–2015 年），平台 ID 例如 372645881386106880
    // 的中间一段是 2645881，年份不像，就不再误当证件号。
    const y=Number(body.slice(6,10)), m=Number(body.slice(10,12)), d=Number(body.slice(12,14));
    if(!(y>=1900&&y<=2015&&m>=1&&m<=12&&d>=1&&d<=31))continue;
    let sum=0;
    for(let i=0;i<17;i++)sum+=Number(body[i])*w[i];
    if(map[sum%11]===hit[17].toUpperCase())return true;
  }
  return false;
}
export function sensitiveReason(value, config=DEFAULTS, opts={}) {  const s=String(value??'');
  if(/(?:sk[-_][A-Za-z0-9_-]{12,}|Bearer\s+[A-Za-z0-9._-]{12,}|-----BEGIN .*PRIVATE KEY-----)/i.test(s))return '疑似密钥或访问令牌';
  if(/(?:api[_-]?key|password|passwd|sessionid|sessdata|authorization|cookie)\s*[=:：]\s*[^\s,，;；]{5,}/i.test(s))return '疑似凭据';
  // 只看"真的是证件号/手机号"的才拦。18 位纯数字在平台里大量存在（项目 ID、素材 ID），
  // 全拦会把「打开自己的项目」这种正常操作也挡了。身份证第 18 位是校验位，用它判定。
  if(/\b1[3-9]\d{9}\b/.test(s))return '疑似手机号';
  if(hasValidIdNumber(s))return '疑似身份证号';
  if(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(s))return '疑似私人邮箱';
  // 原先的 /i 会把 URL 里的 "https:" 当成"C 盘路径"：https 的 s: 后紧跟 // 就命中 [A-Z]:[\\/]。
  // 改成区分大小写、且前面不能紧跟字母数字，避免误伤所有 https 链接。
  if(/(?:file:\/\/|\\\\[^\s\\]+\\)/i.test(s)||/(?<![A-Za-z0-9])[A-Za-z]:[\\/]/.test(s))return '包含本机文件路径';
  if(/(?:家庭住址|身份证|银行卡号|验证码|登录密码|私人聊天记录)\s*[:：]/.test(s))return '疑似用户隐私字段';
  if(!opts.skipIdentifiers&&(config.privateIdentifiers??[]).some(x=>x&&s.includes(x)))return '包含用户私密称呼';
  return undefined;
}
export function assertSafeText(text, config=DEFAULTS, opts={}) {
  const reason=sensitiveReason(text,config,opts); if(reason)throw new Error('对外内容已拦截：'+reason);
}
export function isPublicIP(ip) {
  if(net.isIP(ip)===4){const b=ip.split('.').map(Number);
    return !(b[0]===0||b[0]===10||b[0]===127||b[0]>=224||(b[0]===100&&b[1]>=64&&b[1]<=127)||(b[0]===169&&b[1]===254)||(b[0]===172&&b[1]>=16&&b[1]<=31)||(b[0]===192&&(b[1]===168||b[1]===0))||(b[0]===198&&(b[1]===18||b[1]===19)));
  }
  if(net.isIP(ip)===6){const x=ip.toLowerCase();return !(x==='::'||x==='::1'||x.startsWith('fc')||x.startsWith('fd')||/^fe[89ab]/.test(x)||x.startsWith('ff')||x.includes('ffff:')||x.startsWith('2001:db8:'));}
  return false;
}
export function validatePublicURL(raw,config=DEFAULTS,{allowBiliSubtitleSignature=false}={}) {
  const u=new URL(raw); if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443'))throw new Error('仅允许无凭据的公网HTTPS链接');
  const host=u.hostname.replace(/^\[|\]$/g,'');
  if(host==='localhost'||host.endsWith('.local')||host.endsWith('.internal')||host.endsWith('.localhost')||(net.isIP(host)&&!isPublicIP(host)))throw new Error('禁止访问本机与内网地址');
  // 原来 /token|key|auth.../i 会把普通参数 keyword / search_key 之类也当成凭据。
  // 改成整词匹配：参数名必须是 key、api_key、access_token 这种独立词。
  for(const [key,value] of u.searchParams){
    const signedSubtitle=allowBiliSubtitleSignature&&key==='auth_key'&&u.hostname.endsWith('.hdslb.com')&&/^\/bfs\/(?:ai_)?subtitle\//.test(u.pathname)&&/^[a-zA-Z0-9_-]{1,512}$/.test(value);
    if(!signedSubtitle&&/(?:^|[_-])(?:token|apikey|key|auth|cookie|secret|password|session)(?:$|[_-])/i.test(key))throw new Error('链接带有凭据参数');
    // URL 参数里的纯数字是平台 ID（项目号/素材号），不是隐私文本：
    // 只查密钥与邮箱这类真的会外泄的东西，不按"数字像证件号"判定。
    if(!signedSubtitle&&!/^\d+$/.test(value))assertSafeText(value,config);
  }
  if(u.href.length>2200)throw new Error('链接过长');
  if(/\/(?:delete|logout|sendmessage|submitcomment)(?:\/|$)/i.test(u.pathname))throw new Error('不是只读资料链接');
  return u;
}
// Peak, uncached prices deliberately over-reserve the 00:00–05:00 off-peak tariff.
// No cache discount is credited. Two tokens per UTF-8 byte plus framing padding.
export function reserveMicros(request, config) {
  const bytes=Buffer.byteLength(JSON.stringify(request),'utf8');
  if(bytes>config.maxRequestBytes)throw new Error('本轮上下文达到上限，改在下一轮继续');
  if(!Number.isInteger(request.maxTokens)||request.maxTokens<1||request.maxTokens>config.maxOutputTokens)throw new Error('缺少可靠的输出上限');
  if(request.model!=='deepseek-flash')throw new Error('未知计价模型，已停止');
  if((request.messages??[]).some(m=>(m.content??[]).some(b=>!['text','reasoning','tool-call'].includes(b.type))))throw new Error('自主活动仅接受可计量的文本输入');
  return (bytes*2+8192)*2+request.maxTokens*8;
}
export function observeUsageCost(usage) {
  if(!usage||typeof usage!=='object')return null;
  // Native Harness counts uncached input, cache reads and cache writes separately.
  // Missing required fields or zero-filled error usage must never release money.
  const input=usage.inputTokens,output=usage.outputTokens,cache=usage.cacheReadTokens??0,write=usage.cacheWriteTokens??0;
  if(![input,output,cache,write].every(x=>Number.isSafeInteger(x)&&x>=0))return null;
  const total=input+output+cache+write;
  if(!Number.isSafeInteger(total)||total===0)return null;
  if(usage.totalTokens!==undefined&&usage.totalTokens!==total)return null;
  const cost=(input+cache+write)*2+output*8;
  if(!Number.isSafeInteger(cost))return null;
  return {inputTokens:input,outputTokens:output,cacheReadTokens:cache,cacheWriteTokens:write,peakUpperMicros:cost};
}
export function hasFinalUsage(response){return ['stop','tool-calls','max-tokens'].includes(response?.finish?.kind);}
export function platformOf(url,config=DEFAULTS) {
  const u=validatePublicURL(url,config);return config.publishPlatforms.find(h=>u.hostname===h||u.hostname.endsWith('.'+h));
}

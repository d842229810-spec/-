import {HOLIDAYS} from './holidays.mjs';
// Beijing time, no model calls. Unverified holidays never open a peak window.
export function communicationWindow(now=new Date(),holidays=HOLIDAYS){
 const ms=now instanceof Date?now.getTime():new Date(now).getTime();if(!Number.isFinite(ms))throw Error('INVALID_COMMUNICATION_TIME');
 const bj=new Date(ms+8*3600000),date=bj.toISOString().slice(0,10),day=bj.getUTCDay(),minute=bj.getUTCHours()*60+bj.getUTCMinutes();
 const holiday=holidays.find(h=>h.date===date&&h.source&&h.verified===true);
 const peak=day>0&&day<6&&!holiday&&((minute>=540&&minute<720)||(minute>=840&&minute<1080));
 const waitMinutes=peak?(minute<720?720:1080)-minute:0;
 return {allowed:!peak,timezone:'Asia/Shanghai',date,peak,holidayVerified:!!holiday,holidaySource:holiday?.source??null,nextAllowedAt:peak?new Date(ms+waitMinutes*60000-bj.getUTCSeconds()*1000-bj.getUTCMilliseconds()).toISOString():new Date(ms).toISOString(),reason:peak?'peak-hours':'off-peak',calendarPolicy:'Unknown weekday holidays use the stricter weekday window.'};
}
export function assertOffPeak(now,holidays){const w=communicationWindow(now,holidays);if(!w.allowed){const e=Error('COMMUNICATION_PEAK_HOURS: next allowed '+w.nextAllowedAt);e.window=w;throw e;}return w;}

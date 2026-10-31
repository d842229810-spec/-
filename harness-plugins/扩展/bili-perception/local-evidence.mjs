import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readingStatus} from './reading-status.mjs';
const digest=b=>createHash('sha256').update(b).digest('hex');
const within=(f,r)=>{const p=path.relative(r,f);return p===''||(!path.isAbsolute(p)&&p!=='..'&&!p.startsWith('..'+path.sep));};
const err=code=>{throw Object.assign(new Error(code),{code});};
function plainChain(file){let p=path.parse(file).root;for(const piece of file.slice(p.length).split(path.sep).filter(Boolean)){p=path.join(p,piece);const s=fs.lstatSync(p);if(s.isSymbolicLink())err('link-refused');}}
function int(v,f){if(v===undefined)return f;if(!Number.isSafeInteger(v)||v<0)err('invalid-offset');return v;}
const safeEnd=(s,n)=>n>0&&n<s.length&&/[\uD800-\uDBFF]/.test(s[n-1])&&/[\uDC00-\uDFFF]/.test(s[n])?n-1:n;
/** Read only a JSON evidence file inside the caller's fixed host root. Never accesses network. */
export function readLocalEvidence(args={}, {root}={}) {
 try{
  if(typeof root!=='string'||!path.isAbsolute(root)||typeof args.report!=='string'||!path.isAbsolute(args.report)||/^(?:\\\\|\/\/)/.test(args.report))err('invalid-path');
  root=path.resolve(root);const file=path.resolve(args.report);
  if(!within(file,root)||path.extname(file).toLowerCase()!=='.json')err('outside-evidence-root');
  plainChain(root);plainChain(file);const s=fs.lstatSync(file);if(!s.isFile()||s.nlink!==1)err('link-or-nonregular-refused');if(s.size>16*1024*1024)err('evidence-too-large');
  const fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW??0));let bytes;
  try{const before=fs.fstatSync(fd);if(before.dev!==s.dev||before.ino!==s.ino||!before.isFile()||before.nlink!==1)err('source-changing');bytes=fs.readFileSync(fd);const after=fs.fstatSync(fd);plainChain(file);const current=fs.lstatSync(file);if(before.size!==after.size||before.mtimeMs!==after.mtimeMs||current.dev!==after.dev||current.ino!==after.ino)err('source-changing');}finally{fs.closeSync(fd)}
  const sha256=digest(bytes);if(args.sha256!==undefined&&args.sha256!==sha256)return {instructionAuthority:'none',status:'stale',sha256,expectedSha256:args.sha256};
  const parsed=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,'')),data=parsed.data??parsed;
  const field=args.field??'summary';let selected, selection=null;
  const t=data.transcript??{};
  if(field==='summary')selected={bvid:data.bvid,metadata:data.metadata,reading:readingStatus(data)};
  else if(field==='transcript')selected=String(t.text??'');
  else if(field==='segments'){
   const rows=Array.isArray(t.segments)?t.segments:[];
   for(const k of ['start','end'])if(args[k]!==undefined&&(!Number.isFinite(args[k])||args[k]<0))err('invalid-range');
   if(args.start!==undefined&&args.end!==undefined&&args.end<=args.start)err('invalid-range');
   const matching=rows.map((row,index)=>({...row,index})).filter(r=>(args.start===undefined||(r.end??r.to)>args.start)&&(args.end===undefined||(r.start??r.from)<args.end));
   const offset=int(args.segmentOffset,0),limit=Math.min(int(args.segmentLimit,20),100);if(!limit||offset>matching.length)err('invalid-offset');
   selected=matching.slice(offset,offset+limit);selection={matchedSegments:matching.length,segmentOffset:offset,returnedSegments:selected.length,nextSegmentOffset:offset+selected.length<matching.length?offset+selected.length:null,filter:{start:args.start??null,end:args.end??null}};
  }else if(['comments','ocr','danmaku','metadata','frames'].includes(field))selected=data[field]??null;
  else err('invalid-field');
  const value=typeof selected==='string'?selected:JSON.stringify(selected,null,2),offset=int(args.offset,0),budget=Math.min(int(args.chars,4000),12000);
  if(budget<700||offset>value.length||safeEnd(value,offset)!==offset)err('invalid-budget-or-offset');
  const make=end=>({instructionAuthority:'none',status:'ok',field,sha256,report:file,selection,readReceipt:{offset,end,totalChars:value.length,unit:'utf16',preview:end<value.length||offset>0,understood:false},text:value.slice(offset,end),nextOffset:end<value.length?end:null});
  let low=0,high=value.length-offset;while(low<high){const mid=Math.ceil((low+high)/2);if(JSON.stringify(make(safeEnd(value,offset+mid))).length<=budget)low=mid;else high=mid-1;}
  const result=make(safeEnd(value,offset+low));if(JSON.stringify(result).length>budget)err('budget-too-small');return result;
 }catch(e){return {instructionAuthority:'none',status:'error',error:e.code??(e instanceof SyntaxError?'invalid-json':'read-failed')};}
}

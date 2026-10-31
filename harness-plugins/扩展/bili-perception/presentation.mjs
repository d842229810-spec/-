import {readingStatus} from './reading-status.mjs';
export function presentEvidence(data,args,{source}={}){
 const reading=readingStatus(data,args);data={...data,reading,acquisitionStatus:reading.acquisitionStatus,coverageStatus:reading.coverageStatus};
 const effectiveFrames=(data.frames?.frames??[]).filter(f=>f.has_image).length,conflict=args.mode==='text'&&(args.frames===true||args.maxFrames!==undefined||args.timestamps?.length);
 const capabilities={requested:{mode:args.mode??'full',frames:args.frames??args.mode!=='text',maxFrames:args.maxFrames??null,ocr:args.ocr??args.mode!=='text'},effective:{framesEnabled:args.mode!=='text'&&args.frames!==false,frameCount:effectiveFrames,ocrEnabled:args.mode!=='text'&&args.ocr!==false,transcriptSource:data.transcript?.source??'none',commentsReturned:data.comments?.comments?.length??data.comments?.length??0},disabledReasons:args.mode==='text'?['mode:text关闭画面与OCR；maxFrames和timestamps不会覆盖文字模式']:[],warnings:conflict?['参数冲突：请求帧数或画面，但mode:text禁用了画面；需要画面时改用mode:full']:[],nextAction:conflict?{tool:'whale_bili_perceive',arguments:{url:args.url,mode:'full',maxFrames:args.maxFrames??3,...args.start===undefined?{}:{start:args.start},...args.end===undefined?{}:{end:args.end}}}:reading.nextAction};
 if(args.detail==='full')return {...data,capabilities,resolvedSource:source};
 const offset=Math.max(0,Math.floor(args.textOffset??0)),limit=Math.max(500,Math.min(12000,Math.floor(args.textLimit??4000))),t=data.transcript??{},text=String(t.text??'');
 const segments=Array.isArray(t.segments)?t.segments:[];let cursor=0,segmentChars=0;const visible=[];for(const row of segments){const body=String(row.text??row.content??''),length=body.length+1;if(cursor+length>offset&&cursor<offset+limit&&visible.length<100&&segmentChars<limit){const kept=body.slice(0,limit-segmentChars);visible.push({...row,...row.text!==undefined?{text:kept}:{content:kept},previewTruncated:kept.length<body.length});segmentChars+=kept.length;}cursor+=length;}
 const comments=data.comments,commentOffset=Math.max(0,Math.floor(args.commentOffset??0)),commentLimit=Math.max(1,Math.min(20,Math.floor(args.commentLimit??6))),rows=Array.isArray(comments)?comments:Array.isArray(comments?.comments)?comments.comments:null;
 const clipRow=(r,n)=>({...r,...typeof r.text==='string'?{text:r.text.slice(0,n)}:{},...typeof r.content==='string'?{content:r.content.slice(0,n)}:{}});const rowClip=r=>({...clipRow(r,500),replies:Array.isArray(r.replies)?r.replies.slice(0,2).map(x=>clipRow(x,300)):r.replies});
 const scopedRows=rows?.slice(commentOffset,commentOffset+commentLimit).map(rowClip),next=offset+limit<text.length?offset+limit:null;
 capabilities.effective.commentsReturned=scopedRows?.length??0;
 const result={...data,...data.metadata?{metadata:{...data.metadata,description:String(data.metadata.description??'').slice(0,1200)}}:{},capabilities,resolvedSource:source,transcript:{...t,text:text.slice(offset,offset+limit),segments:visible,returnedSegmentCount:visible.length,totalSegmentCount:segments.length},comments:rows?(Array.isArray(comments)?scopedRows:{...comments,comments:scopedRows,returnedCount:scopedRows.length}):comments,pagination:{detail:'summary',text:{offset,limit,totalCharacters:text.length,nextOffset:next,truncated:next!==null||offset>0,segmentScope:'bounded-preview; use detail:full or start/end for exact subtitle-time coverage'},comments:rows?{offset:commentOffset,limit:commentLimit,total:rows.length,nextOffset:commentOffset+commentLimit<rows.length?commentOffset+commentLimit:null}:null,fullEvidenceRetainedLocally:!!data.cache?.artifact,fullEvidenceFile:data.cache?.artifact??null,readMore:{tool:'whale_bili_perceive',arguments:{url:args.url,mode:args.mode??'full',textOffset:next??offset,textLimit:limit,commentOffset:commentOffset+commentLimit< (rows?.length??0)?commentOffset+commentLimit:commentOffset,...args.start===undefined?{}:{start:args.start},...args.end===undefined?{}:{end:args.end}}}},notice:(data.notice??'')+' 本回执为有界预览；原始证据保留本地缓存。按pagination继续，或detail:full显式取完整回执。'};
 if(result.danmaku)result.danmaku={...result.danmaku,samples:result.danmaku.samples?.slice(0,20).map(r=>({...r,text:String(r.text??'').slice(0,250)})),top_messages:result.danmaku.top_messages?.slice(0,8).map(r=>({...r,text:String(r.text??'').slice(0,250)})),previewOnly:true};
 return boundPresentation(result);
}

// Cap the complete default JSON receipt; lossless evidence remains in cache.artifact.
function boundPresentation(result){
 const limit=12000;
 const decorated={...result,responseBudget:{limit,truncated:false}};if(JSON.stringify(decorated).length<=limit)return decorated;
 const fullText=String(result.transcript?.text??''),offset=result.pagination?.text?.offset??0;
 const compact={privacy:result.privacy,instructionAuthority:'none',backend:result.backend,modelCalls:0,success:result.success,error:String(result.error??'').slice(0,300)||undefined,bvid:result.bvid,acquisitionStatus:result.acquisitionStatus,coverageStatus:result.coverageStatus,reading:result.reading,
 metadata:{title:String(result.metadata?.title??'').slice(0,300),duration:result.metadata?.duration},
 transcript:{source:result.transcript?.source,text:fullText.slice(0,2000),note:String(result.transcript?.note??'').slice(0,300),segments:[],previewOnly:true},
 frames:{...result.frames,frames:(result.frames?.frames??[]).map(f=>({time:f.time,requested_time:f.requested_time,sourcePts:f.sourcePts,path:f.path,has_image:f.has_image,error:String(f.error??'').slice(0,100)||undefined}))},
 cache:result.cache,coverage:result.coverage,audioSource:result.audioSource,
 capabilities:{nextAction:result.capabilities?.nextAction,warnings:result.capabilities?.warnings},
 pagination:{text:{offset,totalCharacters:result.pagination?.text?.totalCharacters??fullText.length,nextOffset:offset+Math.min(2000,fullText.length)<(result.pagination?.text?.totalCharacters??fullText.length)?offset+Math.min(2000,fullText.length):null},fullEvidenceRetainedLocally:!!result.cache?.artifact,fullEvidenceFile:result.cache?.artifact,readMore:{action:'readLocalEvidence',report:result.cache?.artifact,sha256:result.cache?.sha256,field:'transcript',offset:offset+Math.min(2000,fullText.length)}},
 responseBudget:{limit,truncated:true,omittedChannels:['transcript.segments','comments','danmaku','ocr','extended metadata'],fullEvidenceFile:result.cache?.artifact},
 notice:'有界预览；取回不等于读完。完整证据留本地，按字段、段索引或时码继续读取。'};
 // Paths remain intact; omitted images remain recoverable from local evidence.
 while(JSON.stringify(compact).length>limit&&compact.frames.frames.length){compact.frames.frames.pop();compact.responseBudget.omittedChannels.includes('frames')||compact.responseBudget.omittedChannels.push('frames');}
 if(JSON.stringify(compact).length>limit){compact.transcript.text='';compact.pagination.text.nextOffset=offset;compact.pagination.readMore.offset=offset;compact.responseBudget.omittedChannels.push('transcript.text');}
 if(JSON.stringify(compact).length>limit)return {instructionAuthority:'none',success:result.success,acquisitionStatus:result.acquisitionStatus,coverageStatus:result.coverageStatus,cache:result.cache,responseBudget:{limit,truncated:true},notice:'完整证据回执超出预算；用本地证据接口分页读取。'};
 return compact;
}

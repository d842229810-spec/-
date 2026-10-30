export const SUBTITLE_VALIDATION_VERSION=2;

/** Observed Bilibili ai_subtitle/prod naming binds concatenated aid+cid to a hash. */
export function assessSubtitleTrack(rawUrl,{language,aid,cid}={}){
  const url=new URL(rawUrl.startsWith('//')?'https:'+rawUrl:rawUrl);
  const file=url.pathname.split('/').at(-1);
  if(language?.startsWith('ai-')&&url.pathname.includes('/bfs/ai_subtitle/prod/')){
    const prefix=String(aid)+String(cid);
    const passed=Number.isSafeInteger(aid)&&Number.isSafeInteger(cid)&&file.startsWith(prefix)&&/^[a-f0-9]{32}(?:\.json)?$/i.test(file.slice(prefix.length));
    return {passed,identityBound:passed,method:'observed-ai-prod-aid-cid-filename',issues:passed?[]:['ai-subtitle-media-id-mismatch'],trackPath:url.pathname};
  }
  return {passed:true,identityBound:false,method:'player-response-only',issues:[],trackPath:url.pathname};
}

/** Structural evidence only: passing never proves the spoken topic matches. */
export function assessSubtitle(cues,{bvid,cid,aid,duration,identity}={}){
  const issues=[];
  if(identity){
    for(const [field,expected]of Object.entries({bvid,cid,aid})){
      if(expected!==undefined&&identity[field]!==undefined&&String(identity[field])!==String(expected))issues.push('identity-'+field+'-mismatch');
    }
    if(identity.cid===undefined)issues.push('identity-cid-missing');
  }
  if(!Array.isArray(cues)||!cues.length)issues.push('empty-cues');
  let lastStart=-Infinity,maxEnd=0;
  for(const cue of cues??[]){
    const from=cue.from??cue.start,to=cue.to??cue.end;
    if(!Number.isFinite(from)||!Number.isFinite(to)||from<0||to<=from){issues.push('invalid-cue-time');continue;}
    if(from<lastStart-0.05)issues.push('unordered-cues');
    lastStart=from;maxEnd=Math.max(maxEnd,to);
  }
  if(Number.isFinite(duration)&&duration>0&&maxEnd>duration+Math.max(2,Math.min(5,duration*.01)))issues.push('subtitle-exceeds-video-duration');
  return {version:SUBTITLE_VALIDATION_VERSION,passed:issues.length===0,status:issues.length?'rejected':'structurally-checked',semanticVerified:false,
    expected:{bvid,cid,aid,duration},lastEndSeconds:maxEnd,issues:[...new Set(issues)],notice:'身份和时间检查不等于音画语义核实；仍需结合实际画面或原音频确认。'};
}

export function assertSubtitle(cues,expected){
  const result=assessSubtitle(cues,expected);
  if(!result.passed){const error=new Error('SUBTITLE_INTEGRITY_FAILED: '+result.issues.join(', '));error.code='SUBTITLE_INTEGRITY_FAILED';error.validation=result;throw error;}
  return result;
}

export function recommendedFrames(duration){return Math.max(3,Math.min(20,Math.ceil(Number(duration||0)/30)));}

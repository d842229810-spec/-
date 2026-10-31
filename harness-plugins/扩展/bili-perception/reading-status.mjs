// Independently implemented local reading receipt. No model calls or factual truth scoring.
const nonempty = v => typeof v === 'string' && v.trim().length > 0;
const count = v => Array.isArray(v) ? v.length : 0;
export function readingStatus(data, args={}) {
 args={...(data.readingRequest??{}),...args};
 const t=data.transcript??{}, text=String(t.text??''), segments=Array.isArray(t.segments)?t.segments:[];
 const duration=Number(data.metadata?.duration), start=data.range?.start??args.start??0;
 const end=data.range?.end??args.end??(Number.isFinite(duration)?duration:null);
 const validRows=segments.filter(s=>Number.isFinite(s.start??s.from)&&Number.isFinite(s.end??s.to));
 const ranges=validRows.map(s=>[s.start??s.from,s.end??s.to]);
 const rejected=t.validation?.passed===false || t.quality?.suspect===true;
 const source=t.source??'none';
 const asr=/asr|whisper|sherpa|transcrib/i.test(source)||t.provenance?.kind==='audio-transcription';
 const asrFailure=/ASR fallback failed/i.test(t.note??'');
 const transcriptStatus=rejected?'rejected':!nonempty(text)?'empty_unknown':t.scope==='selected-range'?'available_selected_range':'available';
 const asrStatus=asr?(nonempty(text)?(rejected?'rejected':'available'):'empty_unknown'):args.transcribe===false?'not_attempted':asrFailure?'failed_or_rejected':source==='subtitle'&&nonempty(text)?'not_needed':'unknown';
 const frames=(data.frames?.frames??[]).filter(f=>f.has_image&&f.path);
 const transcriptReady=nonempty(text)&&!rejected;
 const next=[];
 if(!transcriptReady)next.push({action:args.transcribe===false?'transcribe-original-audio':'inspect-transcript-failure-or-transcribe-original-audio',reason:transcriptStatus});
 if(args.mode!=='text'&&args.frames!==false&&!frames.length)next.push({action:'retry-frames-or-use-local-media',reason:data.frames?.error??'no-frame-evidence'});
 return {
  acquisitionStatus:data.success===true?'acquired':data.success===false?'failed':'unknown',
  coverageStatus:transcriptReady?(frames.length?'transcript_available_frames_sampled':'transcript_available'):(frames.length?'frames_sampled_transcript_missing':'incomplete'),
  transcript:{status:transcriptStatus,source,characters:text.length,segments:segments.length,requestedRange:{start,end},cueEnvelope:ranges.length?{start:Math.min(...ranges.map(r=>r[0])),end:Math.max(...ranges.map(r=>r[1]))}:null,validation:t.validation?.passed===true?'structure-passed-not-semantic-proof':rejected?'rejected':'unknown',asrStatus,processedAudioRange:t.processedAudioRange??t.runtime?.processedAudioRange??null,note:'字幕首末时间只表示字幕范围，不证明所有声音均已识别；空结果不证明无人声。'},
  frames:{status:frames.length?'sampled':args.mode==='text'||args.frames===false?'not_requested':'missing',count:frames.length,observedByModel:false},
  comments:{status:data.comments?.note&&!(data.comments?.comments?.length)?'unavailable_or_empty':'sample_only',count:Array.isArray(data.comments)?data.comments.length:count(data.comments?.comments)},
  danmaku:{status:data.danmaku?.note&&!data.danmaku?.samples?.length?'unavailable_or_empty':'sample_only',count:count(data.danmaku?.samples)},
  nextAction:next.length?next:null,
  understood:false,notice:'success/acquired仅表示资料取回，不表示模型已经阅读或理解；字幕/转写不是对内容正确性的自动核实。'
 };
}

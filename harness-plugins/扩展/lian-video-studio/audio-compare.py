"""Read local ASR evidence as uncertain recognition, never as ground truth."""
import difflib,json,re,sys,unicodedata
from audio_alignment import alignment
from pathlib import Path
def normalize(text):return ''.join(c for c in unicodedata.normalize('NFKC',text).lower() if c.isalnum())
def compare(expected,recognized):
 a,b=normalize(expected),normalize(recognized)
 if len(a)>12000 or len(b)>12000:raise ValueError('文本过长，请分段校对')
 diffs=[]
 for tag,i,j,k,l in difflib.SequenceMatcher(None,a,b,autojunk=False).get_opcodes():
  if tag!='equal':diffs.append(dict(kind=tag,expectedOffset=i,recognizedOffset=k,expected=a[i:j][:100],recognized=b[k:l][:100]))
 return dict(expectedCharacters=len(a),recognizedCharacters=len(b),matchesNormalized=a==b and bool(a),possibleDifferences=diffs[:40],truncatedDifferences=len(diffs)>40,notice='差异可能来自ASR、同音字、数字写法或真实口播；不是已经证实的错读/漏读。')
def analyze(args):
 segments=args.get('segments',[]);offset=args.get('offset',0);duration=args['duration']
 for s in segments:
  s['windowAvgLogprob']=s.pop('avg_logprob',None)
  s['windowNoSpeechProb']=s.pop('no_speech_prob',None)
  s['confidenceScope']='decoder-window-not-independent-sentence'
  s['decoderWindowSeek']=s.pop('seek',None)
  s['start']+=offset;s['end']+=offset
  for w in s.get('words',[]):w['start']+=offset;w['end']+=offset
 recognized=''.join(s['text'] for s in segments)
 words=[w for s in segments for w in s.get('words',[])]
 caption_checks=[]
 for c in args.get('captions',[])[:120]:
  selected=[w.get('word','') for w in words if w['end']>c['start'] and w['start']<c['end']] if words else [s['text'] for s in segments if s['end']>c['start'] and s['start']<c['end']]
  within=c['start']>=offset and c['end']<=offset+duration+.05
  caption_checks.append(dict(start=c['start'],end=c['end'],text=c['text'],withinAnalyzedRange=within,recognized=''.join(selected),comparison=compare(c['text'],''.join(selected)) if within and selected else None))
 comparison=compare(args.get('expectedText',''),recognized) if args.get('expectedText') and segments else None
 if comparison:
  timed=words or [dict(start=s['start'],end=s['end'],word=s['text']) for s in segments]
  for d in comparison['possibleDifferences']:
   count=0
   for w in timed:
    count+=len(normalize(w.get('word','')))
    if count>d['recognizedOffset']:
     d['approximateStart']=w['start'];d['approximateEnd']=w['end'];break
 return dict(alignment=alignment(args.get('expectedText',''),segments),segments=segments,recognizedText=recognized,expectedComparison=comparison,captionChecks=caption_checks,captionChecksTruncated=len(args.get('captions',[]))>120,uncertainSegments=[dict(start=s['start'],end=s['end'],reason='所在解码窗口的ASR指标较低，仅供回听；不是这句的独立质量分') for s in segments if (s.get('windowAvgLogprob') is not None and s['windowAvgLogprob']<-1) or (s.get('windowNoSpeechProb') is not None and s['windowNoSpeechProb']>.6)],usable=bool(segments),hearingOrAestheticJudgment=False)
if __name__=='__main__':
 sys.stdout.reconfigure(encoding='utf-8');print(json.dumps(analyze(json.loads(Path(sys.argv[1]).read_text(encoding='utf-8')) if len(sys.argv)>1 else json.load(sys.stdin)),ensure_ascii=False,allow_nan=False))

"""Text evidence only. Never infer correct pronunciation from ASR agreement."""
import difflib,unicodedata,math,re
def norm(s):return ''.join(c for c in unicodedata.normalize('NFKC',s).lower() if c.isalnum())
def alignment(expected,segments):
 a=norm(expected);b=''.join(norm(s.get('text','')) for s in segments)
 out={'label':'无法比对','reason':'无可比对文本','alignmentLevel':'full','evidenceBoundary':'ASR与原稿文字不同≠音频念错；全文转写一致≠发音和情绪正确。','normalization':'NFKC、英文小写、忽略标点空白；保留语气词；数字与汉字读法不强行等同，列为待核实；未自动判断同音近音。','differences':[], 'phoneticEquivalenceAssessed':False,'pronunciationVerified':False,'aestheticsAssessed':False}
 if not a or not b or '\ufffd' in expected+''.join(s.get('text','') for s in segments):return out
 positions=[];valid=True;last=-1
 for s in segments:
  start,end=s.get('start'),s.get('end')
  if not isinstance(start,(int,float)) or not isinstance(end,(int,float)) or not math.isfinite(start+end) or start<0 or end<start or start<last:valid=False;break
  last=start;text=norm(s.get('text',''));words=s.get('words',[])
  good=bool(words) and ''.join(norm(w.get('word','')) for w in words)==text and all(isinstance(w.get('start'),(int,float)) and isinstance(w.get('end'),(int,float)) and start<=w['start']<=w['end']<=end+.05 for w in words)
  low=(s.get('windowAvgLogprob') is not None and s['windowAvgLogprob']<-1) or (s.get('windowNoSpeechProb') is not None and s['windowNoSpeechProb']>.6)
  if good:
   for w in words:positions.extend([{'start':w['start'],'end':w['end'],'precision':'word-range','uncertain':low or w.get('probability',1)<.6}]*len(norm(w.get('word',''))))
  else:positions.extend([{'start':start,'end':end,'precision':'segment-range','uncertain':True}]*len(text))
 if not valid or len(positions)!=len(b):out['reason']='无可比对文本：时码缺失、逆序或无效';return out
 out['reason']=None
 for tag,i,j,k,l in difflib.SequenceMatcher(None,a,b,autojunk=False).get_opcodes():
  if tag=='equal':continue
  refs=positions[k:l] or positions[max(0,k-1):min(len(positions),k+1)]
  homophone_unknown=tag=='replace' and bool(re.search(r'[\u3400-\u9fff]',a[i:j]+b[k:l]))
  uncertain=homophone_unknown or not refs or k==l or any(x['uncertain'] for x in refs) or bool(re.search(r'\d',a[i:j]+b[k:l]))
  out['differences'].append({'label':'转写可能不同' if uncertain else '转写确定不同','homophoneSuspect':None,'phoneticReviewRequired':homophone_unknown,'kind':tag,'expected':a[i:j],'recognized':b[k:l],'expectedOffset':i,'recognizedOffset':k,'start':min((x['start'] for x in refs),default=None),'end':max((x['end'] for x in refs),default=None),'timePrecision':'context-range' if k==l else ('segment-range' if any(x['precision']=='segment-range' for x in refs) else 'word-range'),'needsListening':True})
 out['label']='转写一致' if a==b else ('转写可能不同' if any(d['label']=='转写可能不同' for d in out['differences']) else '转写确定不同')
 out['differenceCount']=len(out['differences']);out['differencesTruncated']=len(out['differences'])>80;out['differences']=out['differences'][:80];return out

import argparse
import json
import os
from pathlib import Path
import time
import sys

sys.path.insert(0,str(Path(__file__).parent/'.venv/Lib/site-packages'))
sys.stdout.reconfigure(encoding='utf-8')

os.environ['HF_HUB_OFFLINE']='1'
os.environ['HF_HUB_DISABLE_TELEMETRY']='1'
os.environ['TOKENIZERS_PARALLELISM']='false'
from faster_whisper import WhisperModel

p=argparse.ArgumentParser()
p.add_argument('--audio',required=True)
p.add_argument('--output',required=True)
p.add_argument('--clip-seconds',type=float)
p.add_argument('--word-timestamps',action='store_true')
p.add_argument('--language')
a=p.parse_args()
started=time.time()
model=WhisperModel(str(Path.home()/'.dsh/asr-models/faster-whisper-medium'),device='cpu',compute_type='int8',cpu_threads=min(os.cpu_count() or 4,8),local_files_only=True)
kwargs={'beam_size':1,'vad_filter':True,'condition_on_previous_text':False}
if a.word_timestamps:kwargs['word_timestamps']=True
if a.language:kwargs['language']=a.language
if a.clip_seconds:kwargs['clip_timestamps']=[0,a.clip_seconds]
segments,info=model.transcribe(a.audio,**kwargs)
rows=[{'start':round(s.start,3),'end':round(s.end,3),'text':s.text.strip(),'seek':getattr(s,'seek',None),'no_speech_prob':s.no_speech_prob,'avg_logprob':s.avg_logprob,**({'words':[{'start':round(w.start,3),'end':round(w.end,3),'word':w.word,'probability':w.probability} for w in (s.words or [])]} if a.word_timestamps else {})} for s in segments if s.text.strip()]
data={'source':'faster-whisper-local','language':info.language,'segments':rows,'text':'\n'.join(s['text'] for s in rows),'total_segments':len(rows),'audioDurationSeconds':info.duration,'complete':a.clip_seconds is None or a.clip_seconds>=info.duration,'elapsedSeconds':round(time.time()-started,2),'modelCalls':0,'note':'本地Whisper medium int8从原音频识别；可能存在错字，需要结合画面复核。'}
data['usable']=bool(rows)
if not rows:data['note']='原音频转写为空，未获得可信口播；可用画面OCR补读文字，不能推断视频没有人声。'
Path(a.output).write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8')
health=Path.home()/'.dsh/lian-local-asr-health.json'
from datetime import datetime,timezone
health.write_text(json.dumps({'checkedAt':datetime.now(timezone.utc).isoformat(),'source':data['source'],'status':'passed' if rows else 'empty-transcript','audioDurationSeconds':info.duration,'complete':data['complete'],'segments':len(rows),'elapsedSeconds':data['elapsedSeconds'],'modelCalls':0}),encoding='utf-8')
print(json.dumps({'source':data['source'],'segments':len(rows),'complete':data['complete'],'elapsedSeconds':data['elapsedSeconds']}))

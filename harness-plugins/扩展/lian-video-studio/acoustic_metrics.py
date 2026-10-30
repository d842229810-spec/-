"""Simple voiced-frame F0 and energy measurements, never emotion/quality labels."""
import json,sys,math
import numpy as np,soundfile as sf
def main():
 wave,sr=sf.read(sys.argv[1]);wave=wave.mean(axis=1) if wave.ndim>1 else wave;duration=len(wave)/sr
 if duration>60.1 or not np.isfinite(wave).all():raise ValueError('起伏分析只处理有效的60秒内片段')
 size=round(sr*.04);hop=round(sr*.01);rows=[];threshold=max(.002,float(np.sqrt(np.mean(wave**2)))*.15)
 for i in range(0,max(0,len(wave)-size+1),hop):
  w=wave[i:i+size];rms=float(np.sqrt(np.mean(w*w)));hz=None;strength=0
  if rms>threshold:
   centered=(w-w.mean())*np.hanning(size);corr=np.fft.irfft(np.abs(np.fft.rfft(centered,n=2**math.ceil(math.log2(size*2))))**2);lo,hi=round(sr/500),min(size-2,round(sr/70));peak=lo+int(np.argmax(corr[lo:hi+1]));strength=float(corr[peak]/max(corr[0],1e-12))
   if strength>.5:hz=sr/peak
  rows.append({'time':round((i+size/2)/sr,3),'rms':round(rms,5),'f0Hz':round(hz,2) if hz else None,'periodicity':round(strength,3)})
 voiced=[r for r in rows if r['f0Hz'] is not None];f0=[r['f0Hz'] for r in voiced];pauses=[];began=None
 for r in rows+[{'time':duration,'rms':threshold+1}]:
  if r['rms']<threshold and began is None:began=r['time']
  elif r['rms']>=threshold and began is not None:
   if r['time']-began>=.15:pauses.append({'start':round(began,3),'end':round(r['time'],3),'duration':round(r['time']-began,3)})
   began=None
 tail=[r for r in voiced if r['time']>=voiced[-1]['time']-.5] if voiced else []
 result={'method':'40ms window/10ms hop autocorrelation, 70–500Hz, periodicity>0.5','durationSeconds':duration,'rmsThreshold':threshold,'voicedFrameCount':len(voiced),'analyzedFrameCount':len(rows),'estimatedPitchHz':{'p10':float(np.percentile(f0,10)),'median':float(np.median(f0)),'p90':float(np.percentile(f0,90))} if len(f0)>=5 else None,'lastVoicedHalfSecondDeltaHz':round(tail[-1]['f0Hz']-tail[0]['f0Hz'],2) if len(tail)>3 else None,'lowEnergyPauses':pauses,'contour':[rows[i] for i in np.unique(np.linspace(0,len(rows)-1,min(30,len(rows))).round().astype(int))] if rows else [],'paidModelCalls':0,'notice':'音高/能量与低能量停顿的近似量测；可能倍频或漏检，音乐/多人声不适合作单说话人语调。不能据此判定情绪、自然度、身份或好不好听。'}
 print(json.dumps(result,ensure_ascii=False))
if __name__=='__main__':main()

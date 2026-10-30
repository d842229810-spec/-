"""Cheap full-file PCM inspection. No semantic/emotion judgement."""
import soundfile as sf,numpy as np,sys,json
total=0;energy=0.;peak=0.;clipped=0;nonfinite=0
with sf.SoundFile(sys.argv[1]) as f:
 sr=f.samplerate;channels=f.channels
 for block in f.blocks(blocksize=65536,dtype='float32',always_2d=True):
  nonfinite+=int((~np.isfinite(block)).sum());safe=np.nan_to_num(block)
  total+=block.size;energy+=float(np.sum(safe.astype('float64')**2));peak=max(peak,float(np.max(np.abs(safe))));clipped+=int((np.abs(safe)>=.999).sum())
 frames=len(f)
print(json.dumps(dict(durationSeconds=frames/sr,sampleRate=sr,channels=channels,peak=peak,rms=(energy/max(1,total))**.5,nearFullScaleFraction=clipped/max(1,total),nonfiniteSamples=nonfinite,digitalSilence=peak==0,frames=frames,scope='entire-file',emotionAssessed=False)))

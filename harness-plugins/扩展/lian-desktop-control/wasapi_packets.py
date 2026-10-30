"""Packet timestamps from WASAPI GetBuffer; no modification of SoundCard 0.4.5."""
import time,threading,ctypes,importlib.metadata
import numpy as np
import soundcard as sc
from soundcard import mediafoundation as mf
def capture_packets(device,seconds,stop,source,speaker=None,rate=48000,ready_file=None):
 if importlib.metadata.version('SoundCard')!='0.4.5':raise RuntimeError('WASAPI适配需复核SoundCard版本；未静默退成估计时间戳。')
 ended=threading.Event();ready=threading.Event();keep_errors=[];thread=None
 def keepalive():
  com=None
  try:
   com=mf._COMLibrary()
   with sc.get_speaker(speaker.id).player(samplerate=rate,channels=2,blocksize=4800) as player:
    ready.set()
    while not ended.is_set():player.play(np.zeros((2400,2),dtype=np.float32))
  except Exception as e:keep_errors.append(str(e));ready.set()
  finally:
   if com:del com
 if source=='system-playback':
  thread=threading.Thread(target=keepalive,daemon=True);thread.start()
  if not ready.wait(5):raise RuntimeError('本次静音保活未就绪')
  if keep_errors:raise RuntimeError('本次静音保活失败：'+keep_errors[0])
 # QPC and Python monotonic can have different epochs; measure their mapping.
 counter=ctypes.c_longlong();frequency=ctypes.c_longlong();ctypes.windll.kernel32.QueryPerformanceFrequency(ctypes.byref(frequency));before=time.monotonic();ctypes.windll.kernel32.QueryPerformanceCounter(ctypes.byref(counter));after=time.monotonic();offset=(before+after)/2-counter.value/frequency.value
 chunks=[];packets=[];count=0;expected=None;reason='duration-complete';began=time.monotonic();discontinuities=0;gaps=0
 try:
  with device.recorder(samplerate=rate,channels=2,blocksize=4800) as recorder:
   while count<round(seconds*rate):
    if stop.exists():reason='explicit-stop';break
    if ctypes.windll.user32.GetAsyncKeyState(0x77)&0x8000:reason='F8';break
    if time.monotonic()-began>seconds+8:reason='capture-timeout';break
    if not recorder._capture_available_frames():time.sleep(.001);continue
    ffi=mf._ffi;data=ffi.new('BYTE**');n=ffi.new('UINT32*');flags=ffi.new('DWORD*');position=ffi.new('UINT64*');qpc=ffi.new('UINT64*')
    hr=recorder._ppCaptureClient[0][0].lpVtbl.GetBuffer(recorder._ppCaptureClient[0],data,n,flags,position,qpc);mf._com.check_error(hr)
    if not n[0]:continue
    try:
     if flags[0]&2:block=np.zeros((n[0],2),dtype=np.float32)
     elif data[0]!=ffi.NULL:block=np.frombuffer(ffi.buffer(data[0],n[0]*8),dtype=np.float32).reshape(-1,2).copy()
     else:raise RuntimeError('WASAPI返回空指针且未标静音')
    finally:recorder._capture_release(n[0])
    gap=max(0,int(position[0])-expected) if expected is not None else 0
    if gap:
     fill=min(gap,round(seconds*rate)-count);chunks.append(np.zeros((fill,2),dtype=np.float32));count+=fill;gaps+=fill
    if flags[0]&1 and packets:discontinuities+=1
    take=min(len(block),round(seconds*rate)-count);packet={'fileSampleOffset':count,'sampleCount':take,'devicePosition':int(position[0]),'hostMonotonicSeconds':qpc[0]/1e7+offset if not flags[0]&4 else None,'qpc100ns':int(qpc[0]),'flags':int(flags[0]),'gapFramesBefore':gap}
    if not packets and ready_file:
     from pathlib import Path
     Path(ready_file).write_text('first-packet-received',encoding='utf-8')
    packets.append(packet);chunks.append(block[:take]);count+=take;expected=int(position[0])+len(block)
  if not chunks:raise RuntimeError('未取得音频数据包，不冒充已采样')
  first=packets[0]['hostMonotonicSeconds'];valid=first is not None and all(p['hostMonotonicSeconds'] is not None for p in packets)
  return np.concatenate(chunks),{'firstSampleMonotonicSeconds':first,'firstSampleEstimatedMonotonicSeconds':first if first is not None else began,'packetTimestamps':packets,'hardwareTimestampAvailable':valid,'qpcToMonotonicOffsetSeconds':offset,'clockMappingUncertaintySeconds':(after-before)/2,'discontinuityWarnings':discontinuities,'insertedGapFrames':gaps,'stopReason':reason,'silentOutputKeepalive':source=='system-playback','timingUncertainty':{'sampleTimeIsEstimated':not valid,'endpointQPC':valid,'physicalSpeakerDelayKnown':False,'clockMappingSeconds':(after-before)/2,'source':'https://learn.microsoft.com/en-us/windows/win32/api/audioclient/nf-audioclient-iaudiocaptureclient-getbuffer'}}
 finally:
  ended.set()
  if thread:thread.join(2)

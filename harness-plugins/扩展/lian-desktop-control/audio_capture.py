"""Explicit short WASAPI loopback or microphone recording; never a daemon."""
import json,sys,time,uuid,hashlib,ctypes,warnings
from pathlib import Path
import numpy as np,soundfile as sf,soundcard as sc
ROOT=Path('E:/LianHome/收件箱/感官采集/声音')
def main():
    a=json.load(sys.stdin)
    if a.get('action')=='status':
        print(json.dumps({'available':True,'endpointPacketQPC':True,'silentOutputKeepaliveDuringCapture':True,'alwaysListening':False,'defaultSource':'system-playback','scope':'system-output-mix','microphoneRequiresExplicitSource':True,'defaultSpeaker':sc.default_speaker().name,'speakers':[{'id':s.id,'name':s.name} for s in sc.all_speakers()],'deepseekApiCalls':0},ensure_ascii=False));return
    source=a.get('source','system-playback');seconds=float(a.get('seconds',8))
    if source not in ['system-playback','microphone'] or not 0<seconds<=30:raise ValueError('source须为system-playback/microphone，seconds须为0至30秒')
    stop=Path(a['stopFile']);started=time.time();chunks=[];reason='duration-complete';rate=48000;block_times=[]
    if source=='system-playback':
        speaker=sc.get_speaker(a['device']) if a.get('device') else sc.default_speaker();device=sc.get_microphone(speaker.id,include_loopback=True)
    else:device=sc.get_microphone(a['device']) if a.get('device') else sc.default_microphone()
    if device is None:raise RuntimeError('没有可用音频设备')
    from wasapi_packets import capture_packets
    wave,timing=capture_packets(device,seconds,stop,source,speaker if source=='system-playback' else None,rate,a.get('readyFile'))
    reason=timing['stopReason']
    if not np.isfinite(wave).all():raise RuntimeError('音频采样包含无效数值，未保存为可听音频')
    ROOT.mkdir(parents=True,exist_ok=True);file=ROOT/('capture-'+uuid.uuid4().hex+'.wav');sf.write(str(file),wave,rate,subtype='PCM_16')
    value={'file':str(file),'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'startedAtUnix':started,'durationSeconds':len(wave)/rate,'sampleRate':rate,'channels':wave.shape[1],'source':source,'scope':'system-output-mix' if source=='system-playback' else 'explicit-microphone-session','deviceName':device.name,'stopReason':reason,'alwaysListening':False,'peak':float(np.max(np.abs(wave))),'rms':float(np.sqrt(np.mean(wave**2))),'heard':False,'deepseekApiCalls':0,'notice':'本次短时采集已结束；系统播放回录可能混入其他应用声音。文件存在不等于已听懂，可交whale_hear读取。'}
    value.update(timing,captureWallSeconds=time.time()-started,warnings=[])
    if value['discontinuityWarnings']:value['notice']+=' WASAPI报告采样间断，连续性与精确时序需复核。'
    file.with_suffix('.json').write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(value,ensure_ascii=False))
if __name__=='__main__':
    try:main()
    except Exception as e:print(json.dumps({'error':str(e)},ensure_ascii=False));sys.exit(1)

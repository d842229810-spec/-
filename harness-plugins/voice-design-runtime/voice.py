import json,sys,os,uuid,time,hashlib,re
from pathlib import Path
ROOT=Path(__file__).resolve().parent
SAMPLES=Path('E:/LianHome/工作室/声音设计/20261026_原创候选')
OUT=Path('E:/LianHome/工作室/声音设计/配音输出')

def validate_wave(wave,sr):
    import numpy as np
    if sr<=0 or len(wave)<max(1,round(sr*.08)) or not np.isfinite(wave).all():
        raise ValueError('配音结果为空、无效或过短，未生成可发送语音')
    peak=float(np.max(np.abs(wave)))
    if peak<1e-6:raise ValueError('配音结果全为静音，未生成可发送语音')
    return peak
def main():
    request=json.load(sys.stdin)
    candidates=json.loads((SAMPLES/'候选音色.json').read_text(encoding='utf-8'))
    if request.get('action') in ('status','list'):
        selected_file=ROOT/'selected-voice.json'
        print(json.dumps(dict(candidates=candidates,baseReady=(ROOT/'models/Qwen3-TTS-Base/verified-model.json').exists(),selected=selected_file.exists(),profile=json.loads(selected_file.read_text(encoding='utf-8')) if selected_file.exists() else None),ensure_ascii=False));return
    key=request.get('candidate')
    chosen=ROOT/'selected-voice.json'
    profile=json.loads(chosen.read_text(encoding='utf-8')) if chosen.exists() else None
    audition=request.get('action')=='audition'
    if profile and not audition:
        if key and key!=profile['candidate']:raise ValueError('正式配音沿用已选声线；额外音色试听请使用audition')
        key=profile['candidate']
    if not key:raise ValueError('请选择试听候选，或先确定正式声线')
    assert key in ('A','B','C')
    sample=next(x for x in candidates['samples'] if x['name'].startswith(key+'_'))
    reference=Path(sample['file'])
    assert reference.resolve().is_relative_to(SAMPLES.resolve())
    assert hashlib.sha256(reference.read_bytes()).hexdigest()==sample['sha256']
    text=request.get('text','').strip()
    assert 0<len(text)<=1200
    os.environ['HF_HUB_OFFLINE']='1';os.environ['TRANSFORMERS_OFFLINE']='1'
    from filelock import FileLock
    sys.path.insert(0,str(ROOT.parent/'sensory-runtime'))
    from gpu_lock import gpu_lease
    with gpu_lease(), FileLock(str(ROOT/'gpu-voice.lock'),timeout=30):
        import torch,numpy as np,soundfile as sf
        from qwen_tts import Qwen3TTSModel
        if not torch.cuda.is_available():raise RuntimeError('本机CUDA不可用')
        model_dir=ROOT/'models/Qwen3-TTS-Base'
        manifest=json.loads((model_dir/'verified-model.json').read_text(encoding='utf-8'))
        assert manifest['revision']=='5d83992436eae1d760afd27aff78a71d676296fc'
        for entry in manifest['files']:assert (model_dir/entry['file']).stat().st_size==entry['bytes']
        started=time.monotonic()
        model=Qwen3TTSModel.from_pretrained(str(model_dir),device_map='cuda:0',dtype=torch.bfloat16,attn_implementation='sdpa',local_files_only=True)
        torch.manual_seed(sample['seed'])
        prompt=model.create_voice_clone_prompt(ref_audio=str(reference),ref_text=candidates['text'],x_vector_only_mode=False)
        sentences=re.split(r'(?<=[。！？!?])',text);chunks=[];current=''
        for sentence in sentences:
            while len(sentence)>150:
                if current:chunks.append(current);current=''
                chunks.append(sentence[:150]);sentence=sentence[150:]
            if len(current)+len(sentence)>150:chunks.append(current);current=''
            current+=sentence
        if current:chunks.append(current)
        waves=[]
        with torch.inference_mode():
            for chunk in chunks:
                values,sr=model.generate_voice_clone(text=chunk,language='Chinese',voice_clone_prompt=prompt,max_new_tokens=2048)
                if waves:waves.append(np.zeros(round(sr*.15),dtype=np.float32))
                waves.append(values[0])
        wave=np.concatenate(waves);peak=validate_wave(wave,sr)
        gain=.97/peak if peak>.97 else 1.;wave=wave*gain
        OUT.mkdir(parents=True,exist_ok=True)
        file=OUT/(time.strftime('%Y%m%d_%H%M%S')+'_'+key+'_'+uuid.uuid4().hex[:8]+'.wav')
        sf.write(file,wave,sr,subtype='PCM_16')
        result=dict(file=str(file),candidate=key,profileId=profile['id'] if profile and not audition else None,referenceSha256=sample['sha256'],model=manifest['model'],revision=manifest['revision'],text=text,chunks=len(chunks),sampleRate=sr,durationSeconds=len(wave)/sr,elapsedSeconds=round(time.monotonic()-started,2),peakBeforeGain=peak,gain=gain,sha256=hashlib.sha256(file.read_bytes()).hexdigest(),selected=bool(profile and not audition))
        file.with_suffix('.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps(result,ensure_ascii=False),flush=True)
if __name__=='__main__':main()

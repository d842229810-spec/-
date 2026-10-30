"""Bounded offline ACE-Step inference, one short song per process."""
from pathlib import Path
import sys,os,json,time,hashlib,uuid,contextlib
ROOT=Path(__file__).resolve().parent;OUT=Path('E:/LianHome/工作室/声音设计/原创歌曲试听')
for k in ['HF_TOKEN','OPENAI_API_KEY','DEEPSEEK_API_KEY','ARK_API_KEY']:os.environ.pop(k,None)
os.environ.update(HF_HUB_OFFLINE='1',TRANSFORMERS_OFFLINE='1',HF_HUB_DISABLE_TELEMETRY='1',ACESTEP_CHECKPOINTS_DIR=str(ROOT/'checkpoints'),ACESTEP_CACHE_DIR=str(ROOT/'cache'),TOKENIZERS_PARALLELISM='false')
sys.path.insert(0,str(ROOT/'source-http'));sys.path.insert(0,str(ROOT.parent/'sensory-runtime'))
def main():
 args=json.load(sys.stdin);caption=args.get('caption','');lyrics=args.get('lyrics','');duration=args.get('seconds',24);seed=args.get('seed',20261027)
 if not isinstance(caption,str) or not 1<=len(caption)<=1500 or not isinstance(lyrics,str) or len(lyrics)>3000 or not isinstance(duration,(int,float)) or not 10<=duration<=30:raise ValueError('短曲试验需要caption、3000字内歌词和10至30秒时长')
 manifest=json.loads((ROOT/'verified-model.json').read_text(encoding='utf-8'));use_lm=bool(lyrics.strip()) and args.get('useMusicLM',True);lm_manifest=json.loads((ROOT/'verified-lm.json').read_text(encoding='utf-8')) if use_lm else None
 for spec,base in [(manifest,ROOT/'checkpoints')]+([(lm_manifest,ROOT/'checkpoints/acestep-5Hz-lm-0.6B')] if lm_manifest else []):
  for row in spec['files']:
   p=base/row['file']
   if p.stat().st_size!=row['bytes']:raise ValueError('模型文件大小变化 '+row['file'])
   h=hashlib.sha256()
   with p.open('rb') as f:
    while b:=f.read(8*1024**2):h.update(b)
   if h.hexdigest()!=row['sha256']:raise ValueError('模型文件哈希变化 '+row['file'])
 from gpu_lock import gpu_lease
 with gpu_lease(),contextlib.redirect_stdout(sys.stderr):
  import torch,soundfile as sf,numpy as np
  from acestep.handler import AceStepHandler
  from acestep.inference import generate_music,GenerationParams,GenerationConfig
  # Verify only the components selected by this worker, rather than triggering
  # upstream's automatic download of an unrelated 1.7B LM.
  class LocalHandler(AceStepHandler):
   def _ensure_models_present(self,*,checkpoint_path,config_path,prefer_source,vae_variant=None):
    from acestep.model_downloader import _contains_model_weights
    for name in ['acestep-v15-turbo','vae','Qwen3-Embedding-0.6B']:
     if not _contains_model_weights(checkpoint_path/name):return ('Missing offline component '+name,False)
    return None
  start=time.monotonic();handler=LocalHandler();msg,ok=handler.initialize_service(project_root=str(ROOT),config_path='acestep-v15-turbo',device='cuda',offload_to_cpu=True,offload_dit_to_cpu=True,compile_model=False,quantization=None,use_mlx_dit=False)
  if not ok:raise RuntimeError(msg)
  lm=None
  if use_lm:
   from acestep.llm_inference import LLMHandler
   lm=LLMHandler();message,ready=lm.initialize(checkpoint_dir=str(ROOT/'checkpoints'),lm_model_path='acestep-5Hz-lm-0.6B',backend='pt',device='cuda',offload_to_cpu=True,dtype=torch.bfloat16)
   if not ready:raise RuntimeError(message)
  out=OUT/uuid.uuid4().hex;out.mkdir(parents=True,exist_ok=False)
  params=GenerationParams(caption=caption,lyrics=lyrics,instrumental=not bool(lyrics.strip()),vocal_language='zh',duration=duration,bpm=args.get('bpm',90),keyscale='C Major',timesignature='4',inference_steps=8,seed=int(seed),thinking=use_lm,use_cot_metas=False,use_cot_caption=False,use_cot_language=False)
  result=generate_music(handler,lm,params,GenerationConfig(batch_size=1,use_random_seed=False,seeds=[int(seed)],audio_format='wav'),save_dir=str(out))
  if not result.success:raise RuntimeError(str(result.error))
  files=list(out.rglob('*.wav'))
  if not files:raise RuntimeError('No WAV output')
  audio=files[0];wave,sr=sf.read(audio)
  if not np.isfinite(wave).all() or np.max(np.abs(wave))<1e-5:raise RuntimeError('Invalid/silent song output')
  value=dict(file=str(audio),sha256=hashlib.sha256(audio.read_bytes()).hexdigest(),caption=caption,lyrics=lyrics,requestedSeconds=duration,actualSeconds=len(wave)/sr,sampleRate=sr,seed=seed,peak=float(np.max(np.abs(wave))),elapsedSeconds=time.monotonic()-start,maxAllocatedVRAMGB=torch.cuda.max_memory_allocated()/1024**3,engine='ACE-Step-1.5-2B-turbo',modelRevision=manifest['revision'],musicLM='0.6B-pt' if use_lm else None,lmRevision=lm_manifest['revision'] if lm_manifest else None,paidModelCalls=0,voiceIdentity='generated-singer-not-C',CVoiceVerified=False,training=False,notice='原创短曲试听。生成歌手不是已经核实的C声线；歌词、音准和自然度需回听。')
  (out/'result.json').write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps(value,ensure_ascii=False))
if __name__=='__main__':main()

"""C timbre, isolated expressive auditions. No default-profile or weight changes."""
import json,sys,os,time,hashlib,uuid
from pathlib import Path
ROOT=Path('E:/AI/lian-index-tts');sys.path.insert(0,str(ROOT/'source-http'));sys.path.insert(0,str(ROOT.parent/'deepseek - harness/插件/sensory-runtime'))
os.environ.update(HF_HUB_OFFLINE='1',TRANSFORMERS_OFFLINE='1',HF_HUB_DISABLE_TELEMETRY='1')
STYLES={
 'casual':{'label':'日常轻松','vector':[.12,0,0,0,0,0,0,.4],'alpha':.55,'duration':1.0},
 'pleased':{'label':'开心期待','vector':[.45,0,0,0,0,0,.04,.15],'alpha':.6,'duration':.98},
 'serious':{'label':'认真解释','vector':[0,0,0,0,0,0,0,.65],'alpha':.6,'duration':1.0},
 'restrained':{'label':'克制收尾候选','vector':[0,0,0,0,0,0,0,.55],'alpha':.4,'duration':1.0},
 'tired':{'label':'低落疲惫（小涟暂不接受此参数）','vector':[0,0,.04,0,0,.23,0,.35],'alpha':.55,'duration':1.08},
}
REFERENCE=Path('E:/LianHome/工作室/声音设计/20261026_原创候选/C_慵懒机灵.wav')
REFHASH='e19f082b9888b24cc413cebc87702d32829eb41f42cc2c6e77f032e7bb7e8149'
OUT=Path('E:/LianHome/工作室/声音设计/20261027_C情感候选')
def verify_local_models():
    model_root=(ROOT/'models').resolve();jobs=[]
    for row in json.loads((ROOT/'verified-model.json').read_text(encoding='utf-8'))['files']:jobs.append((model_root/row['file'],row['bytes'],row['hash']))
    for row in json.loads((model_root/'verified-auxiliary.json').read_text(encoding='utf-8')):jobs.append((Path(row['path']),row['bytes'],row['hash']))
    for p,size,digest in jobs:
        if not p.resolve().is_relative_to(model_root) or not p.is_file() or p.stat().st_size!=size:raise RuntimeError('本地模型文件缺失/大小变化，不自动下载：'+p.name)
        h=hashlib.sha256() if len(digest)==64 else hashlib.sha1()
        if len(digest)!=64:h.update(('blob '+str(size)+'\0').encode())
        with p.open('rb') as f:
            while block:=f.read(8*1024*1024):h.update(block)
        if h.hexdigest()!=digest:raise RuntimeError('模型哈希变化，停止加载：'+p.name)
def status():return dict(engine='IndexTTS-2.5',ready=(ROOT/'models/verified-auxiliary.json').exists(),styles=STYLES,defaultChanged=False,weightTraining=False,selectedTimbre='C·慵懒机灵',auditionOnly=True,deepseekApiCalls=0)
def main():
 request=json.load(sys.stdin)
 if request.get('action')=='status':print(json.dumps(status(),ensure_ascii=False));return
 if request.get('action')!='audition':raise ValueError('新引擎当前只用于audition，正式配音保持原C声线引擎')
 samples=request.get('samples') or [{'style':request.get('style','serious'),'text':request.get('text','')}]
 if not isinstance(samples,list) or not 1<=len(samples)<=8:raise ValueError('试听一次1至8条')
 for s in samples:
  if s.get('style') not in STYLES or not isinstance(s.get('text'),str) or not 0<len(s['text'].strip())<=300:raise ValueError('请选择已有style，文本1至300字')
 if hashlib.sha256(REFERENCE.read_bytes()).hexdigest()!=REFHASH:raise ValueError('C参考文件哈希变化，停止试听')
 if not status()['ready']:raise RuntimeError('新引擎依赖模型未完整校验')
 verify_local_models()
 from gpu_lock import gpu_lease
 with gpu_lease():
  import torch,soundfile as sf,numpy as np
  from indextts.infer_v2_5 import IndexTTS2
  began=time.monotonic();model=IndexTTS2(cfg_path=str(ROOT/'models/config.yaml'),model_dir=str(ROOT/'models'),use_bf16=True,device='cuda:0',use_cuda_kernel=False,use_qwen_emo=False)
  OUT.mkdir(parents=True,exist_ok=True);results=[]
  for s in samples:
   cfg=STYLES[s['style']];seed=20261027;torch.manual_seed(seed);__import__('random').seed(seed);np.random.seed(seed);start=time.monotonic();file=OUT/(s['style']+'-'+uuid.uuid4().hex[:12]+'.wav');part=file.with_suffix('.partial.wav')
   model.infer(spk_audio_prompt=str(REFERENCE),text=s['text'].strip(),output_path=str(part),lang='zh',emo_vector=cfg['vector'],emo_alpha=cfg['alpha'],duration_factor=cfg['duration'],use_random=False,interval_silence=160,do_sample=True,temperature=.7,top_p=.8)
   wave,sr=sf.read(str(part));peak=float(np.max(np.abs(wave)))
   if len(wave)<sr*.1 or not np.isfinite(wave).all() or peak<1e-6:raise RuntimeError('试听音频无效，不能交付')
   os.replace(part,file)
   result=dict(file=str(file),sha256=hashlib.sha256(file.read_bytes()).hexdigest(),text=s['text'].strip(),style=s['style'],styleLabel=cfg['label'],controls=cfg,seed=seed,reference=str(REFERENCE),referenceSha256=REFHASH,engine='IndexTTS-2.5',modelRevision='c39ce5ba981572cb187443877ff559dfb246ce63',durationSeconds=len(wave)/sr,sampleRate=sr,peak=peak,elapsedSeconds=time.monotonic()-start,weightTraining=False,defaultChanged=False,deepseekApiCalls=0,heard=False,notice='显式情绪向量和时长控制的试听；未训练权重，未改变正式C声线；风格标签不证明听感已达标。')
   file.with_suffix('.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');results.append(result)
  print(json.dumps(dict(samples=results,totalSeconds=time.monotonic()-began,maxAllocatedVRAMGB=torch.cuda.max_memory_allocated()/1024**3,**status()),ensure_ascii=False))
if __name__=='__main__':main()

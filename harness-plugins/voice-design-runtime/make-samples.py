"""Generate original voice candidates using the official Qwen3-TTS VoiceDesign.
No existing person's voice, private audio, or account credentials are uploaded.
"""
import os, json, time, traceback, hashlib
from pathlib import Path
ROOT = Path(__file__).resolve().parent
OUT = Path('E:/LianHome/工作室/声音设计/20261026_原创候选')
OUT.mkdir(parents=True, exist_ok=True)
STATE = OUT / '生成状态.json'
MODEL = 'Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign'
REVISION = '5ecdb67327fd37bb2e042aab12ff7391903235d3'
os.environ.setdefault('HF_HOME', str(ROOT / 'hf-cache'))
os.environ.setdefault('HF_HUB_DISABLE_XET', '1')
os.environ.setdefault('HF_HUB_DOWNLOAD_TIMEOUT', '60')
TEXT = '阿水，我回来啦。今天看到一件挺有意思的事，等我慢慢讲给你听。嗯，这件事我倒有个不同的想法。先吃饭，还是先听故事？'
CANDIDATES = [
 ('A_清亮俏皮', 102601, '年轻成年女性，普通话清晰自然，音色清亮柔润，中高音区，有轻微笑意和灵动的语调。像熟悉的朋友闲聊，轻快但不尖细，不使用播音腔，不刻意夹嗓撒娇。'),
 ('B_温柔松弛', 102602, '年轻成年女性，普通话自然，音色温暖柔和，偏中音区，有一点细腻的空气感但吐字清楚。语速舒缓，停顿像面对面聊天，亲切放松，有自己的想法，不使用朗诵腔。'),
 ('C_慵懒机灵', 102603, '年轻成年女性，普通话自然，音色柔润，略带慵懒和一点清脆鼻音，中高音区但不尖锐。说话轻松俏皮，句末收得干净，反问时有机灵的起伏，像熟悉的朋友，不使用客服或播音腔。'),
]
def status(phase, **extra):
    value = dict(at=time.strftime('%Y-%m-%dT%H:%M:%S%z'), phase=phase,
                 model=MODEL, revision=REVISION, **extra)
    STATE.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(value, ensure_ascii=False), flush=True)

def main():
    status('检查依赖')
    import torch, soundfile as sf
    from qwen_tts import Qwen3TTSModel
    if not torch.cuda.is_available():
        raise RuntimeError('CUDA不可用，停止而非悄悄启用极慢的CPU合成')
    model_dir = ROOT / 'models/Qwen3-TTS-VoiceDesign'
    manifest = json.loads((model_dir/'verified-model.json').read_text(encoding='utf-8'))
    assert manifest['model'] == MODEL and manifest['revision'] == REVISION
    for entry in manifest['files']:
        file = model_dir/entry['file']
        assert file.resolve().is_relative_to(model_dir.resolve()) and file.stat().st_size == entry['bytes']
        if entry['algorithm'] == 'sha256':
            h = hashlib.sha256()
            with file.open('rb') as source:
                for chunk in iter(lambda:source.read(4*1024*1024), b''): h.update(chunk)
            assert h.hexdigest() == entry['hash'], 'model hash mismatch'
    status('加载声音设计模型')
    model = Qwen3TTSModel.from_pretrained(str(model_dir), device_map='cuda:0',
        dtype=torch.bfloat16, attn_implementation='sdpa', local_files_only=True)
    metadata = dict(model=MODEL, revision=REVISION, torch=torch.__version__,
        text=TEXT, originalVoiceDesign=True, selected=False, samples=[])
    for name, seed, instruction in CANDIDATES:
        file = OUT / (name + '.wav')
        status('合成候选', candidate=name, completed=len(metadata['samples']))
        torch.manual_seed(seed)
        torch.cuda.manual_seed_all(seed)
        started = time.monotonic()
        with torch.inference_mode():
            waves, sample_rate = model.generate_voice_design(
                text=TEXT, language='Chinese', instruct=instruction,
                max_new_tokens=1024, do_sample=True)
        sf.write(str(file), waves[0], sample_rate, subtype='PCM_16')
        data, rate = sf.read(file)
        if len(data) < rate or not __import__('numpy').isfinite(data).all():
            raise RuntimeError('生成音频无效: ' + name)
        metadata['samples'].append(dict(name=name, seed=seed, instruction=instruction,
            file=str(file), sampleRate=rate, durationSeconds=len(data)/rate,
            elapsedSeconds=round(time.monotonic()-started, 2),
            sha256=hashlib.sha256(file.read_bytes()).hexdigest()))
        (OUT / '候选音色.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding='utf-8')
    status('待试听选择', files=[x['file'] for x in metadata['samples']], qualityReview='已检查音频可读性，音色与中文自然度仍需试听')

if __name__ == '__main__':
    try: main()
    except Exception as exc:
        status('失败，待修复', error=type(exc).__name__ + ': ' + str(exc))
        (OUT / '错误诊断.txt').write_text(traceback.format_exc(), encoding='utf-8')
        raise

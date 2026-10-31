import argparse, hashlib, json, sys
from pathlib import Path
from datetime import datetime, timezone
sys.path.insert(0, str(Path(__file__).parent / ".venv/Lib/site-packages"))
sys.path.insert(0, r"E:/DSH/插件/local-asr/.venv/Lib/site-packages")
sys.path.insert(0, r"E:/DSH/插件/lian-shared")
sys.stdout.reconfigure(encoding="utf-8")
import local_asr_runtime as runtime

p = argparse.ArgumentParser()
p.add_argument("--audio", required=True)
p.add_argument("--output", required=True)
p.add_argument("--clip-seconds", type=float)
p.add_argument("--word-timestamps", action="store_true")
p.add_argument("--language")
p.add_argument("--device", choices=["auto", "cpu", "cuda"], default="auto")
p.add_argument("--health-file")
a = p.parse_args()
result = runtime.transcribe_local(a.audio,
    Path.home()/".dsh/asr-models/faster-whisper-medium",
    language=a.language, word_timestamps=a.word_timestamps,
    clip_seconds=a.clip_seconds, device=a.device)
rows = result["segments"]
data = {**result, "source":"faster-whisper-local",
    "text":"\n".join(s["text"] for s in rows), "total_segments":len(rows),
    "usable":bool(rows), "modelCalls":0,
    "note":"从原音轨离线识别，可能有错字，须结合画面复核；空转写不能推断无人声。"}
Path(a.output).write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
health = Path(a.health_file) if a.health_file else Path.home()/".dsh/lian-local-asr-health.json"
health.write_text(json.dumps({
    "checkedAt":datetime.now(timezone.utc).isoformat(),
    "source":data["source"], "status":"passed" if rows else "empty-transcript",
    "audioDurationSeconds":data["audioDurationSeconds"], "complete":data["complete"],
    "segments":len(rows), "elapsedSeconds":data["elapsedSeconds"],
    "device":data["device"], "computeType":data["computeType"],
    "runtimeVersion":runtime.VERSION, "fallbackReason":data["fallbackReason"],
    "codeHash":hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
    "runtimeHash":hashlib.sha256(Path(runtime.__file__).read_bytes()).hexdigest(),
    "verificationScope":"actual-local-audio-transcription-not-transcript-accuracy",
    "modelCalls":0, "paidAPICalls":0
}, ensure_ascii=False), encoding="utf-8")
print(json.dumps({**{k:data[k] for k in ["source","complete","device","computeType","elapsedSeconds","fallbackReason"]},
    "segments": len(rows)}))

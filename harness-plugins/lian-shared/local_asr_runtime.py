"""Shared offline ASR device selection. No downloads, network or voice settings."""
import gc
import math
import os
import time
from pathlib import Path

VERSION = "1.1.0"
_dll_handles = []
_prepared_dll_roots = set()

def prepare_cuda_libraries():
    if os.name != "nt":
        return []
    import ctypes
    roots = [
        Path(r"E:/DSH/插件/voice-design-runtime/.venv/Lib/site-packages/torch/lib"),
        Path(r"E:/DSH/插件/index-tts-runtime/.venv/Lib/site-packages/torch/lib"),
    ]
    warnings = []
    for root in roots:
        if not root.is_dir() or root in _prepared_dll_roots:
            continue
        try:
            _dll_handles.append(os.add_dll_directory(str(root)))
        except OSError as error:
            warnings.append(str(error)[:200])
            continue
        _prepared_dll_roots.add(root)
        os.environ["PATH"] = str(root) + os.pathsep + os.environ.get("PATH", "")
        for name in ("cublasLt64_12.dll", "cublas64_12.dll", "cudnn64_9.dll"):
            try:
                _dll_handles.append(ctypes.WinDLL(str(root / name)))
            except OSError:
                pass
    return warnings

def transcribe_local(audio, model_path, *, language=None, beam_size=1,
                     word_timestamps=False, clip_seconds=None, device="auto",
                     model_factory=None, cuda_count=None):
    if device not in ("auto", "cpu", "cuda"):
        raise ValueError("ASR_DEVICE_INVALID")
    if clip_seconds is not None and (not math.isfinite(clip_seconds) or clip_seconds <= 0):
        raise ValueError("ASR_CLIP_SECONDS_INVALID")
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
    os.environ["TOKENIZERS_PARALLELISM"] = "false"
    cuda_warnings = prepare_cuda_libraries() if device != "cpu" else []
    if model_factory is None:
        from faster_whisper import WhisperModel
        model_factory = WhisperModel
    if cuda_count is None and device == "auto":
        try:
            import ctranslate2
            cuda_count = ctranslate2.get_cuda_device_count()
        except Exception:
            cuda_count = 0
    selected = ("cuda" if cuda_count else "cpu") if device == "auto" else device
    started, fallback, attempts = time.perf_counter(), None, []
    while True:
        model = None
        try:
            compute = "float16" if selected == "cuda" else "int8"
            attempts.append(selected)
            model = model_factory(str(model_path), device=selected, compute_type=compute,
                cpu_threads=min(os.cpu_count() or 4, 8), local_files_only=True)
            kwargs = dict(beam_size=beam_size, vad_filter=True,
                condition_on_previous_text=False, word_timestamps=word_timestamps)
            if language:
                kwargs["language"] = language
            if clip_seconds is not None:
                kwargs["clip_timestamps"] = [0, clip_seconds]
            segments, info = model.transcribe(str(audio), **kwargs)
            rows = []
            for s in segments:
                if not s.text.strip():
                    continue
                r = dict(start=round(s.start, 3), end=round(s.end, 3),
                    text=s.text.strip(), seek=getattr(s, "seek", None),
                    no_speech_prob=s.no_speech_prob, avg_logprob=s.avg_logprob)
                if word_timestamps:
                    r["words"] = [dict(start=round(w.start, 3), end=round(w.end, 3),
                        word=w.word, probability=w.probability) for w in (s.words or [])]
                rows.append(r)
            return dict(segments=rows, language=info.language,
                audioDurationSeconds=info.duration,
                complete=clip_seconds is None or clip_seconds >= info.duration,
                processedRangeSeconds={"start": 0, "end": min(clip_seconds, info.duration)
                    if clip_seconds is not None else info.duration},
                device=selected, computeType=compute, requestedDevice=device,
                fallbackReason=fallback, attemptedDevices=attempts,
                cudaLibraryWarnings=cuda_warnings,
                elapsedSeconds=round(time.perf_counter() - started, 2),
                runtimeVersion=VERSION, localModelRuns=len(attempts), paidAPICalls=0)
        except Exception as e:
            if selected != "cuda" or device == "cuda":
                raise
            fallback = str(e)[:500]
            selected = "cpu"
        finally:
            if model is not None:
                try:
                    model.model.unload_model()
                except Exception:
                    pass
            model = None
            gc.collect()

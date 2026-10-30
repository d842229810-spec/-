"""Local MCP adapter for the current Edge TTS API."""
import asyncio
import os
import json
import re
import subprocess
import sys
import wave
from datetime import datetime
from pathlib import Path
from uuid import uuid4
from urllib.parse import urlparse
import edge_tts
import aiohttp
from mcp.server.fastmcp import FastMCP

output = Path('E:/DSH/大肥鱼创作室/配音')
output.mkdir(parents=True, exist_ok=True)
server = FastMCP('Dafeiyu TTS')

def record_tts_status(kind: str, details: dict) -> None:
    target = output / '配音组件状态.json'
    try:
        current = json.loads(target.read_text(encoding='utf-8')) if target.exists() else {}
    except (OSError, ValueError):
        current = {}
    current[kind] = {'checkedAt': datetime.now().astimezone().isoformat(), **details}
    temporary = target.with_name(target.name + '.' + uuid4().hex + '.tmp')
    temporary.write_text(json.dumps(current, ensure_ascii=False, indent=2), encoding='utf-8')
    temporary.replace(target)

def srt_time(seconds: float) -> str:
    milliseconds = max(0, round(seconds * 1000))
    hours, milliseconds = divmod(milliseconds, 3600000)
    minutes, milliseconds = divmod(milliseconds, 60000)
    seconds, milliseconds = divmod(milliseconds, 1000)
    return f'{hours:02}:{minutes:02}:{seconds:02},{milliseconds:03}'

@server.tool()
async def tts_offline(text: str, voice: str = 'Microsoft Huihui Desktop',
                      rate: int = 0, volume: int = 100) -> dict:
    """Windows offline draft narration with WAV/SRT; voice differs from Edge neural voices. Preview before publishing."""
    if sys.platform != 'win32':
        raise RuntimeError('Offline voice requires Windows System.Speech')
    if not text.strip() or len(text) > 5000 or not -10 <= rate <= 10 or not 0 <= volume <= 100:
        raise ValueError('Text must contain 1-5000 characters; rate -10..10; volume 0..100')
    stem = datetime.now().strftime('%Y%m%d_%H%M%S') + '_' + uuid4().hex[:8] + '_offline'
    audio, subtitles = output / (stem + '.wav'), output / (stem + '.srt')
    request = output / (stem + '.request.json')
    request.write_text(json.dumps({'text': text, 'audio': str(audio), 'voice': voice,
                                   'rate': rate, 'volume': volume}), encoding='utf-8')
    process = None
    try:
        process = await asyncio.create_subprocess_exec(
            str(Path(os.environ.get('SystemRoot', 'C:/Windows')) / 'System32/WindowsPowerShell/v1.0/powershell.exe'),
            '-NoProfile', '-NonInteractive', '-File', str(Path(__file__).with_name('offline-tts.ps1')),
            '-InputJson', str(request), stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
            creationflags=subprocess.CREATE_NO_WINDOW)
        async with asyncio.timeout(120):
            stdout, stderr = await process.communicate()
        if process.returncode != 0:
            raise RuntimeError('Windows offline speech failed: ' + stderr.decode('utf-8', errors='replace')[-500:])
        marks = json.loads(stdout.decode('utf-8-sig').strip() or '[]')
        with wave.open(str(audio), 'rb') as wav:
            duration = wav.getnframes() / wav.getframerate()
        chunks = []
        for match in re.finditer(r'[^。！？!?；;\n]+[。！？!?；;]?|\n', text):
            segment = match.group().strip()
            if segment:
                for offset in range(0, len(segment), 22):
                    piece = segment[offset:offset + 22]
                    position = match.start() + offset
                    utf16_position = len(text[:position].encode('utf-16-le')) // 2
                    start = next((m['StartSeconds'] for m in marks if m['CharacterPosition'] >= utf16_position), None)
                    chunks.append((piece, start))
        rows = []
        for index, (piece, start) in enumerate(chunks):
            start = start if start is not None else duration * index / max(1, len(chunks))
            end = chunks[index + 1][1] if index + 1 < len(chunks) else duration
            end = end if end is not None else duration * (index + 1) / len(chunks)
            if end > start:
                rows.append(f'{len(rows)+1}\n{srt_time(start)} --> {srt_time(end)}\n{piece}\n')
        subtitles.write_text('\n'.join(rows), encoding='utf-8')
        record_tts_status('offline', {'status': 'passed', 'voice': voice, 'durationSeconds': duration})
        return {'audio_path': str(audio), 'subtitle_path': str(subtitles), 'voice': voice,
                'backend': 'windows-offline', 'duration_seconds': duration,
                'subtitle_timing': 'system-word-events' if marks else 'estimated',
                'warning': '本地备用音色与晓晓神经音色不同；字幕时间需试听校对，不能将其冒充在线神经配音。'}
    finally:
        if process is not None and process.returncode is None:
            process.kill()
            await process.wait()
        request.unlink(missing_ok=True)

def configured_proxy() -> tuple[str | None, str]:
    """Honor the owner's existing environment/Windows proxy without changing it."""
    for name in ('HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy'):
        value = os.environ.get(name)
        if value and urlparse(value).scheme in ('http', 'https'):
            return value, 'environment'
    if sys.platform == 'win32':
        try:
            import winreg
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER,
                               r'Software\Microsoft\Windows\CurrentVersion\Internet Settings') as key:
                enabled = winreg.QueryValueEx(key, 'ProxyEnable')[0]
                value = winreg.QueryValueEx(key, 'ProxyServer')[0]
            if enabled and value:
                if '=' in value:
                    servers = dict(part.split('=', 1) for part in value.split(';') if '=' in part)
                    value = servers.get('https') or servers.get('http')
                if value:
                    value = value if '://' in value else 'http://' + value
                    if urlparse(value).scheme in ('http', 'https'):
                        return value, 'windows-system'
        except (OSError, ValueError):
            pass
    return None, 'direct'

@server.tool()
async def list_voice(locale: str = 'zh-CN') -> list[dict]:
    """List Edge TTS voices; choose a locale such as zh-CN or en-US, or empty for all."""
    proxy, _source = configured_proxy()
    routes = [proxy] + ([None] if proxy else [])
    for index, route in enumerate(routes):
        try:
            async with asyncio.timeout(20):
                voices = await edge_tts.list_voices(proxy=route)
            break
        except (aiohttp.ClientError, TimeoutError):
            if index == len(routes)-1:
                raise
    return [{k: v.get(k) for k in ('ShortName', 'Gender', 'Locale')}
            for v in voices if not locale or v.get('Locale', '').lower() == locale.lower()]

@server.tool()
async def tts(text: str, voice: str = 'zh-CN-XiaoxiaoNeural', srt_enable: bool = True,
              rate: str = '+0%', pitch: str = '+0Hz', volume: str = '+0%') -> dict:
    """Synthesize narration to a local MP3 and optionally SRT. Requires internet access."""
    if not text.strip():
        raise ValueError('Text must not be empty')
    stem = datetime.now().strftime('%Y%m%d_%H%M%S') + '_' + uuid4().hex[:8]
    audio = output / (stem + '.mp3')
    subtitles = output / (stem + '.srt')
    temporary = output / (stem + '.mp3.part')
    proxy, proxy_source = configured_proxy()
    routes = [(proxy, proxy_source)] + ([(None, 'direct-fallback')] if proxy else [])
    try:
        for index, (route, label) in enumerate(routes):
            communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch, volume=volume, proxy=route)
            submaker = edge_tts.SubMaker()
            try:
                async with asyncio.timeout(55):
                    with temporary.open('wb') as stream:
                        async for chunk in communicate.stream():
                            if chunk['type'] == 'audio':
                                stream.write(chunk['data'])
                            elif chunk['type'] in ('WordBoundary', 'SentenceBoundary'):
                                submaker.feed(chunk)
                proxy_source = label
                break
            except (aiohttp.ClientError, TimeoutError, edge_tts.exceptions.NoAudioReceived):
                if index == len(routes)-1:
                    raise
        if not temporary.stat().st_size:
            raise RuntimeError('TTS returned empty audio')
        temporary.replace(audio)
    except Exception as error:
        record_tts_status('online', {'status': 'failed', 'errorType': type(error).__name__,
                                     'connection': proxy_source})
        raise RuntimeError('在线配音未完成：' + type(error).__name__ +
                           '。可使用tts_offline制作备用草稿，音色不同，需试听。') from None
    finally:
        temporary.unlink(missing_ok=True)
    result = {'audio_path': str(audio), 'voice': voice, 'rate': rate,
              'pitch': pitch, 'volume': volume, 'audio_bytes': audio.stat().st_size,
              'connection': proxy_source}
    if srt_enable:
        srt = submaker.get_srt()
        if srt.strip():
            subtitles.write_text(srt, encoding='utf-8')
            result['subtitle_path'] = str(subtitles)
        else:
            result['warning'] = '音频已生成，但服务未返回字幕时间点；不能声称字幕已完成。'
    record_tts_status('online', {'status': 'passed', 'voice': voice,
                                 'connection': proxy_source, 'subtitles': 'subtitle_path' in result})
    return result

if __name__ == '__main__':
    server.run()

"""Pinned official files, resumable GET, verify Git/LFS identities before use."""
import requests, json, hashlib, time, concurrent.futures, argparse
from pathlib import Path
ROOT = Path(__file__).resolve().parent
parser=argparse.ArgumentParser();parser.add_argument('--variant',choices=['design','base'],default='design');args=parser.parse_args()
MODEL,REV,folder = ('Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign','5ecdb67327fd37bb2e042aab12ff7391903235d3','Qwen3-TTS-VoiceDesign') if args.variant=='design' else ('Qwen/Qwen3-TTS-12Hz-0.6B-Base','5d83992436eae1d760afd27aff78a71d676296fc','Qwen3-TTS-Base')
DEST = ROOT / 'models'/folder
DEST.mkdir(parents=True, exist_ok=True)
meta = requests.get(f'https://huggingface.co/api/models/{MODEL}/revision/{REV}?blobs=true', timeout=30)
meta.raise_for_status()
info = meta.json()
assert info['sha'] == REV
files = [x for x in info['siblings'] if not x['rfilename'].startswith('.')]
(DEST/'official-manifest.json').write_text(json.dumps(info, indent=2), encoding='utf-8')

def digest(file, lfs):
    h = hashlib.sha256() if lfs else hashlib.sha1()
    if not lfs: h.update(f'blob {file.stat().st_size}\0'.encode())
    with file.open('rb') as source:
        for chunk in iter(lambda:source.read(4*1024*1024), b''): h.update(chunk)
    return h.hexdigest()

def fetch(entry):
    name = entry['rfilename']
    file = DEST/name
    assert file.resolve().is_relative_to(DEST.resolve())
    file.parent.mkdir(parents=True, exist_ok=True)
    lfs = entry.get('lfs', {})
    expected = lfs.get('sha256') or entry['blobId']
    size = entry['size']
    donor=ROOT/'models/Qwen3-TTS-VoiceDesign'/name
    if args.variant=='base' and not file.exists() and donor.exists() and donor.stat().st_size==size and digest(donor,bool(lfs))==expected:
        file.hardlink_to(donor)
    if file.exists() and file.stat().st_size == size and digest(file, bool(lfs)) == expected:
        return dict(file=name, bytes=size, hash=expected, algorithm='sha256' if lfs else 'git-sha1')
    part = file.with_name(file.name+'.part')
    last_error = None
    for attempt in range(3):
        try:
            offset = part.stat().st_size if part.exists() else 0
            response = requests.get(f'https://huggingface.co/{MODEL}/resolve/{REV}/{name}?download=true',
                headers={'Range':f'bytes={offset}-'} if offset else {}, stream=True, timeout=(30,90))
            response.raise_for_status()
            if response.status_code == 206:
                assert response.headers.get('Content-Range','').startswith(f'bytes {offset}-')
            else: offset = 0
            with response, part.open('ab' if offset else 'wb') as output:
                for chunk in response.iter_content(1024*1024):
                    output.write(chunk)
                    if output.tell() > size: raise RuntimeError('response exceeds pinned file size')
            assert part.stat().st_size == size, 'download incomplete'
            assert digest(part, bool(lfs)) == expected, 'official identity mismatch'
            part.replace(file)
            print(json.dumps(dict(verified=name, bytes=size)), flush=True)
            return dict(file=name, bytes=size, hash=expected, algorithm='sha256' if lfs else 'git-sha1')
        except Exception as exc:
            last_error = type(exc).__name__
            print(json.dumps(dict(file=name, attempt=attempt+1, error=last_error)), flush=True)
            time.sleep(attempt+1)
    raise RuntimeError(f'{name}: {last_error}')

with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    results = list(pool.map(fetch, files))
(DEST/'verified-model.json').write_text(json.dumps(dict(model=MODEL, revision=REV, files=results),indent=2),encoding='utf-8')
print(json.dumps(dict(ready=True, verifiedFiles=len(results))), flush=True)

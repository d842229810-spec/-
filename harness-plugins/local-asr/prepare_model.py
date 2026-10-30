import json
import os
from pathlib import Path
base=Path.home()/'.cache/huggingface/hub/models--Systran--faster-whisper-medium/blobs'
dest=Path.home()/'.dsh/asr-models/faster-whisper-medium'
files={'config.json':'242aa06a480a7b5509375c645097e87af5136774','tokenizer.json':'7818adb6de9fa3064d3ff81226fdd675be1f6344','vocabulary.txt':'c9074644d9d1205686f16d411564729461324b75','model.bin':'9b45e1009dcc4ab601eff815b61d80e60ce3fd8c74c1a14f4a282258286b51ae'}
dest.mkdir(parents=True,exist_ok=True)
for name,blob in files.items():
    source=base/blob
    if not source.is_file() or source.stat().st_size==0:raise RuntimeError('Missing cached model: '+name)
    target=dest/name
    if not target.exists():os.link(source,target)
print(json.dumps({'modelDir':str(dest),'files':list(files),'downloadedModelBytes':0}))

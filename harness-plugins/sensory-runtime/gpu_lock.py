"""One OS-released mutex for owned local sensory jobs. No stale lock deletion."""
import sys,time,msvcrt,contextlib
from pathlib import Path
FILE=Path(__file__).with_name('heavy-gpu.lock')
@contextlib.contextmanager
def gpu_lease(timeout=600):
    FILE.parent.mkdir(parents=True,exist_ok=True)
    with FILE.open('a+b') as f:
        f.seek(0,2)
        if f.tell()==0:f.write(b'0');f.flush()
        began=time.monotonic()
        while True:
            try:f.seek(0);msvcrt.locking(f.fileno(),msvcrt.LK_NBLCK,1);break
            except OSError:
                if time.monotonic()-began>timeout:raise TimeoutError('其他本地感知/配音任务仍在使用显卡，请稍后重试')
                time.sleep(.1)
        try:yield
        finally:f.seek(0);msvcrt.locking(f.fileno(),msvcrt.LK_UNLCK,1)
if __name__=='__main__':
    with gpu_lease():
        print('ready',flush=True)
        sys.stdin.buffer.read()

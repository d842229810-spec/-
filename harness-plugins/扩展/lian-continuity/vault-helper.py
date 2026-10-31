"""Local NTFS append-only journal helper. No network and no model calls."""
import ctypes,hashlib,json,os,pathlib,subprocess,sys,datetime
from ctypes import wintypes
sys.stdin.reconfigure(encoding='utf-8');sys.stdout.reconfigure(encoding='utf-8')
def digest(data):return hashlib.sha256(data).hexdigest()
def canonical(value):return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode('utf-8')
SID=subprocess.check_output(['whoami','/user','/fo','csv','/nh'],encoding='utf-8',errors='replace').strip().split(',')[-1].strip('"')
kernel=ctypes.WinDLL('kernel32',use_last_error=True)
kernel.CreateFileW.argtypes=[wintypes.LPCWSTR,wintypes.DWORD,wintypes.DWORD,ctypes.c_void_p,wintypes.DWORD,wintypes.DWORD,wintypes.HANDLE];kernel.CreateFileW.restype=wintypes.HANDLE
kernel.WriteFile.argtypes=[wintypes.HANDLE,ctypes.c_void_p,wintypes.DWORD,ctypes.POINTER(wintypes.DWORD),ctypes.c_void_p]
kernel.FlushFileBuffers.argtypes=[wintypes.HANDLE];kernel.CloseHandle.argtypes=[wintypes.HANDLE]
kernel.CreateMutexW.argtypes=[ctypes.c_void_p,wintypes.BOOL,wintypes.LPCWSTR];kernel.CreateMutexW.restype=wintypes.HANDLE
kernel.WaitForSingleObject.argtypes=[wintypes.HANDLE,wintypes.DWORD];kernel.ReleaseMutex.argtypes=[wintypes.HANDLE]
HEADS={}
advapi=ctypes.WinDLL('advapi32',use_last_error=True)
advapi.ConvertStringSecurityDescriptorToSecurityDescriptorW.argtypes=[wintypes.LPCWSTR,wintypes.DWORD,ctypes.POINTER(ctypes.c_void_p),ctypes.POINTER(wintypes.DWORD)]
advapi.GetSecurityDescriptorDacl.argtypes=[ctypes.c_void_p,ctypes.POINTER(wintypes.BOOL),ctypes.POINTER(ctypes.c_void_p),ctypes.POINTER(wintypes.BOOL)]
advapi.SetNamedSecurityInfoW.argtypes=[wintypes.LPWSTR,wintypes.DWORD,wintypes.DWORD,ctypes.c_void_p,ctypes.c_void_p,ctypes.c_void_p,ctypes.c_void_p]
kernel.LocalFree.argtypes=[ctypes.c_void_p]
def set_dacl(file,sddl):
 sd=ctypes.c_void_p()
 if not advapi.ConvertStringSecurityDescriptorToSecurityDescriptorW(sddl,1,ctypes.byref(sd),None):raise ctypes.WinError(ctypes.get_last_error())
 try:
  present=wintypes.BOOL();defaulted=wintypes.BOOL();dacl=ctypes.c_void_p()
  if not advapi.GetSecurityDescriptorDacl(sd,ctypes.byref(present),ctypes.byref(dacl),ctypes.byref(defaulted)):raise ctypes.WinError(ctypes.get_last_error())
  result=advapi.SetNamedSecurityInfoW(str(file),1,0x80000004,None,None,dacl,None)
  if result:raise ctypes.WinError(result)
 finally:kernel.LocalFree(sd)
def acl(file,append=False):
 # Exact masks deliberately omit SYNCHRONIZE from the deny ACE. icacls /deny
 # implicitly adds it, which would also block ordinary read/append handles.
 deny='0x10002' if append else '0x10006';allow='0x12008d' if append else '0x120089'
 set_dacl(file,f'D:P(D;;{deny};;;{SID})(A;;FA;;;SY)(A;;FA;;;BA)(A;;{allow};;;{SID})')
def directory_acl(root):set_dacl(root,f'D:P(D;;0x40;;;{SID})(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;FA;;;{SID})')
def init(root):
 root.mkdir(parents=True,exist_ok=True)
 directory_acl(root)
 for name in ['changes.jsonl','conversations.jsonl']:
  p=root/name
  if not p.exists():p.touch()
  acl(p,True)
 (root/'versions').mkdir(exist_ok=True)
 directory_acl(root/'versions')
 return {'ready':True,'filesystemGuard':'NTFS FILE_APPEND_DATA','sid':SID,'administratorCanChangeAcl':True}
def append_bytes(file,data):
 handle=kernel.CreateFileW(str(file),0x0004,0x1|0x2|0x4,None,3,0x80,None)
 if handle==ctypes.c_void_p(-1).value:raise ctypes.WinError(ctypes.get_last_error())
 try:
  written=wintypes.DWORD();buffer=ctypes.create_string_buffer(data)
  if not kernel.WriteFile(handle,buffer,len(data),ctypes.byref(written),None):raise ctypes.WinError(ctypes.get_last_error())
  if written.value!=len(data):raise OSError('incomplete journal append')
  if not kernel.FlushFileBuffers(handle):raise ctypes.WinError(ctypes.get_last_error())
 finally:kernel.CloseHandle(handle)
def verify(file):
 seq=0;prev=None;rows=[]
 if file.exists():
  size=file.stat().st_size
  with file.open('rb') as stream:
   while True:
    offset=stream.tell();line=stream.readline()
    if not line:break
    if not line.endswith(b'\n'):
     raise ValueError(f'MEMORY_LOG_TAIL_INCOMPLETE: offset={offset}, bytesRemaining={len(line)}; original retained')
    try:r=json.loads(line)
    except Exception:
     code='MEMORY_LOG_TAIL_INCOMPLETE' if stream.tell()==size else 'MEMORY_LOG_INVALID_RECORD'
     raise ValueError(f'{code}: offset={offset}; original retained')
    if not isinstance(r,dict) or 'hash' not in r:raise ValueError(f'MEMORY_LOG_INVALID_RECORD: offset={offset}')
    h=r.pop('hash');seq+=1
    if r.get('seq')!=seq or r.get('previous')!=prev:raise ValueError(f'MEMORY_LOG_CHAIN_BROKEN: seq={seq}, offset={offset}')
    if digest(canonical(r))!=h:raise ValueError(f'MEMORY_LOG_HASH_MISMATCH: seq={seq}, offset={offset}')
    prev=h;rows.append({**r,'hash':h})
 return seq,prev,rows
EVENT_CACHE={}
def event_index(file,stat):
 key=str(file);signature=(stat.st_size,stat.st_mtime_ns)
 cached=EVENT_CACHE.get(key)
 if cached and cached[0]==signature:return dict(cached[1])
 _,_,rows=verify(file);idx={}
 for row in rows:
  data=row.get('data') or {};eid=data.get('eventId') if isinstance(data,dict) else None
  if not eid:continue
  content=digest(canonical(data))
  if eid in idx:raise ValueError('MEMORY_LOG_DUPLICATE_EVENT_ID: eventId='+str(eid)+', firstSeq='+str(idx[eid]['seq'])+', duplicateSeq='+str(row['seq'])+', conflicting='+str(idx[eid]['content']!=content)+'; originals retained')
  idx[eid]={'content':content,'seq':row['seq'],'hash':row['hash']}
 # Publish only a verified on-disk snapshot; callers work on a copy.
 EVENT_CACHE[key]=(signature,dict(idx))
 return idx
def main(args):
 root=pathlib.Path(args['root']).resolve()
 if args['action']=='init':return init(root)
 if args['action']=='verify':
  seq,head,_=verify(root/args.get('log','changes.jsonl'));return {'valid':True,'seq':seq,'head':head}
 if args['action']=='blob':
  import base64
  data=base64.b64decode(args['data']);h=digest(data);file=root/'versions'/(h+'.bin')
  mutex=kernel.CreateMutexW(None,False,'Local\\LianMemory-'+digest(str(root).encode())[:24]);wait=kernel.WaitForSingleObject(mutex,30000)
  if wait not in (0,0x80):kernel.CloseHandle(mutex);raise TimeoutError('version writer busy')
  try:
   if not file.exists():
    with file.open('xb') as f:f.write(data);f.flush();os.fsync(f.fileno())
    acl(file)
   elif digest(file.read_bytes())!=h:raise ValueError('version blob hash mismatch')
   return {'sha256':h,'path':str(file),'bytes':len(data)}
  finally:kernel.ReleaseMutex(mutex);kernel.CloseHandle(mutex)
 if args['action']=='append':
  name=args.get('log','changes.jsonl')
  if name not in ['changes.jsonl','conversations.jsonl']:raise ValueError('unknown journal')
  file=root/name;mutex=kernel.CreateMutexW(None,False,'Local\\LianMemory-'+digest(str(root).encode())[:24]);wait=kernel.WaitForSingleObject(mutex,30000)
  if wait not in (0,0x80):kernel.CloseHandle(mutex);raise TimeoutError('journal writer busy')
  try:
   stat=file.stat();size=stat.st_size;cached=HEADS.get(str(file))
   signature=(size,stat.st_mtime_ns)
   if cached and cached[0]==signature:_,seq,prev=cached
   else:seq,prev,_=verify(file)
   records=args['records'];key=str(file)
   need_index=any(isinstance(x,dict) and x.get('eventId') for x in records)
   idx=event_index(file,stat) if need_index else {}
   lines=[];events=[]
   try:
    for data in records:
     eid=data.get('eventId') if isinstance(data,dict) else None
     if eid:
      if not isinstance(eid,str) or len(eid)>300:raise ValueError('MEMORY_INVALID_EVENT_ID')
      content=digest(canonical(data))
      if eid in idx:
       old=idx[eid]
       if old['content']!=content:raise ValueError('MEMORY_EVENT_ID_CONFLICT')
       events.append({'eventId':eid,'status':'exists','seq':old['seq'],'hash':old['hash']});continue
     seq+=1;r={'seq':seq,'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'previous':prev,'data':data};prev=digest(canonical(r));lines.append(canonical({**r,'hash':prev})+b'\n')
     if eid:
      idx[eid]={'content':content,'seq':seq,'hash':prev}
      events.append({'eventId':eid,'status':'appended','seq':seq,'hash':prev})
    if lines:append_bytes(file,b''.join(lines))
    after=file.stat();sig=(after.st_size,after.st_mtime_ns)
    HEADS[key]=(sig,seq,prev)
    if need_index:EVENT_CACHE[key]=(sig,dict(idx))
    else:EVENT_CACHE.pop(key,None)
    return {'seq':seq,'head':prev,'appended':len(lines),'eventResults':events}
   except Exception:
    HEADS.pop(key,None);EVENT_CACHE.pop(key,None)
    raise
  finally:kernel.ReleaseMutex(mutex);kernel.CloseHandle(mutex)
 raise ValueError('unknown action')
for line in sys.stdin:
 try:
  request=json.loads(line);answer=main(request);print(json.dumps({'ok':True,'result':answer},ensure_ascii=False),flush=True)
 except Exception as e:print(json.dumps({'ok':False,'errorType':type(e).__name__,'error':str(e)},ensure_ascii=False),flush=True)

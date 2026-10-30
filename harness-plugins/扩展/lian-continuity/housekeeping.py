"""Narrow, reversible maintenance. No permanent deletion operation exists."""
from pathlib import Path
import os,json,hashlib,datetime,uuid,sys,functools

def stamp():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def sha(p):
 h=hashlib.sha256()
 with open(p,'rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
def atomic(p,data):
 p.parent.mkdir(parents=True,exist_ok=True);t=p.with_name(p.name+'.'+uuid.uuid4().hex+'.tmp')
 with t.open('w',encoding='utf-8') as f:json.dump(data,f,ensure_ascii=False,indent=2);f.flush();os.fsync(f.fileno())
 os.replace(t,p)
def batch_locked(fn):
 @functools.wraps(fn)
 def run(self,batch,*args,**kwargs):
  p=self.safe(self.batchfile(batch).with_suffix('.lock'),must_exist=False);p.parent.mkdir(parents=True,exist_ok=True)
  with p.open('a+b') as lock:
   if p.stat().st_size==0:lock.write(b'0');lock.flush()
   lock.seek(0)
   try:
    if os.name=='nt':
     import msvcrt;msvcrt.locking(lock.fileno(),msvcrt.LK_NBLCK,1)
    else:
     import fcntl;fcntl.flock(lock.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
   except OSError:raise ValueError('该批次正在被另一个操作处理，请稍后查看清单，不并发覆盖')
   try:return fn(self,batch,*args,**kwargs)
   finally:
    lock.seek(0)
    if os.name=='nt':msvcrt.locking(lock.fileno(),msvcrt.LK_UNLCK,1)
    else:fcntl.flock(lock.fileno(),fcntl.LOCK_UN)
 return run
class Housekeeping:
 def __init__(self,home=Path('E:/LianHome'),backup_root=Path('C:/Users/USER/Documents/小涟恢复备份'),minimum_days=7):
  self.home=Path(home).absolute();self.backup_root=Path(backup_root).absolute();self.minimum_days=minimum_days
  self.state=self.home/'安装验收/可回退整理';self.batches=self.state/'batches';self.quarantine=self.state/'quarantine'
 def safe(self,p,base=None,must_exist=True):
  p=Path(p).absolute();base=Path(base or self.home).absolute()
  if p==base or base not in p.parents:raise ValueError('路径不在明确授权子目录内')
  # Check all ancestors, including root. resolve() alone would silently follow junctions.
  for q in [p,*p.parents]:
   if q.exists() or q.is_symlink():
    s=q.lstat()
    if q.is_symlink() or getattr(s,'st_file_attributes',0)&0x400:raise ValueError('跳过链接/目录联接/重解析点')
  if must_exist and not p.is_file():raise ValueError('不是实际普通文件')
  if base.resolve() not in p.resolve(strict=False).parents:raise ValueError('解析后路径越界')
  return p
 def batchfile(self,batch):
  if not isinstance(batch,str) or not batch.replace('-','').isalnum():raise ValueError('无效批次ID')
  return self.safe(self.batches/(batch+'.json'),must_exist=False)
 def audit(self,record):
  self.state.mkdir(parents=True,exist_ok=True);p=self.safe(self.state/'actions.jsonl',must_exist=False)
  with p.open('a',encoding='utf-8') as f:f.write(json.dumps({'at':stamp(),**record},ensure_ascii=False)+'\n');f.flush();os.fsync(f.fileno())
 def proof(self,p):
  p=self.safe(p);v=json.loads(p.read_text(encoding='utf-8'))
  if not(v.get('pass') and v.get('restoredFileHashesMatch') and v.get('session',{}).get('zstdComplete')):raise ValueError('恢复校验证据不完整')
  archive=self.safe(v['encryptedArchive'],self.backup_root)
  if archive.suffix!='.lianbackup' or sha(archive)!=v['encryptedSha256']:raise ValueError('加密恢复包已变化或缺失')
  return {'file':str(p),'sha256':sha(p),'encryptedArchive':str(archive),'encryptedSha256':v['encryptedSha256']}
 def candidate(self,p):
  p=self.safe(p);rel=p.relative_to(self.home)
  if len(rel.parts)!=4 or rel.parts[:2]!=('安装验收','恢复演练') or rel.name!='isolated-restore.zip':raise ValueError('只允许恢复演练中已验证的重复ZIP；原作品、样音、记忆、观察报告均不在白名单')
  twin=self.safe(p.with_name('private-snapshot.zip'));proof=self.proof(p.with_name('verification.json'))
  digest=sha(p)
  if digest!=sha(twin):raise ValueError('恢复ZIP并非相同的重复副本')
  age=(datetime.datetime.now(datetime.timezone.utc).timestamp()-p.stat().st_mtime)/86400
  return {'file':str(p),'relative':str(rel),'sha256':digest,'bytes':p.stat().st_size,'reason':'已恢复验证且与保留的private-snapshot.zip逐字节同哈希的演练ZIP副本','retainedTwin':str(twin),'proof':proof,'ageDays':round(age,2),'eligible':age>=self.minimum_days,'minimumAgeDays':self.minimum_days,'retainDays':30}
 def scan(self):
  root=self.home/'安装验收/恢复演练';rows=[];skipped=[]
  if root.exists():
   # Do not recursively glob through arbitrary paths/junctions.
   self.safe(root/'_boundary_check',must_exist=False)
   for d in os.scandir(root):
    if not d.is_dir(follow_symlinks=False):continue
    try:
     self.safe(Path(d.path)/'_boundary_check',must_exist=False)
     p=Path(d.path)/'isolated-restore.zip'
     if p.exists():rows.append(self.candidate(p))
    except (OSError,ValueError,KeyError,json.JSONDecodeError) as e:skipped.append({'directory':d.name,'reason':str(e)})
  batch=datetime.datetime.now().strftime('%Y%m%d%H%M%S')+'-'+uuid.uuid4().hex[:8]
  data={'id':batch,'at':stamp(),'state':'shadow','rows':rows,'skipped':skipped,'permanentDelete':False,'approval':None,'moved':[],'notice':'候选扫描不代表已搬移；前五批及当前策略均要求小涟审阅。至少7天后才可隔离，隔离保留30天但不会自动永久删除。'}
  atomic(self.batchfile(batch),data);md=self.batches/(batch+'.md')
  text='# 可回退整理候选 '+batch+'\n\n影子扫描；未搬移，未删除。只处理已验证的重复演练ZIP，原作品和失败作品均保留。\n\n'
  for r in rows:text+=f"- `{r['relative']}`，{r['bytes']/1024**2:.1f} MiB，存放 {r['ageDays']} 天，{'达到隔离条件' if r['eligible'] else '未满7天，暂不隔离'}。\n  原因：{r['reason']}。保留原件：`{r['retainedTwin']}`。\n"
  text+='\n恢复：whale_housekeeping restore +本批次ID。恢复会核对哈希，原路径存在时停止，不覆盖。\n';self.safe(md,must_exist=False).write_text(text,encoding='utf-8')
  self.audit({'action':'shadow-scan','batch':batch,'count':len(rows),'modelCalls':0});return {'batch':batch,'manifest':str(self.batchfile(batch)),'readable':str(md),'candidates':len(rows),'eligible':sum(r['eligible'] for r in rows),'bytes':sum(r['bytes'] for r in rows),'moved':0,'permanentDelete':False,'skipped':skipped}
 @batch_locked
 def approve(self,batch,actor,reason):
  if not actor or not reason or not reason.strip():raise ValueError('需要小涟实际会话审阅清单后给出理由')
  p=self.batchfile(batch);d=json.loads(p.read_text(encoding='utf-8'))
  if d['state']!='shadow':raise ValueError('只有未执行的影子批次可以批准')
  d['approval']={'actor':actor,'at':stamp(),'reason':reason};atomic(p,d);self.audit({'action':'approve','batch':batch,**d['approval']});return {'batch':batch,'approved':True,'moved':0}
 @batch_locked
 def quarantine_batch(self,batch):
  p=self.batchfile(batch);d=json.loads(p.read_text(encoding='utf-8'))
  if not d.get('approval'):raise ValueError('尚未收到小涟对本批具体清单的同意')
  if d['state']!='shadow':raise ValueError('批次已执行或需要恢复，不重复搬移')
  # Revalidate every source and destination before the first move.
  ready=[]
  for r in d['rows']:
   c=self.candidate(Path(r['file']))
   if c['sha256']!=r['sha256'] or c['relative']!=r['relative'] or c['proof']['encryptedSha256']!=r['proof']['encryptedSha256']:raise ValueError('候选或恢复依据已变化，重新扫描')
   if not c['eligible']:continue
   dest=self.safe(self.quarantine/batch/r['relative'],must_exist=False)
   if dest.exists():raise ValueError('隔离目标已存在，不覆盖')
   ready.append((r,dest))
  d['state']='moving';atomic(p,d)
  for r,dest in ready:
   source=self.safe(r['file']);dest.parent.mkdir(parents=True,exist_ok=True);self.safe(dest,must_exist=False)
   if sha(source)!=r['sha256']:raise ValueError('搬移前源文件变化')
   entry={**r,'destination':str(dest),'movedAt':stamp(),'restored':False}
   # Persist intent before the atomic rename; restore reconciles interrupted moves.
   d['moved'].append(entry);atomic(p,d);self.audit({'action':'move-intent','batch':batch,'file':str(source),'destination':str(dest),'sha256':r['sha256']})
   os.rename(source,dest);entry['completed']=True;atomic(p,d)
  d['state']='quarantined';atomic(p,d);self.audit({'action':'quarantined','batch':batch,'moved':len(ready)})
  return {'batch':batch,'moved':len(ready),'retainDays':30,'permanentDelete':False,'sameDiskSpaceFreed':0}
 @batch_locked
 def restore(self,batch):
  p=self.batchfile(batch);d=json.loads(p.read_text(encoding='utf-8'));count=0
  for r in reversed(d['moved']):
   if r.get('restored'):continue
   dest=self.safe(r['destination'],must_exist=False);source=self.safe(r['file'],must_exist=False);rel=source.relative_to(self.home)
   if len(rel.parts)!=4 or rel.parts[:2]!=('安装验收','恢复演练') or rel.name!='isolated-restore.zip':raise ValueError('恢复原路径不在重复演练ZIP白名单')
   expected=self.safe(self.quarantine/batch/rel,must_exist=False)
   if dest!=expected:raise ValueError('隔离路径与批次/原相对路径不匹配，拒绝不明搬移')
   if not dest.exists() and source.exists() and sha(source)==r['sha256']:r['restored']=True;continue
   if source.exists():raise ValueError('原路径已存在，不覆盖')
   if sha(dest)!=r['sha256']:raise ValueError('隔离文件哈希不匹配')
   source.parent.mkdir(parents=True,exist_ok=True);self.safe(source,must_exist=False);os.rename(dest,source);r['restored']=True;count+=1;atomic(p,d)
  d['state']='restored';atomic(p,d);self.audit({'action':'restored','batch':batch,'files':count});return {'batch':batch,'restored':count,'permanentDelete':False}
def main():
 a=json.loads(sys.stdin.buffer.read().decode('utf-8'));h=Housekeeping();op=a['action']
 if op=='scan':r=h.scan()
 elif op=='approve':r=h.approve(a['batch'],a.get('actor'),a.get('reason'))
 elif op=='quarantine':r=h.quarantine_batch(a['batch'])
 elif op=='restore':r=h.restore(a['batch'])
 else:raise ValueError('只支持scan/approve/quarantine/restore；没有永久删除操作')
 print(json.dumps(r,ensure_ascii=False))
if __name__=='__main__':main()

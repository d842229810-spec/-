"""Encrypted cross-disk snapshots; isolated restore only, no live overwrite."""
from pathlib import Path
import sys,os,json,hashlib,sqlite3,zipfile,datetime,shutil,subprocess,re
from cryptography.hazmat.primitives.ciphers import Cipher,algorithms,modes
HOME=Path('E:/LianHome');HARNESS=Path('E:/DSH');_KEY_NEW=HOME/'记忆/连续性档案/恢复凭据/小涟恢复密钥_20261027.key';_KEY_OLD=HOME/'收件箱/恢复凭据/小涟恢复密钥_20261027.key';KEY=_KEY_NEW if _KEY_NEW.exists() else _KEY_OLD;DEST=Path('C:/Users/USER/Documents/小涟恢复备份');ROOT=HOME/'安装验收/恢复演练'
SKIP={'node_modules','.git','.venv','__pycache__','models','checkpoints','dist','build','target','.cache','连续性档案'}
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  while b:=f.read(4*1024**2):h.update(b)
 return h.hexdigest()
def copy(p,d):
 d.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,d)
def tree(p,d,code=False):
 if not p.exists():return
 for base,dirs,files in os.walk(p,followlinks=False):
  dirs[:]=[n for n in dirs if n not in SKIP and not (Path(base)/n).is_symlink()]
  for n in files:
   f=Path(base)/n
   if f.is_symlink() or f.suffix in {'.lock','.pyc','.log','.exe','.dll','.safetensors','.pt','.gguf'}:continue
   if code and (f.stat().st_size>4*1024**2 or f.suffix.lower() not in {'.js','.mjs','.cjs','.py','.md','.json','.toml','.yaml','.yml','.txt','.html','.css','.ts','.tsx','.ini'}):continue
   copy(f,d/f.relative_to(p))
def check_vault(root):
 out={}
 for name in ['changes.jsonl','conversations.jsonl']:
  seq=0;head=None
  for line in (root/name).read_text(encoding='utf-8').splitlines():
   if not line.strip():continue
   r=json.loads(line);digest=r.pop('hash');assert r['seq']==seq+1 and r['previous']==head,'journal sequence/head mismatch'
   encoded=json.dumps(r,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode();assert hashlib.sha256(encoded).hexdigest()==digest,'journal hash mismatch';seq=r['seq'];head=digest
   data=r['data']
   for key in ['version','beforeVersion']:
    if data.get(key):
     version=root/'versions'/Path(data[key]).name
     assert version.is_file() and sha(version)==version.stem,'version blob missing or altered'
  out[name]={'seq':seq,'head':head,'valid':True}
 return out
def verify(encrypted,key,run):
 raw=encrypted.read_bytes();assert raw[:8]==b'LIANBK01','unknown archive version';dec=Cipher(algorithms.AES(key),modes.GCM(raw[8:20],raw[-16:])).decryptor();data=dec.update(raw[20:-16])+dec.finalize()
 archive=run/'isolated-restore.zip';archive.write_bytes(data);restored=run/'isolated';restored.mkdir()
 with zipfile.ZipFile(archive) as z:
  for info in z.infolist():assert (restored/info.filename).resolve().is_relative_to(restored.resolve()),'archive path traversal'
  z.extractall(restored)
 manifest=json.loads((restored/'manifest.json').read_text(encoding='utf-8'));assert all(sha(restored/r['file'])==r['sha256'] for r in manifest['files'])
 with sqlite3.connect((restored/'home/记忆/连续性档案/continuity.sqlite').as_uri()+'?mode=ro',uri=True) as db:
  assert db.execute('pragma quick_check').fetchone()[0]=='ok';counts={t:db.execute('select count(*) from '+t).fetchone()[0] for t in ['memory_documents','notes','tasks','voice_feedback','creative_feedback']}
 operational={}
 for name in ['qq-community.sqlite','qq-voice.sqlite']:
  f=restored/'dsh'/name
  if f.is_file():
   with sqlite3.connect(f.as_uri()+'?mode=ro',uri=True) as db:assert db.execute('pragma quick_check').fetchone()[0]=='ok'
   operational[name]='quick_check ok'
 ledger=restored/'voyage/state.json'
 if ledger.is_file():
  state=json.loads(ledger.read_text(encoding='utf-8'));assert state.get('requestLedger') is not None and state.get('days') is not None;operational['freeBudgetRequests']=len(state['requestLedger'])
 vault=check_vault(restored/'vault')
 node=HARNESS/'本体/resources/runtime/primary-runtime/dependencies/node/bin/node.exe'
 p=subprocess.run([str(node),str(Path(__file__).with_name('verify-session.cjs')),str(restored/'session/session.v4.jsonl.zstd')],capture_output=True,encoding='utf-8');assert p.returncode==0,p.stderr
 session=json.loads(p.stdout)
 return {'restoredFileHashesMatch':True,'database':counts,'operationalLedgers':operational,'vault':vault,'session':session,'isolatedRestore':str(restored),'fileCount':len(manifest['files'])}
def main():
 args=json.load(sys.stdin);action=args.get('action','create');ROOT.mkdir(parents=True,exist_ok=True);DEST.mkdir(exist_ok=True)
 if not KEY.is_file() or KEY.stat().st_size!=32:raise ValueError('便携恢复密钥不存在或无效；不覆盖生成新密钥。')
 key=KEY.read_bytes();tag=datetime.datetime.now().strftime('%Y%m%d-%H%M%S-%f');run=ROOT/tag;run.mkdir()
 if action=='create':
  data=run/'snapshot';data.mkdir()
  for name in ['记忆','聊天','日志','花园']:tree(HOME/name,data/'home'/name)
  # The directory traversal excludes continuity databases; use SQLite backup API.
  dbsrc=HOME/'记忆/连续性档案/continuity.sqlite';dbdst=data/'home/记忆/连续性档案/continuity.sqlite';dbdst.parent.mkdir(parents=True,exist_ok=True)
  for p in list(dbdst.parent.glob('*.sqlite*')):
   if p.is_file():raise ValueError('snapshot already contains a database; refuse an inconsistent copy')
  with sqlite3.connect(dbsrc.as_uri()+'?mode=ro',uri=True) as src,sqlite3.connect(dbdst) as db:src.backup(db)
  for name in ['identity-versions','checkpoints']:tree(dbsrc.parent/name,dbdst.parent/name)
  for name in ['vault-anchors.json','lifecycle-config.json','context-lifecycle.json']:
   if (dbsrc.parent/name).is_file():copy(dbsrc.parent/name,dbdst.parent/name)
  housekeeping=HOME/'安装验收/可回退整理'
  if housekeeping.is_dir():
   for p in housekeeping.rglob('*'):
    if p.is_file() and p.suffix in {'.json','.jsonl','.md'} and 'quarantine' not in p.relative_to(housekeeping).parts:copy(p,data/'home/安装验收/可回退整理'/p.relative_to(housekeeping))
  for name in ['AGENTS.md','README.md']:copy(HOME/name,data/'home'/name)
  tree(HARNESS/'插件/lian-memory-vault',data/'vault')
  session=Path('C:/Users/USER/.dsh/sessions/--E-~80A5~9C7C~4E4B~5BB6--/session-00000000-0000-0000-0000-000000000000');tree(session,data/'session')
  tree(Path('C:/Users/USER/.dsh/profiles/desktop'),data/'profile',True)
  # Restore stable settings, never replay a one-time maintenance job on recovery.
  trigger_keys={'compressionReviewId','memoryAcceptanceId','memoryCheckpoint','handoffId','handoffFile','handoffKind','growthMaintenanceId','growthRecovery','growthAcceptanceId','growthFinalRecovery','auditInventoryId','compactMaintenanceId','compactConsentFile','compactCheckpoint','compactRecoveryProof','compactReportFile','verificationId','fixProbeId','acceptedProbeId','hearingProbeId','hearingFixture','sensoryProbeId','sensoryFollowupProbeId','economyProbeId','voiceHookProbeId','historyVerificationId','networkVerificationId','costReconciliationId'}
  for profile in (data/'profile').glob('*.yml'):
   text=profile.read_text(encoding='utf-8');text=''.join(line for line in text.splitlines(keepends=True) if not (re.match(r'^\s*([A-Za-z][\w]*):',line) and re.match(r'^\s*([A-Za-z][\w]*):',line).group(1) in trigger_keys));profile.write_text(text,encoding='utf-8')
  tree(HARNESS/'插件/扩展',data/'plugins/扩展',True);tree(HARNESS/'插件/dafeiyu-life',data/'plugins/dafeiyu-life',True)
  for p in (HARNESS/'插件').iterdir():
   if p.is_dir() and p.name.endswith('-runtime'):
    for f in p.iterdir():
     if f.is_file() and f.suffix.lower() in {'.py','.js','.mjs','.cjs','.json','.yaml','.yml','.toml','.txt','.md','.cfg'} and f.stat().st_size<4*1024**2:copy(f,data/'runtime-adapters'/p.name/f.name)
  for name in ['settings.json','state.json','B站评论账本.json','价格快照_20261027.json']:
   if (HARNESS/'涟的探索'/name).is_file():copy(HARNESS/'涟的探索'/name,data/'voyage'/name)
  tree(HARNESS/'涟的探索/活动记录',data/'voyage/活动记录')
  dsh=Path('C:/Users/USER/.dsh')
  for name in ['qq-bridge-config.json','qq-bridge-receipts.json','qq-group-turns.json']:
   if (dsh/name).is_file():copy(dsh/name,data/'dsh'/name)
  for name in ['qq-community.sqlite','qq-voice.sqlite']:
   if (dsh/name).is_file():
    dst=data/'dsh'/name;dst.parent.mkdir(exist_ok=True)
    with sqlite3.connect((dsh/name).as_uri()+'?mode=ro',uri=True) as src,sqlite3.connect(dst) as target:src.backup(target)
  capability=HOME/'安装验收/20261026-全插件技能审查/能力验收记录.json'
  if capability.is_file():copy(capability,data/'home/安装验收/20261026-全插件技能审查/能力验收记录.json')
  for name in ['人设.md','形象设定.md']:copy(HARNESS/'大肥鱼创作室'/name,data/'creative'/name)
  copy(HARNESS/'插件/voice-design-runtime/selected-voice.json',data/'voice/selected-voice.json');copy(HOME/'工作室/声音设计/20261026_原创候选/C_慵懒机灵.wav',data/'voice/C_慵懒机灵.wav')
  for p in (HARNESS/'插件').glob('*/verified*.json'):copy(p,data/'model-manifests'/p.parent.name/p.name)
  artifacts=[];sources=[]
  with sqlite3.connect(dbdst) as db:
   db.row_factory=sqlite3.Row
   for table,column in [('voice_feedback','audio'),('creative_feedback','subject')]:
    for row in db.execute('SELECT * FROM '+table):
     proof=json.loads(row['sourceProof'] or '{}');files=[row[column]]+[x['file'] for x in proof.get('subjects',[])]
     for name in files:
      p=Path(name)
      if p.is_file() and p.stat().st_size<=100*1024**2:
       rel=Path('feedback-artifacts')/(sha(p)+p.suffix);copy(p,data/rel);artifacts.append({'original':name,'archive':rel.as_posix(),'sha256':sha(p)})
     if proof.get('backend')=='codex' and Path(proof.get('file','')).is_file():
      with Path(proof['file']).open('rb') as original:
       for index,line in enumerate(original,1):
        if index==proof['line']:
         assert hashlib.sha256(line).hexdigest()==proof['lineSha256'],'original human feedback line changed';rel=Path('feedback-sources')/(proof['lineSha256']+'.jsonl');(data/rel).parent.mkdir(exist_ok=True);(data/rel).write_bytes(line);sources.append({'originalFile':proof['file'],'originalLine':index,'archive':rel.as_posix(),'sha256':proof['lineSha256']});break
  (data/'feedback-subjects.json').write_text(json.dumps({'artifacts':artifacts,'originalHumanSources':sources},ensure_ascii=False,indent=2),encoding='utf-8')
  (data/'恢复说明.md').write_text('''# 小涟选定资料恢复说明
这是选定资料恢复包，不是操作系统镜像或全部作品备份。
先保留一份现状，再把恢复包解密到新的隔离目录；验证manifest、SQLite、vault链与zstd后再选择恢复。
home对应E:/LianHome；plugins对应E:/DSH/插件；session对应原.dsh主会话目录；profile对应.dsh/profiles/desktop。
vault对应插件/lian-memory-vault，恢复旧版本与追加日志时需重新核对NTFS权限，不直接复制旧ACL。
runtime-adapters只保存自建适配器和依赖说明，不含完整Python/Node环境或通用模型权重；按原版本重新建立环境，核对model-manifests。
voice包含正式C参考和配置。feedback-artifacts按哈希保留反馈所指的音频/稿件，原路径映射见feedback-subjects.json。
voyage保存自由活动/评论的账本与审计记录；dsh保存QQ群0.5元账本、语音回执及桥接绑定。分别恢复到原涟的探索目录与.dsh；恢复前先冻结当前运行，不能拿旧日账覆盖新支出或重复发送已发内容。账号登录状态可能需要重新授权。
Codex原始人类意见按原消息行另存，保留行号、哈希和来源渠道，不伪造为Harness消息。
跨机器恢复时路径和本机凭据可能需要重绑；不要盲目覆盖现有profile或重复发送已有发布回执。
便携密钥不在此包内，阿水需另行安全保存；同一电脑的双盘副本不替代异地备份。恢复用profile已移除一次性维护/交接/探针触发字段，避免恢复时重放旧任务；稳定配置与权限保留。
''',encoding='utf-8')
  records=[{'file':p.relative_to(data).as_posix(),'bytes':p.stat().st_size,'sha256':sha(p)} for p in data.rglob('*') if p.is_file()]
  (data/'manifest.json').write_text(json.dumps({'at':tag,'files':records,'private':True,'genericWeightsExcluded':True,'snapshotScope':'Selected home memory, consistent SQLite, raw session, vault, custom source/adapters, profile and C reference. Not an image of the OS or all works.'},ensure_ascii=False,indent=2),encoding='utf-8')
  archive=run/'private-snapshot.zip'
  with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=3) as z:
   for p in data.rglob('*'):
    if p.is_file():z.write(p,p.relative_to(data).as_posix())
  nonce=os.urandom(12);enc=Cipher(algorithms.AES(key),modes.GCM(nonce)).encryptor();encrypted=DEST/('小涟恢复包_'+tag+'.lianbackup')
  with archive.open('rb') as inp,encrypted.open('xb') as out:
   out.write(b'LIANBK01'+nonce)
   while b:=inp.read(4*1024**2):out.write(enc.update(b))
   out.write(enc.finalize());out.write(enc.tag)
 elif action=='verify':
  encrypted=Path(args['archive']).resolve();assert encrypted.is_relative_to(DEST.resolve()) and encrypted.suffix=='.lianbackup','请选择本机加密备份目录的恢复包'
 else:raise ValueError('action must be create or verify')
 result={'at':tag,'pass':True,'encryptedArchive':str(encrypted),'encryptedSha256':sha(encrypted),'archiveBytes':encrypted.stat().st_size,'portableKeyFile':str(KEY),'keyExportedOffMachine':False,'fullDiskImage':False,'sourceDisk':1,'replicaDisk':0,**verify(encrypted,key,run)}
 (run/'verification.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps(result,ensure_ascii=False))
if __name__=='__main__':main()

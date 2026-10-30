/** Durable, workspace-local recovery. Never silently falls back to permanent deletion. */
import { constants } from 'node:fs'
import { copyFile, lstat, mkdir, readFile, readdir, realpath, rename, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, join, relative, resolve } from 'node:path'
import { ensureWorkspaceEntryPath, ensureWorkspacePath, ensureWorkspaceWritePath, RECOVERY_DIRECTORY } from './path-security.ts'
import { SidebarError } from './wire.ts'
import { invalidateDirectoryCache } from './fs-tree.ts'

interface RecoveryRecord {
  schema: 1
  id: string
  originalRelativePath: string
  kind: 'deleted' | 'overwrite'
  entryType: 'file' | 'directory' | 'symlink'
  createdAt: string
  restoredAt?: string
}
const pending = new Map<string, Promise<void>>()

/** Serializes plugin mutations in one workspace; it cannot lock external programs. */
export async function withWorkspaceMutation<T>(cwd: string, action: () => Promise<T>): Promise<T> {
  const canonical = await realpath(cwd)
  const key = process.platform === 'win32' ? canonical.toLowerCase() : canonical
  const previous = pending.get(key) ?? Promise.resolve()
  let release!: () => void
  const gate = new Promise<void>(done => { release = done })
  const tail = previous.catch(() => {}).then(() => gate)
  pending.set(key, tail)
  await previous.catch(() => {})
  try { return await action() }
  finally { release(); if (pending.get(key) === tail) pending.delete(key) }
}

async function recoveryRoot(cwd: string, create: boolean): Promise<string> {
  const workspace = await ensureWorkspacePath(cwd, cwd)
  const root = join(workspace, RECOVERY_DIRECTORY)
  if (create) await mkdir(root, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error })
  const entry = await lstat(root)
  if (!entry.isDirectory() || entry.isSymbolicLink()) throw new SidebarError('forbidden', 'recovery storage must be a real workspace directory', 403)
  await ensureWorkspacePath(cwd, root)
  if (create) await writeFile(join(root, '.gitignore'), '*\n', { flag: 'wx', mode: 0o600 }).catch(error => { if (error.code !== 'EEXIST') throw error })
  return root
}

async function entryDirectory(cwd: string, id: string): Promise<string> {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)) throw new SidebarError('bad-request', 'invalid recovery id', 400)
  const directory = join(await recoveryRoot(cwd, false), id)
  const info = await lstat(directory)
  if (!info.isDirectory() || info.isSymbolicLink()) throw new SidebarError('forbidden', 'invalid recovery directory', 403)
  return ensureWorkspacePath(cwd, directory)
}

async function saveRecovery(cwd: string, path: string, kind: RecoveryRecord['kind']): Promise<string | undefined> {
  const absolute = kind === 'deleted' ? await ensureWorkspaceEntryPath(cwd, path) : await ensureWorkspaceWritePath(cwd, path)
  let info
  try { info = await lstat(absolute) }
  catch (error) { if (kind === 'overwrite' && (error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error }
  if (kind === 'overwrite' && !info.isFile() && !info.isSymbolicLink()) throw new SidebarError('fs-error', 'cannot overwrite a directory', 400)
  const root = await recoveryRoot(cwd, true)
  const id = randomUUID()
  const directory = join(root, id)
  await mkdir(directory, { mode: 0o700 })
  const record: RecoveryRecord = {
    schema: 1, id, originalRelativePath: relative(resolve(cwd), absolute), kind,
    entryType: kind === 'overwrite' ? 'file' : info.isSymbolicLink() ? 'symlink' : info.isDirectory() ? 'directory' : 'file',
    createdAt: new Date().toISOString(),
  }
  // Metadata is written before moving bytes. A crash can leave an empty entry,
  // but list/restore only accept entries whose payload actually exists.
  await writeFile(join(directory, 'record.json'), JSON.stringify(record, null, 2), { flag: 'wx', mode: 0o600 })
  if (kind === 'deleted') await rename(absolute, join(directory, 'content'))
  else {
    // Publish only a completed copy; process interruption must not expose a
    // partially copied previous version as a valid recovery entry.
    const pendingContent = join(directory, 'content.pending')
    await copyFile(absolute, pendingContent, constants.COPYFILE_EXCL)
    await rename(pendingContent, join(directory, 'content'))
  }
  invalidateDirectoryCache(dirname(absolute))
  return id
}

export function preserveBeforeOverwrite(cwd: string, path: string): Promise<string | undefined> {
  return saveRecovery(cwd, path, 'overwrite')
}
export async function archiveWorkspaceEntry(cwd: string, path: string): Promise<string> {
  return (await saveRecovery(cwd, path, 'deleted'))!
}

async function readRecord(cwd: string, id: string): Promise<{ directory: string; record: RecoveryRecord }> {
  const directory = await entryDirectory(cwd, id)
  const file = join(directory, 'record.json')
  if ((await lstat(file)).isSymbolicLink()) throw new SidebarError('forbidden', 'recovery metadata cannot be a link', 403)
  const record = JSON.parse(await readFile(file, 'utf8')) as RecoveryRecord
  if (record.schema !== 1 || record.id !== id || typeof record.originalRelativePath !== 'string' ||
      !['deleted', 'overwrite'].includes(record.kind) || !['file', 'directory', 'symlink'].includes(record.entryType)) {
    throw new SidebarError('fs-error', 'invalid recovery record', 400)
  }
  try {
    const marker = join(directory, 'restored.json')
    if ((await lstat(marker)).isSymbolicLink()) throw new SidebarError('forbidden', 'invalid restore marker', 403)
    const restored = JSON.parse(await readFile(marker, 'utf8'))
    if (typeof restored.restoredAt === 'string') record.restoredAt = restored.restoredAt
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  await ensureWorkspaceWritePath(cwd, join(cwd, record.originalRelativePath))
  const payload = join(directory, 'content')
  const payloadInfo = await lstat(payload)
  if (!(record.kind === 'deleted' && record.entryType === 'symlink' && payloadInfo.isSymbolicLink())) {
    if (payloadInfo.isSymbolicLink()) throw new SidebarError('forbidden', 'recovery bytes cannot be a link', 403)
    await ensureWorkspacePath(cwd, payload)
  }
  return { directory, record }
}

export async function listWorkspaceRecovery(cwd: string): Promise<RecoveryRecord[]> {
  let root: string
  try { root = await recoveryRoot(cwd, false) }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error }
  const records: RecoveryRecord[] = []
  for (const item of await readdir(root, { withFileTypes: true })) {
    if (!item.isDirectory() || item.isSymbolicLink()) continue
    try { const { record } = await readRecord(cwd, item.name); if (!record.restoredAt) records.push(record) }
    catch { /* incomplete entries are retained on disk for manual recovery */ }
  }
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** Restore only to an absent original destination. Existing work is never overwritten. */
export async function restoreWorkspaceRecovery(cwd: string, id: string): Promise<{ path: string }> {
  return withWorkspaceMutation(cwd, async () => {
    const { directory, record } = await readRecord(cwd, id)
    if (record.restoredAt) throw new SidebarError('fs-conflict', 'recovery entry was already restored', 409)
    const target = await ensureWorkspaceWritePath(cwd, join(cwd, record.originalRelativePath))
    if (resolve(target) === resolve(cwd)) throw new SidebarError('forbidden', 'cannot replace the workspace root', 403)
    try { await lstat(target); throw new SidebarError('fs-conflict', 'restore destination already exists; rename it first', 409) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    await mkdir(dirname(target), { recursive: true })
    await ensureWorkspaceWritePath(cwd, target)
    const content = join(directory, 'content')
    if (record.entryType === 'directory' || record.entryType === 'symlink') await rename(content, target)
    else await copyFile(content, target, constants.COPYFILE_EXCL)
    await writeFile(join(directory, 'restored.json'), JSON.stringify({ restoredAt: new Date().toISOString() }), { flag: 'wx', mode: 0o600 })
    invalidateDirectoryCache(dirname(target))
    return { path: target }
  })
}

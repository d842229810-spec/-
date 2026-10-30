import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const run = promisify(execFile)
const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dependencyRoot = process.env.SIDEBAR_DEPENDENCY_ROOT || 'E:/DSH/插件/扩展/node_modules'
const esbuild = await import(pathToFileURL(path.join(dependencyRoot, 'esbuild/lib/main.js')).href)
await fs.mkdir(path.join(base, '.test-build'), { recursive: true })
await esbuild.build({
  stdin: { contents: ["export * from './src/path-security.ts'", "export * from './src/fs-operations.ts'", "export * from './src/recovery.ts'", "export * from './src/fs-search.ts'", "export * from './src/session-workspace.ts'", "export * from './src/fs-tree.ts'", "export * from './src/archive-tools.ts'"].join('\n'), resolveDir: base, sourcefile: 'hardening-entry.ts', loader: 'ts' },
  outfile: path.join(base, '.test-build/hardening.mjs'), bundle: true, platform: 'node', format: 'esm', target: 'node24', packages: 'external', logLevel: 'warning',
})
const mod = await import(pathToFileURL(path.join(base, '.test-build/hardening.mjs')).href)
const forbidden = error => error?.code === 'forbidden' && error?.status === 403
async function fixture(t) {
  const holder = path.join(base, '.test-build', 'fixture-' + randomUUID())
  const cwd = path.join(holder, 'workspace')
  const outside = path.join(holder, 'outside')
  await fs.mkdir(cwd, { recursive: true }); await fs.mkdir(outside)
  await fs.writeFile(path.join(cwd, 'note.txt'), 'original\r\nsecond\r\n')
  await fs.writeFile(path.join(outside, 'secret.txt'), 'outside')
  t.after(() => fs.rm(holder, { recursive: true, force: true }))
  return { cwd, outside, holder }
}

test('relative and absolute paths inside workspace remain usable', async t => {
  const { cwd } = await fixture(t)
  assert.equal(await mod.ensureWorkspacePath(cwd, 'note.txt'), path.join(cwd, 'note.txt'))
  assert.equal(await mod.ensureWorkspacePath(cwd, path.join(cwd, 'note.txt')), path.join(cwd, 'note.txt'))
  assert.equal(await mod.ensureWorkspaceWritePath(cwd, 'new/deep/file.txt'), path.join(cwd, 'new/deep/file.txt'))
})
test('absolute outside, traversal, prefix sibling and legacy false flag are denied', async t => {
  const { cwd, outside } = await fixture(t)
  for (const target of [outside, '../outside/secret.txt', cwd + '-sibling/file.txt']) {
    await assert.rejects(mod.ensureWorkspacePath(cwd, target), forbidden)
    await assert.rejects(mod.ensureWorkspaceWritePath(cwd, target, false), forbidden)
  }
})
test('Windows case variant remains within the same workspace', async t => {
  const { cwd } = await fixture(t)
  if (process.platform === 'win32') await mod.ensureWorkspacePath(cwd.toUpperCase(), path.join(cwd, 'note.txt'))
})
for (const invalid of ['C:relative', 'C:', '\\\\?\\C:\\file', '\\\\.\\C:\\file', '\\??\\C:\\file', 'note.txt:secret', 'NUL.txt', 'CON', 'COM¹.txt', 'LPT9', 'x. ', 'folder./file', 'name?', 'x\u0000y']) {
  test('Windows filename alias rejected: ' + JSON.stringify(invalid), () => {
    assert.throws(() => mod.assertSafePathSyntax(invalid, 'win32'), forbidden)
  })
}
test('Windows UNC and normal Unicode syntax are accepted without disabling containment', () => {
  for (const valid of ['E:\\项目\\正常.txt', '\\\\server\\share\\file.txt', './中文.txt', '../sibling/file.txt']) mod.assertSafePathSyntax(valid, 'win32')
})
test('external junction cannot be read or used for new nested writes', async t => {
  const { cwd, outside } = await fixture(t)
  await fs.symlink(outside, path.join(cwd, 'escape'), 'junction')
  await assert.rejects(mod.ensureWorkspacePath(cwd, 'escape/secret.txt'), forbidden)
  await assert.rejects(mod.ensureWorkspaceWritePath(cwd, 'escape/missing/deep/file.txt'), forbidden)
  await assert.rejects(mod.writeWorkspaceText({ cwd, path: 'escape/new.txt', content: 'bad' }), forbidden)
  assert.equal(await fs.readFile(path.join(outside, 'secret.txt'), 'utf8'), 'outside')
})
test('internal junction remains usable, dangling junction is denied for writes', async t => {
  const { cwd, holder } = await fixture(t)
  await fs.mkdir(path.join(cwd, 'inside')); await fs.writeFile(path.join(cwd, 'inside/x'), 'ok')
  await fs.symlink(path.join(cwd, 'inside'), path.join(cwd, 'alias'), 'junction')
  assert.equal(await fs.readFile(await mod.ensureWorkspacePath(cwd, 'alias/x'), 'utf8'), 'ok')
  await fs.symlink(path.join(holder, 'missing'), path.join(cwd, 'dangling'), 'junction')
  await assert.rejects(mod.ensureWorkspaceWritePath(cwd, 'dangling/new.txt'), forbidden)
})
test('search cannot directly stat an external path', async t => {
  const { cwd, outside } = await fixture(t)
  await assert.rejects(mod.searchFiles(cwd, path.join(outside, 'secret.txt')), forbidden)
  assert.deepEqual((await mod.searchFiles(cwd, './missing.txt')).matches, [])
})
test('editor overwrite preserves encoding, EOL and a recoverable prior version', async t => {
  const { cwd } = await fixture(t)
  const target = path.join(cwd, 'note.txt'); const old = await fs.readFile(target)
  const mtime = (await fs.stat(target)).mtimeMs
  await mod.writeWorkspaceText({ cwd, path: 'note.txt', content: 'changed\nsecond\n', expectedMtimeMs: mtime })
  assert.equal(await fs.readFile(target, 'utf8'), 'changed\r\nsecond\r\n')
  const records = await mod.listWorkspaceRecovery(cwd)
  assert.equal(records.length, 1); assert.equal(records[0].kind, 'overwrite')
  assert.deepEqual(await fs.readFile(path.join(cwd, '.dsh-sidebar-recovery', records[0].id, 'content')), old)
  await assert.rejects(mod.restoreWorkspaceRecovery(cwd, records[0].id), error => error.code === 'fs-conflict')
  await fs.rename(target, target + '.current')
  await mod.restoreWorkspaceRecovery(cwd, records[0].id)
  assert.deepEqual(await fs.readFile(target), old)
  assert.equal((await mod.listWorkspaceRecovery(cwd)).length, 0)
})
test('stale editor mtime cannot create a backup or overwrite content', async t => {
  const { cwd } = await fixture(t)
  await assert.rejects(mod.writeWorkspaceText({ cwd, path: 'note.txt', content: 'bad', expectedMtimeMs: -1 }), error => error.code === 'fs-conflict')
  assert.equal((await mod.listWorkspaceRecovery(cwd)).length, 0)
  assert.match(await fs.readFile(path.join(cwd, 'note.txt'), 'utf8'), /original/)
})
test('concurrent saves sharing a baseline accept only one writer', async t => {
  const { cwd } = await fixture(t)
  const mtime = (await fs.stat(path.join(cwd, 'note.txt'))).mtimeMs
  const results = await Promise.allSettled(['first', 'second'].map(content => mod.writeWorkspaceText({ cwd, path: 'note.txt', content, expectedMtimeMs: mtime })))
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1)
  assert.equal((await mod.listWorkspaceRecovery(cwd)).length, 1)
})
test('upload overwrite creates a backup and malformed traversal is refused', async t => {
  const { cwd } = await fixture(t)
  async function* chunks() { yield 'uploaded' }
  await mod.writeWorkspaceUpload({ cwd, dir: '.', relativePath: 'note.txt', chunks: chunks() })
  assert.equal(await fs.readFile(path.join(cwd, 'note.txt'), 'utf8'), 'uploaded')
  assert.equal((await mod.listWorkspaceRecovery(cwd)).length, 1)
  await assert.rejects(mod.writeWorkspaceUpload({ cwd, dir: '.', relativePath: '../escape', chunks: chunks() }))
})
test('aborted upload leaves the original intact and does not create recovery noise', async t => {
  const { cwd } = await fixture(t)
  async function* chunks() { yield 'partial'; throw new Error('aborted') }
  await assert.rejects(mod.writeWorkspaceUpload({ cwd, dir: '.', relativePath: 'note.txt', chunks: chunks() }), /aborted/)
  assert.match(await fs.readFile(path.join(cwd, 'note.txt'), 'utf8'), /original/)
  assert.equal((await mod.listWorkspaceRecovery(cwd)).length, 0)
  assert.equal((await fs.readdir(cwd)).filter(x => x.endsWith('.tmp')).length, 0)
})
test('file deletion and directory deletion are recoverable', async t => {
  const { cwd } = await fixture(t)
  await fs.mkdir(path.join(cwd, 'dir')); await fs.writeFile(path.join(cwd, 'dir/child'), 'child')
  for (const target of ['note.txt', 'dir']) {
    await mod.removeWorkspaceEntry({ cwd, path: target })
    await assert.rejects(fs.lstat(path.join(cwd, target)), { code: 'ENOENT' })
    const record = (await mod.listWorkspaceRecovery(cwd)).find(x => x.originalRelativePath === target)
    assert.ok(record)
    await mod.restoreWorkspaceRecovery(cwd, record.id)
    assert.ok(await fs.lstat(path.join(cwd, target)))
  }
  assert.equal(await fs.readFile(path.join(cwd, 'dir/child'), 'utf8'), 'child')
})
test('deleting an external junction archives only the link, never its target', async t => {
  const { cwd, outside } = await fixture(t)
  await fs.symlink(outside, path.join(cwd, 'escape'), 'junction')
  await mod.removeWorkspaceEntry({ cwd, path: 'escape' })
  assert.equal(await fs.readFile(path.join(outside, 'secret.txt'), 'utf8'), 'outside')
  const record = (await mod.listWorkspaceRecovery(cwd))[0]
  assert.equal(record.entryType, 'symlink')
  await mod.restoreWorkspaceRecovery(cwd, record.id)
  assert.equal((await fs.lstat(path.join(cwd, 'escape'))).isSymbolicLink(), true)
  await assert.rejects(mod.ensureWorkspacePath(cwd, 'escape/secret.txt'), forbidden)
})
test('recovery root as a junction aborts overwrite without touching original', async t => {
  const { cwd, outside } = await fixture(t)
  await fs.symlink(outside, path.join(cwd, '.dsh-sidebar-recovery'), 'junction')
  await assert.rejects(mod.writeWorkspaceText({ cwd, path: 'note.txt', content: 'bad' }), forbidden)
  assert.match(await fs.readFile(path.join(cwd, 'note.txt'), 'utf8'), /original/)
  assert.deepEqual(await fs.readdir(outside), ['secret.txt'])
})
test('workspace and recovery storage cannot be removed or overwritten through ordinary routes', async t => {
  const { cwd } = await fixture(t)
  await assert.rejects(mod.removeWorkspaceEntry({ cwd, path: cwd }))
  await mod.writeWorkspaceText({ cwd, path: 'note.txt', content: 'new' })
  await assert.rejects(mod.removeWorkspaceEntry({ cwd, path: '.dsh-sidebar-recovery' }), forbidden)
  await assert.rejects(mod.writeWorkspaceText({ cwd, path: '.dsh-sidebar-recovery/x', content: 'bad' }), forbidden)
})
test('mkdir, create and rename keep legal names and reject Windows device/stream aliases', async t => {
  const { cwd } = await fixture(t)
  await mod.mkdirWorkspaceEntry({ cwd, path: '.', name: '目录' })
  await mod.createWorkspaceFile({ cwd, path: '目录', name: '新文件.txt' })
  await mod.renameWorkspaceEntry({ cwd, path: '目录/新文件.txt', name: '改名.txt' })
  assert.ok(await fs.stat(path.join(cwd, '目录/改名.txt')))
  for (const name of ['NUL', 'name:stream', 'trailing.']) {
    await assert.rejects(mod.mkdirWorkspaceEntry({ cwd, path: '.', name }))
    await assert.rejects(mod.renameWorkspaceEntry({ cwd, path: 'note.txt', name }))
  }
})
test('untrusted client cwd and missing sessions cannot select an authority root', async () => {
  const ctx = { sessions: { get: () => undefined }, get: () => undefined }
  await assert.rejects(mod.sessionCwdOf(ctx, 'missing', 'E:/'), error => error.code === 'not-found')
})
test('live host working directory overrides a forged client hint', async t => {
  const { cwd, outside } = await fixture(t)
  const session = { header: { cwd: outside } }
  const ctx = { sessions: { get: () => session }, get: name => name === 'workingDirectory' ? { get: () => cwd } : undefined }
  assert.equal(await mod.sessionCwdOf(ctx, 'known', outside), cwd)
})
test('cold session observation disposes its lease', async t => {
  const { cwd, outside } = await fixture(t); let disposed = 0
  const observation = { header: { cwd: outside }, projections: { values: { workingDirectory: cwd } }, [Symbol.dispose]: () => disposed++ }
  const ctx = { sessions: { get: () => undefined }, get: name => name === 'sessionQuery' ? { observeSession: async () => observation } : undefined }
  assert.equal(await mod.sessionCwdOf(ctx, 'known', outside), cwd)
  assert.equal(disposed, 1)
})

test('an internal alias cannot bypass recovery-store write protection', async t => {
  const { cwd } = await fixture(t)
  await mod.writeWorkspaceText({ cwd, path: 'note.txt', content: 'new' })
  await fs.symlink(path.join(cwd, '.dsh-sidebar-recovery'), path.join(cwd, 'recovery-alias'), 'junction')
  await assert.rejects(mod.writeWorkspaceText({ cwd, path: 'recovery-alias/x', content: 'bad' }), forbidden)
  const record = (await mod.listWorkspaceRecovery(cwd))[0]
  await assert.rejects(mod.removeWorkspaceEntry({ cwd, path: 'recovery-alias/' + record.id }), forbidden)
})
test('inferred or environment-selected worktree cannot expand session authority', async t => {
  const { cwd, outside } = await fixture(t)
  const previous = process.env.DSH_SIDEBAR_WORKTREE_ROOT
  process.env.DSH_SIDEBAR_WORKTREE_ROOT = outside
  try { assert.equal(await mod.scopedActiveWorktreeRootOf({}, 'fixture', cwd), cwd) }
  finally { if (previous === undefined) delete process.env.DSH_SIDEBAR_WORKTREE_ROOT; else process.env.DSH_SIDEBAR_WORKTREE_ROOT = previous }
})

test('directory previews do not probe or compact external junction contents', async t => {
  const { cwd, outside } = await fixture(t)
  await fs.symlink(outside, path.join(cwd, 'escape'), 'junction')
  const listing = await mod.listDirectory(cwd)
  const entry = listing.entries.find(x => x.name === 'escape')
  assert.equal(entry.broken, true); assert.equal(entry.isDir, false); assert.equal(entry.compact, undefined)
})
test('directory cache includes scope, so a broad preview cannot leak into a narrow one', async t => {
  const { cwd } = await fixture(t)
  const sub = path.join(cwd, 'sub'); const peer = path.join(cwd, 'peer')
  await fs.mkdir(sub); await fs.mkdir(peer); await fs.symlink(peer, path.join(sub, 'alias'), 'junction')
  const wide = await mod.listDirectory(sub, 1000, undefined, undefined, cwd)
  const narrow = await mod.listDirectory(sub)
  assert.equal(wide.entries[0].isDir, true)
  assert.equal(narrow.entries[0].broken, true)
})

test('real tar export excludes recovery versions while preserving normal files', async t => {
  const { cwd, holder } = await fixture(t)
  await mod.writeWorkspaceText({ cwd, path: 'note.txt', content: 'current' })
  const plan = mod.planArchive([cwd], { tool: 'tar', bin: 'tar', flags: ['-czf', '-'], ext: '.tar.gz' })
  const result = await run('tar', plan.args, { cwd: plan.cwd, encoding: 'buffer', maxBuffer: 5_000_000 })
  const archive = path.join(holder, 'output.tar.gz')
  await fs.writeFile(archive, result.stdout)
  const listing = (await run('tar', ['-tzf', archive], { encoding: 'utf8' })).stdout
  assert.match(listing, /note\.txt/)
  assert.doesNotMatch(listing, /dsh-sidebar-recovery/)
})
test('built recovery CLI lists and restores a synthetic deletion', async t => {
  const { cwd } = await fixture(t)
  await mod.removeWorkspaceEntry({ cwd, path: 'note.txt' })
  const result = await run(process.execPath, ['scripts/recovery.mjs', 'list', cwd], { cwd: base, encoding: 'utf8' })
  const records = JSON.parse(result.stdout)
  assert.equal(records.length, 1)
  await run(process.execPath, ['scripts/recovery.mjs', 'restore', cwd, records[0].id], { cwd: base, encoding: 'utf8' })
  assert.match(await fs.readFile(path.join(cwd, 'note.txt'), 'utf8'), /original/)
})

test('a non-repository workspace keeps the original Git empty-state behavior', async t => {
  const { cwd } = await fixture(t)
  assert.equal(await mod.gitWorkspaceOf(cwd), cwd)
})
test('Git repository selection remains in the authorized workspace', async t => {
  const { cwd } = await fixture(t)
  await run('git', ['init', '--quiet', cwd])
  assert.equal(path.resolve(await mod.gitWorkspaceOf(cwd)), path.resolve(cwd))
  await fs.mkdir(path.join(cwd, 'sub'))
  await assert.rejects(mod.gitWorkspaceOf(path.join(cwd, 'sub')), forbidden)
})

test('interrupted snapshot copies are not offered as valid recovery versions', async t => {
  const { cwd } = await fixture(t)
  const id = randomUUID(); const directory = path.join(cwd, '.dsh-sidebar-recovery', id)
  await fs.mkdir(directory, { recursive: true })
  await fs.writeFile(path.join(directory, 'record.json'), JSON.stringify({ schema: 1, id, originalRelativePath: 'note.txt', kind: 'overwrite', entryType: 'file', createdAt: new Date().toISOString() }))
  await fs.writeFile(path.join(directory, 'content.pending'), 'partial')
  assert.deepEqual(await mod.listWorkspaceRecovery(cwd), [])
  await assert.rejects(mod.restoreWorkspaceRecovery(cwd, id), { code: 'ENOENT' })
  assert.match(await fs.readFile(path.join(cwd, 'note.txt'), 'utf8'), /original/)
})

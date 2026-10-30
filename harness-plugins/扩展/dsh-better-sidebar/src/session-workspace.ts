import type { Context } from './context-types.ts'
import { requireAbsolute } from './fs-tree.ts'
import { readPersistedSession } from './session-store.ts'
import { SidebarError } from './wire.ts'
import { activeWorktreeRootOf } from './active-worktree.ts'
import { ensureWorkspacePath } from './path-security.ts'

/** Only host-owned session state may choose a filesystem authority root. */
export async function sessionCwdOf(ctx: Context, sessionId: string, _clientCwd?: string): Promise<string> {
  const session = ctx.sessions.get(sessionId)
  // The immutable header is the original project, not the current execution
  // directory. Read the host's committed value on every request (no TTL).
  if (session !== undefined) {
    const cwd = ctx.get('workingDirectory')?.get(session) ?? session.header.cwd
    if (cwd !== undefined && cwd !== '') return requireAbsolute(cwd)
  }
  const query = ctx.get('sessionQuery')
  if (query !== undefined) {
    const observation = await query.observeSession(sessionId, { projectionMode: 'all' })
    try {
      const cwd = observation.projections?.values.workingDirectory
        ?? observation.header.cwd
        ?? ctx.get('workingDirectory')?.defaultDirectory
      if (cwd !== undefined && cwd !== '') return requireAbsolute(cwd)
    } finally {
      observation[Symbol.dispose]()
    }
  }
  const persistence = ctx.get('sessionPersistence')
  if (persistence !== undefined) {
    const persisted = await readPersistedSession(persistence, sessionId)
    const metaCwd = persisted.header.cwd
    if (metaCwd !== undefined && metaCwd !== '') {
      try {
        return requireAbsolute(metaCwd)
      } catch {
        throw new SidebarError('bad-request', `invalid working directory "${metaCwd}"`)
      }
    }
  }
  throw new SidebarError('not-found', 'session has no authoritative workspace directory', 404)
}

export async function scopedActiveWorktreeRootOf(ctx: Context, sessionId: string, base: string): Promise<string> {
  await ensureWorkspacePath(base, base)
  const proposed = await activeWorktreeRootOf(ctx, sessionId, base)
  try { return await ensureWorkspacePath(base, proposed) }
  catch (error) {
    if (error instanceof SidebarError && error.code === 'forbidden') return base
    throw error
  }
}

/** Preserve non-repository UI behavior while fencing Git selectors. */
export async function gitWorkspaceOf(cwd: string, requested?: string, selected?: string): Promise<string> {
  const git = await import('./git.ts')
  if (requested === undefined && (await git.repoRoots(cwd)).length === 0) return cwd
  const root = await ensureWorkspacePath(cwd, await git.repoRoot(cwd, selected))
  return requested === undefined ? root : ensureWorkspacePath(cwd, await git.resolveWorktree(root, requested))
}

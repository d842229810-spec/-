/** Workspace-scoped path validation shared by every filesystem entry point.
 * This is application-layer enforcement, not an OS sandbox against racing processes.
 */
import { lstat, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, dirname, relative, sep, resolve } from 'node:path'
import { requireAbsolute } from './fs-tree.ts'
import { resolveSessionPath } from './session-path.ts'
import { SidebarError } from './wire.ts'

export const RECOVERY_DIRECTORY = '.dsh-sidebar-recovery'

function refuse(message: string): never {
  throw new SidebarError('forbidden', message, 403)
}

/** Refuse Win32 aliases that can bypass normal filename and containment checks. */
export function assertSafePathSyntax(target: string, platform: NodeJS.Platform = process.platform): void {
  if (typeof target !== 'string' || target.length === 0 || /[\u0000-\u001f]/.test(target)) {
    refuse('a non-empty path without control characters is required')
  }
  if (platform !== 'win32') return
  const normalized = target.replace(/\//g, '\\')
  if (/^(?:\\\\[?.]\\|\\\?\?\\)/.test(normalized)) refuse('Windows device paths are not allowed')
  if (/^[a-z]:(?:$|[^\\])/i.test(normalized)) refuse('drive-relative paths are not allowed')
  const withoutDrive = normalized.replace(/^[a-z]:\\/i, '')
  for (const segment of withoutDrive.split('\\')) {
    if (segment === '' || segment === '.' || segment === '..') continue
    if (/[<>:"|?*]/.test(segment) || /[ .]$/.test(segment)) refuse('Windows alternate streams and ambiguous filenames are not allowed')
    const device = segment.split('.')[0]!.toLowerCase()
    if (/^(?:con|prn|aux|nul|clock\$|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])$/.test(device)) {
      refuse('Windows reserved device names are not allowed')
    }
  }
}

function within(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel === '' || (rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel))
}

/** Lexical containment is necessary but callers doing I/O must also await a guard. */
export function resolveTarget(cwd: string, target: string): string {
  assertSafePathSyntax(cwd)
  assertSafePathSyntax(target)
  const root = requireAbsolute(cwd)
  const homeExpanded = target === '~' || target.startsWith('~/') || target.startsWith('~\\')
    ? join(homedir(), target.slice(1)) : target
  const projected = resolveSessionPath(root, homeExpanded)
  const absolute = resolve(root, projected)
  assertSafePathSyntax(absolute)
  if (!within(root, absolute)) refuse('path is outside the session workspace; select the intended workspace first')
  return absolute
}

async function validate(cwd: string, target: string, allowMissing: boolean, protectRecovery = false): Promise<string> {
  const absolute = resolveTarget(cwd, target)
  const canonicalRoot = await realpath(requireAbsolute(cwd))
  let ancestor = absolute
  const missing: string[] = []
  for (;;) {
    try {
      // lstat distinguishes a dangling link from a genuinely absent component.
      await lstat(ancestor)
      const canonicalAncestor = await realpath(ancestor)
      const canonicalTarget = resolve(canonicalAncestor, ...missing)
      if (!within(canonicalRoot, canonicalAncestor) || !within(canonicalRoot, canonicalTarget)) {
        refuse('path resolves outside the session workspace through a link or junction')
      }
      if (protectRecovery && relative(canonicalRoot, canonicalTarget).split(sep).some(part => part.toLowerCase() === RECOVERY_DIRECTORY)) {
        refuse('recovery records are protected; use the recovery interface')
      }
      return absolute
    } catch (error) {
      if (!allowMissing || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      // An existing but dangling link must not be treated as a new directory.
      try { await lstat(ancestor); refuse('dangling links are not valid file destinations') }
      catch (check) { if ((check as NodeJS.ErrnoException).code !== 'ENOENT') throw check }
      const parent = dirname(ancestor)
      if (parent === ancestor) throw error
      missing.unshift(relative(parent, ancestor))
      ancestor = parent
    }
  }
}

/** The legacy fence argument cannot disable validation. */
export async function ensureWorkspacePath(cwd: string, target: string, _fence?: boolean): Promise<string> {
  return validate(cwd, target, false)
}

/** New descendants are checked against their nearest existing real ancestor. */
export async function ensureWorkspaceWritePath(cwd: string, target: string, _fence?: boolean): Promise<string> {
  const absolute = await validate(cwd, target, true, true)
  const parts = relative(requireAbsolute(cwd), absolute).split(sep)
  if (parts.some(part => part.toLowerCase() === RECOVERY_DIRECTORY)) refuse('recovery records are protected; use the recovery interface')
  return absolute
}

/** Rename/delete the directory entry itself, without following its final link. */
export async function ensureWorkspaceEntryPath(cwd: string, target: string): Promise<string> {
  const absolute = resolveTarget(cwd, target)
  const rel = relative(requireAbsolute(cwd), absolute)
  if (rel.split(sep).some(part => part.toLowerCase() === RECOVERY_DIRECTORY)) refuse('recovery records are protected; use the recovery interface')
  if (rel === '') return ensureWorkspacePath(cwd, absolute)
  await validate(cwd, dirname(absolute), false, true)
  await lstat(absolute)
  return absolute
}

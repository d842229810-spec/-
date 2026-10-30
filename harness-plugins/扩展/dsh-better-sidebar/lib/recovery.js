// src/recovery.ts
import { constants } from "node:fs";
import { copyFile, lstat as lstat2, mkdir, readFile, readdir, realpath as realpath2, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname as dirname3, join as join2, relative as relative2, resolve as resolve3 } from "node:path";

// src/path-security.ts
import { lstat, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute as isAbsolute2, join, dirname as dirname2, relative, sep as sep2, resolve as resolve2 } from "node:path";

// src/fs-tree.ts
import { basename, dirname, isAbsolute, resolve, sep } from "node:path";

// src/git.ts
var GIT_OUTPUT_MAX_BYTES = 8 * 1024 * 1024;
var GIT_STATUS_LIMIT = 2e3;
var GIT_STATUS_MAX_FIELDS = (GIT_STATUS_LIMIT + 1) * 2;

// src/wire.ts
var SidebarError = class extends Error {
  constructor(code, message, status = 400, meta) {
    super(message);
    this.code = code;
    this.status = status;
    this.meta = meta;
  }
  code;
  status;
  meta;
};
var MAX_BODY_BYTES = 1 << 20;

// src/fs-tree.ts
var directoryCache = /* @__PURE__ */ new Map();
function invalidateDirectoryCache(path) {
  if (path === void 0) {
    directoryCache.clear();
    return;
  }
  const target = resolve(path);
  const prefix = `${target}\0`;
  for (const key of directoryCache.keys()) {
    if (key.startsWith(prefix)) directoryCache.delete(key);
  }
}
function requireAbsolute(path) {
  if (!isAbsolute(path)) {
    throw new SidebarError("fs-error", `"${path}" is not an absolute path`, 400);
  }
  return resolve(path);
}

// src/session-path.ts
import { readFileSync, statSync } from "node:fs";
import { win32 } from "node:path";
var WSL_LOCALHOST_ROOT = /^\\\\wsl\.localhost\\([^\\]+)(?:\\|$)/i;
var REMOTE_MIRROR_ROOT = /^(.*\\\.dsh\\remote-workspaces\\[^\\]+\\[^\\]+)(?:\\|$)/i;
var REMOTE_META_FILE = ".dsh-remote-meta.json";
var remoteMetaCache = /* @__PURE__ */ new Map();
function remotePathOf(mirrorRoot) {
  const metaFile = win32.join(mirrorRoot, REMOTE_META_FILE);
  let mtimeMs;
  try {
    mtimeMs = statSync(metaFile).mtimeMs;
  } catch {
    remoteMetaCache.delete(mirrorRoot);
    return void 0;
  }
  const cached = remoteMetaCache.get(mirrorRoot);
  if (cached !== void 0 && cached.mtimeMs === mtimeMs) return cached.remotePath;
  let remotePath;
  try {
    const parsed = JSON.parse(readFileSync(metaFile, "utf8"));
    const value = parsed?.remotePath;
    remotePath = typeof value === "string" && value.startsWith("/") ? value : void 0;
  } catch {
    remotePath = void 0;
  }
  remoteMetaCache.set(mirrorRoot, { mtimeMs, remotePath });
  return remotePath;
}
function relativeUnderPosix(base, target) {
  const normalize = (value) => value.replace(/\/+$/, "");
  const root = normalize(base);
  if (target === root) return "";
  if (!target.startsWith(`${root}/`)) return void 0;
  return target.slice(root.length + 1);
}
function resolveSessionPath(cwd, target, platform = process.platform) {
  if (platform !== "win32" || !/^\/(?!\/)/.test(target)) return target;
  const normalizedCwd = cwd.replace(/\//g, "\\");
  const wsl = WSL_LOCALHOST_ROOT.exec(normalizedCwd);
  if (wsl !== null) {
    const distroRoot = `\\\\wsl.localhost\\${wsl[1]}`;
    const relative3 = target.slice(1).replace(/\//g, "\\");
    return win32.resolve(distroRoot, relative3);
  }
  const mirror = REMOTE_MIRROR_ROOT.exec(normalizedCwd);
  if (mirror !== null) {
    const mirrorRoot = mirror[1];
    const remotePath = remotePathOf(mirrorRoot);
    if (remotePath !== void 0) {
      const relative3 = relativeUnderPosix(remotePath, target);
      if (relative3 !== void 0) {
        return relative3 === "" ? win32.resolve(mirrorRoot) : win32.resolve(mirrorRoot, relative3.replace(/\//g, "\\"));
      }
    }
  }
  return target;
}

// src/path-security.ts
var RECOVERY_DIRECTORY = ".dsh-sidebar-recovery";
function refuse(message) {
  throw new SidebarError("forbidden", message, 403);
}
function assertSafePathSyntax(target, platform = process.platform) {
  if (typeof target !== "string" || target.length === 0 || /[\u0000-\u001f]/.test(target)) {
    refuse("a non-empty path without control characters is required");
  }
  if (platform !== "win32") return;
  const normalized = target.replace(/\//g, "\\");
  if (/^(?:\\\\[?.]\\|\\\?\?\\)/.test(normalized)) refuse("Windows device paths are not allowed");
  if (/^[a-z]:(?:$|[^\\])/i.test(normalized)) refuse("drive-relative paths are not allowed");
  const withoutDrive = normalized.replace(/^[a-z]:\\/i, "");
  for (const segment of withoutDrive.split("\\")) {
    if (segment === "" || segment === "." || segment === "..") continue;
    if (/[<>:"|?*]/.test(segment) || /[ .]$/.test(segment)) refuse("Windows alternate streams and ambiguous filenames are not allowed");
    const device = segment.split(".")[0].toLowerCase();
    if (/^(?:con|prn|aux|nul|clock\$|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])$/.test(device)) {
      refuse("Windows reserved device names are not allowed");
    }
  }
}
function within(root, target) {
  const rel = relative(root, target);
  return rel === "" || rel !== ".." && !rel.startsWith(".." + sep2) && !isAbsolute2(rel);
}
function resolveTarget(cwd, target) {
  assertSafePathSyntax(cwd);
  assertSafePathSyntax(target);
  const root = requireAbsolute(cwd);
  const homeExpanded = target === "~" || target.startsWith("~/") || target.startsWith("~\\") ? join(homedir(), target.slice(1)) : target;
  const projected = resolveSessionPath(root, homeExpanded);
  const absolute = resolve2(root, projected);
  assertSafePathSyntax(absolute);
  if (!within(root, absolute)) refuse("path is outside the session workspace; select the intended workspace first");
  return absolute;
}
async function validate(cwd, target, allowMissing, protectRecovery = false) {
  const absolute = resolveTarget(cwd, target);
  const canonicalRoot = await realpath(requireAbsolute(cwd));
  let ancestor = absolute;
  const missing = [];
  for (; ; ) {
    try {
      await lstat(ancestor);
      const canonicalAncestor = await realpath(ancestor);
      const canonicalTarget = resolve2(canonicalAncestor, ...missing);
      if (!within(canonicalRoot, canonicalAncestor) || !within(canonicalRoot, canonicalTarget)) {
        refuse("path resolves outside the session workspace through a link or junction");
      }
      if (protectRecovery && relative(canonicalRoot, canonicalTarget).split(sep2).some((part) => part.toLowerCase() === RECOVERY_DIRECTORY)) {
        refuse("recovery records are protected; use the recovery interface");
      }
      return absolute;
    } catch (error) {
      if (!allowMissing || error.code !== "ENOENT") throw error;
      try {
        await lstat(ancestor);
        refuse("dangling links are not valid file destinations");
      } catch (check) {
        if (check.code !== "ENOENT") throw check;
      }
      const parent = dirname2(ancestor);
      if (parent === ancestor) throw error;
      missing.unshift(relative(parent, ancestor));
      ancestor = parent;
    }
  }
}
async function ensureWorkspacePath(cwd, target, _fence) {
  return validate(cwd, target, false);
}
async function ensureWorkspaceWritePath(cwd, target, _fence) {
  const absolute = await validate(cwd, target, true, true);
  const parts = relative(requireAbsolute(cwd), absolute).split(sep2);
  if (parts.some((part) => part.toLowerCase() === RECOVERY_DIRECTORY)) refuse("recovery records are protected; use the recovery interface");
  return absolute;
}
async function ensureWorkspaceEntryPath(cwd, target) {
  const absolute = resolveTarget(cwd, target);
  const rel = relative(requireAbsolute(cwd), absolute);
  if (rel.split(sep2).some((part) => part.toLowerCase() === RECOVERY_DIRECTORY)) refuse("recovery records are protected; use the recovery interface");
  if (rel === "") return ensureWorkspacePath(cwd, absolute);
  await validate(cwd, dirname2(absolute), false, true);
  await lstat(absolute);
  return absolute;
}

// src/recovery.ts
var pending = /* @__PURE__ */ new Map();
async function withWorkspaceMutation(cwd, action) {
  const canonical = await realpath2(cwd);
  const key = process.platform === "win32" ? canonical.toLowerCase() : canonical;
  const previous = pending.get(key) ?? Promise.resolve();
  let release;
  const gate = new Promise((done) => {
    release = done;
  });
  const tail = previous.catch(() => {
  }).then(() => gate);
  pending.set(key, tail);
  await previous.catch(() => {
  });
  try {
    return await action();
  } finally {
    release();
    if (pending.get(key) === tail) pending.delete(key);
  }
}
async function recoveryRoot(cwd, create) {
  const workspace = await ensureWorkspacePath(cwd, cwd);
  const root = join2(workspace, RECOVERY_DIRECTORY);
  if (create) await mkdir(root, { mode: 448 }).catch((error) => {
    if (error.code !== "EEXIST") throw error;
  });
  const entry = await lstat2(root);
  if (!entry.isDirectory() || entry.isSymbolicLink()) throw new SidebarError("forbidden", "recovery storage must be a real workspace directory", 403);
  await ensureWorkspacePath(cwd, root);
  if (create) await writeFile(join2(root, ".gitignore"), "*\n", { flag: "wx", mode: 384 }).catch((error) => {
    if (error.code !== "EEXIST") throw error;
  });
  return root;
}
async function entryDirectory(cwd, id) {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)) throw new SidebarError("bad-request", "invalid recovery id", 400);
  const directory = join2(await recoveryRoot(cwd, false), id);
  const info = await lstat2(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new SidebarError("forbidden", "invalid recovery directory", 403);
  return ensureWorkspacePath(cwd, directory);
}
async function saveRecovery(cwd, path, kind) {
  const absolute = kind === "deleted" ? await ensureWorkspaceEntryPath(cwd, path) : await ensureWorkspaceWritePath(cwd, path);
  let info;
  try {
    info = await lstat2(absolute);
  } catch (error) {
    if (kind === "overwrite" && error.code === "ENOENT") return void 0;
    throw error;
  }
  if (kind === "overwrite" && !info.isFile() && !info.isSymbolicLink()) throw new SidebarError("fs-error", "cannot overwrite a directory", 400);
  const root = await recoveryRoot(cwd, true);
  const id = randomUUID();
  const directory = join2(root, id);
  await mkdir(directory, { mode: 448 });
  const record = {
    schema: 1,
    id,
    originalRelativePath: relative2(resolve3(cwd), absolute),
    kind,
    entryType: kind === "overwrite" ? "file" : info.isSymbolicLink() ? "symlink" : info.isDirectory() ? "directory" : "file",
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  await writeFile(join2(directory, "record.json"), JSON.stringify(record, null, 2), { flag: "wx", mode: 384 });
  if (kind === "deleted") await rename(absolute, join2(directory, "content"));
  else {
    const pendingContent = join2(directory, "content.pending");
    await copyFile(absolute, pendingContent, constants.COPYFILE_EXCL);
    await rename(pendingContent, join2(directory, "content"));
  }
  invalidateDirectoryCache(dirname3(absolute));
  return id;
}
function preserveBeforeOverwrite(cwd, path) {
  return saveRecovery(cwd, path, "overwrite");
}
async function archiveWorkspaceEntry(cwd, path) {
  return await saveRecovery(cwd, path, "deleted");
}
async function readRecord(cwd, id) {
  const directory = await entryDirectory(cwd, id);
  const file = join2(directory, "record.json");
  if ((await lstat2(file)).isSymbolicLink()) throw new SidebarError("forbidden", "recovery metadata cannot be a link", 403);
  const record = JSON.parse(await readFile(file, "utf8"));
  if (record.schema !== 1 || record.id !== id || typeof record.originalRelativePath !== "string" || !["deleted", "overwrite"].includes(record.kind) || !["file", "directory", "symlink"].includes(record.entryType)) {
    throw new SidebarError("fs-error", "invalid recovery record", 400);
  }
  try {
    const marker = join2(directory, "restored.json");
    if ((await lstat2(marker)).isSymbolicLink()) throw new SidebarError("forbidden", "invalid restore marker", 403);
    const restored = JSON.parse(await readFile(marker, "utf8"));
    if (typeof restored.restoredAt === "string") record.restoredAt = restored.restoredAt;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await ensureWorkspaceWritePath(cwd, join2(cwd, record.originalRelativePath));
  const payload = join2(directory, "content");
  const payloadInfo = await lstat2(payload);
  if (!(record.kind === "deleted" && record.entryType === "symlink" && payloadInfo.isSymbolicLink())) {
    if (payloadInfo.isSymbolicLink()) throw new SidebarError("forbidden", "recovery bytes cannot be a link", 403);
    await ensureWorkspacePath(cwd, payload);
  }
  return { directory, record };
}
async function listWorkspaceRecovery(cwd) {
  let root;
  try {
    root = await recoveryRoot(cwd, false);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const records = [];
  for (const item of await readdir(root, { withFileTypes: true })) {
    if (!item.isDirectory() || item.isSymbolicLink()) continue;
    try {
      const { record } = await readRecord(cwd, item.name);
      if (!record.restoredAt) records.push(record);
    } catch {
    }
  }
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
async function restoreWorkspaceRecovery(cwd, id) {
  return withWorkspaceMutation(cwd, async () => {
    const { directory, record } = await readRecord(cwd, id);
    if (record.restoredAt) throw new SidebarError("fs-conflict", "recovery entry was already restored", 409);
    const target = await ensureWorkspaceWritePath(cwd, join2(cwd, record.originalRelativePath));
    if (resolve3(target) === resolve3(cwd)) throw new SidebarError("forbidden", "cannot replace the workspace root", 403);
    try {
      await lstat2(target);
      throw new SidebarError("fs-conflict", "restore destination already exists; rename it first", 409);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await mkdir(dirname3(target), { recursive: true });
    await ensureWorkspaceWritePath(cwd, target);
    const content = join2(directory, "content");
    if (record.entryType === "directory" || record.entryType === "symlink") await rename(content, target);
    else await copyFile(content, target, constants.COPYFILE_EXCL);
    await writeFile(join2(directory, "restored.json"), JSON.stringify({ restoredAt: (/* @__PURE__ */ new Date()).toISOString() }), { flag: "wx", mode: 384 });
    invalidateDirectoryCache(dirname3(target));
    return { path: target };
  });
}
export {
  archiveWorkspaceEntry,
  listWorkspaceRecovery,
  preserveBeforeOverwrite,
  restoreWorkspaceRecovery,
  withWorkspaceMutation
};

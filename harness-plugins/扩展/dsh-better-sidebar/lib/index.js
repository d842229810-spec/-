var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};

// src/git.ts
var git_exports = {};
__export(git_exports, {
  GitCommandError: () => GitCommandError,
  blame: () => blame,
  branches: () => branches,
  checkout: () => checkout,
  cherryPick: () => cherryPick,
  commit: () => commit,
  commitDiff: () => commitDiff,
  currentBranch: () => currentBranch,
  diff: () => diff,
  diffHead: () => diffHead,
  discard: () => discard,
  isGitRepo: () => isGitRepo,
  log: () => log,
  parseBlamePorcelain: () => parseBlamePorcelain,
  parseLogLines: () => parseLogLines,
  parseNumstat: () => parseNumstat,
  parsePorcelainZ: () => parsePorcelainZ,
  parseStatusPorcelainV2Z: () => parseStatusPorcelainV2Z,
  parseWorktreeList: () => parseWorktreeList,
  pull: () => pull,
  push: () => push,
  refusedRepository: () => refusedRepository,
  repoRoot: () => repoRoot,
  repoRoots: () => repoRoots,
  resolveWorktree: () => resolveWorktree,
  revert: () => revert,
  runGit: () => runGit,
  show: () => show,
  stage: () => stage,
  status: () => status,
  unstage: () => unstage,
  worktrees: () => worktrees
});
import { readdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
function parsePorcelainZ(output) {
  const tokens = output.split("\0");
  const entries = [];
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    index += 1;
    if (token === "") continue;
    const xy = token.slice(0, 2);
    const rest = token.slice(3);
    entries.push({ path: rest, xy });
    if ((xy[0] === "R" || xy[0] === "C") && tokens[index] !== void 0 && tokens[index] !== "") {
      index += 1;
    }
  }
  return entries;
}
function porcelainV2Tokens(output) {
  const tokens = [];
  const fields = output.split("\0");
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    if (field === "") continue;
    if (field.startsWith("# ")) {
      tokens.push({ kind: "meta", line: field });
      continue;
    }
    if (field.startsWith("? ")) {
      tokens.push({ kind: "record", xy: "??", path: field.slice(2) });
      continue;
    }
    if (!field.startsWith("1 ") && !field.startsWith("2 ") && !field.startsWith("u ")) continue;
    const fixed = field.startsWith("u ") ? 10 : field.startsWith("2 ") ? 9 : 8;
    const path = field.split(" ").slice(fixed).join(" ");
    if (path === "") continue;
    const token = { kind: "record", xy: field.slice(2, 4).replaceAll(".", " "), path };
    if (field.startsWith("2 ")) {
      const origin = fields[index + 1];
      index += 1;
      if (origin !== void 0 && origin !== "") token.origin = origin;
    }
    tokens.push(token);
  }
  return tokens;
}
function parseStatusPorcelainV2Z(output) {
  const result = { isRepo: true, entries: [] };
  for (const token of porcelainV2Tokens(output)) {
    if (token.kind === "record") {
      result.entries.push({ xy: token.xy, path: token.path });
      continue;
    }
    const line = token.line;
    if (line.startsWith("# branch.head ")) {
      const head = line.slice("# branch.head ".length);
      result.detached = head === "(detached)";
      if (!result.detached) result.branch = head;
    } else if (line.startsWith("# branch.upstream ")) {
      result.upstream = line.slice("# branch.upstream ".length);
    } else if (line.startsWith("# branch.ab ")) {
      const counts = /^# branch\.ab \+(\d+) -(\d+)$/.exec(line);
      if (counts !== null) {
        result.ahead = Number(counts[1]);
        result.behind = Number(counts[2]);
      }
    }
  }
  return result;
}
function resolveNumstatPath(path) {
  const arrow = path.indexOf(" => ");
  if (arrow === -1) return path;
  const open4 = path.indexOf("{");
  if (open4 !== -1 && open4 < arrow) {
    const close = path.indexOf("}", arrow + 4);
    if (close !== -1) return `${path.slice(0, open4)}${path.slice(arrow + 4, close)}${path.slice(close + 1)}`;
  }
  return path.slice(arrow + 4);
}
function parseNumstat(output) {
  const counts = /* @__PURE__ */ new Map();
  const framed = output.includes("\0");
  const records = output.split(framed ? "\0" : "\n");
  let index = 0;
  while (index < records.length) {
    const record = records[index];
    index += 1;
    if (record === "") continue;
    const addedEnd = record.indexOf("	");
    const deletedEnd = addedEnd === -1 ? -1 : record.indexOf("	", addedEnd + 1);
    if (deletedEnd === -1) continue;
    const added = record.slice(0, addedEnd);
    const deleted = record.slice(addedEnd + 1, deletedEnd);
    let path = record.slice(deletedEnd + 1);
    if (framed && path === "") {
      const renamed = records[index + 1];
      index += 2;
      if (renamed === void 0) continue;
      path = renamed;
    } else if (!framed) {
      path = resolveNumstatPath(path);
    }
    if (path === "") continue;
    if (added === "-" || deleted === "-") {
      counts.set(path, { binary: true });
      continue;
    }
    const additions = Number(added);
    const deletions = Number(deleted);
    if (!Number.isFinite(additions) || !Number.isFinite(deletions)) continue;
    counts.set(path, { additions, deletions });
  }
  return counts;
}
function parseWorktreeList(output) {
  const rows = [];
  let path;
  let branch = "HEAD";
  let locked = false;
  let prunable = false;
  const flush = () => {
    if (path !== void 0) rows.push({ path, branch, locked, prunable });
    path = void 0;
    branch = "HEAD";
    locked = false;
    prunable = false;
  };
  const sep9 = output.includes("\0") ? "\0" : "\n";
  const framed = output.endsWith(sep9) ? output : `${output}${sep9}`;
  for (const line of framed.split(sep9)) {
    if (line === "") {
      flush();
    } else if (line.startsWith("worktree ")) {
      path = line.slice("worktree ".length);
    } else if (line.startsWith("branch refs/heads/")) {
      branch = line.slice("branch refs/heads/".length);
    } else if (line === "locked" || line.startsWith("locked ")) {
      locked = true;
    } else if (line === "prunable" || line.startsWith("prunable ")) {
      prunable = true;
    }
  }
  return rows;
}
function parseLogLines(output) {
  const rows = [];
  for (const line of output.split("\n")) {
    if (line === "") continue;
    const [hash, subject, author, date, hashFull, refs, parents] = line.split("");
    if (hash === void 0 || subject === void 0) continue;
    rows.push({
      hash,
      subject,
      author: author ?? "",
      date: date ?? "",
      hashFull: hashFull ?? hash,
      refs: refs ?? "",
      parents: parents?.split(" ").filter(Boolean) ?? []
    });
  }
  return rows;
}
function refusedRepository(message) {
  const path = REFUSED_REPOSITORY.exec(message)?.[1];
  return path === void 0 || path === "" ? void 0 : path;
}
function countNulFields(chunk) {
  let count = 0;
  for (let at = chunk.indexOf(0); at !== -1; at = chunk.indexOf(0, at + 1)) count += 1;
  return count;
}
function spawnGit(cwd, args, timeoutMs, safe, options = {}) {
  const full = [
    "-C",
    cwd,
    "--no-pager",
    "-c",
    "color.ui=false",
    // `core.quotePath=false`: emit paths verbatim instead of C-quoting them
    // (git's default turns a CJK/space path into an octal-escaped, quoted
    // string, and every diff surface renders that string as the file name).
    // The `-z`-framed porcelain callers are unaffected: git never quotes
    // NUL-framed output.
    "-c",
    "core.quotePath=false",
    ...safe.flatMap((dir) => ["-c", `safe.directory=${dir}`]),
    ...args
  ];
  const maxBytes = options.maxBytes ?? GIT_OUTPUT_MAX_BYTES;
  const maxNulFields = options.maxNulFields;
  return new Promise((resolvePromise, reject) => {
    const child = spawn("git", full, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      env: { ...process.env, ...GIT_ENV }
    });
    let stdout = "";
    let outBytes = 0;
    let outFields = 0;
    let stderr = "";
    let fieldCapped = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new GitCommandError(`git ${args[0] ?? ""} timed out after ${timeoutMs}ms`, "git-error", args.join(" ")));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      if (fieldCapped) return;
      stdout += chunk.toString("utf8");
      outBytes += chunk.length;
      if (outBytes > maxBytes) {
        child.kill("SIGKILL");
        reject(new GitCommandError(
          `git ${args[0] ?? ""} output exceeded ${maxBytes} bytes`,
          "git-error",
          args.join(" ")
        ));
        return;
      }
      if (maxNulFields !== void 0) {
        outFields += countNulFields(chunk);
        if (outFields >= maxNulFields) {
          fieldCapped = true;
          child.kill("SIGKILL");
        }
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new GitCommandError(`cannot run git: ${error.message}`, "git-error", args.join(" ")));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (fieldCapped || code === 0) {
        resolvePromise(stdout);
      } else {
        reject(new GitCommandError(stderr.trim() || `git exited with ${String(code)}`, "git-error", args.join(" ")));
      }
    });
  });
}
function runGit(cwd, args, timeoutMs = 3e4, options = {}) {
  return spawnGit(cwd, args, timeoutMs, [], options).catch((error) => {
    if (!(error instanceof GitCommandError) || !DUBIOUS_OWNERSHIP.test(error.message)) throw error;
    const refused = refusedRepository(error.message);
    const trust = refused === void 0 || refused === cwd ? [cwd] : [refused, cwd];
    return spawnGit(cwd, args, timeoutMs, trust, options);
  });
}
function isoWithOffset(seconds, timezone) {
  const zone = /^([+-])(\d{2})(\d{2})$/.exec(timezone);
  const offsetMinutes = zone === null ? 0 : (zone[1] === "-" ? -1 : 1) * (Number(zone[2]) * 60 + Number(zone[3]));
  const shifted = new Date((seconds + offsetMinutes * 60) * 1e3);
  const pad = (value) => String(value).padStart(2, "0");
  const stamp = `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}`;
  return zone === null ? `${stamp}Z` : `${stamp}${zone[1]}${zone[2]}:${zone[3]}`;
}
function parseBlamePorcelain(output) {
  const rows = [];
  const seen = /* @__PURE__ */ new Map();
  const lines = output.split("\n");
  let index = 0;
  while (index < lines.length) {
    const header = /^([0-9a-f]{40,64}) \d+ (\d+)(?: \d+)?$/.exec(lines[index]);
    if (header === null) {
      index += 1;
      continue;
    }
    const hash = header[1];
    const line = Number(header[2]);
    index += 1;
    let author;
    let date;
    let summary;
    while (index < lines.length && !lines[index].startsWith("	")) {
      const text = lines[index];
      index += 1;
      if (text.startsWith("author ")) author = text.slice("author ".length);
      else if (text.startsWith("author-time ")) {
        const seconds = Number(text.slice("author-time ".length));
        const zone = /^author-tz (.+)$/.exec(lines[index] ?? "");
        if (Number.isFinite(seconds)) date = isoWithOffset(seconds, zone?.[1] ?? "");
      } else if (text.startsWith("summary ")) summary = text.slice("summary ".length);
    }
    if (index < lines.length && lines[index].startsWith("	")) index += 1;
    const known = seen.get(hash);
    if (known === void 0) {
      const record = { author: author ?? "", date: date ?? "", summary: summary ?? "" };
      seen.set(hash, record);
      rows.push({ hash, line, ...record });
    } else {
      rows.push({ hash, line, ...known });
    }
  }
  return rows;
}
async function blame(cwd, path, startLine, endLine, selected) {
  try {
    const root = await repoRoot(cwd, selected);
    const output = await runGit(root, [
      "blame",
      "--porcelain",
      "-L",
      `${String(startLine)},${String(endLine)}`,
      "--",
      path
    ]);
    return parseBlamePorcelain(output);
  } catch {
    return [];
  }
}
async function isGitRepo(cwd) {
  try {
    const out = await runGit(cwd, ["rev-parse", "--is-inside-work-tree"], DISCOVERY_TIMEOUT_MS);
    return out.trim() === "true";
  } catch {
    return false;
  }
}
async function directRepoRoot(cwd) {
  const out = await runGit(cwd, ["rev-parse", "--show-toplevel"], DISCOVERY_TIMEOUT_MS);
  return out.trim();
}
function repoRoots(cwd) {
  const cached = repoRootsCache.get(cwd);
  if (cached !== void 0 && cached.expires > Date.now()) return Promise.resolve(cached.roots);
  const pending2 = repoRootsInFlight.get(cwd);
  if (pending2 !== void 0) return pending2;
  const promise = discoverRepoRoots(cwd).then(
    (roots) => {
      repoRootsCache.set(cwd, { roots, expires: Date.now() + DISCOVERY_CACHE_TTL_MS });
      repoRootsInFlight.delete(cwd);
      return roots;
    },
    (error) => {
      repoRootsInFlight.delete(cwd);
      throw error;
    }
  );
  repoRootsInFlight.set(cwd, promise);
  return promise;
}
async function discoverRepoRoots(cwd) {
  const roots = [];
  try {
    roots.push(await directRepoRoot(cwd));
  } catch {
  }
  let level = [cwd];
  for (let depth = 1; depth <= DISCOVERY_MAX_DEPTH && level.length > 0; depth++) {
    const next = [];
    for (const dir of level.slice(0, DISCOVERY_LIMIT)) {
      const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
      let hasGit = false;
      const subdirs = [];
      for (const entry of entries) {
        if (entry.name === ".git") {
          if (entry.isDirectory() || entry.isFile() || entry.isSymbolicLink()) hasGit = true;
        } else if (entry.isDirectory() && !entry.isSymbolicLink() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
          subdirs.push(entry.name);
        }
      }
      if (hasGit && dir !== cwd) {
        const resolved = await realpath(dir).catch(() => dir);
        const root = process.platform === "win32" ? resolved.replaceAll("\\", "/") : resolved;
        if (!roots.some((existing) => pathIdentity(existing) === pathIdentity(root))) roots.push(root);
      }
      for (const name2 of subdirs.sort((left, right) => left.localeCompare(right))) next.push(join(dir, name2));
    }
    level = next;
  }
  return roots;
}
async function repoRoot(cwd, selected) {
  const roots = await repoRoots(cwd);
  if (roots.length === 0) throw new GitCommandError("not a git repository", "not-repo", "rev-parse");
  if (selected !== void 0) {
    const identity = pathIdentity(selected);
    const match = roots.find((root) => pathIdentity(root) === identity);
    if (match !== void 0) return match;
  }
  return roots[0];
}
async function currentBranch(cwd) {
  const out = await runGit(cwd, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  return out.trim();
}
async function currentOperation(cwd) {
  const gitDir = (await runGit(cwd, ["rev-parse", "--absolute-git-dir"])).trim();
  const names = await readdir(gitDir);
  if (names.includes("rebase-merge") || names.includes("rebase-apply") && (await readdir(join(gitDir, "rebase-apply")).catch(() => [])).includes("rebasing")) {
    return "rebase";
  }
  return names.includes("MERGE_HEAD") ? "merge" : void 0;
}
function numstatPathsof(porcelainZ) {
  const paths = [];
  let bytes = 0;
  const add = (path) => {
    if (path === "") return true;
    bytes += Buffer.byteLength(path) + 1;
    if (bytes > NUMSTAT_PATHSPEC_MAX_BYTES) return false;
    paths.push(path);
    return true;
  };
  for (const token of porcelainV2Tokens(porcelainZ)) {
    if (token.kind !== "record" || token.xy === "??") continue;
    if (!add(token.path)) return void 0;
    if (token.origin !== void 0 && !add(token.origin)) return void 0;
  }
  return paths;
}
async function status(cwd, selected) {
  const repositories = await repoRoots(cwd);
  if (repositories.length === 0) return { isRepo: false, entries: [], repositories: [] };
  const root = await repoRoot(cwd, selected);
  const [operation, raw] = await Promise.all([
    currentOperation(root).catch(() => void 0),
    runGit(
      root,
      ["status", "--porcelain=v2", "--branch", "--ahead-behind", "-z", "--untracked-files=all"],
      void 0,
      // The row cap is enforced while git is still producing, not after parsing
      // a megabyte of untracked paths: see {@link GIT_STATUS_MAX_FIELDS}.
      { maxNulFields: GIT_STATUS_MAX_FIELDS }
    )
  ]);
  const snapshot = parseStatusPorcelainV2Z(raw);
  const parsed = snapshot.entries;
  const pathspec = numstatPathsof(raw);
  let unstagedNumstat = "";
  let stagedNumstat = "";
  if (pathspec === void 0 || pathspec.length > 0) {
    const literal = pathspec === void 0 ? [] : ["--literal-pathspecs"];
    const paths = pathspec === void 0 ? [] : ["--", ...pathspec];
    const [unstaged, staged] = await Promise.all([
      runGit(root, [...literal, "diff", "--numstat", "-z", ...paths]).catch(() => ""),
      runGit(root, [...literal, "diff", "--cached", "--numstat", "-z", ...paths]).catch(() => "")
    ]);
    unstagedNumstat = unstaged;
    stagedNumstat = staged;
  }
  const stagedCounts = parseNumstat(stagedNumstat);
  const unstagedCounts = parseNumstat(unstagedNumstat);
  const truncated = parsed.length > GIT_STATUS_LIMIT;
  const bounded = truncated ? parsed.slice(0, GIT_STATUS_LIMIT) : parsed;
  return {
    ...snapshot,
    operation,
    // Paths git has no numstat row for on either side (untracked files) keep
    // their entry untouched: the absence IS the information.
    entries: bounded.map((entry) => {
      const staged = stagedCounts.get(entry.path);
      const unstaged = unstagedCounts.get(entry.path);
      if (staged === void 0 && unstaged === void 0) return entry;
      return {
        ...entry,
        ...staged !== void 0 ? { staged } : {},
        ...unstaged !== void 0 ? { unstaged } : {}
      };
    }),
    truncated,
    root,
    repositories
  };
}
function pathIdentity(path) {
  const absolute = resolve(path).replace(/[\\/]+$/, "");
  return process.platform === "win32" ? absolute.toLowerCase() : absolute;
}
async function listedWorktrees(cwd) {
  let raw;
  if (worktreeListSupportsZ === false) {
    raw = await runGit(cwd, ["worktree", "list", "--porcelain"]);
  } else {
    try {
      raw = await runGit(cwd, ["worktree", "list", "--porcelain", "-z"]);
      worktreeListSupportsZ = true;
    } catch {
      worktreeListSupportsZ = false;
      raw = await runGit(cwd, ["worktree", "list", "--porcelain"]);
    }
  }
  return parseWorktreeList(raw).filter((entry) => !entry.prunable);
}
async function countChanges(cwd) {
  const raw = await runGit(cwd, ["status", "--porcelain=v1", "-z", "--untracked-files=normal"]);
  return parsePorcelainZ(raw).length;
}
async function worktrees(cwd) {
  if (!await isGitRepo(cwd)) return [];
  const currentRoot = await repoRoot(cwd);
  const listed = await listedWorktrees(cwd);
  const rows = await Promise.all(listed.map(async (entry) => ({
    path: entry.path,
    branch: entry.branch,
    current: pathIdentity(entry.path) === pathIdentity(currentRoot),
    // One stale/permission-raced linked checkout must not hide the valid
    // current repository from the panel. Targeted operations still fail loud.
    changes: await countChanges(entry.path).catch(() => 0)
  })));
  return rows.sort((left, right) => Number(right.current) - Number(left.current));
}
async function resolveWorktree(cwd, requested) {
  if (requested === void 0 || requested === "") return cwd;
  const identity = pathIdentity(requested);
  const match = (await listedWorktrees(cwd)).find((entry) => pathIdentity(entry.path) === identity);
  if (match === void 0) {
    throw new GitCommandError(`unknown linked worktree: ${requested}`, "git-worktree", "worktree list");
  }
  return match.path;
}
async function diff(cwd, path, staged, selected) {
  const root = await repoRoot(cwd, selected);
  const args = ["diff", "--no-ext-diff", "--no-color", "-U3"];
  if (staged) args.push("--cached");
  if (path !== void 0) args.push("--", path);
  return runGit(root, args);
}
async function diffHead(cwd, path, selected) {
  const root = await repoRoot(cwd, selected);
  const tail = path !== void 0 ? ["--", path] : [];
  try {
    return await runGit(root, ["diff", "--no-ext-diff", "--no-color", "-U3", "HEAD", ...tail]);
  } catch {
    return runGit(root, ["diff", "--no-ext-diff", "--no-color", "-U3", "--cached", ...tail]);
  }
}
async function stage(cwd, path, selected) {
  await runGit(await repoRoot(cwd, selected), ["add", "-A", ...path !== void 0 ? ["--", path] : []]);
}
async function unstage(cwd, path, selected) {
  await runGit(await repoRoot(cwd, selected), ["reset", "-q", ...path !== void 0 ? ["--", path] : []]);
}
async function commit(cwd, message, selected) {
  await runGit(await repoRoot(cwd, selected), ["commit", "-m", message]);
}
async function branches(cwd, selected) {
  const root = await repoRoot(cwd, selected);
  const [current, raw] = await Promise.all([
    currentBranch(root).catch(() => ""),
    runGit(root, ["for-each-ref", "--format=%(refname:short)", "refs/heads"])
  ]);
  const names = raw.split("\n").filter((line) => line !== "");
  return { current, names: current !== "" && !names.includes(current) ? [current, ...names] : names };
}
async function checkout(cwd, branch, selected) {
  await runGit(await repoRoot(cwd, selected), ["checkout", "--end-of-options", branch]);
}
async function log(cwd, count = 30, skip = 0, selected) {
  const raw = await runGit(await repoRoot(cwd, selected), [
    "log",
    "--all",
    "--topo-order",
    "-n",
    String(count),
    "--skip",
    String(skip),
    "--decorate=short",
    "--pretty=format:%h%x1f%s%x1f%an%x1f%ai%x1f%H%x1f%D%x1f%P"
  ]);
  return parseLogLines(raw);
}
async function show(cwd, rev, path, selected) {
  try {
    return await runGit(await repoRoot(cwd, selected), ["show", "--end-of-options", `${rev}:${path}`]);
  } catch {
    return null;
  }
}
async function commitDiff(cwd, hash, selected) {
  return runGit(await repoRoot(cwd, selected), ["show", "--no-ext-diff", "--no-color", "--format=", "-m", "--first-parent", "--end-of-options", hash]);
}
async function discard(cwd, path, selected) {
  await runGit(await repoRoot(cwd, selected), ["checkout", "--", path]);
}
async function revert(cwd, hash, selected) {
  await runGit(await repoRoot(cwd, selected), ["revert", "--no-edit", "--end-of-options", hash]);
}
async function cherryPick(cwd, hash, selected) {
  await runGit(await repoRoot(cwd, selected), ["cherry-pick", "--end-of-options", hash]);
}
async function push(cwd, selected) {
  await runGit(await repoRoot(cwd, selected), ["push"]);
}
async function pull(cwd, selected) {
  await runGit(await repoRoot(cwd, selected), ["pull", "--ff-only"]);
}
var GitCommandError, DUBIOUS_OWNERSHIP, REFUSED_REPOSITORY, GIT_ENV, GIT_OUTPUT_MAX_BYTES, DISCOVERY_LIMIT, DISCOVERY_MAX_DEPTH, DISCOVERY_TIMEOUT_MS, DISCOVERY_CACHE_TTL_MS, repoRootsCache, repoRootsInFlight, GIT_STATUS_LIMIT, GIT_STATUS_MAX_FIELDS, NUMSTAT_PATHSPEC_MAX_BYTES, worktreeListSupportsZ;
var init_git = __esm({
  "src/git.ts"() {
    GitCommandError = class extends Error {
      constructor(message, code = "git-error", command) {
        super(message);
        this.code = code;
        this.command = command;
      }
      code;
      command;
    };
    DUBIOUS_OWNERSHIP = /dubious ownership/i;
    REFUSED_REPOSITORY = /detected dubious ownership in repository at '([^']*)'/;
    GIT_ENV = { GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C" };
    GIT_OUTPUT_MAX_BYTES = 8 * 1024 * 1024;
    DISCOVERY_LIMIT = 200;
    DISCOVERY_MAX_DEPTH = 4;
    DISCOVERY_TIMEOUT_MS = 5e3;
    DISCOVERY_CACHE_TTL_MS = 6e4;
    repoRootsCache = /* @__PURE__ */ new Map();
    repoRootsInFlight = /* @__PURE__ */ new Map();
    GIT_STATUS_LIMIT = 2e3;
    GIT_STATUS_MAX_FIELDS = (GIT_STATUS_LIMIT + 1) * 2;
    NUMSTAT_PATHSPEC_MAX_BYTES = 8e3;
  }
});

// src/index.ts
import { open as open3, readFile as readFile3, stat as stat8 } from "node:fs/promises";
import { basename as basename3, extname, isAbsolute as isAbsolute6, join as join12, sep as sep8 } from "node:path";
import { WebSocket, WebSocketServer } from "ws";
import { parse as parseYaml } from "yaml";

// src/config.ts
import z from "file:///E:/DSH/%E6%9C%AC%E4%BD%93/resources/app.asar/dsh/node_modules/@deepseek-ai/schemastery/lib/index.cjs";

// src/prefs-shared.ts
var SIDEBAR_PREFS_NS = "dsh-better-sidebar";
var EXPLORER_EXCLUDE_DEFAULTS = [".DS_Store", "Thumbs.db", ".dsh-sidebar-recovery"];
var SIDEBAR_PREFS_DEFAULTS = {
  autoOpenSubagent: true,
  autoOpenJobs: true,
  tasksViewMode: "graph",
  // Both mobile adaptations are ON by default: a phone is the case they exist
  // for, and each one only ever changes what happens on a NARROW viewport.
  mobileNoAutoOpen: true,
  mobileDefaultTree: true,
  agentOpenTools: false,
  editorExplorer: false,
  editorGitGutter: true,
  explorerExclude: [...EXPLORER_EXCLUDE_DEFAULTS],
  customCss: "",
  htmlViewerNoSandbox: false,
  htmlViewerDefaultUnsafe: false,
  tabsEnabled: {},
  viewersEnabled: {},
  pluginSettings: {}
};

// src/config.ts
var LimitsSchema = z.object({
  listLimit: z.number().step(1).min(1).default(1e3)
});
function resolveSidebarConfig(config) {
  return {
    listLimit: config?.listLimit ?? 1e3
  };
}
var PrefsSchema = z.object({
  autoOpenSubagent: z.boolean().default(true),
  autoOpenJobs: z.boolean().default(true),
  tasksViewMode: z.union([z.const("graph"), z.const("tree")]).default("graph"),
  mobileNoAutoOpen: z.boolean().default(true),
  mobileDefaultTree: z.boolean().default(true),
  agentOpenTools: z.boolean().default(false),
  editorExplorer: z.boolean().default(false),
  editorGitGutter: z.boolean().default(true),
  explorerExclude: z.array(z.string()).default([...EXPLORER_EXCLUDE_DEFAULTS]),
  customCss: z.string(),
  htmlViewerNoSandbox: z.boolean().default(false),
  htmlViewerDefaultUnsafe: z.boolean().default(false),
  // Per-feature enable switches are OPEN maps (any tab/viewer id, built-in or
  // external): an absent key means enabled, so old documents resolve to {}
  // (everything on) with no migration. Non-boolean values fail validation.
  tabsEnabled: z.dict(z.boolean()).default({}),
  viewersEnabled: z.dict(z.boolean()).default({}),
  // Plugin-owned settings blobs (v0.12.0+) are an OPEN nested map: any
  // descriptor id may carry any JSON-serializable values. This is the
  // "settings seam" opening — without it the seam would drop third-party
  // keys as unknown schema fields.
  pluginSettings: z.dict(z.dict(z.any())).default({})
});
var volatilePrefs = Object.fromEntries(
  Object.entries(PrefsSchema.dict ?? {}).map(([key, field]) => [key, field.volatile()])
);
var Config = z.object({
  ...LimitsSchema.dict,
  ...volatilePrefs
});

// src/fs-tree.ts
import { opendir, readdir as readdir2, realpath as realpath2, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, resolve as resolve2, sep } from "node:path";

// src/wire.ts
init_git();
var SidebarError = class extends Error {
  constructor(code, message, status2 = 400, meta) {
    super(message);
    this.code = code;
    this.status = status2;
    this.meta = meta;
  }
  code;
  status;
  meta;
};
var MAX_BODY_BYTES = 1 << 20;
async function readJsonBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_BODY_BYTES) {
      throw new SidebarError("bad-request", "request body too large");
    }
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (text.trim() === "") return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new SidebarError("bad-request", "request body is not valid JSON");
  }
}
async function readTextBody(req, limit) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk);
    total += buffer.length;
    if (total > limit) {
      throw new SidebarError("too-large", `request body exceeds the ${limit} byte limit`, 413);
    }
    chunks.push(buffer);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
  } catch {
    throw new SidebarError("bad-request", "request body is not valid UTF-8");
  }
}
function writeJson(res, status2, body) {
  if (res.headersSent === true) {
    res.destroy?.();
    return;
  }
  const payload = JSON.stringify(body);
  res.writeHead(status2, { "content-type": "application/json; charset=utf-8" });
  res.end(payload);
}
function writeOk(res, value) {
  writeJson(res, 200, { ok: true, value });
}
function writeError(res, error) {
  if (error instanceof SidebarError) {
    writeJson(res, error.status, { ok: false, error: { code: error.code, message: error.message } });
    return;
  }
  if (error instanceof GitCommandError) {
    const notRepo = error.code === "not-repo";
    writeJson(res, notRepo ? 409 : 400, {
      ok: false,
      error: { code: notRepo ? "not-repo" : "git-error", message: error.message }
    });
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  writeJson(res, 500, { ok: false, error: { code: "internal", message } });
}
function requireString(payload, key) {
  const record = payload;
  const value = record?.[key];
  if (typeof value !== "string" || value === "") {
    throw new SidebarError("bad-request", `missing or invalid "${key}"`);
  }
  return value;
}

// src/fs-tree.ts
function compareEntries(a, b) {
  if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
  const la = a.name.toLowerCase();
  const lb = b.name.toLowerCase();
  if (la !== lb) return la < lb ? -1 : 1;
  if (a.name === b.name) return 0;
  return a.name < b.name ? -1 : 1;
}
var SYMLINK_PROBE_CONCURRENCY = 32;
var DIRECTORY_CACHE_TTL_MS = 1500;
var directoryCache = /* @__PURE__ */ new Map();
function cacheKey(path, maxEntries, exclude, scopeRoot) {
  return `${path}\0${maxEntries}\0${exclude?.key ?? ""}\0${scopeRoot}`;
}
function invalidateDirectoryCache(path) {
  if (path === void 0) {
    directoryCache.clear();
    return;
  }
  const target = resolve2(path);
  const prefix = `${target}\0`;
  for (const key of directoryCache.keys()) {
    if (key.startsWith(prefix)) directoryCache.delete(key);
  }
}
var DIRECTORY_CACHE_MAX = 512;
async function listDirectoryCached(path, maxEntries, exclude, gate, scopeRoot) {
  const key = cacheKey(path, maxEntries, exclude, scopeRoot);
  const now = Date.now();
  const hit = directoryCache.get(key);
  if (hit !== void 0 && now - hit.at < DIRECTORY_CACHE_TTL_MS) return hit.listing;
  const listing = await readDirectory(path, maxEntries, exclude, gate, scopeRoot);
  if (directoryCache.size >= DIRECTORY_CACHE_MAX) {
    const oldest = directoryCache.keys().next().value;
    if (oldest !== void 0) directoryCache.delete(oldest);
  }
  directoryCache.set(key, { at: now, listing });
  return listing;
}
async function listDirectory(path, maxEntries = 1e3, exclude, gate, scopeRoot = path) {
  return await listDirectoryCached(path, maxEntries, exclude, gate, scopeRoot);
}
async function readDirectory(path, maxEntries, exclude, gate, scopeRoot) {
  let dirents;
  try {
    dirents = await readdir2(path, { withFileTypes: true });
  } catch (error) {
    throw new SidebarError("fs-error", `cannot list "${path}": ${messageOf(error)}`, 400);
  }
  const prefix = path.endsWith(sep) ? path : `${path}${sep}`;
  const visible = exclude === void 0 ? dirents : dirents.filter((dirent) => !exclude(`${prefix}${dirent.name}`, dirent.name));
  const truncated = visible.length > maxEntries;
  const kept = truncated ? visible.slice(0, maxEntries) : visible;
  const rows = new Array(kept.length);
  for (let index = 0; index < kept.length; index += 1) {
    const dirent = kept[index];
    rows[index] = {
      name: dirent.name,
      path: `${prefix}${dirent.name}`,
      isDir: dirent.isDirectory(),
      isSymlink: dirent.isSymbolicLink(),
      broken: false,
      hidden: dirent.name.startsWith(".")
    };
  }
  await probeSymlinkTargets(rows, await realpath2(scopeRoot), gate);
  if (!truncated) await probeCompactRows(rows, exclude, gate);
  rows.sort(compareEntries);
  return { path, entries: rows, truncated };
}
var PROBE_BUDGET = 32;
function createProbeGate(limit = PROBE_BUDGET) {
  const max = Math.max(1, Math.floor(limit));
  let active = 0;
  const waiting = [];
  const acquire = () => new Promise((resolve6) => {
    if (active < max) {
      active += 1;
      resolve6();
      return;
    }
    waiting.push(() => {
      active += 1;
      resolve6();
    });
  });
  const release = () => {
    active -= 1;
    waiting.shift()?.();
  };
  return {
    async run(task) {
      await acquire();
      try {
        return await task();
      } finally {
        release();
      }
    }
  };
}
async function forEachRow(rows, concurrency, visit) {
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, rows.length) }, async () => {
    for (; ; ) {
      const index = next;
      next += 1;
      if (index >= rows.length) return;
      await visit(rows[index]);
    }
  });
  await Promise.all(workers);
}
function runProbe(gate, task) {
  return gate === void 0 ? task() : gate.run(task);
}
async function probeSymlinkTargets(rows, scopeRoot, gate, concurrency = SYMLINK_PROBE_CONCURRENCY) {
  await forEachRow(rows, concurrency, async (row) => {
    if (!row.isSymlink) return;
    const info = await runProbe(gate, async () => {
      const canonical = await realpath2(row.path);
      if (!isWithin(scopeRoot, canonical)) return void 0;
      return stat(canonical);
    }).catch(() => void 0);
    row.isDir = info !== void 0 ? info.isDirectory() : row.isDir;
    row.broken = info === void 0;
  });
}
var COMPACT_PROBE_CONCURRENCY = 32;
var COMPACT_PROBE_MAX = 32;
async function probeCompactRows(rows, exclude, gate, concurrency = COMPACT_PROBE_CONCURRENCY) {
  let probed = 0;
  await forEachRow(rows, concurrency, async (row) => {
    if (!row.isDir || row.broken || row.isSymlink) return;
    if (probed >= COMPACT_PROBE_MAX) return;
    probed += 1;
    if (await runProbe(gate, () => hasSingletonChild(row.path, exclude))) row.compact = true;
  });
}
async function hasSingletonChild(dir, exclude) {
  let level;
  try {
    level = await opendir(dir);
    let only = null;
    for (; ; ) {
      const entry = await level.read();
      if (entry === null) break;
      if (entry.name.startsWith(".")) continue;
      if (exclude !== void 0 && exclude(`${dir}${sep}${entry.name}`, entry.name)) continue;
      if (only !== null) return false;
      only = entry;
    }
    return only !== null && !only.isSymbolicLink();
  } catch {
    return false;
  } finally {
    await level?.close().catch(() => void 0);
  }
}
function rootLabel(path) {
  const base = basename(path);
  return base !== "" ? base : path;
}
function parentOf(path) {
  const parent = dirname(path);
  return parent === path ? void 0 : parent;
}
function requireAbsolute(path) {
  if (!isAbsolute(path)) {
    throw new SidebarError("fs-error", `"${path}" is not an absolute path`, 400);
  }
  return resolve2(path);
}
function isWithin(base, target, platform = process.platform) {
  const norm = (value) => value.replace(/[\\/]+/g, "/").replace(/\/$/, "");
  const b = norm(base);
  const t = norm(target);
  if (platform === "win32") {
    const lb = b.toLowerCase();
    const lt = t.toLowerCase();
    return lt === lb || lt.startsWith(`${lb}/`);
  }
  return t === b || t.startsWith(`${b}/`);
}
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
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
    const relative5 = target.slice(1).replace(/\//g, "\\");
    return win32.resolve(distroRoot, relative5);
  }
  const mirror = REMOTE_MIRROR_ROOT.exec(normalizedCwd);
  if (mirror !== null) {
    const mirrorRoot = mirror[1];
    const remotePath = remotePathOf(mirrorRoot);
    if (remotePath !== void 0) {
      const relative5 = relativeUnderPosix(remotePath, target);
      if (relative5 !== void 0) {
        return relative5 === "" ? win32.resolve(mirrorRoot) : win32.resolve(mirrorRoot, relative5.replace(/\//g, "\\"));
      }
    }
  }
  return target;
}

// src/fs-operations.ts
import { randomUUID as randomUUID2 } from "node:crypto";
import { once } from "node:events";
import { createWriteStream } from "node:fs";
import { access, lstat as lstat3, mkdir as mkdir2, rename as rename2, rm, stat as stat2, writeFile as writeFile2 } from "node:fs/promises";
import { basename as basename2, dirname as dirname4, join as join4 } from "node:path";

// src/path-security.ts
import { lstat, realpath as realpath3 } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute as isAbsolute2, join as join2, dirname as dirname2, relative, sep as sep2, resolve as resolve3 } from "node:path";
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
  const homeExpanded = target === "~" || target.startsWith("~/") || target.startsWith("~\\") ? join2(homedir(), target.slice(1)) : target;
  const projected = resolveSessionPath(root, homeExpanded);
  const absolute = resolve3(root, projected);
  assertSafePathSyntax(absolute);
  if (!within(root, absolute)) refuse("path is outside the session workspace; select the intended workspace first");
  return absolute;
}
async function validate(cwd, target, allowMissing, protectRecovery = false) {
  const absolute = resolveTarget(cwd, target);
  const canonicalRoot = await realpath3(requireAbsolute(cwd));
  let ancestor = absolute;
  const missing = [];
  for (; ; ) {
    try {
      await lstat(ancestor);
      const canonicalAncestor = await realpath3(ancestor);
      const canonicalTarget = resolve3(canonicalAncestor, ...missing);
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
import { constants } from "node:fs";
import { copyFile, lstat as lstat2, mkdir, readFile, readdir as readdir3, realpath as realpath4, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname as dirname3, join as join3, relative as relative2, resolve as resolve4 } from "node:path";
var pending = /* @__PURE__ */ new Map();
async function withWorkspaceMutation(cwd, action) {
  const canonical = await realpath4(cwd);
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
  const root = join3(workspace, RECOVERY_DIRECTORY);
  if (create) await mkdir(root, { mode: 448 }).catch((error) => {
    if (error.code !== "EEXIST") throw error;
  });
  const entry = await lstat2(root);
  if (!entry.isDirectory() || entry.isSymbolicLink()) throw new SidebarError("forbidden", "recovery storage must be a real workspace directory", 403);
  await ensureWorkspacePath(cwd, root);
  if (create) await writeFile(join3(root, ".gitignore"), "*\n", { flag: "wx", mode: 384 }).catch((error) => {
    if (error.code !== "EEXIST") throw error;
  });
  return root;
}
async function entryDirectory(cwd, id) {
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)) throw new SidebarError("bad-request", "invalid recovery id", 400);
  const directory = join3(await recoveryRoot(cwd, false), id);
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
  const directory = join3(root, id);
  await mkdir(directory, { mode: 448 });
  const record = {
    schema: 1,
    id,
    originalRelativePath: relative2(resolve4(cwd), absolute),
    kind,
    entryType: kind === "overwrite" ? "file" : info.isSymbolicLink() ? "symlink" : info.isDirectory() ? "directory" : "file",
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  await writeFile(join3(directory, "record.json"), JSON.stringify(record, null, 2), { flag: "wx", mode: 384 });
  if (kind === "deleted") await rename(absolute, join3(directory, "content"));
  else {
    const pendingContent = join3(directory, "content.pending");
    await copyFile(absolute, pendingContent, constants.COPYFILE_EXCL);
    await rename(pendingContent, join3(directory, "content"));
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
  const file = join3(directory, "record.json");
  if ((await lstat2(file)).isSymbolicLink()) throw new SidebarError("forbidden", "recovery metadata cannot be a link", 403);
  const record = JSON.parse(await readFile(file, "utf8"));
  if (record.schema !== 1 || record.id !== id || typeof record.originalRelativePath !== "string" || !["deleted", "overwrite"].includes(record.kind) || !["file", "directory", "symlink"].includes(record.entryType)) {
    throw new SidebarError("fs-error", "invalid recovery record", 400);
  }
  try {
    const marker = join3(directory, "restored.json");
    if ((await lstat2(marker)).isSymbolicLink()) throw new SidebarError("forbidden", "invalid restore marker", 403);
    const restored = JSON.parse(await readFile(marker, "utf8"));
    if (typeof restored.restoredAt === "string") record.restoredAt = restored.restoredAt;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await ensureWorkspaceWritePath(cwd, join3(cwd, record.originalRelativePath));
  const payload = join3(directory, "content");
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
  for (const item of await readdir3(root, { withFileTypes: true })) {
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
    const target = await ensureWorkspaceWritePath(cwd, join3(cwd, record.originalRelativePath));
    if (resolve4(target) === resolve4(cwd)) throw new SidebarError("forbidden", "cannot replace the workspace root", 403);
    try {
      await lstat2(target);
      throw new SidebarError("fs-conflict", "restore destination already exists; rename it first", 409);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await mkdir(dirname3(target), { recursive: true });
    await ensureWorkspaceWritePath(cwd, target);
    const content = join3(directory, "content");
    if (record.entryType === "directory" || record.entryType === "symlink") await rename(content, target);
    else await copyFile(content, target, constants.COPYFILE_EXCL);
    await writeFile(join3(directory, "restored.json"), JSON.stringify({ restoredAt: (/* @__PURE__ */ new Date()).toISOString() }), { flag: "wx", mode: 384 });
    invalidateDirectoryCache(dirname3(target));
    return { path: target };
  });
}

// src/text-encoding.ts
import { open } from "node:fs/promises";
var UTF8_BOM = Buffer.from([239, 187, 191]);
var UTF16LE_BOM = Buffer.from([255, 254]);
var UTF16BE_BOM = Buffer.from([254, 255]);
var UTF32LE_BOM = Buffer.from([255, 254, 0, 0]);
var UTF32BE_BOM = Buffer.from([0, 0, 254, 255]);
var ENCODING_SNIFF_LIMIT = 64 * 1024;
var EOL_SNIFF_LIMIT = 4096;
var UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });
var GBK_DECODER = new TextDecoder("gbk", { fatal: true });
var GB18030_DECODER = new TextDecoder("gb18030", { fatal: true });
var GB18030_LOOSE_DECODER = new TextDecoder("gb18030");
var GB18030_POINTERS = 126 * 10 * 126 * 10;
function startsWith(bytes, prefix) {
  if (bytes.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i += 1) {
    if (bytes[i] !== prefix[i]) return false;
  }
  return true;
}
function decodeUtf16(bytes, littleEndian) {
  const length = bytes.length - bytes.length % 2;
  const body = Buffer.from(bytes.subarray(0, length));
  if (!littleEndian) body.swap16();
  return body.toString("utf16le");
}
function encodeUtf16(text, littleEndian) {
  const body = Buffer.from(text, "utf16le");
  if (!littleEndian) body.swap16();
  return body;
}
function decodeUtf32(bytes, littleEndian) {
  const length = bytes.length - bytes.length % 4;
  let content = "";
  for (let offset = 0; offset < length; offset += 4) {
    const codePoint = littleEndian ? bytes.readUInt32LE(offset) : bytes.readUInt32BE(offset);
    content += codePoint <= 1114111 && !(codePoint >= 55296 && codePoint <= 57343) ? String.fromCodePoint(codePoint) : "\uFFFD";
  }
  return content;
}
function encodeUtf32(text, littleEndian) {
  const codePoints = [...text].map((char) => char.codePointAt(0) ?? 65533);
  const body = Buffer.allocUnsafe(codePoints.length * 4);
  codePoints.forEach((codePoint, index) => {
    if (littleEndian) body.writeUInt32LE(codePoint, index * 4);
    else body.writeUInt32BE(codePoint, index * 4);
  });
  return body;
}
function isUtf16TextUnit(unit) {
  if (unit === 9 || unit === 10 || unit === 13) return true;
  if (unit >= 32 && unit <= 126) return true;
  if (unit >= 160 && unit <= 55295) return true;
  return unit >= 57344 && unit <= 65533;
}
function looksLikeUtf16Text(bytes, pairs, littleEndian) {
  if (pairs === 0) return false;
  let text = 0;
  for (let index = 0; index < pairs; index += 1) {
    const unit = littleEndian ? bytes[index * 2] | bytes[index * 2 + 1] << 8 : bytes[index * 2] << 8 | bytes[index * 2 + 1];
    if (isUtf16TextUnit(unit)) text += 1;
  }
  return text * 10 >= pairs * 9;
}
function bomlessUtf16(bytes) {
  if (bytes.length < 4) return void 0;
  const pairs = Math.min(Math.floor(bytes.length / 2), 1024);
  let evenZeros = 0;
  let oddZeros = 0;
  for (let i = 0; i < pairs; i += 1) {
    if (bytes[i * 2] === 0) evenZeros += 1;
    if (bytes[i * 2 + 1] === 0) oddZeros += 1;
  }
  const minimumZeros = Math.max(2, Math.floor(pairs * 0.2));
  if (oddZeros >= minimumZeros && oddZeros >= evenZeros * 4 && looksLikeUtf16Text(bytes, pairs, true)) return "utf16le";
  if (evenZeros >= minimumZeros && evenZeros >= oddZeros * 4 && looksLikeUtf16Text(bytes, pairs, false)) return "utf16be";
  return void 0;
}
function tryDecode(decoder, bytes) {
  try {
    return decoder.decode(bytes);
  } catch {
    return void 0;
  }
}
function hasGb18030FourByteSequence(bytes) {
  for (let i = 0; i + 3 < bytes.length; i += 1) {
    const b1 = bytes[i];
    const b2 = bytes[i + 1];
    const b3 = bytes[i + 2];
    const b4 = bytes[i + 3];
    if (b1 >= 129 && b1 <= 254 && b2 >= 48 && b2 <= 57 && b3 >= 129 && b3 <= 254 && b4 >= 48 && b4 <= 57) {
      return true;
    }
  }
  return false;
}
function hasIncompleteUtf8Tail(bytes) {
  for (let start = Math.max(0, bytes.length - 3); start < bytes.length; start += 1) {
    const lead = bytes[start];
    const size = lead >= 240 && lead <= 244 ? 4 : lead >= 224 && lead <= 239 ? 3 : lead >= 194 && lead <= 223 ? 2 : 0;
    if (size === 0 || start + size <= bytes.length) continue;
    let incomplete = true;
    for (let i = start + 1; i < bytes.length; i += 1) {
      const trail = bytes[i];
      if (trail < 128 || trail > 191) {
        incomplete = false;
        break;
      }
    }
    if (incomplete && tryDecode(UTF8_DECODER, bytes.subarray(0, start)) !== void 0) return true;
  }
  return false;
}
function decodeTextBytes(bytes, truncated = false) {
  if (startsWith(bytes, UTF32LE_BOM)) {
    return { content: decodeUtf32(bytes.subarray(4), true), encoding: "utf32le-bom" };
  }
  if (startsWith(bytes, UTF32BE_BOM)) {
    return { content: decodeUtf32(bytes.subarray(4), false), encoding: "utf32be-bom" };
  }
  if (startsWith(bytes, UTF8_BOM)) {
    return { content: bytes.subarray(3).toString("utf8"), encoding: "utf8-bom" };
  }
  if (startsWith(bytes, UTF16LE_BOM)) {
    return { content: decodeUtf16(bytes.subarray(2), true), encoding: "utf16le-bom" };
  }
  if (startsWith(bytes, UTF16BE_BOM)) {
    return { content: decodeUtf16(bytes.subarray(2), false), encoding: "utf16be-bom" };
  }
  const utf16 = bomlessUtf16(bytes);
  if (utf16 !== void 0) {
    return { content: decodeUtf16(bytes, utf16 === "utf16le"), encoding: utf16 };
  }
  if (bytes.includes(0)) return null;
  const utf8 = tryDecode(UTF8_DECODER, bytes);
  if (utf8 !== void 0) return { content: utf8, encoding: "utf8" };
  if (truncated && hasIncompleteUtf8Tail(bytes)) {
    return { content: bytes.toString("utf8"), encoding: "utf8" };
  }
  const gb18030 = tryDecode(GB18030_DECODER, bytes);
  if (gb18030 !== void 0 && hasGb18030FourByteSequence(bytes)) {
    return { content: gb18030, encoding: "gb18030" };
  }
  const gbk = tryDecode(GBK_DECODER, bytes);
  if (gbk !== void 0) return { content: gbk, encoding: "gbk" };
  if (gb18030 !== void 0) return { content: gb18030, encoding: "gb18030" };
  return { content: bytes.toString("utf8"), encoding: "utf8" };
}
function unitWidth(encoding) {
  if (encoding === "utf16le" || encoding === "utf16le-bom" || encoding === "utf16be" || encoding === "utf16be-bom") return 2;
  if (encoding === "utf32le-bom" || encoding === "utf32be-bom") return 4;
  return 1;
}
function isWideEncoding(encoding) {
  return unitWidth(encoding) !== 1;
}
function unitLittleEndian(encoding) {
  return encoding === "utf16le" || encoding === "utf16le-bom" || encoding === "utf32le-bom";
}
function lastLineBreakEnd(bytes, encoding) {
  const width = unitWidth(encoding);
  const littleEndian = unitLittleEndian(encoding);
  for (let index = bytes.length - 1; index >= 0; index -= 1) {
    if (bytes[index] !== 10) continue;
    if (width === 1) return index + 1;
    const within2 = littleEndian ? index % width : width - 1 - index % width;
    if (within2 !== 0) continue;
    return littleEndian ? index + width : index + 1;
  }
  return -1;
}
function decodeTextAs(bytes, encoding) {
  switch (encoding) {
    case "utf8":
    case "utf8-bom":
      return tryDecode(UTF8_DECODER, bytes) ?? bytes.toString("utf8");
    case "utf16le":
    case "utf16le-bom":
      return decodeUtf16(bytes, true);
    case "utf16be":
    case "utf16be-bom":
      return decodeUtf16(bytes, false);
    case "utf32le-bom":
      return decodeUtf32(bytes, true);
    case "utf32be-bom":
      return decodeUtf32(bytes, false);
    case "gbk":
      return tryDecode(GBK_DECODER, bytes) ?? bytes.toString("utf8");
    case "gb18030":
      return tryDecode(GB18030_DECODER, bytes) ?? bytes.toString("utf8");
  }
}
var gbkEncodeMap;
function getGbkEncodeMap() {
  if (gbkEncodeMap !== void 0) return gbkEncodeMap;
  const map = /* @__PURE__ */ new Map();
  for (let byte = 0; byte <= 127; byte += 1) map.set(String.fromCharCode(byte), byte);
  map.set("\u20AC", 128);
  for (let lead = 129; lead <= 254; lead += 1) {
    for (let trail = 64; trail <= 254; trail += 1) {
      if (trail === 127) continue;
      const char = tryDecode(GBK_DECODER, Uint8Array.of(lead, trail));
      if (char !== void 0 && [...char].length === 1 && !map.has(char)) {
        map.set(char, lead << 8 | trail);
      }
    }
  }
  gbkEncodeMap = map;
  return map;
}
function gb18030PointerBytes(pointer) {
  let value = pointer;
  const fourth = value % 10;
  value = Math.floor(value / 10);
  const third = value % 126;
  value = Math.floor(value / 126);
  const second = value % 10;
  value = Math.floor(value / 10);
  return [value + 129, second + 48, third + 129, fourth + 48];
}
var gb18030PointerCache = /* @__PURE__ */ new Map();
function resolveGb18030Pointers(chars) {
  const pending2 = new Set([...chars].filter((char) => !gb18030PointerCache.has(char)));
  if (pending2.size === 0) return;
  const bytes = Buffer.allocUnsafe(GB18030_POINTERS * 4);
  for (let pointer2 = 0; pointer2 < GB18030_POINTERS; pointer2 += 1) {
    bytes.set(gb18030PointerBytes(pointer2), pointer2 * 4);
  }
  const decoded = GB18030_LOOSE_DECODER.decode(bytes);
  let pointer = 0;
  for (const char of decoded) {
    if (char !== "\uFFFD" && pending2.has(char)) {
      gb18030PointerCache.set(char, pointer);
      pending2.delete(char);
      if (pending2.size === 0) break;
    }
    pointer += 1;
  }
  if (pending2.size > 0) {
    throw new RangeError(`text contains characters not representable in GB18030: ${JSON.stringify([...pending2])}`);
  }
}
function encodeLegacy(text, gb18030) {
  const map = getGbkEncodeMap();
  const chars = [...text];
  if (gb18030) {
    resolveGb18030Pointers(new Set(chars.filter((char) => !map.has(char))));
  }
  const bytes = [];
  for (const char of chars) {
    const gbk = map.get(char);
    if (gbk !== void 0) {
      if (gbk <= 255) bytes.push(gbk);
      else bytes.push(gbk >> 8, gbk & 255);
      continue;
    }
    if (!gb18030) {
      throw new RangeError(`text contains a character not representable in GBK: ${JSON.stringify(char)}`);
    }
    const pointer = gb18030PointerCache.get(char);
    if (pointer === void 0) {
      throw new RangeError(`text contains a character not representable in GB18030: ${JSON.stringify(char)}`);
    }
    bytes.push(...gb18030PointerBytes(pointer));
  }
  return Buffer.from(bytes);
}
function encodeText(text, encoding) {
  switch (encoding) {
    case "utf8":
      return Buffer.from(text, "utf8");
    case "utf8-bom":
      return Buffer.concat([UTF8_BOM, Buffer.from(text, "utf8")]);
    case "utf16le":
      return encodeUtf16(text, true);
    case "utf16le-bom":
      return Buffer.concat([UTF16LE_BOM, encodeUtf16(text, true)]);
    case "utf16be":
      return encodeUtf16(text, false);
    case "utf16be-bom":
      return Buffer.concat([UTF16BE_BOM, encodeUtf16(text, false)]);
    case "utf32le-bom":
      return Buffer.concat([UTF32LE_BOM, encodeUtf32(text, true)]);
    case "utf32be-bom":
      return Buffer.concat([UTF32BE_BOM, encodeUtf32(text, false)]);
    case "gbk":
      return encodeLegacy(text, false);
    case "gb18030":
      return encodeLegacy(text, true);
  }
}
function detectEol(text) {
  const sample = text.slice(0, EOL_SNIFF_LIMIT);
  const crlf = sample.split("\r\n").length - 1;
  const lines = sample.split("\n").length - 1;
  return crlf > lines - crlf ? "crlf" : "lf";
}
function restoreEol(text, eol) {
  if (eol === "lf") return text;
  return text.replaceAll("\r\n", "\n").split("\n").join("\r\n");
}
async function fileFormatOf(path) {
  let handle;
  try {
    handle = await open(path, "r");
  } catch (error) {
    if (error.code === "ENOENT") return { encoding: "utf8", eol: "lf" };
    throw error;
  }
  try {
    const info = await handle.stat();
    const truncated = info.size > ENCODING_SNIFF_LIMIT;
    const bytes = Buffer.alloc(Math.min(info.size, ENCODING_SNIFF_LIMIT));
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    const decoded = decodeTextBytes(bytes.subarray(0, bytesRead), truncated);
    return {
      encoding: decoded?.encoding ?? "utf8",
      // A binary read has no line structure to preserve; the editor cannot be
      // showing one anyway (it falls back to the download pane).
      eol: decoded === null ? "lf" : detectEol(decoded.content)
    };
  } finally {
    await handle.close();
  }
}

// src/fs-operations.ts
function assertSingleSegmentName(name2) {
  if (name2 === "" || name2 === "." || name2 === ".." || name2.includes("/") || name2.includes("\\")) {
    throw new SidebarError("bad-request", "name must be a single path segment", 400);
  }
}
async function writeWorkspaceUploadInternal(input) {
  const { cwd, dir, relativePath, chunks } = input;
  const base = resolveTarget(cwd, dir);
  if (relativePath === "" || relativePath.startsWith("/") || relativePath.startsWith("\\")) {
    throw new SidebarError("bad-request", "relativePath must stay below the upload directory", 400);
  }
  const segments = relativePath.split(/[\\/]/);
  if (segments.some((part) => part === "" || part === "." || part === "..")) {
    throw new SidebarError("bad-request", "relativePath must stay below the upload directory", 400);
  }
  const target = join4(base, ...segments);
  const safeTarget = await ensureWorkspaceWritePath(cwd, target);
  const tmp = join4(dirname4(safeTarget), `.${basename2(safeTarget)}.dsh-upload-${randomUUID2()}.tmp`);
  await mkdir2(dirname4(safeTarget), { recursive: true });
  const stream = createWriteStream(tmp, { flags: "wx" });
  const closed = new Promise((resolve6) => {
    stream.once("close", () => resolve6());
  });
  let streamError;
  stream.on("error", (error) => {
    streamError = error;
  });
  try {
    for await (const chunk of chunks) {
      const buffer = Buffer.from(chunk);
      if (!stream.write(buffer)) await once(stream, "drain");
      if (streamError !== void 0) throw streamError;
    }
    await new Promise((resolve6, reject) => {
      stream.end((error) => error === void 0 || error === null ? resolve6() : reject(error));
    });
    if (streamError !== void 0) throw streamError;
    await ensureWorkspaceWritePath(cwd, safeTarget);
    await preserveBeforeOverwrite(cwd, safeTarget);
    await rename2(tmp, safeTarget);
    const info = await stat2(safeTarget);
    invalidateDirectoryCache(dirname4(safeTarget));
    return { path: target, size: info.size };
  } catch (error) {
    stream.destroy();
    await closed.catch(() => {
    });
    await rm(tmp, { force: true }).catch(() => {
    });
    throw error;
  }
}
async function writeWorkspaceTextInternal(input) {
  const { cwd, path, content, expectedMtimeMs } = input;
  const absolute = await ensureWorkspaceWritePath(cwd, path);
  const { encoding, eol } = await fileFormatOf(absolute);
  if (expectedMtimeMs !== void 0) {
    const current = await stat2(absolute).then((info) => info.mtimeMs).catch(() => void 0);
    if (current !== expectedMtimeMs) {
      const why = current === void 0 ? `no longer exists on disk (expected mtime ${expectedMtimeMs})` : `changed on disk since it was loaded (expected mtime ${expectedMtimeMs}, found ${current})`;
      throw new SidebarError("fs-conflict", `"${absolute}" ${why}`, 409);
    }
  }
  const tmp = join4(dirname4(absolute), `.${basename2(absolute)}.dsh-sidebar-tmp-${randomUUID2()}.tmp`);
  try {
    await mkdir2(dirname4(absolute), { recursive: true });
    await writeFile2(tmp, encodeText(restoreEol(content, eol), encoding), { flag: "wx" });
    await ensureWorkspaceWritePath(cwd, absolute);
    if (expectedMtimeMs !== void 0 && await stat2(absolute).then((info) => info.mtimeMs).catch(() => void 0) !== expectedMtimeMs) {
      throw new SidebarError("fs-conflict", "file changed during save", 409);
    }
    await preserveBeforeOverwrite(cwd, absolute);
    await rename2(tmp, absolute);
  } catch (error) {
    await rm(tmp, { force: true }).catch(() => {
    });
    if (error instanceof SidebarError) throw error;
    throw new SidebarError("fs-error", `cannot write "${absolute}": ${error instanceof Error ? error.message : String(error)}`, 400);
  }
  invalidateDirectoryCache(dirname4(absolute));
  const mtimeMs = await stat2(absolute).then((info) => info.mtimeMs).catch(() => void 0);
  return { ...mtimeMs !== void 0 ? { mtimeMs } : {} };
}
async function resolveEntry(cwd, target) {
  return { absolute: await ensureWorkspaceEntryPath(cwd, target), realCwd: requireAbsolute(cwd) };
}
function sameSpelling(a, b) {
  const strip = (value) => value.replace(/^\\\\\?\\/, "");
  const left = strip(a);
  const right = strip(b);
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}
async function isWorkspaceRoot(target, root) {
  try {
    const [entry, base] = await Promise.all([
      lstat3(target, { bigint: true }),
      lstat3(root, { bigint: true })
    ]);
    if (entry.ino === 0n || base.ino === 0n) return sameSpelling(target, root);
    return entry.dev === base.dev && entry.ino === base.ino;
  } catch {
    return sameSpelling(target, root);
  }
}
async function pathExists(target) {
  try {
    await access(target);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}
async function renameWorkspaceEntryInternal(input) {
  const { cwd, path, name: name2 } = input;
  assertCreatableFileName(name2);
  const { absolute, realCwd } = await resolveEntry(cwd, path);
  if (await isWorkspaceRoot(absolute, realCwd)) {
    throw new SidebarError("fs-error", "cannot rename the workspace root", 400);
  }
  if (basename2(absolute) === name2) return { path: absolute };
  const destination = join4(dirname4(absolute), name2);
  const safeDestination = await ensureWorkspaceWritePath(cwd, destination);
  if (await pathExists(safeDestination)) {
    throw new SidebarError("fs-error", `"${name2}" already exists`, 409);
  }
  try {
    await rename2(absolute, safeDestination);
  } catch (error) {
    throw new SidebarError("fs-error", `cannot rename "${path}" to "${name2}": ${error instanceof Error ? error.message : String(error)}`, 400);
  }
  invalidateDirectoryCache(dirname4(safeDestination));
  return { path: safeDestination };
}
async function mkdirWorkspaceEntryInternal(input) {
  const { cwd, path, name: name2 } = input;
  assertSingleSegmentName(name2);
  const { absolute } = await resolveEntry(cwd, path);
  const destination = await ensureWorkspaceWritePath(cwd, join4(absolute, name2));
  if (await pathExists(destination)) {
    throw new SidebarError("fs-error", `"${name2}" already exists`, 409);
  }
  try {
    await mkdir2(destination);
  } catch (error) {
    throw new SidebarError("fs-error", `cannot create "${name2}": ${error instanceof Error ? error.message : String(error)}`, 400);
  }
  invalidateDirectoryCache(absolute);
  return { path: destination };
}
var ILLEGAL_FILE_NAME_CHARS = /[<>:"|?*]/;
function firstIllegalNameChar(name2) {
  for (const char of name2) {
    if (ILLEGAL_FILE_NAME_CHARS.test(char) || (char.codePointAt(0) ?? 0) < 32) return char;
  }
  return void 0;
}
var RESERVED_FILE_NAMES = /* @__PURE__ */ new Set([
  "con",
  "prn",
  "aux",
  "nul",
  ...Array.from({ length: 9 }, (_, index) => `com${index + 1}`),
  ...Array.from({ length: 9 }, (_, index) => `lpt${index + 1}`)
]);
function assertCreatableFileName(name2) {
  assertSingleSegmentName(name2);
  const illegal = firstIllegalNameChar(name2);
  if (illegal !== void 0) {
    throw new SidebarError("bad-request", `name contains a character that is not allowed in a file name: ${JSON.stringify(illegal)}`, 400);
  }
  if (RESERVED_FILE_NAMES.has(name2.split(".")[0].toLowerCase())) {
    throw new SidebarError("bad-request", `"${name2}" is a reserved device name on Windows`, 400);
  }
}
async function createWorkspaceFileInternal(input) {
  const { cwd, path, name: name2 } = input;
  assertCreatableFileName(name2);
  const { absolute } = await resolveEntry(cwd, path);
  const destination = await ensureWorkspaceWritePath(cwd, join4(absolute, name2));
  if (await pathExists(destination)) {
    throw new SidebarError("fs-error", `"${name2}" already exists`, 409);
  }
  try {
    await writeFile2(destination, "", { flag: "wx", encoding: "utf8" });
  } catch (error) {
    if (error.code === "EEXIST") {
      throw new SidebarError("fs-error", `"${name2}" already exists`, 409);
    }
    throw new SidebarError("fs-error", `cannot create "${name2}": ${error instanceof Error ? error.message : String(error)}`, 400);
  }
  invalidateDirectoryCache(absolute);
  return { path: destination };
}
async function removeWorkspaceEntryInternal(input) {
  const { cwd, path } = input;
  const { absolute, realCwd } = await resolveEntry(cwd, path);
  if (await isWorkspaceRoot(absolute, realCwd)) {
    throw new SidebarError("fs-error", "cannot remove the workspace root", 400);
  }
  try {
    await archiveWorkspaceEntry(cwd, absolute);
  } catch (error) {
    if (error instanceof SidebarError) throw error;
    throw new SidebarError("fs-error", `cannot remove "${path}": ${error instanceof Error ? error.message : String(error)}`, 400);
  }
  invalidateDirectoryCache(dirname4(absolute));
  return { path: absolute };
}
function writeWorkspaceUpload(input) {
  return withWorkspaceMutation(input.cwd, () => writeWorkspaceUploadInternal(input));
}
function writeWorkspaceText(input) {
  return withWorkspaceMutation(input.cwd, () => writeWorkspaceTextInternal(input));
}
function renameWorkspaceEntry(input) {
  return withWorkspaceMutation(input.cwd, () => renameWorkspaceEntryInternal(input));
}
function mkdirWorkspaceEntry(input) {
  return withWorkspaceMutation(input.cwd, () => mkdirWorkspaceEntryInternal(input));
}
function createWorkspaceFile(input) {
  return withWorkspaceMutation(input.cwd, () => createWorkspaceFileInternal(input));
}
function removeWorkspaceEntry(input) {
  return withWorkspaceMutation(input.cwd, () => removeWorkspaceEntryInternal(input));
}

// src/fs-search.ts
import { opendir as opendir2, stat as stat3 } from "node:fs/promises";
import { isAbsolute as isAbsolute3, join as join7, sep as sep4 } from "node:path";
import { homedir as homedir4 } from "node:os";

// src/search-engines.ts
import { spawn as spawn2 } from "node:child_process";
import { createInterface } from "node:readline";
import { join as join6, posix, sep as sep3, win32 as win322 } from "node:path";
import { homedir as homedir3 } from "node:os";

// src/search-debug.ts
import { appendFileSync } from "node:fs";
import { join as join5 } from "node:path";
import { homedir as homedir2 } from "node:os";
var SEARCH_DEBUG = process.env.DSH_SEARCH_DEBUG === "1";
var LOG_FILE = join5(
  process.env.DSH_HOME !== void 0 && process.env.DSH_HOME.trim() !== "" ? process.env.DSH_HOME : join5(homedir2(), ".dsh"),
  "search-debug.log"
);
function debugLog(msg) {
  if (!SEARCH_DEBUG) return;
  try {
    appendFileSync(LOG_FILE, `[${(/* @__PURE__ */ new Date()).toISOString()}] ${msg}
`);
  } catch {
  }
  console.log(msg);
}

// src/search-engines.ts
var PROBE_TIMEOUT_MS = 500;
var ENGINE_TIMEOUT_MS = 15e3;
var PATH_SEPARATOR = process.platform === "win32" ? ";" : ":";
function bundledRgCandidates(platform, arch, execPath, env, home, modulePath = process.argv[1]) {
  const binName = platform === "win32" ? "rg.exe" : "rg";
  const platformPkg = `@vscode/ripgrep-${platform}-${arch}`;
  const P = platform === "win32" ? win322 : posix;
  const roots = [];
  const addRoot = (root) => {
    if (root !== "" && !roots.includes(root)) roots.push(root);
  };
  const walkRoots = (start) => {
    if (start === "") return;
    let current = P.dirname(start);
    while (current !== P.dirname(current)) {
      if (current.endsWith(`${P.sep}node_modules`)) addRoot(current);
      current = P.dirname(current);
    }
  };
  if (modulePath !== void 0 && modulePath !== "") walkRoots(modulePath);
  walkRoots(execPath);
  if (platform === "win32") {
    if (env.APPDATA !== void 0 && env.APPDATA !== "") {
      addRoot(P.join(env.APPDATA, "npm", "node_modules"));
    }
  } else {
    addRoot(P.join(P.dirname(P.dirname(execPath)), "lib", "node_modules"));
    addRoot("/opt/homebrew/lib/node_modules");
    addRoot("/usr/local/lib/node_modules");
  }
  addRoot(P.join(home, ".dsh", "profiles", "node_modules"));
  const candidates2 = [];
  const seen = /* @__PURE__ */ new Set();
  for (const root of roots) {
    for (const candidate of [
      P.join(root, platformPkg, "bin", binName),
      // A dependency tree that did NOT hoist (pnpm's strict layout, npm with
      // a conflicting top-level @vscode/ripgrep).
      P.join(root, "@deepseek-ai", "dsh", "node_modules", platformPkg, "bin", binName)
    ]) {
      if (!seen.has(candidate)) {
        seen.add(candidate);
        candidates2.push(candidate);
      }
    }
  }
  return candidates2;
}
function candidates(engine) {
  const env = process.env;
  const pathNames = {
    fd: ["fd", "fdfind"],
    rg: ["rg"]
  };
  const out = [];
  if (engine === "rg") {
    out.push(...bundledRgCandidates(process.platform, process.arch, process.execPath, env, homedir3()));
  }
  for (const name2 of pathNames[engine]) {
    if (env.PATH !== void 0 && env.PATH !== "") {
      for (const dir of env.PATH.split(PATH_SEPARATOR)) {
        if (dir !== "") out.push(join6(dir, name2));
      }
    }
  }
  if (engine === "fd") {
    out.push("/opt/homebrew/bin/fd", "/usr/local/bin/fd", "/usr/bin/fd", join6(homedir3(), ".cargo/bin/fd"));
  } else {
    out.push("/opt/homebrew/bin/rg", "/usr/local/bin/rg", "/usr/bin/rg");
  }
  return out;
}
function verify(binary) {
  return new Promise((resolve6) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve6(ok);
    };
    let child;
    try {
      child = spawn2(binary, ["--version"], { stdio: "ignore" });
    } catch {
      finish(false);
      return;
    }
    const timer = setTimeout(() => {
      child.kill();
      finish(false);
    }, PROBE_TIMEOUT_MS);
    child.once("error", () => {
      finish(false);
    });
    child.once("exit", (code) => {
      finish(code === 0);
    });
  });
}
function escapeGlob(query) {
  return query.replace(/[\[\]{}*?\\]/g, "\\$&");
}
var SKIP_DIR_NAMES = [
  ".dsh-sidebar-recovery",
  ".git",
  "node_modules",
  ".pnpm-store",
  ".yarn",
  ".turbo",
  ".turbopack",
  ".next",
  ".nuxt",
  ".output",
  ".cache",
  ".parcel-cache",
  "coverage",
  "dist",
  "build",
  "out",
  // #879: git-worktree forests (both spellings; `.worktrees/` is the
  // layout DeepSeek Harness itself uses) burned the whole 100k visit budget
  // on real projects before the walk reached project files. Language
  // environments and their bytecode caches are noise of the same class.
  ".worktrees",
  ".worktree",
  "target",
  "venv",
  ".venv",
  "__pycache__",
  ".umi",
  ".umi-production",
  ".dumi"
];
var EngineTimeoutError = class extends Error {
};
function streamLines(child, max) {
  return new Promise((resolve6, reject) => {
    const lines = [];
    let truncated = false;
    let closed = false;
    const finish = (error) => {
      if (closed) return;
      closed = true;
      clearTimeout(timer);
      if (error !== void 0) {
        child.kill();
        reject(error);
      } else {
        resolve6({ lines, truncated });
      }
    };
    const timer = setTimeout(() => {
      finish(new EngineTimeoutError("search engine timed out"));
    }, ENGINE_TIMEOUT_MS);
    child.once("error", (error) => {
      finish(error);
    });
    child.once("close", (code) => {
      if (truncated) {
        finish(void 0);
      } else if (code !== 0 && code !== 1) {
        finish(new Error(`search engine exited with ${String(code)}`));
      } else {
        finish(void 0);
      }
    });
    const stdout = child.stdout;
    if (stdout === null) {
      finish(new Error("search engine stdout unavailable"));
      return;
    }
    const rl = createInterface({ input: stdout });
    rl.on("line", (line) => {
      if (line === "" || truncated) return;
      lines.push(line);
      if (lines.length > max) {
        truncated = true;
        child.kill();
      }
    });
  });
}
function normalizeEnginePaths(lines, separator = sep3) {
  const out = [];
  for (const line of lines) {
    if (line === "") continue;
    const trimmed = line.endsWith("\r") ? line.slice(0, -1) : line;
    if (trimmed === "") continue;
    const normalized = trimmed.split(separator).join("/");
    const bare = normalized.startsWith("./") ? normalized.slice(2) : normalized;
    const clean = bare.endsWith("/") ? bare.replace(/\/+$/, "") : bare;
    if (clean !== "" && clean !== ".") out.push(clean);
  }
  return out;
}
function fdArgv(cap, query, type) {
  return [
    "--hidden",
    "--no-ignore",
    ...SKIP_DIR_NAMES.flatMap((name2) => ["--exclude", name2]),
    "--fixed-strings",
    "--ignore-case",
    ...type === void 0 ? [] : ["--type", type],
    "--path-separator",
    "/",
    "--max-results",
    String(cap + 1),
    query,
    "."
  ];
}
function rgArgv(query) {
  const skipGlobs = SKIP_DIR_NAMES.flatMap((name2) => [
    "--iglob",
    `!**/${name2}/**`,
    "--iglob",
    `!**/${name2}`
  ]);
  const escaped = escapeGlob(query);
  return [
    "--files",
    "--hidden",
    "--no-ignore",
    ...skipGlobs,
    // Three query globs. The slash-free form matches BASENAMES only (rg
    // follows gitignore semantics — no '/' in the pattern means basename
    // match, verified on real rg 15: 'util/helper.ts' never matches
    // '*util*'). The other two admit files whose PATH carries a matching
    // segment, so deriveRgMatches can turn that into the directory match the
    // walk/fd contract reports: one '/*' level catches a DIRECT child
    // ('util/helper.ts' — the most common hit), '**' catches everything
    // deeper. Both are needed: '**' alone skips the direct child, '/*'
    // alone skips the nested one (verified against real rg 15).
    "--iglob",
    `*${escaped}*`,
    "--iglob",
    `**/*${escaped}*/*`,
    "--iglob",
    `**/*${escaped}*/**`,
    "--path-separator",
    "/",
    "."
  ];
}
function deriveRgMatches(paths, query, maxMatches) {
  const needle = query.toLowerCase();
  const files = /* @__PURE__ */ new Set();
  const dirs = /* @__PURE__ */ new Set();
  for (const path of paths) {
    const segments = path.split("/");
    const base = segments[segments.length - 1];
    if (base !== void 0 && base.toLowerCase().includes(needle)) files.add(path);
    let prefix = "";
    for (let index = 0; index < segments.length - 1; index += 1) {
      const segment = segments[index];
      if (segment === void 0) continue;
      prefix = prefix === "" ? segment : `${prefix}/${segment}`;
      if (segment.toLowerCase().includes(needle)) dirs.add(prefix);
    }
  }
  const derived = [.../* @__PURE__ */ new Set([...files, ...dirs])].sort();
  return {
    paths: derived.slice(0, maxMatches + 1),
    dirs: [...dirs].sort().slice(0, maxMatches + 1),
    truncated: derived.length > maxMatches
  };
}
function runChild(probe, root, query, maxMatches) {
  const cap = maxMatches + 1;
  if (probe.engine === "rg") {
    const child2 = spawner(probe.binary, rgArgv(query), { cwd: root, stdio: ["ignore", "pipe", "ignore"] });
    return streamLines(child2, cap).then(({ lines, truncated }) => {
      const derived = deriveRgMatches(normalizeEnginePaths(lines), query, maxMatches);
      return { paths: derived.paths, dirs: derived.dirs, truncated: truncated || derived.truncated };
    });
  }
  const child = spawner(probe.binary, fdArgv(cap, query), { cwd: root, stdio: ["ignore", "pipe", "ignore"] });
  const dirChild = spawner(probe.binary, fdArgv(cap, query, "d"), { cwd: root, stdio: ["ignore", "pipe", "ignore"] });
  return Promise.all([
    streamLines(child, cap),
    // The directory run's failure is NOT swallowed (#883): a rejected dirs
    // stream rejects the whole engine call, so runEngine marks the engine
    // broken and this one search falls back to the plain walk — exactly
    // the main run's failure handling. The old swallow-catch degraded the
    // failure into "zero directories", invisible in every environment.
    streamLines(dirChild, cap)
  ]).then(([matches, dirs]) => {
    const paths = normalizeEnginePaths(matches.lines);
    const dirSet = new Set(normalizeEnginePaths(dirs.lines));
    return {
      paths,
      dirs: paths.filter((path) => dirSet.has(path)),
      truncated: matches.truncated
    };
  });
}
var prober = () => probeOnce();
var runner = runChild;
var spawner = spawn2;
var broken = /* @__PURE__ */ new Set();
var probePromise = null;
async function probeOnce() {
  const found = [];
  for (const engine of ["fd", "rg"]) {
    for (const binary of candidates(engine)) {
      if (await verify(binary)) {
        found.push({ engine, binary });
        break;
      }
    }
  }
  const names = found.length > 0 ? found.map((p) => `${p.engine}(${p.binary})`).join(", ") : "none (plain-walk fallback)";
  debugLog(`[dsh-search] engines probed: ${names}`);
  return found;
}
function probeEngines() {
  probePromise ??= prober();
  return probePromise;
}
async function runEngine(probe, root, query, maxMatches) {
  try {
    return await runner(probe, root, query, maxMatches);
  } catch (error) {
    if (error instanceof EngineTimeoutError) {
      debugLog(`[dsh-search] engine ${probe.engine} timed out (tree too large), falling back`);
    } else {
      broken.add(probe.engine);
      debugLog(`[dsh-search] engine ${probe.engine} failed at runtime, disabled: ${error instanceof Error ? error.message : String(error)}`);
    }
    throw error;
  }
}
async function usableEngines() {
  const probes = await probeEngines();
  return probes.filter((probe) => !broken.has(probe.engine));
}

// src/fs-search.ts
var DEFAULT_MAX_MATCHES = 200;
var DEFAULT_MAX_VISITED = 1e5;
var SEARCH_SKIP_DIRS = new Set(SKIP_DIR_NAMES);
function relRoot(root) {
  const home = process.env.DSH_HOME !== void 0 && process.env.DSH_HOME.trim() !== "" ? process.env.DSH_HOME : homedir4();
  if (root === home) return "~";
  const boundary = home.endsWith(sep4) ? home : home + sep4;
  return root.startsWith(boundary) ? `~${root.slice(home.length)}` : root;
}
async function isDirectoryEntry(absolute, dirent) {
  if (dirent.isDirectory()) return true;
  if (!dirent.isSymbolicLink()) return false;
  const info = await stat3(absolute).catch(() => void 0);
  return info?.isDirectory() === true;
}
var SEPARATOR_RE = process.platform === "win32" ? /[/\\]/ : /\//;
var DOT_ANCHORED_RE = process.platform === "win32" ? /^\.+[/\\]/ : /^\.+\//;
function hasSeparator(query) {
  return SEPARATOR_RE.test(query);
}
function isDirectPathQuery(query) {
  return isAbsolute3(query) || query === "~" || query.startsWith("~/") || process.platform === "win32" && query.startsWith("~\\") || DOT_ANCHORED_RE.test(query);
}
async function searchFilesPlain(root, query, opts = {}) {
  const needle = query.trim().toLowerCase();
  if (needle === "") return { matches: [], dirs: [], truncated: false };
  const maxMatches = opts.maxMatches ?? DEFAULT_MAX_MATCHES;
  const maxVisited = opts.maxVisited ?? DEFAULT_MAX_VISITED;
  const pathNeedle = hasSeparator(needle) ? needle.replace(/\//g, sep4) : void 0;
  const matches = [];
  const dirs = [];
  let visited = 0;
  let truncated = false;
  const walk = async (dir, relDir) => {
    if (truncated) return;
    const level = await opendir2(dir).catch(() => void 0);
    if (level === void 0) return;
    for await (const dirent of level) {
      visited += 1;
      if (visited > maxVisited) {
        truncated = true;
        return;
      }
      if (SEARCH_SKIP_DIRS.has(dirent.name.toLowerCase())) continue;
      const relativePath = relDir === "" ? dirent.name : `${relDir}${sep4}${dirent.name}`;
      const absolute = join7(dir, dirent.name);
      if (opts.exclude !== void 0 && opts.exclude(absolute, dirent.name)) continue;
      const hit = pathNeedle === void 0 ? dirent.name.toLowerCase().includes(needle) : relativePath.toLowerCase().includes(pathNeedle);
      if (hit) {
        matches.push(relativePath);
        if (await isDirectoryEntry(absolute, dirent)) dirs.push(relativePath);
        if (matches.length >= maxMatches) {
          truncated = true;
          return;
        }
      }
      if (dirent.isDirectory() && !dirent.isSymbolicLink()) {
        await walk(absolute, relativePath);
        if (truncated) return;
      }
    }
  };
  await walk(root, "");
  const normalize = (path) => path.split(sep4).join("/");
  return { matches: matches.sort().map(normalize), dirs: dirs.sort().map(normalize), truncated };
}
function engineExcludeProbe(root, exclude) {
  const excludedDirs = /* @__PURE__ */ new Map();
  const dirExcluded = (relativeDir) => {
    if (relativeDir === "") return false;
    const cached = excludedDirs.get(relativeDir);
    if (cached !== void 0) return cached;
    const cut = relativeDir.lastIndexOf("/");
    const parent = cut === -1 ? "" : relativeDir.slice(0, cut);
    const name2 = cut === -1 ? relativeDir : relativeDir.slice(cut + 1);
    const verdict = dirExcluded(parent) || exclude(join7(root, ...relativeDir.split("/")), name2);
    excludedDirs.set(relativeDir, verdict);
    return verdict;
  };
  return (relativePath) => {
    const cut = relativePath.lastIndexOf("/");
    const parent = cut === -1 ? "" : relativePath.slice(0, cut);
    const name2 = cut === -1 ? relativePath : relativePath.slice(cut + 1);
    return dirExcluded(parent) || exclude(join7(root, ...relativePath.split("/")), name2);
  };
}
async function searchFiles(root, query, opts = {}) {
  const needle = query.trim();
  if (needle === "") return { matches: [], dirs: [], truncated: false };
  const started = performance.now();
  if (isDirectPathQuery(needle)) {
    const target = await ensureWorkspaceWritePath(root, needle);
    const info = await stat3(target).catch(() => void 0);
    const result2 = info === void 0 ? { matches: [], dirs: [], truncated: false } : info.isDirectory() ? { matches: [target], dirs: [target], truncated: false } : { matches: [target], dirs: [], truncated: false };
    debugLog(`[dsh-search] engine=stat root=${relRoot(root)} query="${needle}" hits=${result2.matches.length} truncated=${result2.truncated} ${(performance.now() - started).toFixed(0)}ms`);
    return result2;
  }
  if (hasSeparator(needle)) {
    const result2 = await searchFilesPlain(root, query, opts);
    debugLog(`[dsh-search] engine=plain root=${relRoot(root)} query="${needle}" hits=${result2.matches.length} truncated=${result2.truncated} ${(performance.now() - started).toFixed(0)}ms`);
    return result2;
  }
  const maxMatches = opts.maxMatches ?? DEFAULT_MAX_MATCHES;
  const isExcluded = opts.exclude === void 0 ? void 0 : engineExcludeProbe(root, opts.exclude);
  for (const probe of await usableEngines()) {
    try {
      const result2 = await runEngine(probe, root, needle, maxMatches);
      const paths = isExcluded === void 0 ? result2.paths : result2.paths.filter((path) => !isExcluded(path));
      const matches = [...paths].sort().slice(0, maxMatches);
      const kept = new Set(matches);
      const dirs = [...new Set(result2.dirs)].filter((dir) => kept.has(dir)).sort();
      debugLog(`[dsh-search] engine=${probe.engine} bin=${probe.binary} root=${relRoot(root)} query="${needle}" hits=${matches.length} truncated=${result2.truncated} ${(performance.now() - started).toFixed(0)}ms`);
      return { matches, dirs, truncated: result2.truncated };
    } catch {
    }
  }
  const result = await searchFilesPlain(root, query, opts);
  debugLog(`[dsh-search] engine=plain root=${relRoot(root)} query="${needle}" hits=${result.matches.length} truncated=${result.truncated} ${(performance.now() - started).toFixed(0)}ms`);
  return result;
}

// src/exclude-patterns.ts
import { relative as relative3, sep as sep5 } from "node:path";
var EXCLUDE_PATTERN_LIMIT = 64;
var EXCLUDE_PATTERN_MAX_LENGTH = 256;
function normalizePattern(raw) {
  if (typeof raw !== "string") return void 0;
  let pattern = raw.trim().replace(/\\/g, "/");
  if (pattern.length > EXCLUDE_PATTERN_MAX_LENGTH) return void 0;
  while (pattern.startsWith("./")) pattern = pattern.slice(2);
  while (pattern.startsWith("/")) pattern = pattern.slice(1);
  while (pattern.endsWith("/")) pattern = pattern.slice(0, -1);
  let kind = "name";
  if (pattern.startsWith("**/")) {
    kind = "suffix";
    pattern = pattern.slice(3);
  }
  if (pattern === "" || pattern === "**") {
    return void 0;
  }
  if (kind === "name" && pattern.includes("/")) kind = "path";
  return { kind, body: pattern };
}
function globToRegExp(body, insensitive) {
  let out = "";
  for (let i = 0; i < body.length; i += 1) {
    const char = body[i];
    if (char === "*") {
      if (body[i + 1] === "*") {
        out += ".*";
        i += 1;
      } else {
        out += "[^/]*";
      }
      continue;
    }
    if (char === "?") {
      out += "[^/]";
      continue;
    }
    out += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${out}$`, insensitive ? "i" : void 0);
}
function relativeToRoot(root, entryPath) {
  const rel = relative3(root, entryPath).split(sep5).join("/");
  return rel.startsWith("..") ? void 0 : rel;
}
function compileExcludePatterns(raw, root, platform = process.platform) {
  if (!Array.isArray(raw)) return void 0;
  const compiled = [];
  for (const item of raw) {
    if (compiled.length >= EXCLUDE_PATTERN_LIMIT) break;
    const normalized = normalizePattern(item);
    if (normalized === void 0) continue;
    compiled.push({ kind: normalized.kind, regex: globToRegExp(normalized.body, platform === "win32") });
  }
  if (compiled.length === 0) return void 0;
  const needsRel = compiled.some((pattern) => pattern.kind !== "name");
  const probe = (entryPath, name2) => {
    let rel;
    for (const pattern of compiled) {
      if (pattern.kind === "name") {
        if (pattern.regex.test(name2)) return true;
        continue;
      }
      if (rel === void 0) {
        if (!needsRel) continue;
        rel = relativeToRoot(root, entryPath) ?? "";
      }
      if (pattern.kind === "path") {
        if (rel !== "" && pattern.regex.test(rel)) return true;
        continue;
      }
      if (pattern.regex.test(name2)) return true;
      if (rel !== "") {
        const segments = rel.split("/");
        for (let start = 0; start < segments.length - 1; start += 1) {
          if (pattern.regex.test(segments.slice(start).join("/"))) return true;
        }
      }
    }
    return false;
  };
  const key = `${root}\0${compiled.map((pattern) => `${pattern.kind}:${pattern.regex.source}:${pattern.regex.flags}`).join("\0")}`;
  return Object.assign(probe, { key });
}

// src/html-route.ts
var HTML_ROUTE_PREFIX = "/sidebar/html/";
function decodeHtmlUrl(pathname) {
  if (!pathname.startsWith(HTML_ROUTE_PREFIX)) {
    return { ok: false, status: 404, message: "not an html route" };
  }
  const rest = pathname.slice(HTML_ROUTE_PREFIX.length);
  if (rest === "") {
    return { ok: false, status: 400, message: "invalid html route path" };
  }
  let segments;
  try {
    segments = rest.split("/").map((segment) => decodeURIComponent(segment));
  } catch {
    return { ok: false, status: 400, message: "malformed URL encoding" };
  }
  const [sessionId, ...pathSegments] = segments;
  if (sessionId === void 0 || sessionId === "") {
    return { ok: false, status: 400, message: "sessionId and file path are required" };
  }
  const unc = pathSegments[0] === "";
  const tail = unc ? pathSegments.slice(1) : pathSegments;
  if (tail.length === 0 || tail.some((segment) => segment === "")) {
    return { ok: false, status: 400, message: "sessionId and file path are required" };
  }
  let path;
  if (unc) {
    path = `//${tail.join("/")}`;
  } else if (tail[0] === "~") {
    path = tail.join("/");
  } else if (/^[A-Za-z]:$/.test(tail[0] ?? "")) {
    path = tail.join("/");
  } else {
    path = `/${tail.join("/")}`;
  }
  return { ok: true, ref: { sessionId, path } };
}

// src/bundle-route.ts
import { createHash } from "node:crypto";
import { stat as stat4, readFile as readFile2 } from "node:fs/promises";
import { dirname as dirname5, join as join8 } from "node:path";
import { fileURLToPath } from "node:url";
var CHUNK_NAMES = ["editor", "mermaid", "locale", "terminal"];
var LIB_DIR = dirname5(fileURLToPath(import.meta.url));
function shortHash(input) {
  return createHash("sha1").update(input).digest("hex").slice(0, 12);
}
var etags = /* @__PURE__ */ new Map();
async function etagOf(name2, chunkDir) {
  const path = join8(chunkDir, `client-${name2}.js`);
  const key = `${chunkDir}:${name2}`;
  try {
    const info = await stat4(path);
    const memo = etags.get(key);
    if (memo !== void 0 && memo.mtimeMs === info.mtimeMs && memo.size === info.size) {
      return memo.etag;
    }
    const etag = `"${shortHash(await readFile2(path))}"`;
    etags.set(key, { mtimeMs: info.mtimeMs, size: info.size, etag });
    return etag;
  } catch {
    return void 0;
  }
}
function createBundleRouteHandler(fence, chunkDir = LIB_DIR) {
  return async (req, res) => {
    if (!fence(req)) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405);
      res.end();
      return;
    }
    const pathname = new URL(req.url ?? "/", "http://dsh.internal").pathname;
    const match = /^\/sidebar\/bundle\/([a-z0-9-]+)\.js$/.exec(pathname);
    const name2 = match?.[1];
    if (name2 === void 0 || !CHUNK_NAMES.includes(name2)) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    const etag = await etagOf(name2, chunkDir);
    if (etag === void 0) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304, { "cache-control": "no-cache", etag });
      res.end();
      return;
    }
    try {
      const body = await readFile2(join8(chunkDir, `client-${name2}.js`));
      res.writeHead(200, {
        "content-type": "text/javascript; charset=utf-8",
        "cache-control": "no-cache",
        etag
      });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  };
}
function registerBundleRoute(ctx, fence) {
  return ctx.webServer.register({
    kind: "prefix",
    path: "/sidebar/bundle",
    handler: createBundleRouteHandler(fence)
  });
}

// src/fs-watch.ts
import { watch } from "node:fs";
var DEBOUNCE_MS = 150;
var MAX_WATCHES = 64;
function createDirectoryWatchers(push2, onError) {
  const watchers = /* @__PURE__ */ new Map();
  const drop = (dir) => {
    const entry = watchers.get(dir);
    if (entry === void 0) return;
    watchers.delete(dir);
    if (entry.timer !== void 0) clearTimeout(entry.timer);
    entry.watcher.close();
  };
  const notify = (dir) => {
    const entry = watchers.get(dir);
    if (entry === void 0 || entry.timer !== void 0) return;
    entry.timer = setTimeout(() => {
      entry.timer = void 0;
      if (!watchers.has(dir)) return;
      invalidateDirectoryCache(dir);
      push2({ dir });
    }, DEBOUNCE_MS);
    entry.timer.unref();
  };
  return {
    add(dir) {
      if (watchers.has(dir)) return true;
      if (watchers.size >= MAX_WATCHES) return false;
      let watcher;
      try {
        watcher = watch(dir, { persistent: false });
      } catch (error) {
        onError(dir, error);
        return false;
      }
      watcher.on("change", () => {
        notify(dir);
      });
      watcher.on("error", (error) => {
        onError(dir, error);
        drop(dir);
      });
      watchers.set(dir, { watcher, timer: void 0 });
      return true;
    },
    remove: drop,
    close() {
      for (const dir of [...watchers.keys()]) drop(dir);
    }
  };
}

// src/sidechat-push.ts
var DURABLE_DEBOUNCE_MS = 60;
var STREAM_DEBOUNCE_MS = 250;
var MAX_WATCHED = 64;
function createSidechatPushHub(ctx) {
  const sockets = /* @__PURE__ */ new Set();
  if (typeof ctx.on !== "function") {
    return { attach: () => {
    }, dispose: () => {
    } };
  }
  const offEvent = ctx.on("session/event", (session) => {
    const sessionId = session?.id;
    if (typeof sessionId !== "string") return;
    for (const socket of sockets) socket.notify(sessionId, DURABLE_DEBOUNCE_MS);
  });
  const offStream = ctx.on("agent/assistant-stream", (payload) => {
    const record = payload;
    const session = record?.agent?.session;
    const sessionId = typeof session?.id === "string" ? session.id : void 0;
    if (sessionId === void 0) return;
    for (const socket of sockets) socket.notify(sessionId, STREAM_DEBOUNCE_MS);
  });
  return {
    attach: (ws) => {
      const socket = new SidechatSocket(ws, () => {
        sockets.delete(socket);
      });
      sockets.add(socket);
    },
    dispose: () => {
      offEvent();
      offStream();
      for (const socket of sockets) socket.close();
      sockets.clear();
    }
  };
}
var SidechatSocket = class {
  socket;
  onClosed;
  watched = /* @__PURE__ */ new Set();
  timers = /* @__PURE__ */ new Map();
  closed = false;
  /**
   * @param socket - the accepted WebSocket.
   * @param onClosed - hub-side cleanup (idempotent).
   */
  constructor(socket, onClosed) {
    this.socket = socket;
    this.onClosed = onClosed;
    socket.on("message", (data) => {
      this.onMessage(data);
    });
    socket.on("close", () => {
      this.close();
    });
    socket.on("error", () => {
      this.close();
    });
  }
  /** Apply one client frame (an unparseable frame is ignored, never fatal). */
  onMessage(data) {
    let frame;
    try {
      frame = JSON.parse(typeof data === "string" ? data : String(data));
    } catch {
      return;
    }
    if (frame === null || typeof frame !== "object" || frame.op !== "watch") return;
    const ids = Array.isArray(frame.threadIds) ? frame.threadIds.filter((id) => typeof id === "string" && id !== "") : [];
    this.watched.clear();
    for (const id of ids.slice(0, MAX_WATCHED)) this.watched.add(id);
    for (const [id, timer] of this.timers) {
      if (this.watched.has(id)) continue;
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }
  /**
   * Coalesce one notice for a thread. The FIRST trigger's window wins, so a
   * burst of deltas never postpones the notice it already scheduled.
   * @param threadId - the session whose transcript is stale.
   * @param delayMs - coalescing window for this trigger.
   */
  notify(threadId, delayMs) {
    if (this.closed || !this.watched.has(threadId) || this.timers.has(threadId)) return;
    this.timers.set(threadId, setTimeout(() => {
      this.timers.delete(threadId);
      this.send({ threadId });
    }, delayMs));
  }
  /** Push one notice (silently dropped once the socket is gone). */
  send(frame) {
    if (this.closed) return;
    try {
      this.socket.send(JSON.stringify(frame));
    } catch {
    }
  }
  /** Release every timer and de-register (idempotent). */
  close() {
    if (this.closed) return;
    this.closed = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.watched.clear();
    this.onClosed();
  }
};

// src/open-external.ts
import { execFileSync, spawn as spawn3 } from "node:child_process";
import { readFileSync as readFileSync2 } from "node:fs";
function isWslRuntime() {
  if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) return true;
  try {
    return /microsoft|wsl/i.test(readFileSync2("/proc/version", "utf8"));
  } catch {
    return false;
  }
}
function wslPath(mode, value) {
  const translated = execFileSync("/usr/bin/wslpath", [mode, value], { encoding: "utf8" }).trim();
  if (translated === "") throw new Error(`wslpath returned no translation for ${value}`);
  return translated;
}
function windowsPathOf(path) {
  return wslPath("-w", path);
}
function windowsExecutableOf(path) {
  return wslPath("-u", path);
}
function revealCommand(path, platform = process.platform, options = {}) {
  switch (platform) {
    case "darwin":
      return { command: "open", args: ["-R", path] };
    // Explorer expects `/select,<path>` as one argument. Keep the spawn
    // shell-free: a command shell would reinterpret valid path characters.
    case "win32":
      return { command: "explorer.exe", args: [`/select,${path}`] };
    // Termux (the dominant Node runtime reporting platform "android") has no
    // desktop file manager and no xdg-open; `termux-open` hands the path to
    // Android's system open-with chooser. Fall through to the parent dir like
    // Linux: Android has no select protocol either.
    case "android": {
      const parent = parentOf(path);
      return { command: "termux-open", args: [parent ?? path] };
    }
    default: {
      if (options.wsl) {
        const toWindowsPath = options.toWindowsPath ?? windowsPathOf;
        const windowsExecutable = options.windowsExecutable ?? windowsExecutableOf;
        return {
          command: windowsExecutable("C:\\Windows\\explorer.exe"),
          args: [`/select,${toWindowsPath(path)}`]
        };
      }
      const parent = parentOf(path);
      return { command: "xdg-open", args: [parent ?? path] };
    }
  }
}
var CMD_METACHARACTERS = /[&%^!|<>"]/;
var CMD_CONTROL_CHARACTERS = new RegExp("\\p{Cc}", "u");
function cmdUnsafe(url) {
  return CMD_METACHARACTERS.test(url) || CMD_CONTROL_CHARACTERS.test(url);
}
function urlCommands(url, platform = process.platform, options = {}) {
  switch (platform) {
    case "darwin":
      return [{ command: "open", args: [url] }];
    case "win32": {
      const chain = [];
      if (!cmdUnsafe(url)) {
        chain.push({ command: options.cmdExecutable ?? "cmd.exe", args: ["/d", "/c", "start", "", url] });
      }
      chain.push({
        command: options.rundll32Executable ?? "rundll32.exe",
        args: ["url.dll,FileProtocolHandler", url]
      });
      return chain;
    }
    // Termux: `termux-open-url` is the Android intent dispatcher for URLs
    // (termux-open would route through the content chooser first).
    case "android":
      return [{ command: "termux-open-url", args: [url] }];
    default:
      if (options.wsl) {
        const windowsExecutable = options.windowsExecutable ?? windowsExecutableOf;
        return [{
          command: windowsExecutable("C:\\Windows\\System32\\rundll32.exe"),
          args: ["url.dll,FileProtocolHandler", url]
        }];
      }
      return [{ command: "xdg-open", args: [url] }];
  }
}
function wslRemoteEditorUrl(url, distroName) {
  const match = /^(vscode(?:-insiders)?|cursor):\/\/file(\/\/.*)$/i.exec(url);
  if (match === null) return url;
  const scheme = match[1];
  const remotePath = match[2];
  if (scheme === void 0 || remotePath === void 0) return url;
  const distro = distroName.trim();
  if (distro === "") {
    throw new SidebarError("internal", "WSL_DISTRO_NAME is unavailable; cannot build a Remote-WSL editor URL", 500);
  }
  return `${scheme}://vscode-remote/wsl+${distro}${remotePath.slice(1)}`;
}
function validateExternalUrl(raw) {
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    throw new SidebarError("bad-request", "url must be a custom-scheme URL");
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new SidebarError("bad-request", "invalid url");
  }
  if (url.protocol === "http:" || url.protocol === "https:") {
    throw new SidebarError("bad-request", "only custom-scheme urls can be opened externally");
  }
  return raw;
}
function launchFailure(action, failures) {
  const subject = action === "url" ? "url" : "path";
  const attempts = failures.map((f) => `"${f.command}" (${messageOf(f.error)})`).join("; ");
  return new SidebarError("internal", `failed to launch external opener for the ${subject}: ${attempts}`, 500);
}
function launchChain(action, chain, spawnExternal) {
  const failures = [];
  return new Promise((resolve6, reject) => {
    const attempt = (index) => {
      const spec = chain[index];
      if (spec === void 0) {
        reject(launchFailure(action, failures));
        return;
      }
      let child;
      try {
        child = spawnExternal(spec.command, spec.args, { detached: true, stdio: "ignore" });
      } catch (error) {
        failures.push({ command: spec.command, error });
        attempt(index + 1);
        return;
      }
      let settled = false;
      child.once("spawn", () => {
        if (settled) return;
        settled = true;
        resolve6({ started: true });
      });
      child.once("error", (error) => {
        if (settled) return;
        settled = true;
        failures.push({ command: spec.command, error });
        attempt(index + 1);
      });
      child.unref();
    };
    attempt(0);
  });
}
function launchExternal(action, value, options = {}) {
  const platform = options.platform ?? process.platform;
  const wsl = options.wsl ?? (platform === "linux" && isWslRuntime());
  const commandOptions = { ...options.commandOptions, wsl };
  let chain;
  if (action === "reveal") {
    chain = [revealCommand(requireAbsolute(value), platform, commandOptions)];
  } else {
    let url = validateExternalUrl(value);
    if (wsl) url = wslRemoteEditorUrl(url, options.distroName ?? process.env.WSL_DISTRO_NAME ?? "");
    chain = urlCommands(url, platform, commandOptions);
  }
  return launchChain(action, chain, options.spawn ?? spawn3);
}

// src/archive-route.ts
import { randomUUID as randomUUID3 } from "node:crypto";
import { open as open2, rm as rm2, stat as stat5 } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join as join9 } from "node:path";

// src/file-stream.ts
import { createReadStream } from "node:fs";
import { once as once2 } from "node:events";
import { pipeline } from "node:stream/promises";
async function streamFileToResponse(path, size, res, headers) {
  const node = res;
  const stream = createReadStream(path);
  try {
    await once2(stream, "open");
  } catch (error) {
    stream.destroy();
    throw new SidebarError(
      "fs-error",
      `cannot read "${path}": ${error instanceof Error ? error.message : String(error)}`,
      400
    );
  }
  res.writeHead(200, { ...headers, "content-length": String(size) });
  try {
    await pipeline(stream, node);
  } catch {
    node.destroy();
  }
}

// src/archive-tools.ts
import { spawn as spawn4 } from "node:child_process";
import { dirname as dirname6, relative as relative4, sep as sep6 } from "node:path";
var TOOL_SPECS = {
  zip: { tool: "zip", bin: "zip", flags: ["-r", "-q", "-X", "-y", "-"], ext: ".zip" },
  tar: { tool: "tar", bin: "tar", flags: ["-czf", "-"], ext: ".tar.gz" }
};
var TOOL_ORDER = ["zip", "tar"];
var PROBE_TIMEOUT_MS2 = 3e3;
var ARCHIVE_STDERR_LIMIT = 4096;
function probeTool(bin, spawner2) {
  return new Promise((resolve6) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve6(ok);
    };
    let child;
    try {
      child = spawner2(bin, ["--version"], { stdio: "ignore", windowsHide: true });
    } catch {
      finish(false);
      return;
    }
    const timer = setTimeout(() => {
      child.kill();
      finish(false);
    }, PROBE_TIMEOUT_MS2);
    child.once("error", () => {
      finish(false);
    });
    child.once("exit", (code) => {
      finish(code === 0);
    });
  });
}
var availability = /* @__PURE__ */ new Map();
function resolveArchiveTool(spawner2 = spawn4) {
  return tryTools(TOOL_ORDER, spawner2);
}
async function tryTools(order, spawner2 = spawn4) {
  for (const tool of order) {
    const spec = TOOL_SPECS[tool];
    let pending2 = availability.get(tool);
    if (pending2 === void 0) {
      pending2 = probeTool(spec.bin, spawner2).then((ok) => ok ? spec : void 0);
      availability.set(tool, pending2);
    }
    const found = await pending2;
    if (found !== void 0) return found;
  }
  return void 0;
}
function toArchiveName(path) {
  return sep6 === "/" ? path : path.split(sep6).join("/");
}
function planArchive(selections, spec) {
  if (selections.length === 0) {
    throw new SidebarError("bad-request", "no paths to archive");
  }
  let base = commonAncestor(selections);
  if (selections.some((selection) => relative4(base, selection) === "")) {
    const parent = dirname6(base);
    if (parent === base) {
      throw new SidebarError("bad-request", "cannot archive the filesystem root");
    }
    base = parent;
  }
  const args = selections.map((selection) => toArchiveName(relative4(base, selection)));
  if (args.some((name2) => name2 === "" || name2 === ".." || name2.startsWith("../"))) {
    throw new SidebarError("bad-request", "selection is not below the archive root");
  }
  const excluded = spec.tool === "zip" ? [...spec.flags, ...args, "-x", "*/.dsh-sidebar-recovery/*", ".dsh-sidebar-recovery/*"] : [...spec.flags, "--exclude=.dsh-sidebar-recovery", ...args];
  return { spec, cwd: base, args: excluded };
}
function commonAncestor(selections) {
  const [first, ...rest] = selections;
  if (first === void 0) throw new SidebarError("bad-request", "no paths to archive");
  if (rest.length === 0) return dirname6(first);
  let base = first;
  for (const selection of rest) {
    while (!isWithin2(base, selection)) {
      const parent = dirname6(base);
      if (parent === base) return parent;
      base = parent;
    }
  }
  return base;
}
function isWithin2(base, target) {
  if (base === target) return true;
  const rel = relative4(base, target);
  return rel !== "" && !rel.startsWith("..") && !rel.startsWith(`..${sep6}`);
}
function runArchiveTool(plan, outputFd, spawner2 = spawn4, onSpawn) {
  return new Promise((resolve6, reject) => {
    const child = spawner2(plan.spec.bin, plan.args, {
      cwd: plan.cwd,
      stdio: ["ignore", outputFd, "pipe"],
      windowsHide: true
    });
    onSpawn?.(child);
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += typeof chunk === "string" ? chunk : chunk.toString("utf8");
      if (stderr.length > ARCHIVE_STDERR_LIMIT * 2) {
        stderr = stderr.slice(-ARCHIVE_STDERR_LIMIT);
      }
    });
    child.once("error", (error) => {
      reject(new SidebarError("fs-error", `cannot run ${plan.spec.bin}: ${error.message}`));
    });
    child.once("close", (code) => {
      resolve6({ code: code ?? 1, stderr: stderr.slice(-ARCHIVE_STDERR_LIMIT).trim() });
    });
  });
}
var DEFAULT_STEM = "archive";
var ARCHIVE_STEM_MAX = 100;
function archiveFileName(raw, ext) {
  const stripped = raw.trim().replace(/\.(?:zip|tar(?:\.gz)?|tgz)$/i, "").trim();
  const cleaned = [...stripped].filter((char) => {
    const code = char.codePointAt(0);
    return char !== "/" && char !== "\\" && char !== '"' && char !== "'" && code >= 32 && code !== 127;
  }).join("").trim().replace(/^\.+/, "").slice(0, ARCHIVE_STEM_MAX);
  return `${cleaned === "" ? DEFAULT_STEM : cleaned}${ext}`;
}
function archiveTempName(id, ext) {
  return `dsh-better-sidebar-${id}${ext}`;
}

// src/archive-route.ts
var ARCHIVE_MAX_BUILDING = 4;
var ARCHIVE_TTL_MS = 5 * 60 * 1e3;
function contentDispositionOf(name2) {
  return `attachment; filename="${asciiFallbackOf(name2)}"; filename*=UTF-8''${encodeURIComponent(name2)}`;
}
function asciiFallbackOf(name2) {
  const ascii = [...name2].filter((char) => {
    const code = char.codePointAt(0);
    return code >= 32 && code <= 126 && char !== '"' && char !== "\\";
  }).join("");
  const stem = ascii.replace(/\.(?:zip|tar\.gz)$/i, "");
  if (stem === "" || /^\.+$/.test(stem)) return "download.zip";
  return ascii;
}
async function respondArchiveDownload(tasks, query, res) {
  if (query.sessionId === null || query.id === null || query.id === "") {
    throw new SidebarError("bad-request", "sessionId and id are required");
  }
  const found = tasks.lookup(query.id, query.sessionId);
  if (!found.ok || found.task.state !== "ready" || found.task.file === void 0) {
    if (found.ok) throw new SidebarError("not-found", "archive is gone", 404);
    if (found.reason === "building") throw new SidebarError("bad-request", found.message, 409);
    if (found.reason === "forbidden") throw new SidebarError("forbidden", found.message, 403);
    if (found.reason === "error") throw new SidebarError("fs-error", found.message, 410);
    throw new SidebarError("not-found", found.message, 404);
  }
  const { name: name2, file } = found.task;
  const id = found.task.id;
  try {
    await streamFileToResponse(file.path, file.size, res, {
      // The extension follows the TOOL, not the client's guess: a host with
      // only `tar` sends a real .tar.gz rather than a mislabelled .zip.
      "content-type": name2.endsWith(".tar.gz") ? "application/gzip" : "application/zip",
      // Never the raw name: a non-latin1 value (中文目录 → 报告.zip) makes Node's
      // writeHead throw and turns the download into a 500.
      "content-disposition": contentDispositionOf(name2),
      "cache-control": "no-cache"
    });
  } finally {
    tasks.release(id);
  }
}
function createArchiveTasks(options = {}) {
  const tasks = /* @__PURE__ */ new Map();
  const children = /* @__PURE__ */ new Map();
  const spawner2 = options.spawn ?? void 0;
  const tempPathOf = (id, ext) => join9(options.tempDir ?? tmpdir(), archiveTempName(id, ext));
  const sweep = (now) => {
    for (const [id, task] of tasks) {
      if (task.state === "building" || task.expiresAt > now) continue;
      tasks.delete(id);
      if (task.file !== void 0) void rm2(task.file.path, { force: true }).catch(() => {
      });
    }
  };
  const lookup = (id, sessionId) => {
    sweep(Date.now());
    const task = tasks.get(id);
    if (task === void 0) return { ok: false, reason: "missing", message: "unknown or expired archive" };
    if (task.sessionId !== sessionId) return { ok: false, reason: "forbidden", message: "archive belongs to another session" };
    if (task.state === "building") return { ok: false, reason: "building", message: "archive is still being built" };
    if (task.state === "error") return { ok: false, reason: "error", message: task.error ?? "archive failed" };
    return { ok: true, task };
  };
  return {
    async start({ sessionId, name: name2, paths }) {
      sweep(Date.now());
      let building = 0;
      for (const task2 of tasks.values()) if (task2.state === "building") building += 1;
      if (building >= ARCHIVE_MAX_BUILDING) {
        throw new SidebarError("bad-request", `too many archives are being built (max ${ARCHIVE_MAX_BUILDING})`, 409);
      }
      const resolve6 = options.resolveTool ?? resolveArchiveTool;
      const spec = await resolve6(spawner2);
      if (spec === void 0) {
        throw new SidebarError(
          "unavailable",
          "no archive tool is available: neither zip nor tar could be run",
          501
        );
      }
      const plan = planArchive(paths, spec);
      const id = `ar-${randomUUID3()}`;
      const finalName = archiveFileName(name2, spec.ext);
      const tempPath = tempPathOf(id, spec.ext);
      const task = {
        id,
        sessionId,
        name: finalName,
        state: "building",
        bytes: 0,
        expiresAt: Number.POSITIVE_INFINITY
      };
      tasks.set(id, task);
      void pack(id, task, plan, tempPath, spawner2);
      return { id, name: finalName, entries: paths.length };
    },
    status(id, sessionId) {
      sweep(Date.now());
      const task = tasks.get(id);
      if (task === void 0) throw new SidebarError("not-found", "unknown or expired archive", 404);
      if (task.sessionId !== sessionId) throw new SidebarError("forbidden", "archive belongs to another session", 403);
      return {
        state: task.state,
        bytes: task.bytes,
        ...task.error === void 0 ? {} : { error: task.error }
      };
    },
    lookup,
    release(id) {
      const task = tasks.get(id);
      tasks.delete(id);
      if (task?.file !== void 0) void rm2(task.file.path, { force: true }).catch(() => {
      });
    },
    size() {
      sweep(Date.now());
      return tasks.size;
    },
    dispose() {
      for (const child of children.values()) {
        try {
          child.kill();
        } catch {
        }
      }
      children.clear();
      for (const task of tasks.values()) {
        if (task.file !== void 0) void rm2(task.file.path, { force: true }).catch(() => {
        });
      }
      tasks.clear();
    }
  };
  async function pack(id, task, plan, tempPath, spawner3) {
    const settle = (error) => {
      task.state = error === void 0 ? "ready" : "error";
      if (error !== void 0) task.error = error;
      task.expiresAt = Date.now() + ARCHIVE_TTL_MS;
      children.delete(id);
    };
    let handle;
    try {
      handle = await open2(tempPath, "w");
      const result = await runArchiveTool(plan, handle.fd, spawner3, (child) => {
        children.set(id, child);
      });
      await handle.close();
      handle = void 0;
      if (result.code !== 0) {
        settle(result.stderr === "" ? `${plan.spec.bin} exited with code ${result.code}` : result.stderr);
        await rm2(tempPath, { force: true }).catch(() => {
        });
        return;
      }
      const info = await stat5(tempPath).catch(() => void 0);
      if (info === void 0) {
        settle(`${plan.spec.bin} produced no archive`);
        return;
      }
      task.bytes = info.size;
      task.file = { path: tempPath, size: info.size };
      settle(void 0);
    } catch (error) {
      await handle?.close().catch(() => {
      });
      task.bytes = await stat5(tempPath).then((info) => info.size).catch(() => 0);
      settle(error instanceof Error ? error.message : String(error));
      await rm2(tempPath, { force: true }).catch(() => {
      });
    }
  }
}

// src/index.ts
init_git();

// src/git-graph.ts
init_git();
import { execFile } from "node:child_process";
import { createHash as createHash2 } from "node:crypto";
var MAX_OUTPUT = 8 * 1024 * 1024;
var MAX_OFFSET = 1e4;
var OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
var fail = (message, code = "bad-request") => {
  throw new GitCommandError(message, code, "graph");
};
function readGit(cwd, args, allowMissing = false) {
  return new Promise((resolve6, reject) => {
    execFile("git", ["-C", cwd, "--no-pager", "--no-replace-objects", "-c", "color.ui=false", ...args], {
      encoding: "utf8",
      timeout: 1e4,
      maxBuffer: MAX_OUTPUT,
      windowsHide: true,
      env: { ...process.env, LC_ALL: "C", GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0", GIT_NO_LAZY_FETCH: "1" }
    }, (error, stdout, stderr) => {
      if (!error) return resolve6(stdout);
      if (allowMissing && error.code === 1 && !stderr.trim()) return resolve6("");
      reject(new GitCommandError(stderr.trim() || error.message, "git-error", args[0] ?? "graph"));
    });
  });
}
function cursorOf(value) {
  if (value === void 0) return void 0;
  if (typeof value !== "string" || value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) fail("Invalid graph cursor");
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (parsed?.version !== 1 || !/^[a-f0-9]{64}$/.test(parsed.fingerprint) || !Number.isSafeInteger(parsed.offset) || parsed.offset < 1 || parsed.offset > MAX_OFFSET) fail("Invalid graph cursor");
    return parsed;
  } catch {
    return fail("Invalid graph cursor");
  }
}
async function snapshotOf(root, branch) {
  const raw = await readGit(root, ["for-each-ref", "--sort=refname", "--format=%(refname)%00%(objectname)", "refs/heads/", "refs/remotes/"]);
  const branches2 = raw.trimEnd().split("\n").filter(Boolean).map((line) => {
    const [ref, hashFull] = line.split("\0");
    if (!ref || !hashFull || !OID.test(hashFull)) return fail("Invalid Git reference output", "git-error");
    return { ref, name: ref.replace(/^refs\/(heads|remotes)\//, ""), hashFull };
  });
  if (branches2.length > 1e3) fail("Too many branches for graph (limit 1000)", "graph-limit");
  const head = (await readGit(root, ["rev-parse", "--verify", "--quiet", "HEAD"], true)).trim();
  const symbolicHead = (await readGit(root, ["symbolic-ref", "--quiet", "HEAD"], true)).trim();
  if (head && !OID.test(head)) fail("Invalid HEAD", "git-error");
  if (!head && (!symbolicHead || branches2.some((item) => item.ref === symbolicHead))) fail("Cannot resolve HEAD", "git-error");
  const fingerprint = createHash2("sha256").update(JSON.stringify({ root, branch, branches: branches2, head, symbolicHead })).digest("hex");
  const selected = branch === void 0 ? void 0 : branches2.find((item) => item.ref === branch);
  const tips = branch === void 0 ? [.../* @__PURE__ */ new Set([...branches2.map((item) => item.hashFull), ...head ? [head] : []])].sort() : selected ? [selected.hashFull] : [];
  const decorations = /* @__PURE__ */ new Map();
  for (const item of branches2) decorations.set(item.hashFull, [...decorations.get(item.hashFull) ?? [], item.name]);
  if (head) decorations.set(head, ["HEAD", ...decorations.get(head) ?? []]);
  return { branches: branches2, fingerprint, tips, decorations, selected };
}
async function gitGraph(cwd, options = {}, selectedRepo) {
  const { branch, count = 50 } = options;
  if (branch !== void 0 && (typeof branch !== "string" || branch.length > 1024 || !/^refs\/(heads|remotes)\/.+/.test(branch))) fail("Expected a full local or remote branch ref");
  if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 1) fail("Invalid graph count");
  const limit = Math.min(count, 200);
  const cursor = cursorOf(options.cursor);
  let root;
  try {
    root = (await readGit(cwd, ["rev-parse", "--show-toplevel"])).trim();
    if (selectedRepo !== void 0) root = await repoRoot(cwd, selectedRepo);
  } catch (error) {
    if (!(error instanceof GitCommandError) || !/^fatal: not a git repository(?: \(|:)/.test(error.message)) throw error;
    try {
      root = await repoRoot(cwd, selectedRepo);
    } catch (discoveryError) {
      if (!(discoveryError instanceof GitCommandError) || discoveryError.code !== "not-repo") throw discoveryError;
      if (cursor) fail("Graph repository changed; refresh", "graph-stale");
      return { isRepo: false, entries: [], branches: [], hasMore: false, snapshot: "" };
    }
    root = (await readGit(root, ["rev-parse", "--show-toplevel"])).trim();
  }
  const before = await snapshotOf(root, branch);
  if (cursor && cursor.fingerprint !== before.fingerprint) fail("Graph changed; refresh", "graph-stale");
  if (branch !== void 0 && !before.selected) fail("Unknown graph branch");
  const offset = cursor?.offset ?? 0;
  const entries = [];
  if (before.tips.length) {
    const output = await readGit(root, [
      "log",
      "--topo-order",
      "--no-decorate",
      "--no-show-signature",
      "--encoding=UTF-8",
      `--max-count=${limit + 1}`,
      `--skip=${offset}`,
      "--format=%H%x00%P%x00%an%x00%ai%x00%s%x00%B%x00",
      ...before.tips,
      "--"
    ]);
    const fields = output.split("\0");
    for (let i = 0; i + 5 < fields.length; i += 6) {
      const hashFull = fields[i].trim();
      const parents = fields[i + 1].split(" ").filter(Boolean);
      if (!OID.test(hashFull) || parents.some((parent) => !OID.test(parent))) fail("Invalid Git graph output", "git-error");
      entries.push({
        hash: hashFull.slice(0, 7),
        hashFull,
        parents,
        author: fields[i + 2],
        date: fields[i + 3],
        subject: fields[i + 4],
        message: fields[i + 5],
        refs: before.decorations.get(hashFull) ?? []
      });
    }
  }
  const after = await snapshotOf(root, branch);
  if (after.fingerprint !== before.fingerprint) fail("Graph changed; refresh", "graph-stale");
  const hasMore = entries.length > limit;
  if (hasMore && offset + limit > MAX_OFFSET) fail("Graph history limit reached (10000)", "graph-limit");
  return {
    isRepo: true,
    root,
    entries: entries.slice(0, limit),
    branches: before.branches,
    hasMore,
    ...hasMore ? { nextCursor: Buffer.from(JSON.stringify({ version: 1, fingerprint: before.fingerprint, offset: offset + limit })).toString("base64url") } : {},
    snapshot: before.fingerprint
  };
}

// src/index.ts
import { SettingsConflictError } from "file:///E:/DSH/%E6%9C%AC%E4%BD%93/resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-settings/lib/index.js";

// src/agent-opens.ts
import { randomUUID as randomUUID4 } from "node:crypto";
import { stat as stat6 } from "node:fs/promises";
import { isAbsolute as isAbsolute4, join as join10, resolve as resolve5 } from "node:path";
import { defineTool } from "file:///E:/DSH/%E6%9C%AC%E4%BD%93/resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-tools/lib/index.js";
var AGENT_OPEN_QUEUE_MAX = 64;
var AgentOpenRegistry = class {
  pending = /* @__PURE__ */ new Map();
  subscribers = /* @__PURE__ */ new Map();
  /** Queue one open and deliver it immediately when a view is attached.
   * @returns the request id and whether a connected view received it now. */
  enqueue(sessionId, kind, target, title) {
    const request = { id: randomUUID4(), sessionId, kind, target, title };
    const list = this.pending.get(sessionId) ?? [];
    list.push(request);
    if (list.length > AGENT_OPEN_QUEUE_MAX) list.splice(0, list.length - AGENT_OPEN_QUEUE_MAX);
    this.pending.set(sessionId, list);
    const views = this.subscribers.get(sessionId);
    if (views !== void 0 && views.size > 0) {
      for (const send of views) send(request);
      this.pending.delete(sessionId);
      return { id: request.id, delivered: true };
    }
    return { id: request.id, delivered: false };
  }
  /** Attach one sidebar view (replays queued requests; consume-on-send).
   * @returns the disposer detaching the view. */
  attach(sessionId, send) {
    let views = this.subscribers.get(sessionId);
    if (views === void 0) {
      views = /* @__PURE__ */ new Set();
      this.subscribers.set(sessionId, views);
    }
    views.add(send);
    const queued = this.pending.get(sessionId) ?? [];
    if (queued.length > 0) {
      for (const request of queued) send(request);
      this.pending.delete(sessionId);
    }
    return () => {
      const current = this.subscribers.get(sessionId);
      current?.delete(send);
      if (current !== void 0 && current.size === 0) this.subscribers.delete(sessionId);
    };
  }
  /** Drop every queued request (the feature was turned off mid-session). */
  drainAll() {
    this.pending.clear();
  }
  /** Drop the queue and every subscriber (plugin teardown). */
  dispose() {
    this.pending.clear();
    this.subscribers.clear();
  }
};
function requireAgent(agent) {
  if (agent === void 0) {
    throw new Error("sidebar_open requires an initiating agent");
  }
  return agent;
}
function sessionIdOf(exec) {
  return requireAgent(exec.agent).session.id;
}
function textRender(fn) {
  return (_args, value) => [{ type: "text", text: fn(value) }];
}
async function classifyTarget(raw, cwd) {
  if (/^https?:\/\//i.test(raw)) {
    let parsed;
    try {
      parsed = new URL(raw);
    } catch {
      throw new Error(`"${raw}" is not a valid URL`);
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("sidebar_open only accepts http:// and https:// URLs");
    }
    const title2 = parsed.hostname !== "" ? parsed.hostname : raw;
    return { kind: "url", target: raw, title: title2 };
  }
  if (!isWindowsDrivePrefix(raw) && /^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    throw new Error("sidebar_open only accepts http:// and https:// URLs; use a local path for files");
  }
  const target = resolve5(isAbsolute4(raw) ? raw : join10(cwd, raw));
  let info;
  try {
    info = await stat6(target);
  } catch (error) {
    const code = error.code;
    if (code === "ENOENT") throw new Error(`"${raw}" does not exist (resolved to "${target}")`, { cause: error });
    if (code === "EACCES" || code === "EPERM") throw new Error(`"${target}" is not readable`, { cause: error });
    throw new Error(`cannot open "${target}": ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
  const title = basenameOf(target);
  return { kind: info.isDirectory() ? "folder" : "file", target, title: title === "" ? raw : title };
}
function basenameOf(path) {
  const trimmed = path.replace(/[\\/]+$/, "");
  const at = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return at === -1 ? trimmed : trimmed.slice(at + 1);
}
function isWindowsDrivePrefix(raw) {
  return /^[a-zA-Z]:[\\/]/.test(raw);
}
function registerOpenTool(ctx, registry, resolveCwd, readPrefs) {
  return ctx.tools.register(defineTool({
    name: "sidebar_open",
    description: "Open a local file, a local folder, or an HTTP(S) page in the sidebar of the calling conversation. A file opens in the sidebar editor (per-path dedupe: an already-open file is focused); a folder opens a file window whose tree is rooted at that folder; a URL opens in the sidebar browser (sandboxed iframe). The panel auto-expands for content opens and the tab title defaults to the file/folder name or the URL hostname. The path may be absolute or relative to the session working directory. The open lands in the CALLING session's sidebar: while that session's sidebar view is not connected (e.g. the session is not the active one), the open is queued and delivered when the session sidebar is next shown \u2014 the result reports `delivered` so you know whether it is visible right now. The side card setting \"model opens files/folders/pages in the sidebar\" must be on, and the target tab type must be enabled in that session's settings.",
    parameters: {
      target: {
        type: "string",
        required: true,
        description: "Absolute or session-cwd-relative local path, or an http:// / https:// URL."
      },
      title: {
        type: "string",
        description: "Optional tab title (defaults to the file/folder name or the URL hostname)."
      }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          kind: { type: "string", required: true, description: "What was opened: file | folder | url." },
          target: { type: "string", required: true, description: "The absolute path or URL the open was requested for." },
          title: { type: "string", required: true, description: "The tab title used (provided title, basename, or hostname)." },
          delivered: {
            type: "boolean",
            required: true,
            description: "Whether the open was pushed to a connected sidebar at call time (false = queued until the session sidebar is next shown)."
          }
        }
      },
      render: textRender(
        (v) => v.delivered ? `Opened ${v.kind} "${v.title}" (${v.target}) in the sidebar.` : `Requested opening ${v.kind} "${v.title}" (${v.target}) in the sidebar \u2014 the session sidebar is not connected yet, so the open is queued and will appear when it is next shown.`
      )
    },
    execute: async (args, exec) => {
      exec.signal.throwIfAborted();
      const sessionId = sessionIdOf(exec);
      const cwd = await resolveCwd(sessionId);
      const { kind, target, title: defaultTitle } = await classifyTarget(args.target, cwd);
      const prefs = readPrefs();
      const tab = kind === "url" ? "browser" : "editor";
      if (prefs.tabsEnabled[tab] === false) {
        throw new Error(`the built-in ${tab} tab is disabled in the side card settings; ask the user to enable it (or disable this tool)`);
      }
      const title = args.title !== void 0 && args.title.trim() !== "" ? args.title : defaultTitle;
      const { delivered } = registry.enqueue(sessionId, kind, target, title);
      return { kind, target, title, delivered };
    }
  }));
}

// src/sidechat-core.ts
import { foldSurface, isSurfaceEligibleType } from "file:///E:/DSH/%E6%9C%AC%E4%BD%93/resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-session/lib/types/surface.js";
var SIDE_LABEL_PREFIX = "Side: ";
var SIDE_NEW_THREAD_TITLE = "Side: New thread";
var LABEL_MAX_CHARS = 48;
var SIDE_BOUNDARY_PREFIX = "Side conversation boundary";
var SIDE_INJECTION_SOURCE_KIND = "plugin:dsh-better-sidebar";
var SIDE_BOUNDARY_PROMPT = `Side conversation boundary.

Everything before this boundary is inherited history from the parent session: its completed turns, its pending question, and \u2014 if the parent was mid-turn \u2014 its in-progress output frozen at the moment this side conversation started. It is reference context only. It is not your current task.

Do not continue, execute, or complete any instructions, plans, tool calls, approvals, edits, or requests from before this boundary. Only messages submitted after this boundary are active user instructions for this side conversation.

Mode: this is a continuable side conversation. Your answers stay in this side thread and are viewed in the side panel; they are never delivered into the parent session.`;
function liveEventsOf(chunks, tailSeq) {
  return chunks.map((delta, position) => ({
    type: "assistant/live-chunk",
    seq: tailSeq + 1 + position,
    time: delta.time,
    data: {
      attemptId: delta.attemptId,
      turn: delta.turn,
      step: delta.step,
      index: delta.index,
      chunk: delta.chunk
    }
  }));
}
function dataOf(event) {
  return event.data;
}
function copyEvents(events) {
  return events.map((event) => {
    const source = event;
    return {
      type: source.type,
      seq: source.seq,
      time: source.time,
      data: dataOf(source),
      ...source.surfaceOp === void 0 ? {} : { surfaceOp: source.surfaceOp },
      ...source.sourceEventSeqs === void 0 ? {} : { sourceEventSeqs: source.sourceEventSeqs },
      ...source.ignorable === void 0 ? {} : { ignorable: source.ignorable }
    };
  });
}
function lastTurnBoundary(events) {
  for (let index = events.length - 1; index >= 0; index--) {
    const type = events[index]?.type;
    if (type === "turn/start" || type === "turn/end") return index;
  }
  return -1;
}
function numberAt(data, key) {
  const value = data[key];
  return typeof value === "number" && Number.isSafeInteger(value) ? value : 0;
}
function openStepInTurn(events, turnStart) {
  let open4;
  for (let index = turnStart + 1; index < events.length; index++) {
    const event = events[index];
    if (event === void 0) continue;
    if (event.type === "step/start") open4 = numberAt(dataOf(event), "step");
    else if (event.type === "step/end") open4 = void 0;
  }
  return open4;
}
function hasDanglingToolCall(events, turnStart) {
  const pending2 = /* @__PURE__ */ new Set();
  for (let index = turnStart + 1; index < events.length; index++) {
    const event = events[index];
    if (event === void 0) continue;
    const data = dataOf(event);
    if (event.type === "step/end") {
      pending2.clear();
      continue;
    }
    if (event.type === "tool/call") {
      const callId = data.callId;
      if (typeof callId === "string") pending2.add(callId);
      continue;
    }
    if (event.type === "tool/result") {
      const source = data.message;
      const callId = source?.source?.callId;
      if (typeof callId === "string") pending2.delete(callId);
    }
  }
  return pending2.size > 0;
}
function resultBlocks(content) {
  if (!Array.isArray(content)) return void 0;
  for (const block of content) {
    if (block === null || typeof block !== "object") continue;
    const wrapper = block;
    if (wrapper.type === "tool-result" && Array.isArray(wrapper.content)) {
      return wrapper.content;
    }
  }
  return content;
}
function toolResultText(data) {
  const message = data.message;
  const blocks = resultBlocks(message?.content);
  if (blocks === void 0) return "";
  const parts = [];
  for (const item of blocks) {
    if (item === null || typeof item !== "object") continue;
    const textItem = item;
    if (textItem.type === "text" && typeof textItem.text === "string") {
      parts.push(textItem.text);
    }
  }
  return parts.join("\n");
}
var SNAPSHOT_RESULT_CAP = 2e3;
var SNAPSHOT_TOTAL_CAP = 8e3;
function compactionTail(events) {
  const cut = lastCheckpointIndex(events);
  if (cut === void 0) return void 0;
  const checkpoint = events[cut];
  if (checkpoint === void 0) return void 0;
  let parentNodes;
  try {
    const fold = foldSurface(events);
    parentNodes = fold.nodes;
  } catch {
    return void 0;
  }
  const surfaceIndex = parentNodes.indexOf(checkpoint.seq);
  if (surfaceIndex === -1) return void 0;
  const head = [];
  let keepFirst;
  let sawTailNode = false;
  for (let index = 0; index < parentNodes.length; index++) {
    if (index === surfaceIndex) continue;
    const seq = parentNodes[index];
    if (seq >= cut) {
      if (index < surfaceIndex) return void 0;
      sawTailNode = true;
      continue;
    }
    if (sawTailNode) return void 0;
    if (index < surfaceIndex) head.push(seq);
    else if (keepFirst === void 0) keepFirst = seq;
  }
  const headEvents = headSkeleton(events, head);
  if (headEvents === void 0) return void 0;
  let keepStart = enclosingTurnStart(events, keepFirst);
  while (keepStart > 0 && events[keepStart - 1]?.type === "agent/inbox/spliced") keepStart -= 1;
  const groupId = dataOf(events[cut - 1]).compactionId;
  const surviving = new Set(parentNodes);
  const survivingCallIds = /* @__PURE__ */ new Set();
  for (const seq of parentNodes) {
    const node = events[seq];
    if (node === void 0 || node.type !== "tool/result") continue;
    const callId = toolResultCallIdOf(node);
    if (callId !== void 0) survivingCallIds.add(callId);
  }
  const replaceCovered = /* @__PURE__ */ new Set();
  for (const [from, to] of [[keepStart, cut], [cut + 1, events.length]]) {
    for (let index = from; index < to; index++) {
      const event = events[index];
      if (event === void 0 || isCompactionGroupEvent(event, groupId)) continue;
      const op = event.surfaceOp;
      if (op === null || typeof op !== "object" || op.op !== "replace") continue;
      const start = op.startSeq;
      const end = op.endSeq;
      if (typeof start !== "number" || typeof end !== "number" || start > end) continue;
      for (let seq = Math.max(0, start); seq <= Math.min(end, events.length - 1); seq++) replaceCovered.add(seq);
    }
  }
  const emittedSeqs = /* @__PURE__ */ new Set();
  for (const event of headEvents) emittedSeqs.add(event.seq);
  emittedSeqs.add(checkpoint.seq);
  const keepSkip = (event) => isSurfaceEligibleType(event.type) && !surviving.has(event.seq) && !replaceCovered.has(event.seq) || event.type === "tool/call" && !survivingCallIds.has(String(dataOf(event).callId));
  for (const [from, to] of [[keepStart, cut], [cut + 1, events.length]]) {
    for (let index = from; index < to; index++) {
      const event = events[index];
      if (event === void 0) continue;
      if (isCompactionGroupEvent(event, groupId)) continue;
      if (index < cut && keepSkip(event)) continue;
      emittedSeqs.add(event.seq);
    }
  }
  const droppedGroups = /* @__PURE__ */ new Set();
  const keptRunIds = /* @__PURE__ */ new Set();
  for (const seq of emittedSeqs) {
    const event = events[seq];
    if (event === void 0 || event.type !== "command/run") continue;
    const id = dataOf(event).commandId;
    if (typeof id === "string") keptRunIds.add(id);
  }
  const droppedDones = /* @__PURE__ */ new Set();
  for (const seq of emittedSeqs) {
    const event = events[seq];
    if (event === void 0) continue;
    const data = dataOf(event);
    if (event.type === "compaction/summary" || event.type === "compaction/prune") {
      const range = data.shadowedRange;
      const cited = data.shadowedSeqs;
      if (range === null || typeof range !== "object" || !Array.isArray(cited)) continue;
      const start = typeof range.start === "number" ? emittedSeqs.has(range.start) : true;
      const end = typeof range.end === "number" ? emittedSeqs.has(range.end) : true;
      const citedAll = cited.every((item) => typeof item !== "number" || emittedSeqs.has(item));
      if (!start || !end || !citedAll) {
        const id = data.compactionId;
        if (typeof id === "string") droppedGroups.add(id);
      }
    } else if (event.type === "command/done") {
      const id = data.commandId;
      const sourceSeq = data.sourceEventSeq;
      const runKept = typeof id === "string" && keptRunIds.has(id);
      const sourceKept = typeof sourceSeq !== "number" || emittedSeqs.has(sourceSeq);
      if (!runKept || !sourceKept) droppedDones.add(event.seq);
    }
  }
  const headOwnsTurn1 = headEvents.some((event) => event.type === "turn/start");
  const expectedFirstKeptTurn = headOwnsTurn1 ? 2 : 1;
  let firstKeptTurn;
  for (const [from, to] of [[keepStart, cut], [cut + 1, events.length]]) {
    for (let index = from; index < to; index++) {
      const event = events[index];
      if (event === void 0 || event.type !== "turn/start") continue;
      const turn = dataOf(event).turn;
      if (typeof turn === "number") firstKeptTurn = turn;
      break;
    }
    if (firstKeptTurn !== void 0) break;
  }
  const turnOffset = firstKeptTurn === void 0 ? 0 : Math.max(0, firstKeptTurn - expectedFirstKeptTurn);
  const rebase = /* @__PURE__ */ new Map();
  const seed = [];
  let aborted = false;
  const emit = (event) => {
    if (aborted || event === void 0) return;
    const rebased = rebaseEvent(event, seed.length, rebase, turnOffset, firstKeptTurn);
    if (rebased === DROPPED) return;
    if (rebased === void 0) {
      aborted = true;
      return;
    }
    rebase.set(event.seq, seed.length);
    seed.push(rebased);
  };
  for (const event of headEvents) emit(event);
  emit(checkpoint);
  for (let index = keepStart; index < cut; index++) {
    const event = events[index];
    if (event === void 0 || isCompactionGroupEvent(event, groupId)) continue;
    if (keepSkip(event)) continue;
    if (droppedGroups.has(String(dataOf(event).compactionId))) continue;
    if (droppedDones.has(event.seq)) continue;
    emit(event);
  }
  for (let index = cut + 1; index < events.length; index++) {
    const event = events[index];
    if (event === void 0 || isCompactionGroupEvent(event, groupId)) continue;
    if (droppedGroups.has(String(dataOf(event).compactionId))) continue;
    if (droppedDones.has(event.seq)) continue;
    emit(event);
  }
  if (aborted) return void 0;
  try {
    const child = foldSurface(seed);
    if (!sameVisibleSequence(events, parentNodes, child.nodes, seed)) return void 0;
  } catch {
    return void 0;
  }
  if (!turnSequenceValid(seed)) return void 0;
  if (!inboxSplicesValid(seed)) return void 0;
  if (!bracketsValid(seed)) return void 0;
  return seed;
}
function bracketsValid(seed) {
  const summarized = /* @__PURE__ */ new Set();
  const ranCommands = /* @__PURE__ */ new Set();
  for (const event of seed) {
    const data = dataOf(event);
    if (event.type === "compaction/summary") {
      const id = data.compactionId;
      if (typeof id === "string") summarized.add(id);
    } else if (event.type === "compaction/end") {
      const id = data.compactionId;
      if (data.error === void 0 && (typeof id !== "string" || !summarized.has(id))) return false;
    } else if (event.type === "command/run") {
      const id = data.commandId;
      if (typeof id === "string") ranCommands.add(id);
    } else if (event.type === "command/done") {
      const id = data.commandId;
      if (typeof id !== "string" || !ranCommands.has(id)) return false;
    }
  }
  return true;
}
function inboxSplicesValid(seed) {
  const nextTurn = [];
  const nextStep = [];
  for (const event of seed) {
    if (event.type !== "agent/inbox/spliced") continue;
    const data = dataOf(event);
    if (data.target !== "next-turn" && data.target !== "next-step") return false;
    const inbox = data.target === "next-step" ? nextStep : nextTurn;
    const rawStart = data.start;
    const removedCount = typeof data.removedCount === "number" ? data.removedCount : 0;
    const inserted = Array.isArray(data.inserted) ? data.inserted : void 0;
    const start = typeof rawStart === "number" ? rawStart : Number.NaN;
    if (inserted === void 0 || !Number.isSafeInteger(start) || start < 0 || start > inbox.length || !Number.isSafeInteger(removedCount) || removedCount < 0 || start + removedCount > inbox.length) return false;
    inbox.splice(start, removedCount, ...inserted);
    const ids = /* @__PURE__ */ new Set();
    for (const message of [...nextTurn, ...nextStep]) {
      const id = message.id;
      if (typeof id !== "string") return false;
      if (ids.has(id)) return false;
      ids.add(id);
    }
  }
  return true;
}
function turnSequenceValid(seed) {
  let nextTurn = 1;
  let nextStep = 1;
  let openTurn;
  let openStep;
  let pendingCalls = /* @__PURE__ */ new Set();
  for (const event of seed) {
    const data = dataOf(event);
    if (event.type === "turn/start") {
      if (openTurn !== void 0 || data.turn !== nextTurn) return false;
      openTurn = nextTurn;
      nextTurn += 1;
      nextStep = 1;
      openStep = void 0;
      pendingCalls = /* @__PURE__ */ new Set();
    } else if (event.type === "turn/end") {
      if (openTurn === void 0 || data.turn !== openTurn || openStep !== void 0) return false;
      openTurn = void 0;
    } else if (event.type === "step/start") {
      if (openTurn === void 0 || data.turn !== openTurn || openStep !== void 0) return false;
      if (data.step !== nextStep) return false;
      openStep = nextStep;
      nextStep += 1;
      pendingCalls = /* @__PURE__ */ new Set();
    } else if (event.type === "step/end") {
      if (openTurn === void 0 || openStep === void 0 || data.turn !== openTurn || data.step !== openStep) return false;
      if (pendingCalls.size > 0) return false;
      openStep = void 0;
    } else if (event.type === "tool/call") {
      if (typeof data.turn === "number" && data.turn !== openTurn) return false;
      if (typeof data.step === "number" && data.step !== openStep) return false;
      const callId = data.callId;
      if (typeof callId === "string" && callId !== "") pendingCalls.add(callId);
    } else if (event.type === "tool/result") {
      const op = event.surfaceOp;
      if (op !== "append") {
        if (openTurn === void 0) return false;
        continue;
      }
      if (typeof data.turn === "number" && data.turn !== openTurn) return false;
      if (typeof data.step === "number" && data.step !== openStep) return false;
      const callId = toolResultCallIdOf(event);
      if (callId !== void 0 && !pendingCalls.delete(callId)) return false;
    } else if (isSurfaceEligibleType(event.type)) {
      if (typeof data.turn === "number" && data.turn !== openTurn) return false;
      if (typeof data.step === "number" && data.step !== openStep) return false;
    }
  }
  return true;
}
function toolResultCallIdOf(event) {
  if (event.type !== "tool/result") return void 0;
  const message = dataOf(event).message;
  const callId = message?.source?.callId;
  return typeof callId === "string" && callId !== "" ? callId : void 0;
}
function headSkeleton(events, head) {
  if (head.length === 0) return [];
  const first = events[head[0]];
  const last = events[head[head.length - 1]];
  if (first === void 0 || last === void 0) return void 0;
  let turnStart;
  let stepStart;
  for (let index = head[0] - 1; index >= 0; index--) {
    const event = events[index];
    if (event === void 0) break;
    if (event.type === "turn/end") break;
    if (event.type === "step/start" && stepStart === void 0) stepStart = event;
    if (event.type === "turn/start") {
      turnStart = event;
      break;
    }
  }
  const normalized = (event, over) => {
    const data = { ...dataOf(event) };
    if (over.turn !== void 0 && typeof data.turn === "number") data.turn = over.turn;
    if (over.step !== void 0 && typeof data.step === "number") data.step = over.step;
    return { ...event, data };
  };
  const parts = [];
  if (turnStart !== void 0) {
    const turn = dataOf(turnStart).turn;
    if (typeof turn !== "number") return void 0;
    const step = stepStart !== void 0 ? dataOf(stepStart).step : void 0;
    if (stepStart !== void 0 && typeof step !== "number") return void 0;
    for (const seq of head) {
      const node = events[seq];
      if (node === void 0) return void 0;
      const nodeData = dataOf(node);
      if (nodeData.turn !== turn && nodeData.turn !== void 0) return void 0;
      if (stepStart !== void 0 && nodeData.step !== step && nodeData.step !== void 0) return void 0;
    }
    parts.push(normalized(turnStart, { turn: 1 }));
    if (stepStart !== void 0) parts.push(normalized(stepStart, { turn: 1, step: 1 }));
    for (const seq of head) parts.push(normalized(events[seq], { turn: 1, ...stepStart !== void 0 ? { step: 1 } : {} }));
    let closedStep = false;
    for (let index = head[head.length - 1] + 1; index < events.length; index++) {
      const event = events[index];
      if (event === void 0) break;
      if (!closedStep && event.type === "step/end" && typeof step === "number" && dataOf(event).step === step && dataOf(event).turn === turn) {
        parts.push(normalized(event, { turn: 1, step: 1 }));
        closedStep = true;
        continue;
      }
      if (event.type === "turn/end" && dataOf(event).turn === turn) {
        parts.push(normalized(event, { turn: 1 }));
        break;
      }
      if (event.type === "turn/start") break;
    }
    return closedStep || step === void 0 ? parts : void 0;
  }
  for (const seq of head) {
    const node = events[seq];
    if (node === void 0) return void 0;
    parts.push(node);
  }
  return parts;
}
function enclosingTurnStart(events, seq) {
  if (seq === void 0) return events.length;
  for (let index = seq - 1; index >= 0; index--) {
    const event = events[index];
    if (event === void 0) return seq;
    if (event.type === "turn/start") return index;
    if (event.type === "turn/end") return seq;
  }
  return seq;
}
function isCompactionGroupEvent(event, groupId) {
  if (!event.type.startsWith("compaction/")) return false;
  if (typeof groupId !== "string") return false;
  return dataOf(event).compactionId === groupId;
}
function lastCheckpointIndex(events) {
  for (let index = events.length - 1; index >= 0; index--) {
    if (events[index]?.type !== "compaction/summary") continue;
    if (events[index + 1]?.type === "user/message") return index + 1;
  }
  return void 0;
}
function visibleToken(event) {
  if (event === void 0) return "missing";
  if (event.type === "user/message") return `${event.type}:${JSON.stringify(dataOf(event))}`;
  const message = dataOf(event).message;
  return `${event.type}:${JSON.stringify(message ?? null)}`;
}
function sameVisibleSequence(parent, parentNodes, childNodes, child) {
  if (parentNodes.length !== childNodes.length) return false;
  for (let index = 0; index < parentNodes.length; index++) {
    if (visibleToken(parent[parentNodes[index]]) !== visibleToken(child[childNodes[index]])) {
      return false;
    }
  }
  return true;
}
var DROPPED = /* @__PURE__ */ Symbol("dropped");
function rebaseEvent(event, seq, rebase, turnOffset, firstKeptTurn) {
  const source = event;
  const seed = { type: source.type, seq, time: source.time, data: dataOf(source) };
  if (source.ignorable === true) seed.ignorable = true;
  const sourceData = dataOf(event);
  if (turnOffset > 0 && typeof sourceData.turn === "number" && firstKeptTurn !== void 0 && sourceData.turn >= firstKeptTurn) {
    seed.data = { ...seed.data, turn: sourceData.turn - turnOffset };
  }
  if (event.type === "command/done" && typeof sourceData.sourceEventSeq === "number") {
    const mapped = rebase.get(sourceData.sourceEventSeq);
    if (mapped === void 0) return DROPPED;
    seed.data = { ...seed.data, sourceEventSeq: mapped };
  }
  if (event.type === "compaction/summary" || event.type === "compaction/prune") {
    const range = sourceData.shadowedRange;
    const cited2 = sourceData.shadowedSeqs;
    if (range === null || typeof range !== "object" || !Array.isArray(cited2)) return seed;
    const start = typeof range.start === "number" ? rebase.get(range.start) : void 0;
    const end = typeof range.end === "number" ? rebase.get(range.end) : void 0;
    const mapped = cited2.map((item) => typeof item === "number" ? rebase.get(item) : void 0);
    if (start === void 0 || end === void 0 || mapped.includes(void 0)) return DROPPED;
    seed.data = {
      ...seed.data,
      shadowedRange: { start, end },
      shadowedSeqs: mapped
    };
  }
  const headerSeq = sourceData.headerSeq;
  if (event.type === "developer/message" && typeof headerSeq === "number") {
    const mapped = rebase.get(headerSeq);
    if (mapped === void 0) return void 0;
    seed.data = { ...seed.data, headerSeq: mapped };
  }
  const op = event.surfaceOp;
  if (op === "append") {
    seed.surfaceOp = "append";
  } else if (op !== null && typeof op === "object" && "op" in op && op.op === "replace") {
    const replace = op;
    const start = typeof replace.startSeq === "number" ? rebase.get(replace.startSeq) : void 0;
    const end = typeof replace.endSeq === "number" ? rebase.get(replace.endSeq) : void 0;
    seed.surfaceOp = start !== void 0 && end !== void 0 && start <= end ? { op: "replace", startSeq: start, endSeq: end } : "append";
  }
  const cited = event.sourceEventSeqs;
  if (Array.isArray(cited)) {
    const mapped = cited.map((item) => typeof item === "number" ? rebase.get(item) : void 0);
    if (!mapped.includes(void 0)) seed.sourceEventSeqs = mapped;
  }
  return seed;
}
function buildSidechatInheritance(events, live = []) {
  if (events.length === 0) return { seed: [], snapshot: null };
  const trimmed = compactionTail(events);
  const log2 = trimmed ?? events;
  const boundary = lastTurnBoundary(log2);
  if (boundary < 0 || log2[boundary]?.type === "turn/end") {
    return { seed: copyEvents(log2), snapshot: null };
  }
  if (hasDanglingToolCall(log2, boundary)) {
    return {
      seed: copyEvents(log2.slice(0, boundary)),
      snapshot: buildOpenTurnSnapshot(log2, live)
    };
  }
  const seed = copyEvents(log2);
  const last = log2[log2.length - 1];
  const turn = numberAt(dataOf(log2[boundary]), "turn");
  const now = last?.time ?? 0;
  const openStep = openStepInTurn(log2, boundary);
  if (openStep !== void 0) {
    seed.push({ type: "step/end", seq: seed.length, time: now, data: { turn, step: openStep } });
  }
  seed.push({
    type: "turn/end",
    seq: seed.length,
    time: now,
    data: { turn, reason: { kind: "interrupted" } }
  });
  return { seed, snapshot: null };
}
function messageTexts(message) {
  const content = message?.content;
  let text = "";
  let reasoning = "";
  if (!Array.isArray(content)) return { text, reasoning };
  for (const block of content) {
    if (block === null || typeof block !== "object") continue;
    const candidate = block;
    if (typeof candidate.text !== "string" || candidate.text === "") continue;
    if (candidate.type === "text") text += candidate.text;
    else if (candidate.type === "reasoning") reasoning += candidate.text;
  }
  return { text, reasoning };
}
function streamTexts(stream) {
  let text = "";
  let reasoning = "";
  if (!Array.isArray(stream)) return { text, reasoning };
  for (const record of stream) {
    if (record === null || typeof record !== "object") continue;
    const entry = record;
    if (entry.type === "text-chunks" || entry.type === "reasoning-chunks") {
      if (!Array.isArray(entry.texts)) continue;
      const joined = entry.texts.filter((part) => typeof part === "string").join("");
      if (entry.type === "text-chunks") text += joined;
      else reasoning += joined;
      continue;
    }
    if (entry.type === "chunk") {
      const chunk = entry.chunk;
      if (chunk === null || typeof chunk !== "object" || typeof chunk.text !== "string") continue;
      if (chunk.type === "text-delta") text += chunk.text;
      else if (chunk.type === "reasoning-delta") reasoning += chunk.text;
    }
  }
  return { text, reasoning };
}
function liveTexts(chunk) {
  if (typeof chunk.text !== "string" || chunk.text === "") return { text: "", reasoning: "" };
  if (chunk.type === "text-delta") return { text: chunk.text, reasoning: "" };
  if (chunk.type === "reasoning-delta") return { text: "", reasoning: chunk.text };
  return { text: "", reasoning: "" };
}
function buildOpenTurnSnapshot(events, live = []) {
  const boundary = lastTurnBoundary(events);
  if (boundary < 0 || events[boundary]?.type !== "turn/start") return null;
  const openTurn = numberAt(dataOf(events[boundary]), "turn");
  let text = "";
  let reasoning = "";
  const tools = [];
  const pendingCalls = /* @__PURE__ */ new Map();
  for (let index = boundary + 1; index < events.length; index++) {
    const event = events[index];
    if (event === void 0) continue;
    const data = dataOf(event);
    if (event.type === "step/end") {
      pendingCalls.clear();
      continue;
    }
    if (event.type === "assistant/message") {
      const settled = messageTexts(data.message);
      text += settled.text;
      reasoning += settled.reasoning;
      continue;
    }
    if (event.type === "assistant/attempt") {
      const attempt = streamTexts(data.stream);
      text += attempt.text;
      reasoning += attempt.reasoning;
      continue;
    }
    if (event.type === "tool/call") {
      const callId = data.callId;
      if (typeof callId === "string") {
        pendingCalls.set(callId, {
          name: typeof data.name === "string" ? data.name : "tool",
          args: typeof data.arguments === "string" ? data.arguments : ""
        });
      }
      continue;
    }
    if (event.type === "tool/result") {
      const source = data.message;
      const callId = typeof source?.source?.callId === "string" ? source.source.callId : void 0;
      const name2 = callId !== void 0 ? pendingCalls.get(callId)?.name : void 0;
      const args = callId !== void 0 ? pendingCalls.get(callId)?.args : void 0;
      if (callId !== void 0) pendingCalls.delete(callId);
      const result = toolResultText(data).slice(0, SNAPSHOT_RESULT_CAP);
      const failed = data.error !== void 0;
      const line = [
        `- \`${name2 ?? "tool"}\`${failed ? " (failed)" : ""}` + (args !== void 0 && args !== "" ? ` \u2014 arguments: \`${args}\`` : ""),
        ...result === "" ? [] : [`  Result: ${result}`]
      ].join("\n");
      tools.push(line);
    }
  }
  for (const [, call] of pendingCalls) {
    const line = `- \`${call.name}\` (executing) \u2014 arguments: \`${call.args}\``;
    tools.push(line);
  }
  for (const delta of live) {
    if (delta.turn !== openTurn) continue;
    const contribution = liveTexts(delta.chunk);
    text += contribution.text;
    reasoning += contribution.reasoning;
  }
  const sections = [];
  if (text.trim() !== "") sections.push(`Assistant output so far:

${text}`);
  if (reasoning.trim() !== "") sections.push(`Reasoning so far:

${reasoning}`);
  if (tools.length > 0) sections.push(`Tool activity:
${tools.join("\n")}`);
  if (sections.length === 0) return null;
  const body = sections.join("\n\n");
  return body.length > SNAPSHOT_TOTAL_CAP ? `Parent session in-progress turn (reference only):

${body.slice(0, SNAPSHOT_TOTAL_CAP)}\u2026` : `Parent session in-progress turn (reference only):

${body}`;
}
function sideLabel(question) {
  const flat = question.replace(/\s+/g, " ").trim();
  const max = Math.max(1, LABEL_MAX_CHARS - SIDE_LABEL_PREFIX.length);
  const body = flat.length > max ? `${flat.slice(0, max - 1)}\u2026` : flat;
  return `${SIDE_LABEL_PREFIX}${body}`;
}
function boundaryDelivered(events) {
  for (const event of events) {
    if (event.type !== "user/message") continue;
    if (messageLeadText(dataOf(event)).startsWith(SIDE_BOUNDARY_PREFIX)) return true;
  }
  return false;
}
function messageLeadText(data) {
  const content = data.content;
  const first = Array.isArray(content) ? content[0] : content;
  return typeof first === "string" ? first : typeof first === "object" && first !== null && "text" in first ? String(first.text) : "";
}
function pendingText(message) {
  const content = message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts = [];
  for (const block of content) {
    if (block === null || typeof block !== "object") continue;
    const item = block;
    if (item.type === "text" && typeof item.text === "string") parts.push(item.text);
  }
  return parts.join("\n");
}
function pendingInputId(message) {
  const id = message?.id;
  return typeof id === "string" && id !== "" ? id : void 0;
}
function pendingInputs(nextStep, nextTurn) {
  const rows = [];
  const add = (message, target) => {
    const id = pendingInputId(message);
    if (id === void 0) return;
    rows.push({ id, target, text: pendingText(message) });
  };
  for (const message of nextStep) add(message, "next-step");
  for (const message of nextTurn) add(message, "next-turn");
  return rows;
}
function pendingIdsInLog(events, limit) {
  const nextTurn = [];
  const nextStep = [];
  const end = limit === void 0 ? events.length : Math.min(limit, events.length);
  for (let index = 0; index < end; index++) {
    const event = events[index];
    if (event === void 0 || event.type !== "agent/inbox/spliced") continue;
    const data = dataOf(event);
    const target = data.target === "next-step" ? nextStep : data.target === "next-turn" ? nextTurn : void 0;
    if (target === void 0) continue;
    const start = typeof data.start === "number" && Number.isSafeInteger(data.start) ? data.start : 0;
    const removed = typeof data.removedCount === "number" && Number.isSafeInteger(data.removedCount) ? data.removedCount : 0;
    const inserted = Array.isArray(data.inserted) ? data.inserted : [];
    target.splice(Math.max(0, Math.min(start, target.length)), Math.max(0, removed), ...inserted);
  }
  const ids = [];
  for (const message of [...nextStep, ...nextTurn]) {
    const id = pendingInputId(message);
    if (id !== void 0) ids.push(id);
  }
  return ids;
}
function inheritedPendingIds(events, inheritedEventCount) {
  return pendingIdsInLog(events, Math.max(0, Math.trunc(inheritedEventCount)));
}
function effectiveModelSelection(events) {
  return parentModelSelection(events);
}
function threadOwnLogEvents(events) {
  for (let index = events.length - 1; index >= 0; index--) {
    if (events[index]?.type === "session/end-seed") return events.slice(index + 1);
  }
  return [...events];
}
function resolvePresetId(header, events) {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (event?.type !== "agent-preset/selected") continue;
    const preset = dataOf(event).agentPreset;
    if (typeof preset === "string") return preset;
  }
  return header.agentPreset;
}
function parentModelSelection(events) {
  let pending2;
  let lastUsed;
  for (const event of events) {
    if (event.type === "model/selection") {
      const selection2 = looseSelection(dataOf(event));
      if (selection2 !== void 0) pending2 = selection2;
      continue;
    }
    if (event.type !== "request/header") continue;
    const header = dataOf(event).header;
    const config = header?.config;
    if (config === null || typeof config !== "object") continue;
    const selection = looseSelection(config);
    if (selection === void 0) continue;
    const isDefaultEffort = header?.adapterDefaults?.reasoningEffort === true;
    lastUsed = {
      provider: selection.provider,
      model: selection.model,
      ...!isDefaultEffort && selection.reasoningEffort !== void 0 ? { reasoningEffort: selection.reasoningEffort } : {}
    };
    if (sameSelection(pending2, lastUsed)) pending2 = void 0;
  }
  return pending2 ?? lastUsed;
}
function sameSelection(left, right) {
  if (left === right) return true;
  if (left === void 0 || right === void 0) return false;
  return left.provider === right.provider && left.model === right.model && left.reasoningEffort === right.reasoningEffort;
}
function looseSelection(data) {
  const { provider, model, reasoningEffort } = data;
  if (typeof provider !== "string" || provider === "") return void 0;
  if (typeof model !== "string" || model === "") return void 0;
  return {
    provider,
    model,
    ...typeof reasoningEffort === "string" && reasoningEffort !== "" ? { reasoningEffort } : {}
  };
}

// src/process-activity.ts
var PROCESS_WINDOW_EVENTS = 400;
var PROCESS_DETAIL_MAX_CHARS = 160;
var PROCESS_TEXT_MAX_CHARS = 400;
function activityOf(name2) {
  if (name2 === "read") return "read";
  if (name2 === "read_image") return "readImage";
  if (name2 === "grep" || name2 === "glob" || name2.endsWith("_inspect")) return "search";
  if (name2 === "write") return "write";
  if (name2 === "edit" || name2 === "apply_patch") return "edit";
  if (["bash", "pwsh", "exec_command", "write_stdin"].includes(name2) || name2.startsWith("terminal_")) {
    return "commands";
  }
  if (name2 === "run_code") return "code";
  if (name2 === "web_search") return "webSearch";
  if (name2 === "web_fetch") return "webFetch";
  if (name2 === "subagent" || name2.startsWith("subagent_")) return "subagents";
  if (["todo_write", "create_goal", "update_goal", "get_goal"].includes(name2)) return "plan";
  if (name2 === "ask_user_question" || name2 === "request_user_input") return "questions";
  return "tools";
}
var LIVE_TOOL_DETAIL_KEYS = [
  "title",
  "description",
  "objective",
  "task",
  "task_name",
  "name",
  "question",
  "questions",
  "prompt",
  "message",
  "command",
  "cmd",
  "queries",
  "query",
  "pattern",
  "url",
  "uri",
  "file_path",
  "path",
  "target",
  "action",
  "status"
];
var SEGMENTER = typeof Intl !== "undefined" && typeof Intl.Segmenter === "function" ? new Intl.Segmenter(void 0, { granularity: "grapheme" }) : void 0;
function graphemes(text) {
  if (SEGMENTER === void 0) return Array.from(text);
  return Array.from(SEGMENTER.segment(text), (part) => part.segment);
}
function normalizeDetail(value) {
  const flat = (typeof value === "string" ? value : Array.isArray(value) && value.every((item) => typeof item === "string") ? value.join(", ") : "").replace(/\s+/g, " ").trim();
  const chars = graphemes(flat);
  if (chars.length <= PROCESS_DETAIL_MAX_CHARS) return flat;
  return `${chars.slice(0, PROCESS_DETAIL_MAX_CHARS - 1).join("").trimEnd()}\u2026`;
}
function questionDetail(value) {
  if (!Array.isArray(value)) return "";
  for (const item of value) {
    if (item === null || typeof item !== "object") continue;
    const detail = normalizeDetail(item.question);
    if (detail !== "") return detail;
  }
  return "";
}
function liveToolDetail(name2, argsRaw) {
  let args;
  try {
    args = JSON.parse(argsRaw);
  } catch {
    return normalizeDetail(name2);
  }
  if (args === null || typeof args !== "object") return normalizeDetail(name2);
  const record = args;
  for (const key of LIVE_TOOL_DETAIL_KEYS) {
    if (!(key in record)) continue;
    const value = record[key];
    const detail = key === "questions" ? questionDetail(value) : normalizeDetail(value);
    if (detail !== "") return detail;
  }
  return normalizeDetail(name2);
}
function contentText(content) {
  if (!Array.isArray(content)) return void 0;
  const parts = [];
  for (const block of content) {
    if (block === null || typeof block !== "object") continue;
    const candidate = block;
    if (candidate.type === "text" && typeof candidate.text === "string") {
      parts.push(candidate.text);
    }
  }
  return parts.length > 0 ? parts.join("\n") : void 0;
}
function announcedCalls(content) {
  if (!Array.isArray(content)) return [];
  const found = [];
  for (const block of content) {
    if (block === null || typeof block !== "object") continue;
    const candidate = block;
    if (candidate.type !== "tool-call" && candidate.type !== "tool_use") continue;
    const rawId = candidate.id ?? candidate.callId;
    if (typeof rawId !== "string" || typeof candidate.name !== "string") continue;
    found.push({
      callId: rawId,
      name: candidate.name,
      args: typeof candidate.arguments === "string" ? candidate.arguments : ""
    });
  }
  return found;
}
function resultCallId(data) {
  const message = data.message;
  for (const candidate of [data.callId, message?.source?.callId, message?.toolCallId, data.toolCallId]) {
    if (typeof candidate === "string" && candidate !== "") return candidate;
  }
  return void 0;
}
function summarize(calls, live) {
  const counts = /* @__PURE__ */ new Map();
  let running;
  let preparing;
  let runningDetail = "";
  let runningSeq = -Infinity;
  const ordered = calls.slice().sort((left, right) => left.seq - right.seq);
  for (const call of ordered) {
    const kind = activityOf(call.name);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
    if (call.settled || !live) continue;
    if (call.seq < runningSeq) continue;
    runningSeq = call.seq;
    running = kind;
    preparing = call.preparing ? true : void 0;
    runningDetail = call.preparing ? kind === "tools" ? call.name : "" : liveToolDetail(call.name, call.args);
  }
  const ranked = [...counts].map(([kind, count]) => ({ kind, count }));
  ranked.sort((left, right) => right.count - left.count);
  return {
    counts: ranked,
    ...running === void 0 ? {} : { running },
    runningDetail,
    ...preparing === true ? { preparing: true } : {}
  };
}
function truncateText(text) {
  const chars = graphemes(text);
  if (chars.length <= PROCESS_TEXT_MAX_CHARS) return text;
  return `${chars.slice(0, PROCESS_TEXT_MAX_CHARS - 1).join("").trimEnd()}\u2026`;
}
function openRange() {
  return { calls: [], ids: /* @__PURE__ */ new Set() };
}
function addCall(range, call) {
  if (range.ids.has(call.callId)) return;
  range.calls.push(call);
  range.ids.add(call.callId);
}
function foldProcess(events, options) {
  const live = options.live;
  const maxEvents = Math.max(1, options.maxEvents ?? PROCESS_WINDOW_EVENTS);
  let range = openRange();
  let answer;
  let answerLive = false;
  const settled = /* @__PURE__ */ new Set();
  let latestText;
  let lastEventTime;
  let crossed = 0;
  for (let index = events.length - 1, scanned = 0; index >= 0; index -= 1) {
    if (scanned >= maxEvents) break;
    const event = events[index];
    if (event === void 0) continue;
    scanned += 1;
    lastEventTime ??= event.time;
    const { type, data } = event;
    if (type === "tool/result") {
      const callId = resultCallId(data);
      if (callId !== void 0) settled.add(callId);
      continue;
    }
    if (type === "tool/call") {
      const callId = typeof data.callId === "string" && data.callId !== "" ? data.callId : `anon-${event.seq}`;
      addCall(range, {
        callId,
        name: typeof data.name === "string" ? data.name : "tool",
        args: typeof data.arguments === "string" ? data.arguments : "",
        seq: event.seq,
        settled: settled.has(callId),
        preparing: false
      });
      continue;
    }
    if (type !== "assistant/message" && type !== "user/message") continue;
    const message = type === "assistant/message" ? data.message : void 0;
    if (message !== void 0) {
      for (const announced of announcedCalls(message.content)) {
        const isSettled = settled.has(announced.callId);
        addCall(range, {
          callId: announced.callId,
          name: announced.name,
          args: announced.args,
          seq: event.seq,
          settled: isSettled,
          preparing: !isSettled
        });
      }
    }
    const text = message === void 0 ? void 0 : contentText(message.content);
    if (text !== void 0) latestText ??= text;
    if (type !== "user/message" && text === void 0) continue;
    if (range.calls.length > 0) {
      answer = range.calls;
      answerLive = crossed === 0;
      break;
    }
    crossed += 1;
    if (crossed > 1) break;
    range = openRange();
  }
  const calls = answer ?? range.calls;
  const newest = answer === void 0 ? crossed === 0 : answerLive;
  return {
    current: summarize(calls, live && newest),
    ...latestText === void 0 ? {} : { text: truncateText(latestText) },
    ...lastEventTime === void 0 ? {} : { lastEventTime }
  };
}

// src/subagent-live-route.ts
function buildSubagentLiveApi(ctx) {
  return {
    async live(payload) {
      const rootSessionId = requireString(payload, "rootSessionId");
      const subagents = ctx.get("subagents");
      if (subagents === void 0 || typeof subagents.listDescendants !== "function") {
        throw new SidebarError(
          "subagents-unavailable",
          "the subagent service is not mounted in this deployment",
          503
        );
      }
      let descendants;
      try {
        descendants = await subagents.listDescendants(rootSessionId);
      } catch (error) {
        throw new SidebarError(
          "subagents-unavailable",
          `subagent catalog read failed: ${error instanceof Error ? error.message : String(error)}`,
          503
        );
      }
      const live = {};
      const foldInto = (sessionId, running) => {
        const view = running === void 0 ? {} : { running };
        try {
          const events = ctx.sessions.get(sessionId)?.snapshotEvents() ?? [];
          const fold = foldProcess(events, { live: running !== false });
          if (fold.current.counts.length > 0 || fold.current.running !== void 0) {
            view.summary = fold.current;
          }
          if (fold.text !== void 0) view.text = fold.text;
          if (fold.lastEventTime !== void 0) view.lastEventTime = fold.lastEventTime;
        } catch {
        }
        live[sessionId] = view;
      };
      foldInto(rootSessionId, void 0);
      for (const entry of descendants) {
        if (entry.kind !== "child") continue;
        if (entry.label?.startsWith(SIDE_LABEL_PREFIX) ?? false) continue;
        foldInto(entry.id, entry.activity === "running");
      }
      return { live };
    }
  };
}

// src/team-routes.ts
var TASK_ACTIONS = /* @__PURE__ */ new Set([
  "claim",
  "release",
  "edit",
  "set_dependencies",
  "complete",
  "reopen",
  "reassign",
  "delete"
]);
var STALE_REVISION_CODE = "TEAM_TASK_STALE_REVISION";
function stringArrayOf(value) {
  if (!Array.isArray(value)) return void 0;
  const out = value.filter((item) => typeof item === "string");
  return out.length === value.length ? out : void 0;
}
function errorCodeOf(error) {
  if (typeof error !== "object" || error === null) return void 0;
  const code = error.code;
  return typeof code === "string" ? code : void 0;
}
function buildTeamsApi(ctx) {
  const teams = ctx.get("agentTeams");
  const agents = ctx.get("agents");
  const membershipOf = async (payload) => {
    if (teams === void 0) {
      throw new SidebarError("team-error", "the agent-teams layer is not mounted in this deployment", 503);
    }
    const rootSessionId = requireString(payload, "rootSessionId");
    const agent = agents?.get(rootSessionId);
    if (agent === void 0) {
      throw new SidebarError("team-error", "the tree root is not live in this process", 404);
    }
    try {
      if (teams.tryMembership(agent) === void 0) {
        throw new SidebarError("team-error", "the tree root leads no team", 404);
      }
    } catch (error) {
      if (error instanceof SidebarError) throw error;
      throw new SidebarError("team-error", error instanceof Error ? error.message : String(error), 404);
    }
    return { svc: teams, agent };
  };
  const serviceError = (error) => {
    const message = error instanceof Error ? error.message : String(error);
    return errorCodeOf(error) === STALE_REVISION_CODE ? new SidebarError("team-conflict", message, 409) : new SidebarError("team-error", message, 400);
  };
  return {
    async taskCreate(payload) {
      const membership = await membershipOf(payload);
      const record = payload;
      const blockedBy = stringArrayOf(record.blockedBy);
      const writeScopes = stringArrayOf(record.writeScopes);
      const req = {
        subject: requireString(payload, "subject"),
        description: typeof record.description === "string" ? record.description : "",
        ...blockedBy !== void 0 ? { blockedBy } : {},
        ...writeScopes !== void 0 ? { writeScopes } : {}
      };
      try {
        return { ok: true, value: await membership.svc.createTask(membership.agent, req) };
      } catch (error) {
        throw serviceError(error);
      }
    },
    async taskUpdate(payload) {
      const membership = await membershipOf(payload);
      const record = payload;
      const expectedRevision = record.expectedRevision;
      if (typeof expectedRevision !== "number" || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
        throw new SidebarError("bad-request", 'missing or invalid "expectedRevision"');
      }
      const action = record.action;
      if (typeof action !== "string" || !TASK_ACTIONS.has(action)) {
        throw new SidebarError("bad-request", 'missing or invalid "action"');
      }
      const blockedBy = stringArrayOf(record.blockedBy);
      const writeScopes = stringArrayOf(record.writeScopes);
      const req = {
        taskId: requireString(payload, "taskId"),
        expectedRevision,
        action,
        ...typeof record.subject === "string" ? { subject: record.subject } : {},
        ...typeof record.description === "string" ? { description: record.description } : {},
        ...blockedBy !== void 0 ? { blockedBy } : {},
        ...writeScopes !== void 0 ? { writeScopes } : {},
        ...typeof record.owner === "string" ? { owner: record.owner } : {}
      };
      try {
        return { ok: true, value: await membership.svc.updateTask(membership.agent, req) };
      } catch (error) {
        throw serviceError(error);
      }
    }
  };
}

// src/workflow-runs.ts
var EVENT_PREFIX = "tool-workflow/";
function foldWorkflowRuns(events, originSessionId) {
  const runs = [];
  const byRunId = /* @__PURE__ */ new Map();
  for (const event of events) {
    if (!event.type.startsWith(EVENT_PREFIX)) continue;
    const data = event.data;
    switch (event.type) {
      case "tool-workflow/run-start": {
        const runId = typeof data.runId === "string" ? data.runId : void 0;
        if (runId === void 0 || byRunId.has(runId)) break;
        const fold = {
          view: {
            runId,
            name: typeof data.name === "string" && data.name !== "" ? data.name : runId,
            originSessionId,
            status: "running",
            phases: [],
            startedSeq: event.seq,
            startedAt: event.time
          },
          memberBySeq: /* @__PURE__ */ new Map()
        };
        byRunId.set(runId, fold);
        runs.push(fold);
        break;
      }
      case "tool-workflow/agent-start": {
        const fold = runOf(data, byRunId);
        const seq = seqOf(data);
        if (fold === void 0 || seq === void 0 || fold.memberBySeq.has(seq)) break;
        const member = {
          seq,
          label: typeof data.label === "string" && data.label !== "" ? data.label : `#${seq}`,
          ...typeof data.phase === "string" ? { phase: data.phase } : {},
          childId: typeof data.childId === "string" ? data.childId : ""
        };
        fold.memberBySeq.set(seq, member);
        let phase = fold.view.phases.find((candidate) => candidate.title === member.phase);
        if (phase === void 0) {
          phase = member.phase === void 0 ? { members: [] } : { title: member.phase, members: [] };
          fold.view.phases.push(phase);
        }
        phase.members.push(member);
        break;
      }
      case "tool-workflow/agent-end": {
        const fold = runOf(data, byRunId);
        const seq = seqOf(data);
        const member = fold?.memberBySeq.get(seq ?? -1);
        if (member === void 0) break;
        const outcome = data.outcome;
        if (outcome === "completed" || outcome === "failed" || outcome === "cancelled") {
          member.outcome = outcome;
        }
        break;
      }
      case "tool-workflow/run-end": {
        const fold = runOf(data, byRunId);
        if (fold === void 0) break;
        const stopReason = data.stopReason;
        if (stopReason === "completed" || stopReason === "cancelled" || stopReason === "error") {
          fold.view.stopReason = stopReason;
          fold.view.status = stopReason === "error" ? "failed" : stopReason;
        } else {
          fold.view.status = "failed";
        }
        fold.view.finishedAt = event.time;
        break;
      }
      default:
        break;
    }
  }
  return runs.map((fold) => fold.view);
}
function runOf(data, byRunId) {
  const runId = data.runId;
  return typeof runId === "string" ? byRunId.get(runId) : void 0;
}
function seqOf(data) {
  const seq = data.seq;
  return typeof seq === "number" && Number.isSafeInteger(seq) && seq >= 0 ? seq : void 0;
}

// src/workflow-routes.ts
var MIRROR_MAX_ENTRIES = 500;
function createWorkflowEventMirror(ctx) {
  const perSession = /* @__PURE__ */ new Map();
  if (typeof ctx.on !== "function") {
    return { entries: () => [] };
  }
  const dispose = ctx.on("session/event", (session, event) => {
    const sessionId = session?.id;
    if (typeof sessionId !== "string" || !event.type.startsWith("tool-workflow/")) return;
    let list = perSession.get(sessionId);
    if (list === void 0) perSession.set(sessionId, list = []);
    const minimal = {
      type: event.type,
      seq: event.seq,
      time: event.time,
      data: event.data
    };
    list.push(minimal);
    if (list.length > MIRROR_MAX_ENTRIES) {
      list.splice(0, list.length - MIRROR_MAX_ENTRIES);
    }
  });
  ctx.effect(() => dispose, "dsh-better-sidebar: workflow event mirror");
  return { entries: (sessionId) => perSession.get(sessionId) ?? [] };
}
function buildWorkflowsApi(ctx) {
  const mirror = createWorkflowEventMirror(ctx);
  const treeSessionIds = async (rootSessionId) => {
    const subagents = ctx.get("subagents");
    if (subagents === void 0 || typeof subagents.listDescendants !== "function") {
      return [rootSessionId];
    }
    try {
      const descendants = await subagents.listDescendants(rootSessionId);
      return [rootSessionId, ...descendants.map((entry) => entry.id)];
    } catch {
      return [rootSessionId];
    }
  };
  return {
    async list(payload) {
      const rootSessionId = requireString(payload, "rootSessionId");
      const runs = [];
      for (const sessionId of await treeSessionIds(rootSessionId)) {
        try {
          const bySeq = /* @__PURE__ */ new Map();
          for (const event of ctx.sessions.get(sessionId)?.snapshotEvents() ?? []) {
            if (event.type.startsWith("tool-workflow/")) bySeq.set(event.seq, event);
          }
          for (const event of mirror.entries(sessionId)) bySeq.set(event.seq, event);
          if (bySeq.size === 0) continue;
          const ordered = [...bySeq.values()].sort((left, right) => left.seq - right.seq);
          runs.push(...foldWorkflowRuns(ordered, sessionId));
        } catch {
        }
      }
      runs.sort((left, right) => left.startedSeq - right.startedSeq);
      return { runs };
    }
  };
}

// src/sidechat-routes.ts
import { randomUUID as randomUUID5 } from "node:crypto";
import { createUserMessage, ReasoningEffortId } from "file:///E:/DSH/%E6%9C%AC%E4%BD%93/resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-llm/lib/index.js";
import {
  installModelSelection
} from "file:///E:/DSH/%E6%9C%AC%E4%BD%93/resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-agent/lib/index.js";
import { snapshotSubagentDescriptor } from "file:///E:/DSH/%E6%9C%AC%E4%BD%93/resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-subagent/lib/index.js";

// src/session-store.ts
async function readPersistedSession(persistence, sessionId) {
  const handle = await persistence.open(sessionId, "read");
  try {
    const { events } = await handle.read();
    return {
      header: handle.header,
      events,
      inheritedEventCount: handle.inheritedEventCount ?? 0
    };
  } finally {
    await handle.close();
  }
}
async function readPersistedSessionOf(ctx, sessionId) {
  const persistence = ctx.get("sessionPersistence");
  if (persistence === void 0) return void 0;
  try {
    return await readPersistedSession(persistence, sessionId);
  } catch {
    return void 0;
  }
}

// src/sidechat-routes.ts
var CREATE_TIMEOUT_MS = 15e3;
var EVENTS_CAP = 8e3;
var threadDisposers = /* @__PURE__ */ new Map();
var pendingSnapshots = /* @__PURE__ */ new Map();
var threadModelRefs = /* @__PURE__ */ new Map();
async function composeChildSetup(ctx, presetId) {
  const presets = ctx.get("agentPresets");
  if (presets === void 0) {
    return { setup: () => Promise.resolve() };
  }
  const resolved = await presets.resolve(presetId);
  return {
    agentPreset: resolved.id,
    setup: async (agentCtx) => {
      await presets.mount(agentCtx, resolved.id);
    }
  };
}
async function composePersistedSetup(ctx, childId) {
  const persistence = ctx.get("sessionPersistence");
  if (persistence === void 0) {
    return () => Promise.resolve();
  }
  const inspected = await readPersistedSession(persistence, childId);
  const presetId = resolvePresetId(inspected.header, inspected.events);
  const presets = ctx.get("agentPresets");
  if (presets === void 0 || presetId === void 0) {
    return () => Promise.resolve();
  }
  const resolved = await presets.resolve(presetId);
  return async (agentCtx) => {
    await presets.mount(agentCtx, resolved.id);
  };
}
function textPrompt(text) {
  return [{ type: "text", text }];
}
function admitFollowup(agent, blocks) {
  const message = createUserMessage({ content: blocks, source: { kind: "user" } });
  agent.followup(message);
}
function admitFirstContact(agent, injectionText, question) {
  agent.inject(createUserMessage({
    content: textPrompt(injectionText),
    source: { kind: SIDE_INJECTION_SOURCE_KIND }
  }));
  admitFollowup(agent, textPrompt(question));
}
function liveThreadAgent(ctx, childId) {
  const agents = ctx.get("agents");
  return agents?.get(childId);
}
var COLD_LOG_MEMO_MAX = 16;
var coldLogMemo = /* @__PURE__ */ new Map();
async function readColdThreadLog(persistence, childId) {
  const identity = await storedIdentityOf(persistence, childId);
  if (identity === void 0) {
    return (await readPersistedSession(persistence, childId)).events;
  }
  const key = `${childId}\0${identity}`;
  const hit = coldLogMemo.get(key);
  if (hit !== void 0) {
    coldLogMemo.delete(key);
    coldLogMemo.set(key, hit);
    return hit;
  }
  const events = (await readPersistedSession(persistence, childId)).events;
  const prefix = `${childId}\0`;
  for (const existing of coldLogMemo.keys()) {
    if (existing.startsWith(prefix)) coldLogMemo.delete(existing);
  }
  coldLogMemo.set(key, events);
  while (coldLogMemo.size > COLD_LOG_MEMO_MAX) {
    const oldest = coldLogMemo.keys().next().value;
    if (oldest === void 0) break;
    coldLogMemo.delete(oldest);
  }
  return events;
}
async function storedIdentityOf(persistence, childId) {
  const stat9 = persistence.stat;
  if (typeof stat9 !== "function") return void 0;
  try {
    const snapshot = await stat9.call(persistence, childId);
    if (snapshot === void 0) return void 0;
    return `${String(snapshot.revision ?? "")}\0${String(snapshot.sizeBytes ?? "")}`;
  } catch {
    return void 0;
  }
}
async function threadLogEvents(ctx, childId) {
  const agent = liveThreadAgent(ctx, childId);
  if (agent !== void 0) {
    return agent.session.snapshotEvents();
  }
  const persistence = ctx.get("sessionPersistence");
  if (persistence === void 0) {
    throw new SidebarError("sidechat-error", "the session persistence service is unavailable", 503);
  }
  try {
    return await readColdThreadLog(persistence, childId);
  } catch (error) {
    throw new SidebarError(
      "not-found",
      `thread "${childId}" is not available: ${error instanceof Error ? error.message : String(error)}`,
      404
    );
  }
}
function pendingOf(agent) {
  try {
    return pendingInputs(agent.inbox.nextStep, agent.inbox.nextTurn);
  } catch {
    return [];
  }
}
function boundaryPending(agent) {
  try {
    for (const message of [...agent.inbox.nextStep, ...agent.inbox.nextTurn]) {
      if (messageLeadTextOf(message).startsWith(SIDE_BOUNDARY_PREFIX)) return true;
    }
  } catch {
  }
  return false;
}
function messageLeadTextOf(message) {
  const content = message?.content;
  const first = Array.isArray(content) ? content[0] : content;
  if (typeof first === "string") return first;
  if (first !== null && typeof first === "object" && "text" in first) return String(first.text);
  return "";
}
function dropInheritedGhosts(agent) {
  const log2 = agent.session.snapshotEvents();
  const ghosts = new Set(inheritedPendingIds(log2, Number(agent.session.inheritedEventCount)));
  if (ghosts.size === 0) return 0;
  let removed = 0;
  for (const message of [...agent.inbox.nextStep, ...agent.inbox.nextTurn]) {
    const id = pendingInputId(message);
    if (id === void 0 || !ghosts.has(id)) continue;
    if (agent.inbox.remove(id)) removed++;
  }
  return removed;
}
function selectionOf(agent) {
  const logged = effectiveModelSelection(
    agent.session.snapshotEvents()
  );
  if (logged !== void 0) return logged;
  const { provider, model, reasoningEffort } = agent.options;
  if (provider === void 0 || model === void 0) return void 0;
  return {
    provider,
    model,
    ...reasoningEffort === void 0 ? {} : { reasoningEffort: String(reasoningEffort) }
  };
}
function brandedSelection(selection) {
  return {
    provider: selection.provider,
    model: selection.model,
    ...selection.reasoningEffort === void 0 ? {} : { reasoningEffort: ReasoningEffortId(selection.reasoningEffort) }
  };
}
function ensureModelSelection(agent, childId) {
  const existing = threadModelRefs.get(childId);
  if (existing !== void 0) return existing;
  const selection = selectionOf(agent);
  const ref = {
    current: selection === void 0 ? void 0 : brandedSelection(selection),
    assembled: void 0
  };
  installModelSelection(agent.ctx, ref);
  threadModelRefs.set(childId, ref);
  return ref;
}
async function ensureLiveThread(ctx, childId) {
  const live = liveThreadAgent(ctx, childId);
  if (live !== void 0) return live;
  const agents = ctx.get("agents");
  if (agents?.resume === void 0) {
    throw new SidebarError("sidechat-error", "the agents service is unavailable", 503);
  }
  const setup = await composePersistedSetup(ctx, childId);
  try {
    const handle = await agents.resume({ resumeSessionId: childId, setup });
    threadDisposers.set(childId, () => handle.dispose());
    dropInheritedGhosts(handle.agent);
    ensureModelSelection(handle.agent, childId);
    return handle.agent;
  } catch (error) {
    throw new SidebarError(
      "sidechat-error",
      `thread resume failed: ${error instanceof Error ? error.message : String(error)}`,
      500
    );
  }
}
async function normalizeSelection(ctx, requested) {
  const llm = ctx.get("llm");
  if (llm?.resolveCallConfig === void 0) return requested;
  let resolved;
  try {
    resolved = await llm.resolveCallConfig({
      provider: requested.provider,
      model: requested.model,
      ...requested.reasoningEffort === void 0 ? {} : { reasoningEffort: ReasoningEffortId(requested.reasoningEffort) }
    });
  } catch (error) {
    throw new SidebarError(
      "bad-request",
      `model "${requested.provider}/${requested.model}" is unavailable: ${error instanceof Error ? error.message : String(error)}`,
      400
    );
  }
  const provider = typeof resolved?.provider === "string" ? resolved.provider : requested.provider;
  const model = typeof resolved?.model === "string" ? resolved.model : requested.model;
  const effort = resolved?.reasoningEffort === void 0 ? void 0 : String(resolved.reasoningEffort);
  return { provider, model, ...effort === void 0 ? {} : { reasoningEffort: effort } };
}
async function modelCatalogOf(ctx) {
  const service = ctx.get("sessionController");
  if (service?.modelCatalog === void 0) {
    return { available: false, groups: [], failures: [] };
  }
  try {
    const catalog = await service.modelCatalog();
    return {
      available: true,
      ...catalog?.default === void 0 ? {} : { default: catalog.default },
      groups: catalog?.groups ?? [],
      failures: catalog?.failures ?? []
    };
  } catch (error) {
    return {
      available: false,
      groups: [],
      failures: [{ id: "host", message: error instanceof Error ? error.message : String(error) }]
    };
  }
}
function buildSidechatApi(ctx, live) {
  return {
    "sidechat.start": async (payload) => {
      const sessionId = requireString(payload, "sessionId");
      const rawQuestion = payload.question;
      const question = typeof rawQuestion === "string" ? rawQuestion.trim() : "";
      const parent = liveThreadAgent(ctx, sessionId);
      if (parent === void 0) {
        throw new SidebarError("sidechat-error", `parent session "${sessionId}" is not running`, 409);
      }
      const parentSession = parent.session;
      const workingDirectory = ctx.get("workingDirectory");
      const parentCwd = workingDirectory?.get(parentSession) ?? parentSession.header.cwd;
      const parentSelection = parentModelSelection(
        parentSession.snapshotEvents()
      );
      const routeProvider = parentSelection?.provider ?? parent.options.provider;
      const routeModel = parentSelection?.model ?? parent.options.model;
      const inheritance = buildSidechatInheritance(
        parentSession.snapshotEvents(),
        live?.chunksFor(sessionId) ?? []
      );
      const { agentPreset, setup } = await composeChildSetup(
        ctx,
        resolvePresetId(parentSession.header, parentSession.snapshotEvents())
      );
      const childId = `session-${randomUUID5()}`;
      const label = question === "" ? SIDE_NEW_THREAD_TITLE : sideLabel(question);
      const descriptor = snapshotSubagentDescriptor({
        mode: "continuable",
        provider: "sidechat",
        label,
        ...routeProvider === void 0 ? {} : { agentProvider: routeProvider },
        ...routeModel === void 0 ? {} : { agentModel: routeModel }
      });
      const directorySeed = workingDirectory === void 0 ? [] : [{
        type: "working-directory/change",
        seq: inheritance.seed.length,
        time: Date.now(),
        data: { cwd: parentCwd }
      }];
      const descriptorEvent = {
        type: "subagent/descriptor",
        seq: inheritance.seed.length + directorySeed.length,
        time: Date.now(),
        data: descriptor
      };
      const seed = [...inheritance.seed, ...directorySeed, descriptorEvent];
      const targetEffort = parentSelection !== void 0 ? parentSelection.reasoningEffort === void 0 ? void 0 : ReasoningEffortId(parentSelection.reasoningEffort) : parent.options.reasoningEffort;
      const childAgentOptions = {
        ...parent.options,
        ...routeProvider === void 0 ? {} : { provider: routeProvider },
        ...routeModel === void 0 ? {} : { model: routeModel }
      };
      if (targetEffort !== void 0) {
        childAgentOptions.reasoningEffort = targetEffort;
      } else {
        delete childAgentOptions.reasoningEffort;
      }
      const options = {
        sessionId: childId,
        meta: {
          ...parentCwd === void 0 ? {} : { cwd: parentCwd },
          parentSession: parentSession.id,
          isSeeded: true,
          origin: "subagent",
          delegationDepth: (parentSession.header.delegationDepth ?? 0) + 1,
          ...agentPreset === void 0 ? {} : { agentPreset }
        },
        seed,
        // Branded number, compile-time only: DSH Desktop's plugin-facing
        // `@deepseek-ai/dsh-session` surface carries the type but not the runtime
        // stamp, so importing the value aborts the whole host half at load time.
        // `Array#length` is a non-negative safe integer by construction — exactly
        // what the upstream stamp asserts — so the cast is lossless here.
        inheritedEventCount: seed.length,
        agentOptions: childAgentOptions,
        setup,
        signal: AbortSignal.timeout(CREATE_TIMEOUT_MS)
      };
      const agents = ctx.get("agents");
      if (agents?.create === void 0) {
        throw new SidebarError("sidechat-error", "the agents service is unavailable", 503);
      }
      let handle;
      try {
        handle = await agents.create(options);
      } catch (error) {
        throw new SidebarError("sidechat-error", `thread creation failed: ${error instanceof Error ? error.message : String(error)}`, 500);
      }
      threadDisposers.set(childId, () => handle.dispose());
      handle.agent.inbox.clear();
      ensureModelSelection(handle.agent, childId);
      const titles = ctx.get("sessionTitle");
      const pinTitle = (label2) => {
        if (titles === void 0) return;
        try {
          titles.rename(handle.agent.session, label2);
        } catch {
        }
      };
      if (question === "") {
        if (inheritance.snapshot !== null) pendingSnapshots.set(childId, inheritance.snapshot);
        pinTitle(SIDE_NEW_THREAD_TITLE);
      } else {
        const promptParts = [SIDE_BOUNDARY_PROMPT];
        if (inheritance.snapshot !== null) promptParts.push(inheritance.snapshot);
        admitFirstContact(handle.agent, promptParts.join("\n\n"), question);
        pinTitle(sideLabel(question));
      }
      return { childId };
    },
    "sidechat.prompt": async (payload) => {
      const childId = requireString(payload, "childId");
      const text = requireString(payload, "text").trim();
      if (text === "") {
        throw new SidebarError("bad-request", "text is required");
      }
      const agent = await ensureLiveThread(ctx, childId);
      if (boundaryDelivered(agent.session.snapshotEvents()) || boundaryPending(agent)) {
        admitFollowup(agent, textPrompt(text));
      } else {
        const parts = [SIDE_BOUNDARY_PROMPT];
        const snapshot = pendingSnapshots.get(childId);
        pendingSnapshots.delete(childId);
        if (snapshot !== void 0) parts.push(snapshot);
        admitFirstContact(agent, parts.join("\n\n"), text);
        const titles = ctx.get("sessionTitle");
        if (titles !== void 0) {
          try {
            titles.rename(agent.session, sideLabel(text));
          } catch {
          }
        }
      }
      return { accepted: true };
    },
    "sidechat.cancel": async (payload) => {
      const childId = requireString(payload, "childId");
      const agent = liveThreadAgent(ctx, childId);
      if (agent !== void 0) {
        agent.cancel({ kind: "user" }, { keepInbox: true });
      }
      return { accepted: true };
    },
    "sidechat.dispose": async (payload) => {
      const childId = requireString(payload, "childId");
      pendingSnapshots.delete(childId);
      threadModelRefs.delete(childId);
      const dispose = threadDisposers.get(childId);
      if (dispose !== void 0) {
        threadDisposers.delete(childId);
        try {
          await dispose();
        } catch {
        }
      }
      return { accepted: true };
    },
    "sidechat.info": async (payload) => {
      const childId = requireString(payload, "childId");
      const agent = liveThreadAgent(ctx, childId);
      if (agent !== void 0) {
        const preset = agent.session.header.agentPreset;
        const selection = selectionOf(agent);
        return {
          live: true,
          status: agent.status,
          ...selection === void 0 ? {} : selectionFields(selection),
          ...preset === void 0 ? {} : { preset }
        };
      }
      const persistence = ctx.get("sessionPersistence");
      if (persistence !== void 0) {
        try {
          const inspected = await readPersistedSession(persistence, childId);
          const preset = resolvePresetId(inspected.header, inspected.events);
          const selection = effectiveModelSelection(inspected.events);
          return {
            live: false,
            ...preset === void 0 ? {} : { preset },
            ...selection === void 0 ? {} : selectionFields(selection)
          };
        } catch {
        }
      }
      return { live: false };
    },
    "sidechat.events": async (payload) => {
      const childId = requireString(payload, "childId");
      const rawAfter = payload.afterSeq;
      if (rawAfter !== void 0 && (typeof rawAfter !== "number" || !Number.isSafeInteger(rawAfter) || rawAfter < 0)) {
        throw new SidebarError("bad-request", "afterSeq must be a non-negative integer");
      }
      const events = await threadLogEvents(ctx, childId);
      const own = threadOwnLogEvents(events);
      const fresh = rawAfter === void 0 ? own : own.filter((event) => event.seq > rawAfter);
      const tailSeq = own.at(-1)?.seq ?? -1;
      const agent = liveThreadAgent(ctx, childId);
      return {
        events: fresh.length > EVENTS_CAP ? fresh.slice(fresh.length - EVENTS_CAP) : fresh,
        // The live rows ride every poll: they are process-local, so there is
        // no durable seq to page them by. An idle thread has none.
        live: liveEventsOf(live?.chunksFor(childId) ?? [], tailSeq),
        // Accepted-but-unclaimed input, so the transcript can show it as
        // pending (with a dequeue affordance) instead of looking dead until a
        // claim logs the durable `user/message`. A cold thread has none.
        pending: agent === void 0 ? [] : pendingOf(agent)
      };
    },
    "sidechat.dequeue": async (payload) => {
      const childId = requireString(payload, "childId");
      const rawId = payload.messageId;
      if (rawId !== void 0 && (typeof rawId !== "string" || rawId === "")) {
        throw new SidebarError("bad-request", "messageId must be a non-empty string");
      }
      const agent = liveThreadAgent(ctx, childId);
      if (agent === void 0) return { accepted: true, removed: 0 };
      if (rawId === void 0) {
        const queued = pendingOf(agent).length;
        agent.inbox.clear();
        return { accepted: true, removed: queued };
      }
      return { accepted: true, removed: agent.inbox.remove(rawId) ? 1 : 0 };
    },
    "sidechat.models": async () => modelCatalogOf(ctx),
    "sidechat.model": async (payload) => {
      const childId = requireString(payload, "childId");
      const provider = requireString(payload, "provider");
      const model = requireString(payload, "model");
      const rawEffort = payload.reasoningEffort;
      if (rawEffort !== void 0 && (typeof rawEffort !== "string" || rawEffort === "")) {
        throw new SidebarError("bad-request", "reasoningEffort must be a non-empty string");
      }
      const requested = {
        provider,
        model,
        ...rawEffort === void 0 ? {} : { reasoningEffort: rawEffort }
      };
      const selection = await normalizeSelection(ctx, requested);
      const agent = await ensureLiveThread(ctx, childId);
      agent.session.append("model/selection", brandedSelection(selection));
      ensureModelSelection(agent, childId).current = brandedSelection(selection);
      return { accepted: true, selection };
    }
  };
}
function selectionFields(selection) {
  return {
    provider: selection.provider,
    model: selection.model,
    ...selection.reasoningEffort === void 0 ? {} : { reasoningEffort: selection.reasoningEffort }
  };
}

// src/assistant-live.ts
var LIVE_CHUNK_CAP = 4e3;
var LIVE_SESSION_CAP = 64;
function chunkOf(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
function countOf(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : void 0;
}
function createAssistantLiveBuffer(ctx, cap = LIVE_CHUNK_CAP) {
  const attempts = /* @__PURE__ */ new Map();
  const off = ctx.on("agent/assistant-stream", (payload) => {
    const record = payload;
    const frame = record?.frame;
    if (frame === void 0) return;
    const session = record?.agent?.session;
    const sessionId = typeof session?.id === "string" ? session.id : void 0;
    if (sessionId === void 0) return;
    const type = frame["type"];
    if (type === "end") {
      attempts.delete(sessionId);
      return;
    }
    const attemptId = typeof frame["attemptId"] === "string" ? frame.attemptId : void 0;
    if (attemptId === void 0) return;
    if (type === "start") {
      const turn = countOf(frame["turn"]);
      const step = countOf(frame["step"]);
      if (turn === void 0 || step === void 0) return;
      const known = attempts.has(sessionId);
      attempts.delete(sessionId);
      if (!known && attempts.size >= LIVE_SESSION_CAP) {
        const oldest = attempts.keys().next().value;
        if (oldest !== void 0) attempts.delete(oldest);
      }
      attempts.set(sessionId, { attemptId, turn, step, chunks: [], nextIndex: 0 });
      return;
    }
    if (type !== "chunk") return;
    const attempt = attempts.get(sessionId);
    if (attempt === void 0 || attempt.attemptId !== attemptId) return;
    const index = countOf(frame["index"]);
    const chunk = chunkOf(frame["chunk"]);
    if (index === void 0 || chunk === void 0 || index !== attempt.nextIndex) {
      attempts.delete(sessionId);
      return;
    }
    attempt.nextIndex = index + 1;
    const time = countOf(frame["time"]) ?? 0;
    attempt.chunks.push({ attemptId, turn: attempt.turn, step: attempt.step, index, time, chunk });
    if (attempt.chunks.length > cap) attempt.chunks.splice(0, attempt.chunks.length - cap);
  });
  return {
    chunksFor: (sessionId) => attempts.get(sessionId)?.chunks ?? [],
    dispose: () => {
      off();
    }
  };
}

// src/changes-ops.ts
var EVENTS_CAP2 = 4e3;
var WAIT_MS = 25e3;
function isFileToolEvent(event) {
  return event.type === "tool/call" || event.type === "tool/result" || event.type === "tool/ptc-dispatch-start" || event.type === "tool/ptc-dispatch";
}
function createChangesOpsApi(ctx) {
  return async (payload, signal) => {
    const sessionId = requireString(payload, "sessionId");
    const record = payload;
    const rawAfter = record.afterSeq;
    if (rawAfter !== void 0 && (typeof rawAfter !== "number" || !Number.isSafeInteger(rawAfter) || rawAfter < -1)) {
      throw new SidebarError("bad-request", "afterSeq must be an integer of at least -1");
    }
    if (record.wait !== void 0 && typeof record.wait !== "boolean") {
      throw new SidebarError("bad-request", "wait must be a boolean");
    }
    const afterSeq = rawAfter ?? -1;
    const readWindow = async () => {
      let events = ctx.sessions.get(sessionId)?.snapshotEvents();
      if (events === void 0) {
        const persistence = ctx.get("sessionPersistence");
        if (persistence !== void 0) {
          try {
            events = (await readPersistedSession(persistence, sessionId)).events;
          } catch {
          }
        }
      }
      const filtered = (events ?? []).filter((event) => isFileToolEvent(event) && event.seq > afterSeq);
      const window = filtered.length > EVENTS_CAP2 ? filtered.slice(-EVENTS_CAP2) : filtered;
      return { events: window, lastSeq: window.at(-1)?.seq ?? afterSeq };
    };
    if (record.wait !== true) return readWindow();
    const pending2 = [];
    let wake;
    const notified = new Promise((resolve6) => {
      wake = resolve6;
    });
    const dispose = ctx.on("session/event", (session, event) => {
      const minimal = {
        type: event.type,
        seq: event.seq,
        time: event.time,
        data: event.data
      };
      if (session?.id !== sessionId || !isFileToolEvent(minimal) || minimal.seq <= afterSeq) return;
      pending2.push(minimal);
      if (pending2.length > EVENTS_CAP2) pending2.shift();
      wake?.();
    });
    const timer = setTimeout(() => wake?.(), WAIT_MS);
    const abort = () => {
      wake?.();
    };
    signal?.addEventListener("abort", abort, { once: true });
    try {
      const initial = await readWindow();
      if (initial.events.length > 0 || signal?.aborted === true) return initial;
      await notified;
      const current = await readWindow();
      if (pending2.length === 0) return current;
      const merged = new Map(current.events.map((event) => [event.seq, event]));
      for (const event of pending2) merged.set(event.seq, event);
      const events = [...merged.values()].sort((left, right) => left.seq - right.seq).slice(-EVENTS_CAP2);
      return { events, lastSeq: events.at(-1)?.seq ?? afterSeq };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      dispose();
    }
  };
}

// src/index.ts
import { BlockAssembler, createUserMessage as createUserMessage2 } from "file:///E:/DSH/%E6%9C%AC%E4%BD%93/resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-llm/lib/index.js";

// src/commit-message.ts
var SUGGEST_DIFF_LIMIT = 12e3;
function normalizeLanguage(value) {
  return value === "zh" ? "zh" : "en";
}
function truncateDiff(diff2) {
  if (diff2.length <= SUGGEST_DIFF_LIMIT) return diff2;
  return `${diff2.slice(0, SUGGEST_DIFF_LIMIT)}
...(diff truncated)`;
}
function parseModelRoute(value) {
  if (typeof value !== "string") return void 0;
  const trimmed = value.trim();
  const slash = trimmed.indexOf("/");
  if (slash <= 0 || slash === trimmed.length - 1) return void 0;
  const provider = trimmed.slice(0, slash).trim();
  const model = trimmed.slice(slash + 1).trim();
  if (provider === "" || model === "") return void 0;
  return { provider, model };
}
var MODEL_ROUTE_HISTORY_LIMIT = 20;
function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return "";
}
function providerEntryOf(entry) {
  if (entry === null || typeof entry !== "object") return void 0;
  const record = entry;
  const provider = firstString(record.provider, record.route, record.id);
  if (provider === "") return void 0;
  const label = firstString(record.name, record.displayName, record.label, record.title, provider);
  return { provider, label };
}
function modelEntryOf(entry) {
  if (entry === null || typeof entry !== "object") return void 0;
  const record = entry;
  const id = firstString(record.id, record.model, record.name);
  if (id === "") return void 0;
  return { id, name: firstString(record.name, record.displayName, record.label, record.title, id) };
}
var REASONING_LEVEL_ORDER = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
function lowestReasoningEffortOf(efforts) {
  if (!Array.isArray(efforts)) return void 0;
  const ids = [];
  for (const entry of efforts) {
    const id = entry !== null && typeof entry === "object" ? entry.id : void 0;
    if (typeof id === "string" && id !== "") ids.push(id);
  }
  let best;
  let bestRank = Number.POSITIVE_INFINITY;
  for (const id of ids) {
    const rank = REASONING_LEVEL_ORDER.indexOf(id);
    if (rank < 0) continue;
    if (rank < bestRank) {
      best = id;
      bestRank = rank;
    }
  }
  return best ?? ids[0];
}
function defaultRouteOf(selection) {
  if (selection === null || typeof selection !== "object") return void 0;
  const record = selection;
  const provider = firstString(record.provider);
  const model = firstString(record.model);
  if (provider === "" || model === "") return void 0;
  return { provider, model };
}
function collectModelRoutes(events, limit = MODEL_ROUTE_HISTORY_LIMIT) {
  const routes = [];
  const seen = /* @__PURE__ */ new Set();
  for (let index = events.length - 1; index >= 0 && routes.length < limit; index--) {
    const event = events[index];
    if (event === void 0 || event.type !== "request/header") continue;
    const config = event.data?.header?.config;
    if (config === null || typeof config !== "object") continue;
    const provider = config.provider;
    const model = config.model;
    if (typeof provider !== "string" || provider === "") continue;
    if (typeof model !== "string" || model === "") continue;
    const key = `${provider}/${model}`;
    if (seen.has(key)) continue;
    seen.add(key);
    routes.push({ provider, model });
  }
  return routes;
}
function buildCommitPrompt(language, files, diff2) {
  const fileList = files.join("\n");
  if (language === "zh") {
    return {
      system: "\u4F60\u662F git \u63D0\u4EA4\u4FE1\u606F\u751F\u6210\u52A9\u624B\u3002\u6839\u636E\u7ED9\u5B9A\u7684\u6587\u4EF6\u6E05\u5355\u4E0E\u5DEE\u5F02\uFF0C\u751F\u6210\u4E00\u884C Conventional Commits \u98CE\u683C\u7684\u4E2D\u6587\u63D0\u4EA4\u4FE1\u606F\uFF08\u7C7B\u578B\u524D\u7F00\uFF1Afeat/fix/refactor/chore/docs/test/perf/style\uFF0C\u5FC5\u8981\u65F6\u53EF\u9644\u7B80\u77ED\u6B63\u6587\uFF09\u3002\u53EA\u8F93\u51FA\u63D0\u4EA4\u4FE1\u606F\u672C\u8EAB\uFF0C\u4E0D\u8981\u89E3\u91CA\u3002",
      user: `\u6539\u52A8\u7684\u6587\u4EF6\uFF1A
${fileList}

\u5DEE\u5F02\uFF1A
${diff2}`
    };
  }
  return {
    system: "You are a git commit message assistant. Based on the given file list and diff, write a one-line Conventional Commits style commit message in English (type prefix: feat/fix/refactor/chore/docs/test/perf/style, with a short body when needed). Output only the commit message itself, no explanation.",
    user: `Changed files:
${fileList}

Diff:
${diff2}`
  };
}
function cleanSuggestion(text) {
  const withoutFence = text.split("\n").filter((line) => !line.trimStart().startsWith("```")).join("\n");
  return withoutFence.replace(/\r/g, "").split("\n").map((line) => line.trimEnd()).join("\n").trim();
}

// src/fs-batch.ts
var FS_TREES_MAX_PATHS = 64;

// src/active-worktree.ts
import { stat as stat7 } from "node:fs/promises";
import { dirname as dirname7, isAbsolute as isAbsolute5, join as join11, sep as sep7 } from "node:path";
init_git();
var ACTIVE_ROOT_TTL_MS = 15e3;
var ACTIVE_ROOT_MAX_EVENTS = 4e3;
var ACTIVE_ROOT_MAX_PROBES = 24;
var PATH_TOP_CACHE_MAX = 512;
var LINKED_WORKTREE_CACHE_MAX = 512;
var ACTIVE_ROOT_CACHE_MAX = 256;
var ACTIVE_ROOT_OVERRIDE_ENV = "DSH_SIDEBAR_WORKTREE_ROOT";
var ACTIVE_ROOT_STRUCTURED_FIELD = /^(cwd|workdir|work_dir|workingdirectory|path|file_path|filepath|target|root)$/i;
var ACTIVE_ROOT_PATH_PATTERN = /[A-Za-z]:(?:\\|\/)[^\\/\s"'\x60,;|)<>*?]+(?:[\\/][^\\/\s"'\x60,;|)<>*?]+)*/g;
var activeWorktreeRootCache = /* @__PURE__ */ new Map();
var pathTopCache = /* @__PURE__ */ new Map();
var linkedWorktreeCache = /* @__PURE__ */ new Map();
var activeRootInFlight = /* @__PURE__ */ new Map();
var topLevelInFlight = /* @__PURE__ */ new Map();
function cachePut(map, key, value, max) {
  map.delete(key);
  map.set(key, value);
  while (map.size > max) {
    const oldest = map.keys().next().value;
    if (oldest === void 0) break;
    map.delete(oldest);
  }
}
var directoryEpochs = /* @__PURE__ */ new WeakMap();
function directoryEpochOf(ctx, sessionId) {
  const session = ctx.sessions.get(sessionId);
  if (session?.seq === void 0 || session.eventAt === void 0) return void 0;
  const end = session.seq;
  const previous = directoryEpochs.get(session);
  if (previous?.through === end) return previous.epoch;
  const start = previous?.through ?? Math.max(0, end - ACTIVE_ROOT_MAX_EVENTS);
  let epoch = previous?.epoch ?? -1;
  for (let index = end - 1; index >= start; index -= 1) {
    const event = session.eventAt(index);
    if (event?.type !== "working-directory/change") continue;
    epoch = event.seq;
    break;
  }
  directoryEpochs.set(session, { through: end, epoch });
  return epoch;
}
function pathKeyOf(value) {
  return value.replace(/[\\/]+/g, "/").replace(/\/+$/, "").toLowerCase();
}
function pathUnderOf(base, target) {
  const b = pathKeyOf(base);
  const t = pathKeyOf(target);
  return t === b || t.startsWith(`${b}/`);
}
async function gitTopLevelOf(cwd) {
  if (cwd === "" || !isAbsolute5(cwd)) return void 0;
  try {
    if (!(await stat7(cwd)).isDirectory()) return void 0;
    return (await runGit(cwd, ["rev-parse", "--show-toplevel"])).trim();
  } catch {
    return void 0;
  }
}
function topLevelOf(cwd) {
  const key = pathKeyOf(cwd);
  const pending2 = topLevelInFlight.get(key);
  if (pending2 !== void 0) return pending2;
  const promise = gitTopLevelOf(cwd).then(
    (top) => {
      topLevelInFlight.delete(key);
      return top;
    },
    (error) => {
      topLevelInFlight.delete(key);
      throw error;
    }
  );
  topLevelInFlight.set(key, promise);
  return promise;
}
function normalizeActivePath(value) {
  const trimmed = value.replace(/[\\/]+$/, "");
  if (trimmed.startsWith("\\\\")) return `\\\\${trimmed.slice(2).replace(/[\\/]+/g, "\\")}`;
  return trimmed.replace(/[\\/]+/g, sep7);
}
function addActivePath(map, value, weight) {
  if (typeof value !== "string") return;
  const normalized = normalizeActivePath(value);
  if (normalized === "" || !isAbsolute5(normalized)) return;
  const key = pathKeyOf(normalized);
  const entry = map.get(key);
  if (entry === void 0) map.set(key, { path: normalized, score: weight });
  else entry.score += weight;
}
function collectActivePaths(value, map, structured) {
  if (typeof value === "string") {
    if (isAbsolute5(value)) {
      addActivePath(map, value, structured ? 8 : 1);
      return;
    }
    const head = value.charCodeAt(0);
    if (head === 123 || head === 91) {
      try {
        collectActivePaths(JSON.parse(value), map, structured);
      } catch {
      }
    }
    for (const match of value.match(ACTIVE_ROOT_PATH_PATTERN) ?? []) addActivePath(map, match, 1);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectActivePaths(item, map, structured);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      const isStructured = ACTIVE_ROOT_STRUCTURED_FIELD.test(key);
      collectActivePaths(item, map, structured || isStructured);
    }
  }
}
async function topOfActivePath(value) {
  const key = pathKeyOf(value);
  if (pathTopCache.has(key)) {
    const cached = pathTopCache.get(key);
    cachePut(pathTopCache, key, cached, PATH_TOP_CACHE_MAX);
    return cached;
  }
  let top = await topLevelOf(value);
  if (top === void 0) top = await topLevelOf(dirname7(value));
  const result = top === void 0 ? void 0 : requireAbsolute(top);
  cachePut(pathTopCache, key, result, PATH_TOP_CACHE_MAX);
  return result;
}
async function isLinkedWorktree(top) {
  const key = pathKeyOf(top);
  const cached = linkedWorktreeCache.get(key);
  if (cached !== void 0) {
    cachePut(linkedWorktreeCache, key, cached, LINKED_WORKTREE_CACHE_MAX);
    return cached;
  }
  let linked = false;
  try {
    const out = (await runGit(top, ["rev-parse", "--absolute-git-dir", "--git-common-dir"])).trim().split(/\r?\n/);
    const gitDir = out[0];
    const commonRaw = out[1] ?? "";
    if (gitDir !== void 0 && gitDir !== "" && commonRaw !== "") {
      const common = isAbsolute5(commonRaw) ? commonRaw : join11(top, commonRaw);
      linked = pathKeyOf(requireAbsolute(gitDir)) !== pathKeyOf(requireAbsolute(common));
    }
  } catch {
    linked = false;
  }
  cachePut(linkedWorktreeCache, key, linked, LINKED_WORKTREE_CACHE_MAX);
  return linked;
}
async function activeRootFromEvents(events, base) {
  if (events.length === 0) return void 0;
  const baseKey = pathKeyOf(base);
  const start = Math.max(0, events.length - ACTIVE_ROOT_MAX_EVENTS);
  let probes = 0;
  for (let index = events.length - 1; index >= start; index -= 1) {
    const event = events[index];
    if (event?.type === "working-directory/change") break;
    if (event === void 0 || event.type !== "tool/call") continue;
    const weights = /* @__PURE__ */ new Map();
    collectActivePaths(event.data, weights, false);
    if (weights.size === 0) continue;
    const ordered = [...weights.values()].sort((left, right) => right.score - left.score);
    const scores = /* @__PURE__ */ new Map();
    for (const candidate of ordered) {
      if (probes >= ACTIVE_ROOT_MAX_PROBES) break;
      probes += 1;
      const top = await topOfActivePath(candidate.path);
      if (top === void 0) continue;
      const topKey = pathKeyOf(top);
      if (topKey === baseKey) continue;
      if (!await isLinkedWorktree(top)) continue;
      const entry = scores.get(topKey);
      if (entry === void 0) scores.set(topKey, { top, score: candidate.score });
      else entry.score += candidate.score;
    }
    if (scores.size > 0) {
      let best;
      let bestScore = -1;
      for (const entry of scores.values()) {
        if (entry.score > bestScore) {
          best = entry.top;
          bestScore = entry.score;
        }
      }
      if (best !== void 0) return best;
    }
    if (probes >= ACTIVE_ROOT_MAX_PROBES) return void 0;
  }
  return void 0;
}
async function sessionEventsOf(ctx, sessionId) {
  const live = ctx.sessions.get(sessionId);
  const events = typeof live?.snapshotEvents === "function" ? live.snapshotEvents() : void 0;
  if (events !== void 0) return events;
  const persisted = await readPersistedSessionOf(ctx, sessionId);
  return persisted?.events ?? [];
}
async function activeWorktreeRootOf(ctx, sessionId, base) {
  if (base === "") return base;
  const override = (process.env[ACTIVE_ROOT_OVERRIDE_ENV] ?? "").trim();
  if (override !== "" && isAbsolute5(override)) return requireAbsolute(override);
  const directoryEpoch = directoryEpochOf(ctx, sessionId);
  const cached = activeWorktreeRootCache.get(sessionId);
  if (cached !== void 0 && cached.expires > Date.now() && cached.base === base && cached.directoryEpoch === directoryEpoch) {
    cachePut(activeWorktreeRootCache, sessionId, cached, ACTIVE_ROOT_CACHE_MAX);
    return cached.root;
  }
  const flightKey = `${sessionId}\0${base}\0${directoryEpoch ?? ""}`;
  const pending2 = activeRootInFlight.get(flightKey);
  if (pending2 !== void 0) return pending2;
  const promise = resolveActiveWorktreeRoot(ctx, sessionId, base, directoryEpoch).then(
    (root) => {
      activeRootInFlight.delete(flightKey);
      return root;
    },
    (error) => {
      activeRootInFlight.delete(flightKey);
      throw error;
    }
  );
  activeRootInFlight.set(flightKey, promise);
  return promise;
}
async function resolveActiveWorktreeRoot(ctx, sessionId, base, directoryEpoch) {
  const top = await topLevelOf(base);
  if (top === void 0) {
    cachePut(activeWorktreeRootCache, sessionId, { root: base, base, directoryEpoch, expires: Date.now() + ACTIVE_ROOT_TTL_MS }, ACTIVE_ROOT_CACHE_MAX);
    return base;
  }
  const canonicalTop = requireAbsolute(top);
  const effectiveBase = pathUnderOf(base, canonicalTop) ? base : canonicalTop;
  const active = await activeRootFromEvents(await sessionEventsOf(ctx, sessionId), effectiveBase);
  const root = active ?? effectiveBase;
  cachePut(activeWorktreeRootCache, sessionId, { root, base, directoryEpoch, expires: Date.now() + ACTIVE_ROOT_TTL_MS }, ACTIVE_ROOT_CACHE_MAX);
  return root;
}

// src/session-workspace.ts
async function sessionCwdOf(ctx, sessionId, _clientCwd) {
  const session = ctx.sessions.get(sessionId);
  if (session !== void 0) {
    const cwd = ctx.get("workingDirectory")?.get(session) ?? session.header.cwd;
    if (cwd !== void 0 && cwd !== "") return requireAbsolute(cwd);
  }
  const query = ctx.get("sessionQuery");
  if (query !== void 0) {
    const observation = await query.observeSession(sessionId, { projectionMode: "all" });
    try {
      const cwd = observation.projections?.values.workingDirectory ?? observation.header.cwd ?? ctx.get("workingDirectory")?.defaultDirectory;
      if (cwd !== void 0 && cwd !== "") return requireAbsolute(cwd);
    } finally {
      observation[Symbol.dispose]();
    }
  }
  const persistence = ctx.get("sessionPersistence");
  if (persistence !== void 0) {
    const persisted = await readPersistedSession(persistence, sessionId);
    const metaCwd = persisted.header.cwd;
    if (metaCwd !== void 0 && metaCwd !== "") {
      try {
        return requireAbsolute(metaCwd);
      } catch {
        throw new SidebarError("bad-request", `invalid working directory "${metaCwd}"`);
      }
    }
  }
  throw new SidebarError("not-found", "session has no authoritative workspace directory", 404);
}
async function scopedActiveWorktreeRootOf(ctx, sessionId, base) {
  await ensureWorkspacePath(base, base);
  const proposed = await activeWorktreeRootOf(ctx, sessionId, base);
  try {
    return await ensureWorkspacePath(base, proposed);
  } catch (error) {
    if (error instanceof SidebarError && error.code === "forbidden") return base;
    throw error;
  }
}
async function gitWorkspaceOf(cwd, requested, selected) {
  const git = await Promise.resolve().then(() => (init_git(), git_exports));
  if (requested === void 0 && (await git.repoRoots(cwd)).length === 0) return cwd;
  const root = await ensureWorkspacePath(cwd, await git.repoRoot(cwd, selected));
  return requested === void 0 ? root : ensureWorkspacePath(cwd, await git.resolveWorktree(root, requested));
}

// src/editor-limits.ts
var MAX_EDITABLE_BYTES = 5 * 1024 * 1024;
var PAGE_BYTES = 128 * 1024;
var WRITE_BODY_GUARD_BYTES = 8 * 1024 * 1024;

// src/index.ts
var name = "dsh-better-sidebar";
var inject = ["webServer", "sessions", "connection", "tools"];
var MEDIA_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".avif": "image/avif",
  ".pdf": "application/pdf",
  ".html": "text/html",
  ".htm": "text/html"
};
function mediaTypeForPath(path) {
  return MEDIA_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream";
}
function selectedRepoOf(payload) {
  const record = payload;
  if (record.repoRoot === void 0) return void 0;
  return requireAbsolute(requireString(payload, "repoRoot"));
}
function requireLineNumber(payload, key) {
  const value = payload?.[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new SidebarError("bad-request", `"${key}" must be a positive integer line number`);
  }
  return value;
}
async function resolveGitPath(cwd, raw, selected) {
  if (isAbsolute6(raw)) return requireAbsolute(resolveSessionPath(cwd, raw));
  const sessionPath = requireAbsolute(join12(cwd, raw));
  if (await stat8(sessionPath).then(() => true).catch(() => false)) return sessionPath;
  const root = await repoRoot(cwd, selected).catch(() => cwd);
  return requireAbsolute(join12(root, raw));
}
var MODEL_CATALOG_PROVIDER_LIMIT = 20;
var MODEL_CATALOG_MODEL_LIMIT = 50;
var COMMIT_MODEL_SETTING_KEY = "commitModel";
function pinnedCommitRouteOf(getSettings) {
  const value = getSettings()?.get().value;
  if (value === null || typeof value !== "object") return void 0;
  const pluginSettings = value.pluginSettings;
  if (pluginSettings === null || typeof pluginSettings !== "object") return void 0;
  const blob = pluginSettings.git;
  if (blob === null || typeof blob !== "object") return void 0;
  return parseModelRoute(blob[COMMIT_MODEL_SETTING_KEY]);
}
function conversationModelRoute(ctx, sessionId) {
  const agents = ctx.get("agents");
  const options = agents?.get(sessionId)?.options;
  if (options !== void 0 && typeof options.provider === "string" && options.provider !== "" && typeof options.model === "string" && options.model !== "") {
    return { provider: options.provider, model: options.model };
  }
  const events = ctx.sessions.get(sessionId)?.snapshotEvents();
  return events === void 0 ? void 0 : collectModelRoutes(events, 1)[0];
}
function defaultModelRoute(ctx) {
  const service = ctx.get("agentDefaultModel");
  return defaultRouteOf(service?.currentSelection());
}
var SUGGEST_MAX_TOKENS = 512;
var SUGGEST_TIMEOUT_MS = 3e4;
async function commitReasoningEffort(llm, route) {
  if (llm.resolveModelInfo === void 0) return void 0;
  const info = await Promise.resolve(llm.resolveModelInfo(route.provider, route.model)).catch(() => void 0);
  return lowestReasoningEffortOf(info?.reasoning?.efforts);
}
async function streamCommitMessage(ctx, route, system, user) {
  const llm = ctx.get("llm");
  if (llm === void 0) {
    throw new SidebarError("git-suggest-error", "the harness LLM service is unavailable", 503);
  }
  const effort = await commitReasoningEffort(llm, route);
  const assembler = new BlockAssembler();
  try {
    for await (const chunk of llm.stream({
      provider: route.provider,
      model: route.model,
      messages: [createUserMessage2({
        content: [{ type: "text", text: user }],
        // The plugin's producer-owned source kind (0.1.7 removed the shared
        // `plugin` catch-all): see SIDE_INJECTION_SOURCE_KIND.
        source: { kind: "plugin:dsh-better-sidebar" }
      })],
      system,
      maxTokens: SUGGEST_MAX_TOKENS,
      signal: AbortSignal.timeout(SUGGEST_TIMEOUT_MS),
      ...effort === void 0 ? {} : { reasoningEffort: effort }
    })) {
      assembler.push(chunk);
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new SidebarError(
        "git-suggest-error",
        `the model did not answer within ${Math.round(SUGGEST_TIMEOUT_MS / 1e3)}s`,
        504
      );
    }
    throw error;
  }
  const message = cleanSuggestion(assembler.blocks().map((block) => block.type === "text" ? block.text : "").join(""));
  if (message === "") {
    const finish = assembler.finish?.kind;
    throw new SidebarError(
      "git-suggest-error",
      `the model returned an empty message (finish=${typeof finish === "string" ? finish : "unknown"})`,
      500
    );
  }
  return message;
}
async function resolveStatusPath(cwd, raw, selected) {
  if (isAbsolute6(raw)) return requireAbsolute(resolveSessionPath(cwd, raw));
  const root = await repoRoot(cwd, selected).catch(() => cwd);
  return requireAbsolute(join12(root, raw));
}
var READ_HEAD_LIMIT = 4096;
async function statFileForRoute(path) {
  return await stat8(path).catch((error) => {
    throw new SidebarError(
      "fs-error",
      `cannot read "${path}": ${error instanceof Error ? error.message : String(error)}`,
      400
    );
  });
}
async function readText(path) {
  const info = await stat8(path).catch((error) => {
    throw new SidebarError("fs-error", `cannot read "${path}": ${error instanceof Error ? error.message : String(error)}`, 400);
  });
  if (info.isDirectory()) {
    throw new SidebarError("fs-error", `"${path}" is a directory`, 400);
  }
  const size = info.size;
  const oversized = size > MAX_EDITABLE_BYTES;
  const handle = await open3(path, "r").catch((error) => {
    throw new SidebarError("fs-error", `cannot read "${path}": ${error instanceof Error ? error.message : String(error)}`, 400);
  });
  try {
    const window = oversized ? READ_HEAD_LIMIT : size;
    const buffer = Buffer.alloc(window);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const slice = buffer.subarray(0, bytesRead);
    const decoded = decodeTextBytes(slice, oversized);
    if (decoded === null) {
      return {
        kind: "binary",
        size,
        mtimeMs: info.mtimeMs,
        head: slice.subarray(0, Math.min(slice.length, READ_HEAD_LIMIT)).toString("base64")
      };
    }
    if (oversized) {
      return {
        kind: "too-large",
        size,
        mtimeMs: info.mtimeMs,
        head: slice.toString("base64")
      };
    }
    return { kind: "text", content: decoded.content, size, mtimeMs: info.mtimeMs };
  } finally {
    await handle.close();
  }
}
var wideEncodingCache = /* @__PURE__ */ new Map();
var PAGE_ENCODING_CACHE_MAX = 64;
async function readPage(path, offset) {
  const info = await stat8(path).catch((error) => {
    throw new SidebarError("fs-error", `cannot read "${path}": ${error instanceof Error ? error.message : String(error)}`, 400);
  });
  if (info.isDirectory()) {
    throw new SidebarError("fs-error", `"${path}" is a directory`, 400);
  }
  const size = info.size;
  if (offset >= size) {
    return {
      kind: "text",
      text: "",
      offset,
      nextOffset: size,
      eof: true,
      size,
      mtimeMs: info.mtimeMs,
      encoding: "utf8"
    };
  }
  const handle = await open3(path, "r").catch((error) => {
    throw new SidebarError("fs-error", `cannot read "${path}": ${error instanceof Error ? error.message : String(error)}`, 400);
  });
  try {
    const length = Math.min(PAGE_BYTES, size - offset);
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, offset);
    let slice = buffer.subarray(0, bytesRead);
    let nextOffset = offset + bytesRead;
    const cacheKey2 = `${path}\0${size}\0${info.mtimeMs}`;
    const locked = wideEncodingCache.get(cacheKey2);
    if (nextOffset < size) {
      const lastBreak = lastLineBreakEnd(slice, locked ?? "utf8");
      if (lastBreak >= 0) {
        slice = slice.subarray(0, lastBreak);
        nextOffset = offset + lastBreak;
      }
    }
    const decoded = decodeTextBytes(slice, true);
    let encoding;
    let text;
    if (locked !== void 0) {
      encoding = locked;
      text = offset === 0 && decoded !== null ? decoded.content : decodeTextAs(slice, locked);
    } else {
      encoding = decoded?.encoding ?? "utf8";
      text = decoded?.content ?? decodeTextAs(slice, "utf8");
      if (decoded !== null && isWideEncoding(decoded.encoding)) {
        if (wideEncodingCache.size >= PAGE_ENCODING_CACHE_MAX) {
          const oldest = wideEncodingCache.keys().next();
          if (!oldest.done) wideEncodingCache.delete(oldest.value);
        }
        wideEncodingCache.set(cacheKey2, decoded.encoding);
      }
    }
    return {
      kind: "text",
      text,
      offset,
      nextOffset,
      eof: nextOffset >= size,
      size,
      mtimeMs: info.mtimeMs,
      encoding
    };
  } finally {
    await handle.close();
  }
}
function buildApi(ctx, resolved, getSettings, assistantLive, archiveTasks) {
  const cwdOf = async (payload) => {
    const sessionId = requireString(payload, "sessionId");
    const record = payload;
    const clientCwd = typeof record?.cwd === "string" && record.cwd !== "" ? record.cwd : void 0;
    return { sessionId, cwd: await scopedActiveWorktreeRootOf(ctx, sessionId, await sessionCwdOf(ctx, sessionId, clientCwd)) };
  };
  const gitCwdOf = async (payload) => {
    const base = await cwdOf(payload);
    const record = payload;
    const requested = typeof record?.worktree === "string" && record.worktree !== "" ? record.worktree : void 0;
    return { sessionId: base.sessionId, cwd: await gitWorkspaceOf(base.cwd, requested, selectedRepoOf(payload)) };
  };
  const subagentLiveApi = buildSubagentLiveApi(ctx);
  const changesOps = createChangesOpsApi(ctx);
  const workflowsApi = buildWorkflowsApi(ctx);
  const teamsApi = buildTeamsApi(ctx);
  return {
    "session.phase": async (payload) => {
      const sessionId = requireString(payload, "sessionId");
      const session = ctx.sessions.get(sessionId);
      if (session === void 0) return { blank: false };
      const blank = !session.snapshotEvents().some((event) => event.type === "user/message" || event.type === "assistant/message");
      return { blank };
    },
    "session.cwd": async (payload) => {
      const { sessionId, cwd } = await cwdOf(payload);
      return { sessionId, cwd, root: rootLabel(cwd), parent: parentOf(cwd) ?? null };
    },
    "fs.tree": async (payload) => {
      const { cwd } = await cwdOf(payload);
      const record = payload;
      const target = record.path === void 0 ? cwd : await ensureWorkspacePath(cwd, requireString(payload, "path"));
      const exclude = compileExcludePatterns(record.exclude, cwd);
      return listDirectory(target, resolved.listLimit, exclude, createProbeGate(), cwd);
    },
    // Batch listing: one request for every level the tree has expanded, so a
    // mount/refresh costs one round trip instead of N. Each path rides the
    // SAME resolution + cache as `fs.tree` (so a level listed here is warm for
    // the single-path route and vice versa), and one failing level is reported
    // in place — the other levels still render.
    "fs.trees": async (payload) => {
      const { cwd } = await cwdOf(payload);
      const record = payload;
      const paths = Array.isArray(record?.paths) ? record.paths.filter((value) => typeof value === "string" && value !== "") : [];
      if (paths.length === 0) throw new SidebarError("bad-request", "paths must be a non-empty array");
      if (paths.length > FS_TREES_MAX_PATHS) {
        throw new SidebarError("bad-request", `too many paths (max ${FS_TREES_MAX_PATHS})`);
      }
      const exclude = compileExcludePatterns(record?.exclude, cwd);
      const gate = createProbeGate();
      const levels = await Promise.all(paths.map(async (raw) => {
        const homeRelative = raw === "~" || raw.startsWith("~/") || raw.startsWith("~\\");
        const requested = isAbsolute6(raw) || homeRelative ? raw : `${cwd}${sep8}${raw}`;
        try {
          return await listDirectory(await ensureWorkspacePath(cwd, requested), resolved.listLimit, exclude, gate, cwd);
        } catch (error) {
          return { path: requested, entries: [], truncated: false, error: messageOf(error) };
        }
      }));
      return { levels };
    },
    "fs.search": async (payload) => {
      const { cwd } = await cwdOf(payload);
      const record = payload;
      const query = requireString(payload, "query");
      return searchFiles(cwd, query, { exclude: compileExcludePatterns(record.exclude, cwd) });
    },
    "fs.read": async (payload) => {
      const { cwd } = await cwdOf(payload);
      const selected = selectedRepoOf(payload);
      const path = await ensureWorkspacePath(cwd, await resolveGitPath(cwd, requireString(payload, "path"), selected));
      return await readText(path);
    },
    // One byte window of a large text file, for the read-only paged preview.
    // The window is line-aligned by the host, so the client can treat each
    // response as whole lines (and, for a `.jsonl`, whole records) without
    // having to re-split anything.
    "fs.readPage": async (payload) => {
      const { cwd } = await cwdOf(payload);
      const selected = selectedRepoOf(payload);
      const path = await ensureWorkspacePath(cwd, await resolveGitPath(cwd, requireString(payload, "path"), selected));
      const record = payload;
      const offset = typeof record?.offset === "number" && Number.isFinite(record.offset) && record.offset >= 0 ? Math.floor(record.offset) : 0;
      return await readPage(path, offset);
    },
    // The tree row's rename: single-segment name, destination-existence and
    // workspace-root refusals, link-aware (renames the row, not its target).
    // fs-operations.ts owns the containment and shape rules.
    "fs.rename": async (payload) => {
      const { cwd } = await cwdOf(payload);
      return renameWorkspaceEntry({
        cwd,
        path: requireString(payload, "path"),
        name: requireString(payload, "name")
      });
    },
    // The tree's "new folder": one directory inside an existing row, with
    // the same single-segment/existence rules as rename.
    "fs.mkdir": async (payload) => {
      const { cwd } = await cwdOf(payload);
      return mkdirWorkspaceEntry({
        cwd,
        path: requireString(payload, "path"),
        name: requireString(payload, "name")
      });
    },
    // The tree's "new file": one EMPTY file inside an existing row. Same
    // single-segment/existence rules as mkdir, plus the Windows-illegal and
    // reserved-device-name refusals a file name has to survive (fs-operations.ts
    // owns both), and a destination that is never truncated.
    "fs.createFile": async (payload) => {
      const { cwd } = await cwdOf(payload);
      return createWorkspaceFile({
        cwd,
        path: requireString(payload, "path"),
        name: requireString(payload, "name")
      });
    },
    // The tree row's delete is recoverable through fs.recovery.list/restore.
    "fs.remove": async (payload) => {
      const { cwd } = await cwdOf(payload);
      return removeWorkspaceEntry({
        cwd,
        path: requireString(payload, "path")
      });
    },
    "fs.recovery.list": async (payload) => {
      const { cwd } = await cwdOf(payload);
      return listWorkspaceRecovery(cwd);
    },
    "fs.recovery.restore": async (payload) => {
      const { cwd } = await cwdOf(payload);
      return restoreWorkspaceRecovery(cwd, requireString(payload, "id"));
    },
    "git.worktrees": async (payload) => {
      const { cwd } = await gitCwdOf(payload);
      const selected = selectedRepoOf(payload);
      const base = selected !== void 0 ? await repoRoot(cwd, selected).catch(() => cwd) : cwd;
      return worktrees(base);
    },
    "git.status": async (payload) => {
      const { cwd } = await gitCwdOf(payload);
      return status(cwd, selectedRepoOf(payload));
    },
    "git.diff": async (payload) => {
      const { cwd } = await gitCwdOf(payload);
      const record = payload;
      const repoRoot2 = selectedRepoOf(payload);
      const path = record.path === void 0 ? void 0 : await resolveStatusPath(cwd, requireString(payload, "path"), repoRoot2);
      return { diff: await diff(cwd, path, record.staged === true, repoRoot2) };
    },
    // The editor's change gutter asks for the WHOLE uncommitted change of one
    // file (worktree against HEAD, staged and unstaged together) — the two
    // existing `git.diff` sides would each report only half of a partly
    // staged file, and the gutter's line numbers are the worktree's.
    "git.diff-head": async (payload) => {
      const { cwd } = await gitCwdOf(payload);
      const repoRoot2 = selectedRepoOf(payload);
      const path = await ensureWorkspacePath(cwd, await resolveGitPath(cwd, requireString(payload, "path"), repoRoot2));
      return { diff: await diffHead(cwd, path, repoRoot2) };
    },
    "git.stage": async (payload) => {
      const { cwd } = await gitCwdOf(payload);
      const record = payload;
      const path = record.path === void 0 ? void 0 : requireString(payload, "path");
      await stage(cwd, path, selectedRepoOf(payload));
      return { ok: true };
    },
    "git.unstage": async (payload) => {
      const { cwd } = await gitCwdOf(payload);
      const record = payload;
      const path = record.path === void 0 ? void 0 : requireString(payload, "path");
      await unstage(cwd, path, selectedRepoOf(payload));
      return { ok: true };
    },
    "git.commit": async (payload) => {
      const { cwd } = await gitCwdOf(payload);
      const message = requireString(payload, "message");
      await commit(cwd, message, selectedRepoOf(payload));
      return { ok: true };
    },
    // Ship a commit without leaving the panel. Both target the selected
    // checkout through gitCwdOf/selectedRepoOf like every other git route, and
    // both report git's own stderr: a missing upstream (push) or a diverged
    // branch (pull is --ff-only) is the user's to resolve in a terminal.
    "git.push": async (payload) => {
      const { cwd } = await gitCwdOf(payload);
      await push(cwd, selectedRepoOf(payload));
      return { ok: true };
    },
    "git.pull": async (payload) => {
      const { cwd } = await gitCwdOf(payload);
      await pull(cwd, selectedRepoOf(payload));
      return { ok: true };
    },
    "git.branch": async (payload) => {
      const { cwd } = await gitCwdOf(payload);
      return branches(cwd, selectedRepoOf(payload));
    },
    "git.checkout": async (payload) => {
      const { cwd } = await gitCwdOf(payload);
      await checkout(cwd, requireString(payload, "branch"), selectedRepoOf(payload));
      return { ok: true };
    },
    "git.graph": async (payload) => {
      const { cwd } = await gitCwdOf(payload);
      try {
        return await gitGraph(cwd, payload, selectedRepoOf(payload));
      } catch (error) {
        if (error instanceof GitCommandError && (error.code === "graph-stale" || error.code === "graph-limit" || error.code === "bad-request")) {
          throw new SidebarError(error.code, error.message, error.code === "graph-stale" ? 409 : 400);
        }
        throw error;
      }
    },
    "git.log": async (payload) => {
      const { cwd } = await gitCwdOf(payload);
      const record = payload;
      const count = typeof record.count === "number" && Number.isInteger(record.count) && record.count > 0 ? record.count : void 0;
      const skip = typeof record.skip === "number" && Number.isInteger(record.skip) && record.skip >= 0 ? record.skip : void 0;
      return log(cwd, count, skip, selectedRepoOf(payload));
    },
    "git.commit-diff": async (payload) => {
      const { cwd } = await gitCwdOf(payload);
      return { diff: await commitDiff(cwd, requireString(payload, "hash"), selectedRepoOf(payload)) };
    },
    "git.discard": async (payload) => {
      const { cwd } = await gitCwdOf(payload);
      const repoRoot2 = selectedRepoOf(payload);
      await discard(cwd, await resolveStatusPath(cwd, requireString(payload, "path"), repoRoot2), repoRoot2);
      return { ok: true };
    },
    "git.revert": async (payload) => {
      const { cwd } = await gitCwdOf(payload);
      await revert(cwd, requireString(payload, "hash"), selectedRepoOf(payload));
      return { ok: true };
    },
    "git.cherry-pick": async (payload) => {
      const { cwd } = await gitCwdOf(payload);
      await cherryPick(cwd, requireString(payload, "hash"), selectedRepoOf(payload));
      return { ok: true };
    },
    "git.show": async (payload) => {
      const { cwd } = await gitCwdOf(payload);
      const repoRoot2 = selectedRepoOf(payload);
      const path = requireString(payload, "path");
      const rev = requireString(payload, "rev");
      return { content: await show(cwd, rev, path, repoRoot2) };
    },
    // The editor's hover blame: ONE line range per request (the tooltip never
    // prefetches a file) and an empty list for every failure — see git.blame.
    "git.blame": async (payload) => {
      const { cwd } = await gitCwdOf(payload);
      const repoRoot2 = selectedRepoOf(payload);
      const path = await ensureWorkspacePath(cwd, await resolveGitPath(cwd, requireString(payload, "path"), repoRoot2));
      const startLine = requireLineNumber(payload, "startLine");
      const endLine = requireLineNumber(payload, "endLine");
      if (endLine < startLine) throw new SidebarError("bad-request", '"endLine" must not precede "startLine"');
      return { lines: await blame(cwd, path, startLine, endLine, repoRoot2) };
    },
    // Commit-message suggestion: build a prompt from the pending changes and
    // stream it through the harness LLM service (`ctx.llm`) — no agent is
    // spawned, no session event is written, and the sidebar never sees a
    // credential. The route is the one the user PINNED in the Git card's
    // settings when set, else the route the conversation itself runs on.
    // Staged changes win because they are exactly what `git commit` records;
    // with nothing staged the unstaged diff is used, and a lone untracked set
    // still yields a file-list-based message.
    "git.suggest-message": async (payload) => {
      const { cwd, sessionId } = await gitCwdOf(payload);
      const repoRoot2 = selectedRepoOf(payload);
      const language = normalizeLanguage(payload.language);
      const route = pinnedCommitRouteOf(getSettings) ?? conversationModelRoute(ctx, sessionId) ?? defaultModelRoute(ctx);
      if (route === void 0) {
        throw new SidebarError("git-suggest-error", "cannot resolve a model route for this conversation", 503);
      }
      const status2 = await status(cwd, repoRoot2);
      const staged = status2.entries.filter((entry) => entry.xy[0] !== " " && entry.xy[0] !== "?");
      const untracked = status2.entries.filter((entry) => entry.xy === "??");
      const unstaged = status2.entries.filter((entry) => entry.xy !== "??" && entry.xy[1] !== " " && entry.xy[1] !== "?");
      if (staged.length === 0 && unstaged.length === 0 && untracked.length === 0) {
        throw new SidebarError("git-suggest-empty", "no pending changes", 400);
      }
      const focus = staged.length > 0 ? { diff: await diff(cwd, void 0, true, repoRoot2), files: staged } : unstaged.length > 0 ? { diff: await diff(cwd, void 0, false, repoRoot2), files: unstaged } : { diff: "", files: untracked };
      const prompt = buildCommitPrompt(language, focus.files.map((entry) => entry.path), truncateDiff(focus.diff));
      const message = await streamCommitMessage(ctx, route, prompt.system, prompt.user);
      return { message, provider: route.provider, model: route.model };
    },
    // The route the NEXT suggestion would use (pinned → the conversation's own
    // → the harness default), which the generate button shows in its tooltip.
    // Deliberately separate from `git.models`: this is one settings read plus
    // one header scan, with no adapter catalog discovery.
    "git.commit-model": (payload) => {
      const record = payload ?? {};
      const pinned = pinnedCommitRouteOf(getSettings);
      const sessionId = typeof record.sessionId === "string" ? record.sessionId : "";
      const route = pinned ?? (sessionId === "" ? void 0 : conversationModelRoute(ctx, sessionId)) ?? defaultModelRoute(ctx);
      return {
        ...route === void 0 ? {} : { route },
        /** Whether the route above is a PINNED one (the panel may want to
         *  label it differently from the conversation's own model). */
        pinned: pinned !== void 0
      };
    },
    // The model catalog behind the Git card's pinned-route dropdown: every
    // registered provider with the models its adapter advertises. Discovery is
    // advisory and best-effort — a provider whose adapter cannot be asked
    // (or that advertises nothing) is reported with an empty model list
    // instead of failing the whole catalog.
    "git.models": async (payload) => {
      const record = payload ?? {};
      const llm = ctx.get("llm");
      const providers = llm === void 0 ? [] : await Promise.resolve(llm.listProviders()).then((listed) => Array.isArray(listed) ? listed.slice(0, MODEL_CATALOG_PROVIDER_LIMIT) : []).then((entries) => Promise.all(entries.map(async (entry) => {
        const parsed = providerEntryOf(entry);
        if (parsed === void 0) return { provider: "", name: "", models: [] };
        const models = await Promise.resolve(llm.listModels(parsed.provider)).then((list) => Array.isArray(list) ? list.slice(0, MODEL_CATALOG_MODEL_LIMIT) : []).catch(() => []);
        return {
          provider: parsed.provider,
          name: parsed.label,
          models: models.flatMap((model) => {
            const item = modelEntryOf(model);
            return item === void 0 ? [] : [{ id: item.id, name: item.name }];
          })
        };
      }))).catch(() => []);
      const events = typeof record.sessionId === "string" ? ctx.sessions.get(record.sessionId)?.snapshotEvents() ?? [] : [];
      return {
        // Whether the harness exposes an LLM surface at all: an empty
        // catalog is then "no adapters registered", not "the route failed".
        llm: llm !== void 0,
        providers: providers.filter((provider) => provider.provider !== ""),
        recent: collectModelRoutes(events),
        default: defaultModelRoute(ctx)
      };
    },
    // The session's file-tool events for the changes tab's session lens
    // (and its badge): the CLIENT runtime's sessions face has no event-log
    // access, so the events cross the wire here — live session log first,
    // the persisted logical log for not-yet-hydrated sessions. Only the event
    // types the lens folds are sent (a plain `tool/call` + `tool/result` pair,
    // or a PTC `tool/ptc-dispatch-start` / `tool/ptc-dispatch` pair), narrowed
    // to `seq > afterSeq` so polling is a small delta. A primed client asks the
    // host to WAIT for the next tool event instead of re-reading an unchanged
    // window (see `src/changes-ops.ts`).
    "changes.ops": changesOps,
    // Subagent live previews: one batch request per refresh; the route folds
    // the newest text/tool activity of every running child in the tree.
    "subagents.live": (payload) => subagentLiveApi.live(payload),
    // Workflow runs of the whole tree (folded from `tool-workflow/*`
    // session events; empty list when the tree never ran one).
    "workflows.list": (payload) => workflowsApi.list(payload),
    // Agent Teams (experimental): the task board's create/CAS-update
    // mutations. Reads ride the Lead Session's `agentTeam` projection, so
    // there is no `teams.view` route (see src/team-routes.ts).
    "teams.taskCreate": (payload) => teamsApi.taskCreate(payload),
    "teams.taskUpdate": (payload) => teamsApi.taskUpdate(payload),
    // The side card preferences. The settings service is optional in the
    // composition; while absent the routes report undefined and the client
    // keeps the schema defaults. Writes are revision-guarded: a stale editor
    // is refused with settings-conflict so a concurrent change is never
    // silently overwritten (mirror of the settings seam's own guard).
    "settings.get": () => {
      const settings = getSettings();
      return settings === void 0 ? { value: void 0, revision: void 0, externalDisable: false } : { ...settings.get(), externalDisable: settings.externalDisable() };
    },
    "settings.update": async (payload) => {
      const settings = getSettings();
      if (settings === void 0) {
        throw new SidebarError("settings-rejected", "the settings service is not mounted in this deployment", 503);
      }
      const record = payload;
      const patch = record?.patch;
      if (patch === null || typeof patch !== "object" || Array.isArray(patch)) {
        throw new SidebarError("bad-request", "patch must be a plain object");
      }
      const expectedRevision = typeof record?.expectedRevision === "number" ? record.expectedRevision : void 0;
      try {
        return await settings.update(patch, expectedRevision);
      } catch (error) {
        if (error instanceof SettingsConflictError) {
          throw new SidebarError("settings-conflict", error.message, 409);
        }
        throw new SidebarError("settings-rejected", error instanceof Error ? error.message : String(error), 400);
      }
    },
    // External open for the file tree's "open with" menu: reveal a path in
    // the OS file manager, or hand a custom-scheme URL (vscode://,
    // cursor://, zed://, custom editors) to its registered handler. The
    // client is a browser renderer where raw scheme navigation is
    // unreliable, so the launch always goes through the host — the same
    // fence as every other route, argv-only (no shell interpolation).
    "open.external": (payload) => {
      const record = payload;
      const action = record?.action;
      if (action === "reveal") return launchExternal("reveal", requireString(payload, "path"));
      if (action === "url") return launchExternal("url", requireString(payload, "url"));
      throw new SidebarError("bad-request", 'action must be "reveal" or "url"');
    },
    // Archive builds: fence the selection and hand the packing to the
    // background task table, which runs the system's zip/tar into a temp file.
    // The tree watches it through `archive.status` and downloads the finished
    // bytes from GET /sidebar/archive?id=.
    //
    // The selection arrives as absolute paths and is passed to the tool as
    // paths relative to the selections' common ancestor — the tool decides the
    // in-archive layout from the real directory structure, so there is no walk
    // and no name disambiguation here any more.
    "archive.build": async (payload) => {
      const { sessionId, cwd } = await cwdOf(payload);
      const record = payload;
      const paths = Array.isArray(record?.paths) ? record.paths.filter((value) => typeof value === "string" && value !== "") : [];
      if (paths.length === 0) throw new SidebarError("bad-request", "paths must be a non-empty array");
      const name2 = typeof record?.name === "string" ? record.name : "";
      const selected = [];
      for (const raw of paths) selected.push(await ensureWorkspacePath(cwd, raw));
      return await archiveTasks.start({ sessionId, name: name2, paths: selected });
    },
    "archive.status": (payload) => archiveTasks.status(requireString(payload, "id"), requireString(payload, "sessionId")),
    // Side Chat: create a side-thread child seeded with the parent's full
    // log up to now, deliver follow-ups (cold-resuming when the thread's
    // agent is gone), abort a running thread, and release a thread's agent.
    // Every operation runs through these routes because subagent-origin
    // identities are fenced from the generic session RPCs (agent-lookup
    // ownership), and the thread is created with a CUSTOM seed the stock
    // fork APIs cannot express.
    ...buildSidechatApi(ctx, assistantLive)
  };
}
var SIDEBAR_PACKAGE_NAME = "dsh-better-sidebar";
var AIONUI_PANEL_ENTRY = "aionui-panel";
var LEGACY_SETTINGS_FILE = "settings.yaml";
function ownEntryId(ctx) {
  let fallback;
  try {
    for (const entry of ctx.loader.entries()) {
      const id = entry.options.id;
      if (entry.options.name !== SIDEBAR_PACKAGE_NAME || typeof id !== "string" || id === "") continue;
      if (entry.fiber === ctx.fiber) return id;
      if (entry.disabled !== true && fallback === void 0) fallback = id;
    }
  } catch {
    return void 0;
  }
  return fallback;
}
async function readLegacyPrefs(home) {
  const declared = new Set(Object.keys(Config.dict ?? {}));
  for (const name2 of [`${LEGACY_SETTINGS_FILE}.imported`, LEGACY_SETTINGS_FILE]) {
    let text;
    try {
      text = await readFile3(join12(home, name2), "utf8");
    } catch {
      continue;
    }
    let document;
    try {
      document = parseYaml(text);
    } catch {
      continue;
    }
    if (document === null || typeof document !== "object" || Array.isArray(document)) continue;
    const section = document[SIDEBAR_PREFS_NS];
    if (section === null || typeof section !== "object" || Array.isArray(section)) continue;
    const filtered = Object.fromEntries(
      Object.entries(section).filter(([key]) => declared.has(key))
    );
    if (Object.keys(filtered).length > 0) return filtered;
  }
  return void 0;
}
async function importLegacyPrefs(ctx, settings, ns) {
  const home = ctx.profileContext?.home;
  if (home === void 0) return "no-profile-home";
  const row = settings.describe().find((candidate) => candidate.ns === ns);
  if (row === void 0) return "no-form";
  const user = row.user;
  if (user !== null && typeof user === "object" && Object.keys(user).length > 0) return "already-configured";
  const section = await readLegacyPrefs(home);
  if (section === void 0) return "no-legacy-section";
  await settings.update(ns, section);
  return "imported";
}
function apply(ctx, config) {
  const resolved = resolveSidebarConfig(config);
  const fence = (req) => ctx.connection.requestRejection(req) === void 0;
  const agentOpenRegistry = new AgentOpenRegistry();
  let settingsFace;
  let openToolsDisposers = null;
  ctx.inject(["settings"], (sctx) => {
    const ns = ownEntryId(ctx);
    if (ns === void 0) {
      ctx.logger?.warn?.("dsh-better-sidebar: no loader row for this package; Side card preferences stay at defaults");
      return;
    }
    ctx.effect(
      () => sctx.settings.configure({ auto: false }, ctx.fiber),
      "dsh-better-sidebar: settings page policy"
    );
    const viewOf = () => {
      const descriptor = sctx.settings.describe({ redactSecrets: true }).find((candidate) => candidate.ns === ns);
      return descriptor === void 0 ? { value: void 0, revision: void 0 } : { value: descriptor.value, revision: descriptor.revision };
    };
    const externalDisable = () => {
      const descriptor = sctx.settings.describe({ redactSecrets: true }).find((candidate) => candidate.ns === AIONUI_PANEL_ENTRY);
      const value = descriptor?.value;
      return value?.rightPanel === "aionui-panel";
    };
    const prefsOf = () => {
      const value = viewOf().value;
      return value !== null && typeof value === "object" ? value : SIDEBAR_PREFS_DEFAULTS;
    };
    const syncOpenToolsGate = () => {
      if (prefsOf().agentOpenTools === true) {
        if (openToolsDisposers === null) {
          openToolsDisposers = registerOpenTool(
            ctx,
            agentOpenRegistry,
            (sessionId) => sessionCwdOf(ctx, sessionId),
            prefsOf
          );
        }
      } else if (openToolsDisposers !== null) {
        openToolsDisposers();
        openToolsDisposers = null;
        agentOpenRegistry.drainAll();
      }
    };
    settingsFace = {
      // Two triggers cover what the 0.1.6 namespace watch used to: the
      // plugin's own writes flow through `update`, and the client re-reads
      // this face on every `settings/document-updated` push. (The host emits
      // that event on the settings service's own context, which is not an
      // ancestor of this plugin's fiber, so a listener here would never run.)
      get: () => {
        syncOpenToolsGate();
        return viewOf();
      },
      externalDisable,
      update: async (patch, expectedRevision) => {
        await sctx.settings.update(ns, patch, expectedRevision);
        return viewOf();
      }
    };
    syncOpenToolsGate();
    void Promise.resolve(ctx.loader?.await?.()).then(
      () => importLegacyPrefs(ctx, sctx.settings, ns)
    ).then((outcome) => {
      if (outcome === "no-profile-home" || outcome === "no-form") {
        ctx.logger.warn("dsh-better-sidebar: legacy preference import could not run (%s)", outcome);
        return;
      }
      ctx.logger.info("dsh-better-sidebar: legacy preference import: %s", outcome);
    }).catch((error) => {
      ctx.logger.warn("dsh-better-sidebar: legacy preference import was rejected");
      ctx.logger.warn(error);
    });
  });
  const assistantLive = createAssistantLiveBuffer(ctx);
  ctx.effect(() => () => {
    assistantLive.dispose();
  }, "dsh-better-sidebar: live assistant stream buffer");
  const archiveTasks = createArchiveTasks();
  ctx.effect(() => () => {
    archiveTasks.dispose();
  }, "dsh-better-sidebar: archive task table");
  const api = buildApi(ctx, resolved, () => settingsFace, assistantLive, archiveTasks);
  ctx.effect(() => ctx.webServer.register({
    kind: "prefix",
    path: "/sidebar/api",
    handler: async (req, res) => {
      if (!fence(req)) {
        writeJson(res, 403, { ok: false, error: { code: "forbidden", message: "forbidden" } });
        return;
      }
      if (req.method !== "POST") {
        writeJson(res, 405, { ok: false, error: { code: "method-error", message: "method not allowed" } });
        return;
      }
      const pathname = new URL(req.url ?? "/", "http://dsh.internal").pathname;
      const method = pathname.startsWith("/sidebar/api/") ? pathname.slice("/sidebar/api/".length) : void 0;
      if (method === void 0 || method.includes("/")) {
        writeError(res, new SidebarError("not-found", "unknown sidebar API method", 404));
        return;
      }
      const controller = method === "changes.ops" ? new AbortController() : void 0;
      const response = controller === void 0 ? void 0 : res;
      const abort = () => {
        controller?.abort();
      };
      response?.once("close", abort);
      try {
        const payload = await readJsonBody(req);
        const handler = Object.hasOwn(api, method) ? api[method] : void 0;
        if (typeof handler !== "function") {
          throw new SidebarError("not-found", `unknown sidebar API method "${method}"`, 404);
        }
        const result = await handler(payload, controller?.signal);
        if (controller?.signal.aborted !== true) writeOk(res, result);
      } catch (error) {
        if (controller?.signal.aborted !== true) writeError(res, error);
      } finally {
        response?.off("close", abort);
      }
    }
  }), "dsh-better-sidebar: /sidebar/api routes");
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/sidebar/upload",
    handler: async (req, res) => {
      if (!fence(req)) {
        writeJson(res, 403, { ok: false, error: { code: "forbidden", message: "forbidden" } });
        return;
      }
      if (req.method !== "POST") {
        writeJson(res, 405, { ok: false, error: { code: "method-error", message: "method not allowed" } });
        return;
      }
      try {
        const url = new URL(req.url ?? "/", "http://dsh.internal");
        const sessionId = url.searchParams.get("sessionId");
        const dir = url.searchParams.get("dir");
        const relativePath = url.searchParams.get("relativePath");
        if (sessionId === null || dir === null || relativePath === null || relativePath.trim() === "") {
          throw new SidebarError("bad-request", "sessionId, dir, and relativePath are required");
        }
        const cwd = await scopedActiveWorktreeRootOf(ctx, sessionId, await sessionCwdOf(ctx, sessionId, url.searchParams.get("cwd") ?? void 0));
        const { path, size } = await writeWorkspaceUpload({
          cwd,
          dir,
          relativePath,
          chunks: req
        });
        writeOk(res, { path, size });
      } catch (error) {
        writeError(res, error);
      }
    }
  }), "dsh-better-sidebar: /sidebar/upload route");
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/sidebar/write",
    handler: async (req, res) => {
      if (!fence(req)) {
        writeJson(res, 403, { ok: false, error: { code: "forbidden", message: "forbidden" } });
        return;
      }
      if (req.method !== "POST") {
        writeJson(res, 405, { ok: false, error: { code: "method-error", message: "method not allowed" } });
        return;
      }
      try {
        const url = new URL(req.url ?? "/", "http://dsh.internal");
        const sessionId = url.searchParams.get("sessionId");
        const path = url.searchParams.get("path");
        if (sessionId === null || path === null || path === "") {
          throw new SidebarError("bad-request", "sessionId and path are required");
        }
        const cwd = await scopedActiveWorktreeRootOf(ctx, sessionId, await sessionCwdOf(ctx, sessionId, url.searchParams.get("cwd") ?? void 0));
        const raw = url.searchParams.get("expectedMtimeMs");
        const parsed = raw === null ? Number.NaN : Number(raw);
        const expectedMtimeMs = Number.isFinite(parsed) ? parsed : void 0;
        const content = await readTextBody(req, WRITE_BODY_GUARD_BYTES);
        const result = await writeWorkspaceText({
          cwd,
          path,
          content,
          ...expectedMtimeMs === void 0 ? {} : { expectedMtimeMs }
        });
        writeOk(res, { ok: true, ...result });
      } catch (error) {
        writeError(res, error);
      }
    }
  }), "dsh-better-sidebar: /sidebar/write route");
  ctx.effect(() => registerBundleRoute(ctx, fence), "dsh-better-sidebar: /sidebar/bundle chunk route");
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/sidebar/archive",
    handler: async (req, res) => {
      if (!fence(req)) {
        writeJson(res, 403, { ok: false, error: { code: "forbidden", message: "forbidden" } });
        return;
      }
      if (req.method !== "GET") {
        writeJson(res, 405, { ok: false, error: { code: "method-error", message: "method not allowed" } });
        return;
      }
      try {
        const url = new URL(req.url ?? "/", "http://dsh.internal");
        await respondArchiveDownload(archiveTasks, {
          sessionId: url.searchParams.get("sessionId"),
          id: url.searchParams.get("id")
        }, res);
      } catch (error) {
        writeError(res, error);
      }
    }
  }), "dsh-better-sidebar: /sidebar/archive route");
  ctx.effect(() => ctx.webServer.register({
    kind: "prefix",
    path: "/sidebar/file",
    handler: async (req, res) => {
      if (!fence(req)) {
        res.writeHead(403);
        res.end("forbidden");
        return;
      }
      if (req.method !== "GET") {
        res.writeHead(405);
        res.end();
        return;
      }
      try {
        const url = new URL(req.url ?? "/", "http://dsh.internal");
        const sessionId = url.searchParams.get("sessionId");
        const raw = url.searchParams.get("path");
        if (sessionId === null || raw === null) throw new SidebarError("bad-request", "sessionId and path are required");
        const cwd = await scopedActiveWorktreeRootOf(ctx, sessionId, await sessionCwdOf(ctx, sessionId, url.searchParams.get("cwd") ?? void 0));
        const path = await ensureWorkspacePath(cwd, raw);
        const info = await statFileForRoute(path);
        if (!info.isFile()) {
          throw new SidebarError("fs-error", "not a file", 400);
        }
        const type = mediaTypeForPath(path);
        const headers = { "content-type": type, "cache-control": "no-cache" };
        if (type === "image/svg+xml") {
          headers["content-security-policy"] = "sandbox; object-src 'none'";
          headers["x-content-type-options"] = "nosniff";
          headers["referrer-policy"] = "no-referrer";
        }
        if (url.searchParams.get("download") === "1") {
          headers["content-disposition"] = `attachment; filename*=UTF-8''${encodeURIComponent(basename3(path))}`;
        }
        await streamFileToResponse(path, info.size, res, headers);
      } catch (error) {
        writeError(res, error);
      }
    }
  }), "dsh-better-sidebar: /sidebar/file media route");
  ctx.effect(() => ctx.webServer.register({
    kind: "prefix",
    path: "/sidebar/html",
    handler: async (req, res) => {
      if (!fence(req)) {
        res.writeHead(403);
        res.end("forbidden");
        return;
      }
      if (req.method !== "GET") {
        res.writeHead(405);
        res.end();
        return;
      }
      try {
        const url = new URL(req.url ?? "/", "http://dsh.internal");
        const decoded = decodeHtmlUrl(url.pathname);
        if (!decoded.ok) {
          writeError(res, new SidebarError("bad-request", decoded.message, decoded.status));
          return;
        }
        const { sessionId, path } = decoded.ref;
        const cwd = await scopedActiveWorktreeRootOf(ctx, sessionId, await sessionCwdOf(ctx, sessionId));
        const absolute = await ensureWorkspacePath(cwd, path);
        const info = await statFileForRoute(absolute);
        if (!info.isFile()) {
          throw new SidebarError("fs-error", "not a file", 400);
        }
        const type = mediaTypeForPath(absolute);
        await streamFileToResponse(absolute, info.size, res, {
          "content-type": type === "text/html" ? "text/html; charset=utf-8" : type,
          "cache-control": "no-cache",
          "x-content-type-options": "nosniff",
          "referrer-policy": "no-referrer",
          // The sandbox directive (no allow-same-origin → opaque origin) is
          // the previewer's security boundary even for top-level loads;
          // object-src 'none' blocks plugin embeds.
          "content-security-policy": "sandbox allow-scripts allow-popups allow-downloads allow-modals; object-src 'none'"
        });
      } catch (error) {
        writeError(res, error);
      }
    }
  }), "dsh-better-sidebar: /sidebar/html preview route");
  const agentOpenWss = new WebSocketServer({ noServer: true });
  ctx.effect(() => ctx.webServer.registerUpgrade({
    path: "/sidebar/ws/agent-opens",
    handler: (req, socket, head) => {
      if (!fence(req)) {
        socket.destroy();
        return;
      }
      agentOpenWss.handleUpgrade(req, socket, head, (ws) => {
        void attachAgentOpen(agentOpenRegistry, ws, req);
      });
    }
  }), "dsh-better-sidebar: agent-opens push WebSocket");
  const fsWatchWss = new WebSocketServer({ noServer: true });
  ctx.effect(() => ctx.webServer.registerUpgrade({
    path: "/sidebar/ws/fs-watch",
    handler: (req, socket, head) => {
      if (!fence(req)) {
        socket.destroy();
        return;
      }
      fsWatchWss.handleUpgrade(req, socket, head, (ws) => {
        void attachFsWatch(ctx, ws, req);
      });
    }
  }), "dsh-better-sidebar: file-tree watch WebSocket");
  const sidechatWss = new WebSocketServer({ noServer: true });
  const sidechatPush = createSidechatPushHub(ctx);
  ctx.effect(() => () => {
    sidechatPush.dispose();
  }, "dsh-better-sidebar: side-chat push hub");
  ctx.effect(() => ctx.webServer.registerUpgrade({
    path: "/sidebar/ws/sidechat",
    handler: (req, socket, head) => {
      if (!fence(req)) {
        socket.destroy();
        return;
      }
      sidechatWss.handleUpgrade(req, socket, head, (ws) => {
        sidechatPush.attach(ws);
      });
    }
  }), "dsh-better-sidebar: side-chat push WebSocket");
  ctx.effect(() => () => {
    openToolsDisposers?.();
    agentOpenRegistry.dispose();
    for (const wss of [agentOpenWss, fsWatchWss, sidechatWss]) {
      for (const client of wss.clients) client.close();
      wss.close();
    }
  }, "dsh-better-sidebar: teardown");
}
async function attachFsWatch(ctx, ws, req) {
  try {
    const url = new URL(req.url ?? "/", "http://dsh.internal");
    const sessionId = url.searchParams.get("sessionId");
    if (sessionId === null) {
      ws.close(1008, "sessionId is required");
      return;
    }
    const watchers = createDirectoryWatchers(
      (event) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ dir: event.dir }));
      },
      (dir, error) => {
        ctx.logger.warn("dsh-better-sidebar: cannot watch %s", dir);
        ctx.logger.warn(error);
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ dir, ok: false }));
      }
    );
    ws.on("close", () => {
      watchers.close();
    });
    ws.on("error", () => {
      watchers.close();
    });
    ws.on("message", (data) => {
      void handleFsWatchFrame(ctx, ws, watchers, sessionId, data);
    });
  } catch (error) {
    ws.close(1011, error instanceof Error ? error.message : String(error));
  }
}
async function handleFsWatchFrame(ctx, ws, watchers, sessionId, data) {
  let frame;
  try {
    frame = JSON.parse(typeof data === "string" ? data : String(data));
  } catch {
    return;
  }
  const path = typeof frame.path === "string" ? frame.path : void 0;
  if (path === void 0 || path === "") return;
  try {
    const cwd = await scopedActiveWorktreeRootOf(ctx, sessionId, await sessionCwdOf(ctx, sessionId));
    const dir = await ensureWorkspacePath(cwd, path);
    if (frame.op === "unwatch") {
      watchers.remove(dir);
      return;
    }
    if (frame.op !== "watch") return;
    const ok = watchers.add(dir);
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ dir, ok }));
  } catch (error) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ dir: path, ok: false, reason: error instanceof Error ? error.message : String(error) }));
    }
  }
}
async function attachAgentOpen(registry, ws, req) {
  try {
    const url = new URL(req.url ?? "/", "http://dsh.internal");
    const sessionId = url.searchParams.get("sessionId");
    if (sessionId === null) {
      ws.close(1008, "sessionId is required");
      return;
    }
    const send = (request) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(request));
      }
    };
    const unsubscribe = registry.attach(sessionId, send);
    ws.on("close", () => {
      unsubscribe();
    });
    ws.on("error", () => {
      unsubscribe();
    });
  } catch (error) {
    ws.close(1011, error instanceof Error ? error.message : String(error));
  }
}
export {
  Config,
  FS_TREES_MAX_PATHS,
  apply,
  contentDispositionOf,
  inject,
  mediaTypeForPath,
  name
};

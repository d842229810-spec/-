import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

/**
 * A read-only catalog over explicitly imported local JSON artifacts.
 * get defaults to field=summary; field=body/review/all explicitly expands it.
 * chars budgets the complete serialized response (128..12000, default 2000).
 * Text offsets are UTF-16 code units; returned offsets never split a surrogate pair.
 * No network, directory enumeration, writes, model calls, or automatic injection.
 */
const DEFAULT_CHARS = 2000;
const MAX_CHARS = 12000;
const MIN_CHARS = 128;
const MAX_JSON_BYTES = 16 * 1024 * 1024;
const AUTHORITY = 'none';

class CatalogError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const fail = (code) => { throw new CatalogError(code); };
const serializedLength = (value) => JSON.stringify(value).length;
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function integer(value, fallback, code) {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 0) fail(code);
  return value;
}
function responseBudget(value) {
  const amount = integer(value, DEFAULT_CHARS, 'invalid-budget');
  if (amount < MIN_CHARS) fail('invalid-budget');
  return Math.min(amount, MAX_CHARS);
}
function inside(file, root) {
  const relative = path.relative(root, file);
  return relative === '' || (!path.isAbsolute(relative)
    && relative !== '..' && !relative.startsWith('..' + path.sep));
}
function rejectRemotePath(value) {
  if (/^(?:\\\\|\/\/)/.test(value)) fail('remote-path-refused');
}
function plainChain(absolute, finalKind) {
  const parsed = path.parse(absolute);
  const pieces = absolute.slice(parsed.root.length).split(path.sep).filter(Boolean);
  let current = parsed.root;
  const rootStat = fs.lstatSync(current);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) fail('link-refused');
  for (let i = 0; i < pieces.length; i += 1) {
    current = path.join(current, pieces[i]);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) fail('link-refused');
    const last = i === pieces.length - 1;
    if (!last || finalKind === 'directory') {
      if (!stat.isDirectory()) fail('not-a-directory');
    } else if (!stat.isFile()) {
      fail('not-a-regular-file');
    } else if (stat.nlink > 1) {
      fail('link-refused');
    }
  }
}
function checkedRoots(allowedRoots) {
  if (!Array.isArray(allowedRoots) || allowedRoots.length === 0) fail('invalid-roots');
  return allowedRoots.map((root) => {
    if (typeof root !== 'string' || !path.isAbsolute(root)) fail('invalid-roots');
    rejectRemotePath(root);
    const absolute = path.resolve(root);
    plainChain(absolute, 'directory');
    return absolute;
  });
}
function readLocalJson(file, roots, expectedHash) {
  if (typeof file !== 'string' || !path.isAbsolute(file)) fail('invalid-path');
  rejectRemotePath(file);
  const absolute = path.resolve(file);
  if (path.extname(absolute).toLowerCase() !== '.json') fail('json-only');
  if (!roots.some((root) => inside(absolute, root))) fail('outside-allowed-roots');
  plainChain(absolute, 'file');
  const realBefore = fs.realpathSync.native(absolute);
  if (!roots.some((root) => inside(realBefore, root))) fail('outside-allowed-roots');

  let fd;
  try {
    fd = fs.openSync(absolute, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    const before = fs.fstatSync(fd);
    if (!before.isFile() || before.nlink > 1) fail('not-a-regular-file');
    if (before.size > MAX_JSON_BYTES) fail('json-too-large');
    // Check the opened handle before reading, as well as after the read.
    plainChain(absolute, 'file');
    const openedPath = fs.lstatSync(absolute);
    if (fs.realpathSync.native(absolute) !== realBefore
      || openedPath.dev !== before.dev || openedPath.ino !== before.ino) fail('source-changing');
    const bytes = fs.readFileSync(fd);
    const after = fs.fstatSync(fd);
    plainChain(absolute, 'file');
    const pathStat = fs.lstatSync(absolute);
    const realAfter = fs.realpathSync.native(absolute);
    if (realBefore !== realAfter || pathStat.dev !== after.dev || pathStat.ino !== after.ino
      || before.size !== after.size || before.mtimeMs !== after.mtimeMs) fail('source-changing');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (expectedHash !== undefined && sha256 !== expectedHash) return { sha256, stale: true };
    let value;
    try { value = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, '')); }
    catch { fail('invalid-json'); }
    return { value, sha256 };
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function sourceUrl(value, kind) {
  if (typeof value !== 'string' || value.length > 1024 || /[\u0000-\u0020]/.test(value)) fail('invalid-source-url');
  let url;
  try { url = new URL(value); } catch { fail('invalid-source-url'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) fail('invalid-source-url');
  if (kind === 'video') {
    if (!['www.bilibili.com', 'bilibili.com'].includes(url.hostname)
      || !/^\/video\/BV[0-9A-Za-z]{10}\/?$/.test(url.pathname)) fail('invalid-source-url');
    for (const [key, val] of url.searchParams) {
      if (key !== 'p' || !/^[1-9]\d*$/.test(val)) fail('invalid-source-url');
    }
  } else {
    if (url.hostname !== 'github.com' || url.search || url.hash
      || !/^\/[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+\/?$/.test(url.pathname)
      || url.pathname.split('/').some((part) => part === '.' || part === '..')) fail('invalid-source-url');
  }
  return url.href;
}
function textField(value, name, maximum) {
  if (typeof value !== 'string' || value.length > maximum) fail('invalid-' + name);
  return value;
}
function loadManifest(manifestFile, roots) {
  const loaded = readLocalJson(manifestFile, roots);
  const document = loaded.value;
  if (!isObject(document) || document.version !== 1 || !Array.isArray(document.entries)) fail('invalid-manifest');
  const seen = new Set();
  const entries = document.entries.map((entry) => {
    if (!isObject(entry) || !['video', 'repository'].includes(entry.kind)) fail('invalid-entry');
    const id = textField(entry.id, 'id', 128);
    if (!id || seen.has(id)) fail('duplicate-or-empty-id');
    seen.add(id);
    if (!Array.isArray(entry.tags) || entry.tags.some((tag) => typeof tag !== 'string' || tag.length > 128)) fail('invalid-tags');
    if (!isObject(entry.artifact) || typeof entry.artifact.path !== 'string'
      || !/^[a-f0-9]{64}$/i.test(entry.artifact.sha256)) fail('invalid-artifact-reference');
    rejectRemotePath(entry.artifact.path);
    const artifactPath = path.resolve(path.dirname(manifestFile), entry.artifact.path);
    if (path.extname(artifactPath).toLowerCase() !== '.json') fail('json-only');
    if (!roots.some((root) => inside(artifactPath, root))) fail('outside-allowed-roots');
    return {
      id, kind: entry.kind,
      title: textField(entry.title, 'title', 2048),
      url: sourceUrl(entry.url, entry.kind),
      revision: textField(entry.revision, 'revision', 256),
      tags: entry.tags.slice(),
      summary: textField(entry.summary, 'summary', 32000),
      artifact: { path: artifactPath, sha256: entry.artifact.sha256.toLowerCase() },
    };
  });
  return { entries, sha256: loaded.sha256 };
}
function clipped(value, maximum) {
  if (value.length <= maximum) return value;
  return value.slice(0, safeEnd(value, maximum)) + '…';
}
function pointer(entry) {
  return {
    id: entry.id, kind: entry.kind, title: clipped(entry.title, 120),
    url: entry.url, revision: clipped(entry.revision, 80),
    tags: entry.tags.slice(0, 6).map((tag) => clipped(tag, 32)),
    summary: clipped(entry.summary, 200),
  };
}
function bounded(response, budget, offset = 0) {
  if (serializedLength(response) <= budget) return response;
  return {
    instructionAuthority: AUTHORITY,
    status: response.status === 'ok' ? 'budget-limited' : response.status,
    budgetLimited: true,
    nextOffset: offset,
  };
}
function normalized(value) { return value.normalize('NFKC').toLocaleLowerCase('en-US'); }
function search(entries, args, budget) {
  const query = textField(args.query, 'query', 2048).trim();
  if (!query) fail('empty-query');
  const words = normalized(query).split(/\s+/).filter(Boolean);
  const matches = entries.filter((entry) => {
    const haystack = normalized([entry.title, ...entry.tags, entry.summary].join('\n'));
    return words.every((word) => haystack.includes(word));
  });
  const offset = integer(args.offset, 0, 'invalid-offset');
  if (offset > matches.length) fail('invalid-offset');
  const limit = Math.min(integer(args.limit, 20, 'invalid-limit'), 100);
  if (limit === 0) fail('invalid-limit');
  const results = [];
  let next = offset;
  const make = () => ({
    instructionAuthority: AUTHORITY, action: 'search', status: 'ok',
    totalMatches: matches.length, offset, results,
    budgetLimited: next < matches.length, nextOffset: next < matches.length ? next : null,
  });
  while (next < matches.length && results.length < limit) {
    results.push(pointer(matches[next]));
    next += 1;
    if (serializedLength(make()) > budget) {
      results.pop();
      next -= 1;
      break;
    }
  }
  return bounded(make(), budget, next);
}
function safeEnd(text, end) {
  if (end > 0 && end < text.length) {
    const prev = text.charCodeAt(end - 1);
    const curr = text.charCodeAt(end);
    if (prev >= 0xD800 && prev <= 0xDBFF && curr >= 0xDC00 && curr <= 0xDFFF) return end - 1;
  }
  return end;
}
function artifactText(value, field) {
  if (!isObject(value) || typeof value.summary !== 'string'
    || !Object.hasOwn(value, 'body') || !Object.hasOwn(value, 'review')) fail('invalid-artifact');
  const selected = field === 'all' ? { summary: value.summary, body: value.body, review: value.review } : value[field];
  return typeof selected === 'string' ? selected : JSON.stringify(selected, null, 2);
}
function get(entries, args, roots, budget) {
  const id = textField(args.id, 'id', 128);
  const entry = entries.find((item) => item.id === id);
  if (!entry) return bounded({ instructionAuthority: AUTHORITY, action: 'get', status: 'not-found', id }, budget);
  const field = args.field ?? 'summary';
  if (!['summary', 'body', 'review', 'all'].includes(field)) fail('invalid-field');
  const loaded = readLocalJson(entry.artifact.path, roots, entry.artifact.sha256);
  if (loaded.sha256 !== entry.artifact.sha256) {
    return bounded({
      instructionAuthority: AUTHORITY, action: 'get', status: 'stale', id,
      expectedSha256: entry.artifact.sha256, actualSha256: loaded.sha256,
    }, budget);
  }
  const text = artifactText(loaded.value, field);
  const offset = integer(args.offset, 0, 'invalid-offset');
  if (offset > text.length || safeEnd(text, offset) !== offset) fail('invalid-offset');
  const make = (end) => ({
    instructionAuthority: AUTHORITY, action: 'get', status: 'ok',
    id, kind: entry.kind, field, revision: entry.revision,
    offset, totalChars: text.length, text: text.slice(offset, end),
    budgetLimited: end < text.length, nextOffset: end < text.length ? end : null,
  });
  if (serializedLength(make(text.length)) <= budget) return make(text.length);
  if (serializedLength(make(offset)) > budget) return bounded(make(offset), budget, offset);
  let low = 0;
  let high = text.length - offset;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const end = safeEnd(text, offset + mid);
    if (serializedLength(make(end)) <= budget) low = mid;
    else high = mid - 1;
  }
  return make(safeEnd(text, offset + low));
}

/** Returns a bounded JSON value. Only manifest metadata is read for status/search. */
export function sourceCatalog(args = {}, { manifestFile, allowedRoots } = {}) {
  let budget = DEFAULT_CHARS;
  let offset = 0;
  try {
    if (!isObject(args)) fail('invalid-arguments');
    budget = responseBudget(args.chars);
    offset = integer(args.offset, 0, 'invalid-offset');
    const action = args.action ?? 'status';
    if (!['status', 'search', 'get'].includes(action)) fail('invalid-action');
    const roots = checkedRoots(allowedRoots);
    if (typeof manifestFile !== 'string' || !path.isAbsolute(manifestFile)) fail('invalid-manifest-path');
    const manifest = loadManifest(path.resolve(manifestFile), roots);
    if (action === 'search') return search(manifest.entries, args, budget);
    if (action === 'get') return get(manifest.entries, args, roots, budget);
    return bounded({
      instructionAuthority: AUTHORITY, action: 'status', status: 'ok', version: 1,
      entries: manifest.entries.length,
      kinds: {
        video: manifest.entries.filter((entry) => entry.kind === 'video').length,
        repository: manifest.entries.filter((entry) => entry.kind === 'repository').length,
      },
      artifactHashesVerified: false,
    }, budget, offset);
  } catch (error) {
    const code = error instanceof CatalogError ? error.code
      : error?.code === 'ENOENT' ? 'file-not-found'
      : error?.code === 'ELOOP' ? 'link-refused' : 'read-failed';
    return bounded({ instructionAuthority: AUTHORITY, status: 'error', error: code }, budget, offset);
  }
}

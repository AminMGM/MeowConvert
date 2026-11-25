import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

export const require = createRequire(import.meta.url);

/** Native binaries cannot run from inside app.asar; electron-builder unpacks them next to it. */
export function unpacked(filePath) {
  return filePath.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
}

export const ffmpegPath = unpacked(require('ffmpeg-static'));
export const sevenZipPath = unpacked(require('7zip-bin').path7za);
export const bsdtarPath = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');

export class CancelledError extends Error {
  constructor() {
    super('Cancelled');
    this.cancelled = true;
  }
}

export function throwIfCancelled(signal) {
  if (signal?.aborted) throw new CancelledError();
}

/** Runs a process, streaming output to callbacks. Rejects with the stderr tail on failure. */
export function run(command, args, { signal, onStdout, onStderr, cwd, env, allowFail = false, input } = {}) {
  return new Promise((resolve, reject) => {
    throwIfCancelled(signal);
    const child = spawn(command, args, { cwd, env, windowsHide: true, stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const abort = () => child.kill('SIGKILL');
    signal?.addEventListener('abort', abort, { once: true });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      if (stdout.length < 1_000_000) stdout += chunk;
      onStdout?.(chunk);
    });
    child.stderr.on('data', chunk => {
      stderr = (stderr + chunk).slice(-64_000);
      onStderr?.(chunk);
    });
    if (input) child.stdin.end(input);
    child.on('error', error => {
      signal?.removeEventListener('abort', abort);
      reject(error);
    });
    child.on('close', code => {
      signal?.removeEventListener('abort', abort);
      if (signal?.aborted) return reject(new CancelledError());
      if (code !== 0 && !allowFail) {
        const error = new Error(summarizeError(stderr) || `${path.basename(command)} exited with code ${code}`);
        error.stderr = stderr;
        return reject(error);
      }
      resolve({ code, stdout, stderr });
    });
  });
}

function summarizeError(stderr) {
  const lines = stderr.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const interesting = lines.filter(line => /error|invalid|unable|not supported|could not|failed|no such|unknown|incorrect|does not|cannot|too /i.test(line));
  return (interesting.slice(-2).join(' — ') || lines.slice(-1)[0] || '').slice(0, 400);
}

const reserved = new Set();

export function sanitizeFileName(name) {
  const cleaned = String(name).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '').trim();
  return cleaned && cleaned !== '.' && cleaned !== '..' ? cleaned.slice(0, 200) : 'output';
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/** Splits "file.tar.gz" into ["file", ".tar.gz"]. */
export function splitName(fileName) {
  const match = /^(.*?)(\.tar\.(?:gz|bz2|xz|zst))$/i.exec(fileName);
  if (match) return [match[1], match[2]];
  const ext = path.extname(fileName);
  return [fileName.slice(0, fileName.length - ext.length), ext];
}

/** Reserves a collision-free path in `dir`, unique across concurrent jobs too. */
export async function reservePath(dir, fileName, { overwrite = false } = {}) {
  const [base, ext] = splitName(sanitizeFileName(fileName));
  for (let index = 0; index < 10_000; index += 1) {
    const candidate = path.join(dir, index ? `${base} (${index})${ext}` : `${base}${ext}`);
    const key = candidate.toLowerCase();
    if (reserved.has(key)) continue;
    if (!overwrite && await exists(candidate)) continue;
    reserved.add(key);
    return { path: candidate, release: () => reserved.delete(key) };
  }
  throw new Error('Could not find a free output filename.');
}

export async function makeTempDir() {
  const dir = path.join(os.tmpdir(), `meowconvert-${randomUUID()}`);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function removeQuietly(target) {
  try {
    await fs.rm(target, { recursive: true, force: true });
  } catch {
    // Best effort clean-up.
  }
}

export function stemOf(filePath) {
  return splitName(path.basename(filePath))[0];
}

export function fileSize(filePath) {
  try {
    return fssync.statSync(filePath).size;
  } catch {
    return 0;
  }
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Parses "1-3, 5, 8-" into zero-based page indexes for a document of `count` pages. */
export function parsePageRanges(spec, count) {
  const text = String(spec || '').trim();
  if (!text || text.toLowerCase() === 'all') return [...Array(count).keys()];
  const pages = [];
  for (const part of text.split(/[,;\s]+/).filter(Boolean)) {
    const match = /^(\d*)\s*-\s*(\d*)$/.exec(part);
    if (match) {
      const start = match[1] ? Number(match[1]) : 1;
      const end = match[2] ? Number(match[2]) : count;
      if (start < 1 || end < start) throw new Error(`Invalid page range "${part}".`);
      for (let page = start; page <= Math.min(end, count); page += 1) pages.push(page - 1);
    } else if (/^\d+$/.test(part)) {
      const page = Number(part);
      if (page < 1 || page > count) throw new Error(`Page ${page} does not exist (document has ${count} pages).`);
      pages.push(page - 1);
    } else {
      throw new Error(`Invalid page range "${part}".`);
    }
  }
  if (!pages.length) throw new Error('The page range does not match any page.');
  return pages;
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

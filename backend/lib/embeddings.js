import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { embed } from './ollama.js';

const indexDir = () => path.join(config.vaultPath, config.files.indexDir);
const indexFile = () => path.join(indexDir(), 'embeddings.json');

// Folders/files we never embed (operational, not knowledge).
const EXCLUDE_DIRS = new Set([
  config.files.chatsDir,
  config.files.collectionsDir,
  config.files.indexDir,
  '.git', '.obsidian', '.trash', 'node_modules',
]);
const EXCLUDE_FILES = new Set([config.files.dailyLog]);

let state = { chunks: [], loaded: false, building: null };

// ── math ───────────────────────────────────────────────────────
function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

// ── walk vault for markdown ────────────────────────────────────
async function walk(dir, out = []) {
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (EXCLUDE_DIRS.has(e.name)) continue;
      // also skip the nested Supermind/ operational dirs' non-knowledge files? keep Memories + Topics.
      await walk(path.join(dir, e.name), out);
    } else if (e.isFile() && e.name.endsWith('.md') && !EXCLUDE_FILES.has(e.name)) {
      out.push(path.join(dir, e.name));
    }
  }
  return out;
}

// Split note text into ~chunkChars pieces on paragraph boundaries.
function chunkText(text, size) {
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks = [];
  let cur = '';
  for (const p of paras) {
    if ((cur + '\n\n' + p).length > size && cur) { chunks.push(cur); cur = p; }
    else cur = cur ? cur + '\n\n' + p : p;
  }
  if (cur) chunks.push(cur);
  return chunks.length ? chunks : (text.trim() ? [text.trim().slice(0, size)] : []);
}

async function loadCache() {
  try {
    const raw = JSON.parse(await fs.readFile(indexFile(), 'utf8'));
    if (raw?.model === config.models.embed && Array.isArray(raw.chunks)) return raw.chunks;
  } catch { /* no cache yet */ }
  return [];
}

async function saveCache(chunks) {
  await fs.mkdir(indexDir(), { recursive: true });
  await fs.writeFile(indexFile(), JSON.stringify({ model: config.models.embed, chunks }), 'utf8');
}

// Build/refresh the index. Only (re)embeds new or changed files.
export async function buildIndex({ force = false } = {}) {
  if (state.building) return state.building;
  state.building = (async () => {
    const cached = force ? [] : await loadCache();
    const byPath = new Map();
    for (const c of cached) {
      if (!byPath.has(c.path)) byPath.set(c.path, []);
      byPath.get(c.path).push(c);
    }

    const files = await walk(config.vaultPath);
    const fresh = [];
    let embedded = 0, reused = 0;

    for (const file of files) {
      const rel = path.relative(config.vaultPath, file);
      const stat = await fs.stat(file).catch(() => null);
      if (!stat) continue;
      const prior = byPath.get(rel);
      if (prior && prior[0]?.mtimeMs === stat.mtimeMs) { fresh.push(...prior); reused += prior.length; continue; }

      const text = await fs.readFile(file, 'utf8').catch(() => '');
      const title = path.basename(file, '.md');
      const pieces = chunkText(text, config.retrieval.chunkChars);
      for (let i = 0; i < pieces.length; i++) {
        try {
          const vec = await embed(pieces[i]);
          fresh.push({ path: rel, title, chunkIndex: i, text: pieces[i], mtimeMs: stat.mtimeMs, vec });
          embedded++;
        } catch (e) {
          // embed model likely not pulled — stop early, keep what we have.
          console.error(`[embeddings] embed failed (${e.message}). Run: ollama pull ${config.models.embed}`);
          state.chunks = fresh.length ? fresh : cached;
          state.loaded = true;
          await saveCache(state.chunks).catch(() => {});
          return state.chunks.length;
        }
      }
    }

    state.chunks = fresh;
    state.loaded = true;
    await saveCache(fresh).catch(() => {});
    console.log(`[embeddings] index ready · ${fresh.length} chunks (${embedded} embedded, ${reused} cached)`);
    return fresh.length;
  })();
  try { return await state.building; } finally { state.building = null; }
}

async function ensureLoaded() {
  if (state.loaded) return;
  await buildIndex();
}

// Semantic search → best chunk per note, sorted by score.
export async function search(query, k = config.retrieval.topK) {
  if (!config.retrieval.enabled) return [];
  await ensureLoaded();
  if (!state.chunks.length) return [];
  let qv;
  try { qv = await embed(query); } catch { return []; }

  const best = new Map(); // path -> {path,title,text,score}
  for (const c of state.chunks) {
    if (!c.vec?.length) continue;
    const score = cosine(qv, c.vec);
    const prev = best.get(c.path);
    if (!prev || score > prev.score) best.set(c.path, { path: c.path, title: c.title, text: c.text, score });
  }
  return [...best.values()]
    .filter((r) => r.score >= config.retrieval.minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

export function indexStats() {
  return { loaded: state.loaded, chunks: state.chunks.length, model: config.models.embed };
}

import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { search } from './embeddings.js';

const EXCLUDE_DIRS = new Set([
  config.files.chatsDir, config.files.collectionsDir, config.files.indexDir,
  '.git', '.obsidian', '.trash', 'node_modules',
]);

// [[Note]], [[Note|alias]], [[Note#heading]] → "Note"
export function parseWikiLinks(text = '') {
  const out = [];
  const re = /\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const name = m[1].trim().split('/').pop();
    if (name) out.push(name);
  }
  return out;
}

function stripToFirstPara(text) {
  return text
    .replace(/^---[\s\S]*?---\n/, '')       // frontmatter
    .replace(/^#+\s.*$/gm, '')               // headings
    .split(/\n\s*\n/).map((s) => s.trim()).find(Boolean) || '';
}

// ── in-memory link graph (rebuilt lazily) ──────────────────────
let graph = { at: 0, titleToPath: new Map(), neighbors: new Map() };

async function walkMd(dir, out = []) {
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.isDirectory()) { if (!EXCLUDE_DIRS.has(e.name)) await walkMd(path.join(dir, e.name), out); }
    else if (e.isFile() && e.name.endsWith('.md')) out.push(path.join(dir, e.name));
  }
  return out;
}

async function ensureGraph() {
  if (Date.now() - graph.at < 30_000 && graph.titleToPath.size) return graph;
  const files = await walkMd(config.vaultPath);
  const titleToPath = new Map();
  const out = new Map();
  const back = new Map();
  const add = (map, k, v) => { if (!map.has(k)) map.set(k, new Set()); map.get(k).add(v); };

  for (const f of files) {
    const title = path.basename(f, '.md');
    titleToPath.set(title, f);
    const content = await fs.readFile(f, 'utf8').catch(() => '');
    for (const link of parseWikiLinks(content)) { add(out, title, link); add(back, link, title); }
  }
  const neighbors = new Map();
  for (const title of titleToPath.keys()) {
    const s = new Set([...(out.get(title) || []), ...(back.get(title) || [])]);
    s.delete(title);
    neighbors.set(title, [...s]);
  }
  graph = { at: Date.now(), titleToPath, neighbors };
  return graph;
}

async function firstParaOf(title, g) {
  const p = g.titleToPath.get(title);
  if (!p) return null; // unresolved link (still a real graph node, just no file yet)
  const content = await fs.readFile(p, 'utf8').catch(() => '');
  const para = stripToFirstPara(content);
  return para ? para.slice(0, 180) : null;
}

// Build the chat-init grounding block. Runs once per conversation.
export async function getChatInitContext(query) {
  if (!config.retrieval.enabled) return '';
  const hits = await search(query, config.retrieval.topK);
  if (!hits.length) return '';

  const g = await ensureGraph();
  const seen = new Set(hits.map((h) => h.title));
  const budget = config.retrieval.maxChars;
  let used = 0;
  const parts = [];

  for (const hit of hits) {
    const chunk = hit.text.length > 700 ? hit.text.slice(0, 700) + '…' : hit.text;
    let block = `[[${hit.title}]] (relevance ${hit.score.toFixed(2)})\n${chunk}`;

    // 1-hop neighbors from the graph.
    const neigh = (g.neighbors.get(hit.title) || []).filter((n) => !seen.has(n)).slice(0, config.retrieval.neighbors);
    const linkLines = [];
    for (const n of neigh) {
      seen.add(n);
      const para = await firstParaOf(n, g);
      linkLines.push(para ? `  ↳ [[${n}]] — ${para}` : `  ↳ [[${n}]]`);
    }
    if (linkLines.length) block += '\n' + linkLines.join('\n');

    if (used + block.length > budget) break;
    parts.push(block);
    used += block.length;
  }

  if (!parts.length) return '';
  return (
    `<vault_context>\n` +
    `Relevant notes retrieved from your Obsidian vault (semantic match + linked nodes). ` +
    `Treat these as your own long-term memory; reference them naturally.\n\n` +
    parts.join('\n\n') +
    `\n</vault_context>`
  );
}

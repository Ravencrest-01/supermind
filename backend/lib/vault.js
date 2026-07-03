import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

const chatsDir = () => path.join(config.vaultPath, config.files.chatsDir);
const memoryPath = () => path.join(config.vaultPath, config.files.memory);
const dailyLogPath = () => path.join(config.vaultPath, config.files.dailyLog);

const collectionsDir = () => path.join(config.vaultPath, config.files.collectionsDir);
const memoriesDir = () => path.join(config.vaultPath, config.files.memoriesDir);

// Make sure the vault + chats folder + seed files exist on boot.
export async function ensureVault() {
  await fs.mkdir(chatsDir(), { recursive: true });
  await fs.mkdir(collectionsDir(), { recursive: true });
  await fs.mkdir(memoriesDir(), { recursive: true });
  if (!fssync.existsSync(memoryPath())) {
    await fs.writeFile(
      memoryPath(),
      `# Supermind Core Memory\n\n` +
        `This file is your permanent context. The AI reads it on every turn.\n` +
        `Edit it in Obsidian to steer your Supermind.\n\n` +
        `## Directives\n- \n\n## User Context\n- \n\n## Active Workflows\n- \n`,
      'utf8'
    );
  }
  if (!fssync.existsSync(dailyLogPath())) {
    await fs.writeFile(dailyLogPath(), `# Supermind Chat Log\n\n`, 'utf8');
  }
}

// Permanent context injected as the system prompt.
export async function readCoreMemory(activeTag) {
  let coreText = '';
  try {
    coreText = await fs.readFile(memoryPath(), 'utf8');
  } catch {
    coreText = '';
  }

  if (config.memoryEnabled && activeTag) {
    try {
      const files = await fs.readdir(memoriesDir());
      const mdFiles = files.filter(f => f.endsWith('.md'));
      
      const matchedNodes = [];
      const searchTag = activeTag.toLowerCase();

      for (const file of mdFiles) {
        try {
          const content = await fs.readFile(path.join(memoriesDir(), file), 'utf8');
          if (file.toLowerCase().includes(searchTag) || content.toLowerCase().includes(searchTag)) {
            matchedNodes.push({ title: file.replace('.md', ''), content });
            if (matchedNodes.length >= 10) break; // hard cap at 10 to protect context
          }
        } catch (e) {
          // ignore read errors
        }
      }

      if (matchedNodes.length > 0) {
        coreText += `\n\n## Targeted Supermemory Nodes (Keyword: "${activeTag}"):\n`;
        coreText += `The user requested to load the following specific memory nodes. Use them as the primary context for this conversation.\n\n`;

        for (const node of matchedNodes) {
          coreText += `--- MEMORY NODE: ${node.title} ---\n${node.content}\n\n`;
        }
      }
    } catch (e) {
      // Memories dir doesn't exist yet, ignore
    }
  }

  return coreText;
}

// ── Conversation storage ───────────────────────────────────────
// Canonical source of truth = <id>.json (reliable to reload).
// Human-readable mirror = <id>.md (browse inside Obsidian).

const jsonPath = (id) => path.join(chatsDir(), `${id}.json`);
const mdPath = (id) => path.join(chatsDir(), `${id}.md`);

export function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function listConversations() {
  await ensureVault();
  const entries = await fs.readdir(chatsDir());
  const metas = [];
  for (const f of entries) {
    if (!f.endsWith('.json')) continue;
    try {
      const c = JSON.parse(await fs.readFile(path.join(chatsDir(), f), 'utf8'));
      metas.push({
        id: c.id,
        title: c.title || 'Untitled',
        model: c.model,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        preview: c.messages?.at(-1)?.content?.slice(0, 80) || '',
      });
    } catch {
      /* skip corrupt files */
    }
  }
  metas.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return metas;
}

export async function getConversation(id) {
  try {
    return JSON.parse(await fs.readFile(jsonPath(id), 'utf8'));
  } catch {
    return null;
  }
}

export async function saveConversation(convo) {
  await ensureVault();
  convo.updatedAt = Date.now();
  await fs.writeFile(jsonPath(convo.id), JSON.stringify(convo, null, 2), 'utf8');
  await fs.writeFile(mdPath(convo.id), renderMarkdown(convo), 'utf8');
  return convo;
}

export async function deleteConversation(id) {
  await Promise.allSettled([fs.rm(jsonPath(id)), fs.rm(mdPath(id))]);
}

export async function saveImages(imagesBase64) {
  if (!imagesBase64 || imagesBase64.length === 0) return [];
  await ensureVault();
  const savedPaths = [];
  for (const b64 of imagesBase64) {
    const id = newId();
    const filename = `${id}.png`;
    const fullPath = path.join(collectionsDir(), filename);
    const buffer = Buffer.from(b64, 'base64');
    await fs.writeFile(fullPath, buffer);
    savedPaths.push(filename);
  }
  return savedPaths;
}

function renderMarkdown(convo) {
  const lines = [
    `---`,
    `id: ${convo.id}`,
    `title: ${convo.title}`,
    `model: ${convo.model}`,
    `created: ${new Date(convo.createdAt).toISOString()}`,
    `updated: ${new Date(convo.updatedAt).toISOString()}`,
    `---`,
    ``,
    `# ${convo.title}`,
    ``,
  ];
  for (const m of convo.messages || []) {
    const who = m.role === 'user' ? '🧑 You' : '🧠 Supermind';
    const stamp = m.at ? ` · ${new Date(m.at).toLocaleString()}` : '';
    lines.push(`**${who}**${stamp}`);
    if (m.imagePaths?.length) {
      lines.push(m.imagePaths.map(p => `![[${config.files.collectionsDir}/${p}]]`).join('\n'));
    }
    lines.push('', m.content || '', '');
  }
  return lines.join('\n');
}

// Append-only human-readable daily ledger (per the spec).
export async function appendDailyLog(convo, userMsg, assistantMsg) {
  await ensureVault();
  const ts = new Date().toLocaleString();
  const block =
    `\n---\n### ${ts} · \`${convo.model}\` · ctx=${config.numCtx}\n` +
    `**You:** ${userMsg.content}\n\n` +
    `**Supermind:** ${assistantMsg.content}\n`;
  await fs.appendFile(dailyLogPath(), block, 'utf8');
}

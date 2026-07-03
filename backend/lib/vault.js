import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

const chatsDir = () => path.join(config.vaultPath, config.files.chatsDir);
const memoryPath = () => path.join(config.vaultPath, config.files.memory);
const dailyLogPath = () => path.join(config.vaultPath, config.files.dailyLog);

// Make sure the vault + chats folder + seed files exist on boot.
export async function ensureVault() {
  await fs.mkdir(chatsDir(), { recursive: true });
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
export async function readCoreMemory() {
  try {
    return await fs.readFile(memoryPath(), 'utf8');
  } catch {
    return '';
  }
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
    if (m.images?.length) lines.push(`_[${m.images.length} image(s) attached]_`);
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

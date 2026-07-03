import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { chatOnce } from './ollama.js';
import { saveConversation } from './vault.js';

const topicsDir = () => path.join(config.vaultPath, config.files.topicsDir);

function parseJson(raw) {
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    return JSON.parse(m ? m[0] : raw);
  } catch { return null; }
}

function pad(n) { return String(n).padStart(2, '0'); }
function stamp(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Keep [[wikilinks]] only if brackets are balanced; else strip to plain text.
function sanitizeBullet(s) {
  let t = String(s || '').replace(/\s+/g, ' ').trim();
  const opens = (t.match(/\[\[/g) || []).length;
  const closes = (t.match(/\]\]/g) || []).length;
  if (opens !== closes) t = t.replace(/\[\[|\]\]/g, '');
  t = t.replace(/\[\[\s*\]\]/g, '');           // empty links
  return t.slice(0, 300).replace(/^[-*\s]+/, ''); // drop leading bullet chars
}

// ── Call 1: classify into the closed tag vocabulary ────────────
async function classify(transcript) {
  const allowed = config.finalize.tags;
  try {
    const raw = await chatOnce({
      model: config.models.text,
      format: 'json',
      messages: [
        {
          role: 'system',
          content:
            `Classify the conversation into EXACTLY ONE category. ` +
            `Respond ONLY with JSON: {"category": "<one value>"}. ` +
            `The value MUST be exactly one of: ${allowed.join(', ')}.`,
        },
        { role: 'user', content: transcript },
      ],
    });
    const cat = String(parseJson(raw)?.category || '').toLowerCase().trim();
    if (allowed.includes(cat)) return cat;
  } catch { /* fall through */ }
  return allowed.includes('misc') ? 'misc' : allowed[allowed.length - 1];
}

// ── Call 2: 3–5 bullets, key concepts wrapped as [[wikilinks]] ─
async function summarize(transcript) {
  const raw = await chatOnce({
    model: config.models.text,
    format: 'json',
    messages: [
      {
        role: 'system',
        content:
          `Summarize the conversation as 3 to 5 concise bullet points capturing the key decisions, ` +
          `facts, and takeaways. Wrap important concepts, tools, entities, or terms in Obsidian ` +
          `wikilink syntax [[like this]] — but only the genuinely notable ones (2–4 per bullet max, ` +
          `not every word). Respond ONLY with JSON: {"bullets": ["...", "..."]}.\n\n` +
          `Example: {"bullets": [` +
          `"Chose [[FastAPI]] over [[Flask]] for the backend to get async + typed routes",` +
          `"Set a target of [[German B1]] by December using [[Anki]] daily drills"]}`,
      },
      { role: 'user', content: transcript },
    ],
  });
  let bullets = parseJson(raw)?.bullets;
  if (!Array.isArray(bullets)) bullets = [];
  bullets = bullets.map(sanitizeBullet).filter(Boolean).slice(0, 5);
  return bullets;
}

async function appendToTopic(tag, title, bullets, convoId) {
  await fs.mkdir(topicsDir(), { recursive: true });
  const file = path.join(topicsDir(), `${tag}.md`);
  try { await fs.access(file); }
  catch {
    const heading = tag.charAt(0).toUpperCase() + tag.slice(1);
    await fs.writeFile(file, `# ${heading}\n\nAuto-growing log of everything tagged **#${tag}**.\n\n#${tag}\n`, 'utf8');
  }
  const block =
    `\n## ${stamp()} — ${title}\n` +
    bullets.map((b) => `- ${b}`).join('\n') +
    `\n_source: [[${convoId}]]_\n`;
  await fs.appendFile(file, block, 'utf8');
  return file;
}

// Summarize a concluded chat, grow the graph, tag it. Idempotent.
export async function finalizeConversation(convo) {
  if (!config.finalize.enabled) return null;
  if (!convo || convo.finalized) return null;
  const msgs = (convo.messages || []).filter((m) => m.content?.trim());
  const hasExchange = msgs.some((m) => m.role === 'user') && msgs.some((m) => m.role === 'assistant');
  if (msgs.length < 2 || !hasExchange) return null;

  // Build a bounded transcript (keep the tail — most recent context).
  const transcript = msgs
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n')
    .slice(-6000);

  try {
    const tag = await classify(transcript);
    const bullets = await summarize(transcript);
    if (!bullets.length) return null;

    const title = convo.title || 'Untitled chat';
    const file = await appendToTopic(tag, title, bullets, convo.id);

    convo.finalized = true;
    convo.topic = tag;
    convo.finalizedAt = Date.now();
    await saveConversation(convo);

    console.log(`[finalize] ${convo.id} → #${tag} (${bullets.length} pts) → ${path.basename(file)}`);
    return { tag, bullets, file };
  } catch (e) {
    console.error('[finalize] failed:', e.message);
    return null;
  }
}

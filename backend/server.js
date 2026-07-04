import express from 'express';
import cors from 'cors';
import multer from 'multer';
import EventEmitter from 'node:events';
import { config } from './config.js';
import {
  ensureVault,
  readCoreMemory,
  listConversations,
  getConversation,
  saveConversation,
  deleteConversation,
  appendDailyLog,
  newId,
  saveImages,
} from './lib/vault.js';
import { extractMemory } from './lib/memory.js';
import { streamChat, nodeStatus } from './lib/ollama.js';
import { getChatInitContext } from './lib/retrieval.js';
import { buildIndex, indexStats } from './lib/embeddings.js';
import { finalizeConversation } from './lib/finalize.js';
import { ingestFile } from './lib/ingestion.js';
import { auditFilesystem } from './lib/audit.js';

const upload = multer({ dest: 'uploads/' });
const logEmitter = new EventEmitter();

const app = express();
app.use(express.json({ limit: '25mb' })); // room for base64 images

// ── CORS ───────────────────────────────────────────────────────
app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true); // curl / same-origin
      if (config.allowedOrigins.includes('*')) return cb(null, true);
      if (config.allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`Origin ${origin} not allowed by CORS`));
    },
    allowedHeaders: ['Content-Type', 'Authorization', 'x-supermind-key', 'ngrok-skip-browser-warning'],
  })
);

// ── Optional shared-secret gate ────────────────────────────────
app.use((req, res, next) => {
  if (!config.authToken) return next();
  if (req.headers['x-supermind-key'] === config.authToken) return next();
  res.status(401).json({ error: 'unauthorized' });
});

// ── Health + node status ───────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/status', async (_req, res) => {
  res.json(await nodeStatus());
});

// ── Conversations CRUD ─────────────────────────────────────────
app.get('/api/conversations', async (_req, res) => {
  res.json(await listConversations());
});

app.get('/api/conversations/:id', async (req, res) => {
  const c = await getConversation(req.params.id);
  if (!c) return res.status(404).json({ error: 'not found' });
  res.json(c);
});

app.post('/api/conversations', async (req, res) => {
  const now = Date.now();
  const convo = {
    id: newId(),
    title: req.body?.title || 'New chat',
    model: req.body?.model || config.models.text,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  await saveConversation(convo);
  res.json(convo);
});

app.patch('/api/conversations/:id', async (req, res) => {
  const c = await getConversation(req.params.id);
  if (!c) return res.status(404).json({ error: 'not found' });
  if (typeof req.body?.title === 'string') c.title = req.body.title;
  await saveConversation(c);
  res.json(c);
});

app.delete('/api/conversations/:id', async (req, res) => {
  await deleteConversation(req.params.id);
  res.json({ ok: true });
});

// Explicitly finalize a chat now (auto-tag + summary + graph append).
// Call this from the UI on "New Chat" for instant graph growth, or let
// the inactivity sweep handle it automatically.
app.post('/api/conversations/:id/finalize', async (req, res) => {
  const c = await getConversation(req.params.id);
  if (!c) return res.status(404).json({ error: 'not found' });
  const result = await finalizeConversation(c);
  res.json({ ok: true, finalized: !!result, ...result });
});

// Embedding index: view stats or force a rebuild.
app.get('/api/index', (_req, res) => res.json(indexStats()));
app.post('/api/reindex', async (_req, res) => {
  const count = await buildIndex({ force: true });
  res.json({ ok: true, chunks: count });
});

// ── Ingestion & Audit ──────────────────────────────────────────
app.post('/api/ingest', upload.array('files'), async (req, res) => {
  const workspace = req.body.workspace;
  const files = req.files || [];
  
  if (!files.length) return res.status(400).json({ error: 'No files provided' });

  res.json({ ok: true, message: `Queued ${files.length} files for ingestion.` });

  for (const file of files) {
    ingestFile(file, workspace, (evt, data) => logEmitter.emit(evt, data)).catch(console.error);
  }
});

app.get('/api/audit', async (req, res) => {
  const auditResult = await auditFilesystem();
  res.json(auditResult);
});

app.get('/api/logs', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const listener = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  logEmitter.on('log', listener);
  req.on('close', () => {
    logEmitter.off('log', listener);
  });
});

// ── Chat (Server-Sent Events stream) ───────────────────────────
// Body: { conversationId, model, message, images?: [base64...] }
app.post('/api/chat', async (req, res) => {
  const { conversationId, model, message, images } = req.body || {};
  const targetModel = model || config.models.text;

  const convo = (await getConversation(conversationId)) || {
    id: conversationId || newId(),
    title: 'New chat',
    model: targetModel,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
  };
  convo.model = targetModel;

  const isFirstMessage = convo.messages.length === 0;

  // Auto-title from the first user message.
  if (isFirstMessage && message) {
    convo.title = message.slice(0, 40) + (message.length > 40 ? '…' : '');

    // Check for "load <tag>" command (manual, targeted memory override)
    const loadMatch = message.match(/^load\s+(.+)$/i);
    if (loadMatch) {
      convo.activeMemoryTag = loadMatch[1].trim().toLowerCase();
    }
  }

  // A new turn means the chat is active again — allow (re)finalization later.
  convo.finalized = false;

  const userMsg = { role: 'user', content: message || '', at: Date.now() };
  if (images?.length) {
    userMsg.images = images;
    userMsg.imagePaths = await saveImages(images);
  }
  convo.messages.push(userMsg);

  // Chat-init super-memory: on the first message, semantically search the
  // vault + pull linked graph nodes, then keep that grounding for the chat.
  // Skipped when the user issued an explicit `load <tag>` command.
  if (isFirstMessage && !convo.activeMemoryTag && config.retrieval.enabled) {
    convo.vaultContext = await getChatInitContext(message || '');
  }

  // Build the payload: core memory + retrieved vault context + rolling window.
  const coreMemory = await readCoreMemory(convo.activeMemoryTag);
  const systemPrompt =
    `You are a synchronized extension of the user's mind — their private "Supermind". ` +
    `Use the following Core Memory to ground your awareness. Be concise and direct.\n\n` +
    `<core_memory>\n${coreMemory}\n</core_memory>` +
    (convo.vaultContext ? `\n\n${convo.vaultContext}` : '');

  // Keep only the last N turns to protect the 4096 ctx budget.
  const WINDOW = 12;
  const history = convo.messages.slice(-WINDOW).map((m) => {
    const msg = { role: m.role, content: m.content };
    if (m.images?.length) msg.images = m.images; // Ollama accepts base64 images
    return msg;
  });

  const ollamaMessages = [{ role: 'system', content: systemPrompt }, ...history];

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  send('meta', { conversationId: convo.id, title: convo.title, model: targetModel });

  const ac = new AbortController();
  req.on('close', () => ac.abort());

  try {
    const full = await streamChat({
      model: targetModel,
      messages: ollamaMessages,
      signal: ac.signal,
      onSwap: (m) => send('swap', { model: m }),
      onToken: (t) => send('token', { t }),
    });

    const assistantMsg = { role: 'assistant', content: full, at: Date.now() };
    convo.messages.push(assistantMsg);
    await saveConversation(convo);
    await appendDailyLog(convo, userMsg, assistantMsg);

    // Run Supermemory extraction asynchronously
    extractMemory(convo, userMsg).catch(console.error);

    send('done', { conversationId: convo.id, title: convo.title });
    res.end();
  } catch (err) {
    send('error', { message: String(err.message || err) });
    res.end();
  }
});

// ── Inactivity sweep: finalize chats gone quiet ────────────────
// Server-side is the only reliable trigger — browsers give no
// dependable "chat closed" event (esp. on mobile PWA).
function startFinalizeSweep() {
  if (!config.finalize.enabled) return;
  const tick = async () => {
    try {
      const now = Date.now();
      const metas = await listConversations();
      for (const meta of metas) {
        if (now - (meta.updatedAt || 0) < config.finalize.inactivityMs) continue;
        const convo = await getConversation(meta.id);
        if (convo && !convo.finalized) await finalizeConversation(convo);
      }
    } catch (e) {
      console.error('[sweep] error:', e.message);
    }
  };
  setInterval(tick, config.finalize.sweepMs);
  console.log(`  → finalize sweep every ${config.finalize.sweepMs / 60000}m (idle ${config.finalize.inactivityMs / 60000}m)`);
}

// ── Boot ───────────────────────────────────────────────────────
await ensureVault();
app.listen(config.port, config.host, () => {
  console.log(`\n  Supermind backend live`);
  console.log(`  → http://${config.host}:${config.port}`);
  console.log(`  → vault:  ${config.vaultPath}`);
  console.log(`  → ollama: ${config.ollamaUrl}`);
  console.log(`  → models: ${config.models.text} | ${config.models.vision} | embed:${config.models.embed}`);
  console.log(`  → CORS:   ${config.allowedOrigins.join(', ')}`);

  // Build the semantic index in the background (non-blocking).
  if (config.retrieval.enabled) {
    buildIndex().catch((e) => console.error('[embeddings] initial build failed:', e.message));
  }
  startFinalizeSweep();
  console.log('');
});

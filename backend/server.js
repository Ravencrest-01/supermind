import express from 'express';
import cors from 'cors';
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
} from './lib/vault.js';
import { streamChat, nodeStatus } from './lib/ollama.js';

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

  // Auto-title from the first user message.
  if (convo.messages.length === 0 && message) {
    convo.title = message.slice(0, 40) + (message.length > 40 ? '…' : '');
  }

  const userMsg = { role: 'user', content: message || '', at: Date.now() };
  if (images?.length) userMsg.images = images;
  convo.messages.push(userMsg);

  // Build the payload: core memory as system prompt + rolling window.
  const coreMemory = await readCoreMemory();
  const systemPrompt =
    `You are a synchronized extension of the user's mind — their private "Supermind". ` +
    `Use the following Core Memory to ground your awareness. Be concise and direct.\n\n` +
    `<core_memory>\n${coreMemory}\n</core_memory>`;

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

    send('done', { conversationId: convo.id, title: convo.title });
    res.end();
  } catch (err) {
    send('error', { message: String(err.message || err) });
    res.end();
  }
});

// ── Boot ───────────────────────────────────────────────────────
await ensureVault();
app.listen(config.port, config.host, () => {
  console.log(`\n  Supermind backend live`);
  console.log(`  → http://${config.host}:${config.port}`);
  console.log(`  → vault:  ${config.vaultPath}`);
  console.log(`  → ollama: ${config.ollamaUrl}`);
  console.log(`  → models: ${config.models.text} | ${config.models.vision}`);
  console.log(`  → CORS:   ${config.allowedOrigins.join(', ')}\n`);
});

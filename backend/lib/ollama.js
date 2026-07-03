import { config } from '../config.js';

// Which model is currently resident in VRAM (used to detect a "swap").
let residentModel = null;

export function getResidentModel() {
  return residentModel;
}

// List models Ollama has pulled + which are currently loaded in VRAM.
export async function nodeStatus() {
  const status = {
    online: false,
    residentModel,
    installed: [],
    loaded: [],
    ollamaUrl: config.ollamaUrl,
    numCtx: config.numCtx,
    models: config.models,
  };
  try {
    const tagsRes = await fetch(`${config.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(4000) });
    if (tagsRes.ok) {
      status.online = true;
      const tags = await tagsRes.json();
      status.installed = (tags.models || []).map((m) => m.name);
    }
    const psRes = await fetch(`${config.ollamaUrl}/api/ps`, { signal: AbortSignal.timeout(4000) });
    if (psRes.ok) {
      const ps = await psRes.json();
      status.loaded = (ps.models || []).map((m) => ({
        name: m.name,
        sizeVram: m.size_vram, // bytes in VRAM
      }));
    }
  } catch {
    status.online = false;
  }
  return status;
}

// Stream a chat completion from Ollama, forwarding raw token chunks
// through `onToken`. Returns the full assembled text.
export async function streamChat({ model, messages, onToken, onSwap, signal }) {
  const willSwap = residentModel && residentModel !== model;
  if (willSwap && onSwap) onSwap(model); // tell the client to show the swap buffer
  residentModel = model;

  const res = await fetch(`${config.ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      options: { num_ctx: config.numCtx },
    }),
    signal,
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Ollama error ${res.status}: ${detail}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = '';
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      let json;
      try {
        json = JSON.parse(line);
      } catch {
        continue;
      }
      const piece = json.message?.content || '';
      if (piece) {
        full += piece;
        onToken?.(piece);
      }
    }
  }
  return full;
}

// ── Non-streaming single completion (memory / finalize) ────────
// Set `format:'json'` to force JSON mode. Low temp for determinism.
export async function chatOnce({ model, messages, format, temperature = 0.2, signal }) {
  const res = await fetch(`${config.ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      ...(format ? { format } : {}),
      options: { num_ctx: config.numCtx, temperature },
    }),
    signal: signal ?? AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Ollama chatOnce ${res.status}: ${await res.text().catch(() => '')}`);
  const data = await res.json();
  return data.message?.content || '';
}

// ── Embeddings ─────────────────────────────────────────────────
// Handles both the newer /api/embed and legacy /api/embeddings.
// Returns a single vector (number[]) or throws.
export async function embed(text, { signal } = {}) {
  // Prefer /api/embed (input + embeddings[]).
  let res = await fetch(`${config.ollamaUrl}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: config.models.embed, input: text, keep_alive: '30s' }),
    signal: signal ?? AbortSignal.timeout(30_000),
  }).catch(() => null);

  if (res && res.ok) {
    const data = await res.json();
    const v = data.embeddings?.[0] || data.embedding;
    if (Array.isArray(v)) return v;
  }
  // Fallback: legacy /api/embeddings (prompt + embedding).
  res = await fetch(`${config.ollamaUrl}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: config.models.embed, prompt: text, keep_alive: '30s' }),
    signal: signal ?? AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Ollama embed ${res.status}: ${await res.text().catch(() => '')}`);
  const data = await res.json();
  if (!Array.isArray(data.embedding)) throw new Error('embed: no vector returned');
  return data.embedding;
}

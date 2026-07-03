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

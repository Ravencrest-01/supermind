import { BACKEND_URL, SUPERMIND_KEY } from './config.js';

function headers(extra = {}) {
  const h = { 
    'Content-Type': 'application/json', 
    'ngrok-skip-browser-warning': 'true',
    ...extra 
  };
  if (SUPERMIND_KEY) h['x-supermind-key'] = SUPERMIND_KEY;
  return h;
}

async function j(path, opts = {}) {
  const res = await fetch(`${BACKEND_URL}${path}`, { headers: headers(opts.headers), ...opts });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export const api = {
  status: () => j('/api/status'),
  listConversations: () => j('/api/conversations'),
  getConversation: (id) => j(`/api/conversations/${id}`),
  createConversation: (body) =>
    j('/api/conversations', { method: 'POST', body: JSON.stringify(body || {}) }),
  renameConversation: (id, title) =>
    j(`/api/conversations/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) }),
  deleteConversation: (id) => j(`/api/conversations/${id}`, { method: 'DELETE' }),

  // Stream a chat turn. Callbacks fire as events arrive.
  // Returns an abort function.
  streamChat(body, { onMeta, onToken, onSwap, onDone, onError }) {
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/chat`, {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(`chat failed: ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const chunks = buf.split('\n\n');
          buf = chunks.pop() || '';
          for (const chunk of chunks) {
            const evLine = chunk.split('\n').find((l) => l.startsWith('event:'));
            const dataLine = chunk.split('\n').find((l) => l.startsWith('data:'));
            if (!evLine || !dataLine) continue;
            const event = evLine.slice(6).trim();
            let data = {};
            try {
              data = JSON.parse(dataLine.slice(5).trim());
            } catch {
              /* ignore */
            }
            if (event === 'meta') onMeta?.(data);
            else if (event === 'token') onToken?.(data.t);
            else if (event === 'swap') onSwap?.(data.model);
            else if (event === 'done') onDone?.(data);
            else if (event === 'error') onError?.(new Error(data.message));
          }
        }
      } catch (err) {
        if (err.name !== 'AbortError') onError?.(err);
      }
    })();
    return () => controller.abort();
  },
};

// Read a File to a bare base64 string (no data: prefix) for Ollama.
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

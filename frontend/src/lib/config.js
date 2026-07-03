// ─────────────────────────────────────────────────────────────
//  SUPERMIND FRONTEND CONFIG
//  Values come from Vite env vars (see frontend/.env.example).
//  On Vercel, set these in Project → Settings → Environment Vars.
// ─────────────────────────────────────────────────────────────

const env = import.meta.env;

export const APP_NAME = env.VITE_APP_NAME || 'Supermind';

// The backend base URL. In production this is your Tailscale HTTPS
// address, e.g. https://raven-laptop.tailnet-xxxx.ts.net
// (Tailscale Serve fronts the local Node server with a real cert.)
export const BACKEND_URL = (env.VITE_BACKEND_URL !== undefined ? env.VITE_BACKEND_URL : (env.PROD ? 'https://component-zipfile-cause.ngrok-free.dev' : 'http://localhost:3001')).replace(/\/$/, '');

// Must match AUTH_TOKEN on the backend if you set one; else blank.
export const SUPERMIND_KEY = env.VITE_SUPERMIND_KEY || '';

// The model options shown in the top dropdown. `id` must match the
// name in `ollama list`. `vision: true` unlocks image upload.
export const MODELS = [
  {
    id: env.VITE_TEXT_MODEL || 'qwen2.5:7b',
    label: 'Qwen 2.5 7B',
    role: 'Deep text logic',
    vision: false,
  },
  {
    id: 'huihui_ai/qwen3.5-abliterated:4B',
    label: 'Qwen 3.5 Abliterated 4B',
    role: 'Uncensored text logic',
    vision: false,
  },
];

export const DEFAULT_MODEL = MODELS[0].id;
export const CONTEXT_LOCK = Number(env.VITE_NUM_CTX || 4096);

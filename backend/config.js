import 'dotenv/config';
import path from 'node:path';
import os from 'node:os';

// ─────────────────────────────────────────────────────────────
//  SUPERMIND BACKEND CONFIG
//  Everything you might need to change lives here (or in .env).
//  Prefer setting values in backend/.env — this file just reads
//  them and provides safe defaults.
// ─────────────────────────────────────────────────────────────

function expandHome(p) {
  if (!p) return p;
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
}

export const config = {
  // Port the backend listens on (local loopback only).
  port: Number(process.env.PORT || 3001),

  // Bind to loopback ONLY. Tailscale Serve fronts this with HTTPS.
  // Do NOT change to 0.0.0.0 unless you know what you're doing.
  host: process.env.HOST || '127.0.0.1',

  // Absolute path to your Obsidian vault (or any folder). The app
  // creates a `Supermind_Chats/` subfolder and log files inside it.
  //   macOS/Linux example: /Users/you/Obsidian/MainVault
  //   Windows example:     C:\\Users\\you\\Obsidian\\MainVault
  vaultPath: expandHome(process.env.VAULT_PATH || path.join(os.homedir(), 'SupermindVault')),

  // Where the Ollama daemon is reachable.
  ollamaUrl: process.env.OLLAMA_URL || 'http://127.0.0.1:11434',

  // CORS: the exact origin your frontend is served from.
  // e.g. https://supermind.ravencrest.space  (no trailing slash)
  // Comma-separate to allow several. Use * only for local testing.
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  // Model identifiers as they appear in `ollama list`.
  models: {
    text: process.env.TEXT_MODEL || 'qwen2.5:7b',
    vision: process.env.VISION_MODEL || 'qwen2.5vl:3b',
    // Small, fast embedder for semantic vault retrieval. Pull with:
    //   ollama pull nomic-embed-text
    embed: process.env.EMBED_MODEL || 'nomic-embed-text',
  },

  // Context window. Locked to 4096 to respect the 6GB VRAM ceiling.
  numCtx: Number(process.env.NUM_CTX || 4096),

  // File names inside the vault.
  files: {
    memory: process.env.MEMORY_FILE || 'Supermind_Memory.md',
    dailyLog: process.env.DAILY_LOG_FILE || 'Chat_Log_Daily.md',
    chatsDir: process.env.CHATS_DIR || 'Supermind_Chats',
    collectionsDir: process.env.COLLECTIONS_DIR || 'Collections',
    memoriesDir: process.env.MEMORIES_DIR || 'Supermind/Memories',
    memoryHub: process.env.MEMORY_HUB || 'Supermind/Supermind Memory.md',
    // Master files per topic tag (auto-appended on chat finalize).
    topicsDir: process.env.TOPICS_DIR || 'Supermind/Topics',
    // Embedding cache (hidden folder, not part of your knowledge).
    indexDir: process.env.INDEX_DIR || '.supermind-index',
  },

  memoryEnabled: process.env.MEMORY_ENABLED !== 'false',

  // ── Semantic retrieval (chat-init "super-memory") ────────────
  retrieval: {
    enabled: process.env.RETRIEVAL_ENABLED !== 'false',
    topK: Number(process.env.RETRIEVAL_TOP_K || 6),        // top chunks by cosine
    neighbors: Number(process.env.RETRIEVAL_NEIGHBORS || 2), // 1-hop links per hit
    maxChars: Number(process.env.RETRIEVAL_MAX_CHARS || 3200), // hard budget for the block
    chunkChars: Number(process.env.RETRIEVAL_CHUNK_CHARS || 1600),
    minScore: Number(process.env.RETRIEVAL_MIN_SCORE || 0.35),
  },

  // ── Chat finalization (auto-tag + summary + graph growth) ────
  finalize: {
    enabled: process.env.FINALIZE_ENABLED !== 'false',
    inactivityMs: Number(process.env.FINALIZE_INACTIVITY_MIN || 15) * 60_000,
    sweepMs: Number(process.env.FINALIZE_SWEEP_MIN || 3) * 60_000,
    // Closed vocabulary — keeps master files from fragmenting.
    tags: (process.env.TOPIC_TAGS || 'tech,lifestyle,language,work,health,finance,ideas,misc')
      .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  },

  // Optional shared secret. If set, the frontend must send the same
  // value as `x-supermind-key` header. Leave blank to disable
  // (Tailscale already gates who can reach the backend).
  authToken: process.env.AUTH_TOKEN || '',
};

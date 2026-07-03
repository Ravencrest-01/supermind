# Supermind

A fully private, single-user personal AI. The **frontend** is a React PWA you host on a
subdomain and install on your phone. The **backend** is a small Node server that runs on
your laptop, proxies to **Ollama**, and reads/writes an **Obsidian** vault as long-term memory.

```
 Phone / laptop browser  ──HTTPS──▶  Vercel (frontend, supermind.ravencrest.space)
        │
        └── fetch ──HTTPS──▶  Your laptop
                                ├─ Node backend  (loopback :3001)
                                ├─ Ollama daemon (:11434)  → Qwen 2.5 7B / SmolVLM2
                                └─ Obsidian vault (memory + chat logs)
```

---

## 1. What to download

| Tool | Why | Get it |
|------|-----|--------|
| **Ollama** | Runs the models on your GPU | https://ollama.com/download |
| **Node.js 18+** | Runs the backend + builds the frontend | https://nodejs.org |
| **Obsidian** *(optional)* | Read/edit the memory + logs as markdown | https://obsidian.md |

Pull the two models (matches the spec's VRAM budget):

```bash
ollama pull qwen2.5:7b
ollama pull richardyoung/smolvlm2-2.2b-instruct
ollama serve            # if not already running as a service
```

Confirm both appear:

```bash
ollama list
```

---

## 2. Backend (runs on your laptop)

```bash
cd backend
npm install
cp .env.example .env
```

Open `.env` and set at minimum:

- `VAULT_PATH` → absolute path to your Obsidian vault (or any folder).
- `ALLOWED_ORIGINS` → your frontend origin(s), e.g.
  `http://localhost:5173,https://supermind.ravencrest.space`

Pull the models (once), including the new embedder used for semantic recall:

```bash
ollama pull qwen2.5:7b
ollama pull qwen2.5vl:3b
ollama pull nomic-embed-text   # semantic vault retrieval
```

Then run it:

```bash
npm start
```

You should see the "Supermind backend live" banner. On first boot it creates, inside your
vault: `Supermind_Memory.md`, `Chat_Log_Daily.md`, and a `Supermind_Chats/` folder.

**What the backend gives the app:** the model output (streamed), your conversation
history, node status (which models are loaded + VRAM use), and it injects
`Supermind_Memory.md` as the system prompt on every turn.

---

## 3. Frontend — local dev

```bash
cd frontend
npm install
cp .env.example .env      # VITE_BACKEND_URL=http://localhost:3001
npm run dev               # http://localhost:5173
```

You now have a working chat with a sidebar, model switch, and image upload (SmolVLM2).

---

## 4. Deploy the frontend to your subdomain (Vercel)

```bash
cd frontend
# push to a GitHub repo, then import it on vercel.com
```

In Vercel: **Root Directory = `frontend`**, framework auto-detects as Vite. Add a
custom domain `supermind.ravencrest.space`. Under **Settings → Environment Variables**
(Production) set:

- `VITE_BACKEND_URL` = your backend URL
- `VITE_TEXT_MODEL`, `VITE_VISION_MODEL` = same IDs as the backend
- `VITE_SUPERMIND_KEY` = only if you set `AUTH_TOKEN` on the backend

Redeploy. The site is now live at your subdomain and served over HTTPS (required for PWA).

---

## 5. Memory, Collections & the supermemory graph

Inside your vault:

- **`Supermind_Memory.md`** — permanent context. Edit it in Obsidian: directives, who you
  are, active workflows. The AI reads it every turn. This is how you "program" its awareness.
- **`Chat_Log_Daily.md`** — append-only human-readable ledger of every exchange.
- **`Supermind_Chats/`** — one `.json` (source of truth) + one `.md` (browseable) per
  conversation. These power the sidebar history.
- **`Collections/`** — every image you upload is saved here as a real file and embedded
  (`![[Collections/…]]`) into the chat note, so it shows up in Obsidian.
- **`Supermind/Memories/`** + **`Supermind/Supermind Memory.md`** — the supermemory graph.

### Supermemory (the "remember this" feature)

When your message contains an importance cue — *"remember this", "important", "note this",
"don't forget", "keep in mind", "for future reference", "save this"* — the backend distils
the exchange into a durable memory and writes it as its own Obsidian note with:

- YAML **tags** + inline `#tags` (topic nodes in the graph),
- `[[wikilinks]]` to the concepts it mentions and to the central **`Supermind Memory`** hub.

Because every memory links to concepts and the hub, **Obsidian's Graph View draws the whole
web** — you can visually backtrack how ideas connect. On the next turn, the backend does a
lightweight keyword match over these notes and injects the most relevant ones into the
prompt, so the model can recall them. That's the "supermemory".

You can also save any message manually: hover it and click **Remember** (the bookmark).
The **Regenerate** action re-runs the last reply; **Copy** is on every message and code block.

> Memory extraction uses your local text model. It works even if the model is down (it falls
> back to a simpler note), but with Qwen running you get cleaner titles, tags, and concept
> links. Toggle the whole feature with `MEMORY_ENABLED`.

### Automatic super-memory (semantic retrieval + graph growth)

Two automations run without you invoking anything:

**On the first message of a chat (retrieval).** The backend embeds your message with
`nomic-embed-text`, cosine-searches every note in your vault, and pulls the top matches
**plus their 1-hop linked neighbors** from the graph. That bundle is injected as
`<vault_context>` so the model is grounded in your relevant history from message one — no
`load` command needed. The embedding index lives in `.supermind-index/` and only re-embeds
files that changed. Tune with `RETRIEVAL_*` in `.env`; force a rebuild with
`POST /api/reindex`.

> `load <keyword>` still works as a manual override — it bypasses semantic search and injects
> notes matching that keyword instead.

**When a chat goes idle (finalization).** A server-side sweep (every `FINALIZE_SWEEP_MIN`
minutes) finalizes any chat idle longer than `FINALIZE_INACTIVITY_MIN`. It runs two small,
constrained model calls:

1. **Classify** the chat into exactly one tag from a closed list (`TOPIC_TAGS`) — a fixed
   vocabulary so your master files never fragment into `#tech`/`#Tech`/`#technology`.
2. **Summarize** it into 3–5 bullets, wrapping key concepts in `[[wikilinks]]`.

The bullets are appended, timestamped and backlinked to the source chat, to
`Supermind/Topics/<tag>.md` — so your knowledge graph grows on its own. Browsers give no
reliable "chat closed" event, so this is server-driven; to finalize instantly (e.g. on "New
Chat"), call `POST /api/conversations/:id/finalize`.

New endpoints: `POST /api/conversations/:id/finalize`, `GET /api/index`, `POST /api/reindex`.

---

## 6. Full variable reference

### Frontend — `frontend/.env` (or Vercel env vars)

| Variable | What it is | Example |
|----------|-----------|---------|
| `VITE_APP_NAME` | Name shown in the UI | `Supermind` |
| `VITE_BACKEND_URL` | Backend base URL (**https in prod**) | `https://your-backend-url.com` |
| `VITE_SUPERMIND_KEY` | Shared secret (only if backend sets one) | *(blank)* |
| `VITE_TEXT_MODEL` | Text model id (matches `ollama list`) | `qwen2.5:7b` |
| `VITE_VISION_MODEL` | Vision model id | `richardyoung/smolvlm2-2.2b-instruct` |
| `VITE_NUM_CTX` | Context lock shown in UI | `4096` |

### Backend — `backend/.env`

| Variable | What it is | Example |
|----------|-----------|---------|
| `PORT` | Backend port | `3001` |
| `HOST` | Bind address (keep loopback) | `127.0.0.1` |
| `VAULT_PATH` | **Absolute** path to your vault/folder | `/Users/raven/Obsidian/MainVault` |
| `OLLAMA_URL` | Ollama daemon URL | `http://127.0.0.1:11434` |
| `ALLOWED_ORIGINS` | Comma-separated frontend origins | `http://localhost:5173,https://supermind.ravencrest.space` |
| `TEXT_MODEL` | Text model id | `qwen2.5:7b` |
| `VISION_MODEL` | Vision model id | `richardyoung/smolvlm2-2.2b-instruct` |
| `NUM_CTX` | Context window (keep 4096 for 6GB VRAM) | `4096` |
| `EMBED_MODEL` | Embedder for semantic retrieval | `nomic-embed-text` |
| `MEMORY_ENABLED` | Turn the "remember this" feature on/off | `true` |
| `RETRIEVAL_ENABLED` | Semantic chat-init retrieval on/off | `true` |
| `RETRIEVAL_TOP_K` | Notes pulled per chat | `6` |
| `RETRIEVAL_NEIGHBORS` | Linked notes expanded per hit | `2` |
| `RETRIEVAL_MAX_CHARS` | Hard cap on injected context | `3200` |
| `RETRIEVAL_CHUNK_CHARS` | Note chunk size for embedding | `1600` |
| `RETRIEVAL_MIN_SCORE` | Cosine floor to include a note | `0.35` |
| `FINALIZE_ENABLED` | Auto tag+summary on idle on/off | `true` |
| `FINALIZE_INACTIVITY_MIN` | Idle minutes before finalizing | `15` |
| `FINALIZE_SWEEP_MIN` | How often the sweep runs | `3` |
| `TOPIC_TAGS` | Closed tag vocabulary | `tech,lifestyle,language,work,health,finance,ideas,misc` |
| `AUTH_TOKEN` | Optional shared secret | *(blank)* |
| `MEMORY_FILE` | Core memory file name | `Supermind_Memory.md` |
| `DAILY_LOG_FILE` | Daily log file name | `Chat_Log_Daily.md` |
| `CHATS_DIR` | Conversations subfolder | `Supermind_Chats` |
| `COLLECTIONS_DIR` | Where uploaded images are stored | `Collections` |
| `MEMORIES_DIR` | Where "remember this" notes are written | `Supermind/Memories` |
| `MEMORY_HUB` | The graph hub note | `Supermind/Supermind Memory.md` |
| `TOPICS_DIR` | Per-tag master files (finalization) | `Supermind/Topics` |
| `INDEX_DIR` | Embedding cache (hidden) | `.supermind-index` |

**Minimum you must change to go live:** backend `VAULT_PATH` + `ALLOWED_ORIGINS`,
and frontend `VITE_BACKEND_URL`. Everything else has working defaults.

---

## 7. Troubleshooting

- **"No node" / can't reach backend** → is `npm start` running? Does `VITE_BACKEND_URL` match your server?
- **CORS error in console** → the frontend origin isn't in `ALLOWED_ORIGINS` (exact match,
  no trailing slash). Fix `.env`, restart the backend.
- **Model says "not pulled" in the picker** → run `ollama pull <id>`; the id must match
  exactly.
- **Slow / choppy tokens** → model + KV cache exceeded 6GB and Ollama offloaded layers to
  CPU. Keep `NUM_CTX=4096` and run one model at a time.

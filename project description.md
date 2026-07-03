# Supermind: Project Overview & Architecture

**Supermind** is a fully private, single-user personal AI designed to serve as an extension of your own mind. It seamlessly bridges a modern web interface (frontend) with your local machine's processing power and your personal knowledge base (Obsidian).

---

## 🏗️ High-Level Architecture

The project is split into two primary repositories that communicate securely over the internet, allowing you to access your AI from anywhere (e.g., your mobile phone via cellular data) while keeping the actual data and computation strictly local to your laptop.

```text
📱 Phone / External Browser  ──HTTPS──▶  🌐 Vercel (Frontend Hosting)
                                             │
                                         (API Route Rewrites)
                                             │
                                         NGROK TUNNEL (https://*.ngrok-free.dev)
                                             │
💻 Your Laptop (Local Environment) ◀─────────┘
      │
      ├─ 🟢 Node.js Backend (Port 3001, Daemonized via PM2)
      │      ├─ Manages Chat History
      │      └─ Interacts with Obsidian Vault
      │
      ├─ 🦙 Ollama Daemon (Port 11434)
      │      └─ Runs Qwen 2.5 7B (Text) & SmolVLM2 (Vision - Currently Disabled)
      │
      └─ 🗄️ Obsidian Vault
             ├─ Supermind_Memory.md (Static System Prompt)
             ├─ Chat_Log_Daily.md (Ledger of all chats)
             ├─ Collections/ (Locally saved images)
             ├─ Supermind_Chats/ (Chat JSON/MD history)
             └─ Supermind/
                  ├─ Memories/ (Auto-extracted knowledge nodes)
                  └─ Supermind Memory.md (Central Graph Hub)
```

---

## ✨ Core Features & Mechanics

### 1. The Frontend (React PWA)
- **Tech Stack:** React 18, Vite, Tailwind CSS (via variables), Headless UI.
- **Hosting:** Hosted on Vercel as a Progressive Web App (PWA) so it can be installed natively on iOS/Android.
- **Routing & Tunneling:** Because mobile phones cannot resolve `localhost` to the host laptop, the frontend uses Vercel `vercel.json` rewrites to securely route `/api/*` requests directly through an **Ngrok Tunnel** pointing to your laptop.
- **UI/UX:** Features a dark, premium aesthetic with smooth model-switching dropdowns, chat history sidebars, and support for Markdown rendering and image uploads. 

### 2. The Backend (Node.js Express)
- **Tech Stack:** Node.js, Express, File System (fs).
- **Daemonization:** Managed completely by **PM2**. Both the Node server (`server.js`) and the Ngrok tunnel (`start-ngrok.bat`) run as silent background daemons, ensuring the AI is always online as long as the laptop is running.
- **Ollama Proxy:** The backend streams requests to the local Ollama daemon, managing token limits (hardcapped at 4096 to respect 6GB VRAM limits) and seamlessly handling the SSE (Server-Sent Events) streams back to the frontend.

### 3. The Obsidian Supermemory Engine (RAG)
Instead of a standard vector database, Supermind uses your actual Obsidian Vault as its long-term memory, leveraging Markdown files, tags, and wikilinks to build a knowledge graph.

* **Memory Extraction:** When a user types *"remember this", "important", or "note this"*, the backend intercepts the message, uses the LLM to extract a title, tags, and a summary, and creates a standalone Markdown node in `Supermind/Memories/`. It then links this node in the central `Supermind Memory.md` Hub.
* **Semantic Retrieval (automatic super-memory):** On the **first message of every chat**, the backend embeds the query with `nomic-embed-text`, runs cosine similarity over a cached index of the whole vault (`.supermind-index/`), and pulls the top-K notes **plus their 1-hop graph neighbors** (wikilink + backlink expansion). This bundle is injected as `<vault_context>` so the model is grounded in relevant history from the very first message — no command required. The index only re-embeds changed files (mtime-keyed).
* **Chat Finalization (automatic graph growth):** A server-side inactivity sweep finalizes idle chats with two constrained LLM calls — (1) classify into exactly one tag from a closed vocabulary, (2) summarize into 3–5 `[[wikilinked]]` bullets — then appends the timestamped, backlinked result to a per-tag master file in `Supermind/Topics/<tag>.md`. Browsers have no reliable "chat closed" event, so this is server-driven; `POST /api/conversations/:id/finalize` triggers it on demand.
* **Targeted Context Loading (`load <tag>`):** A manual override of semantic retrieval. If a user starts a new chat with `load <keyword>` (e.g. `load python project`), the backend scans the `Memories/` folder, filters notes by filename/tags/content, and injects the matching nodes into the system prompt for that chat instead of running the semantic pass.
* **Media Collections:** Any image uploaded via the UI is decoded by the backend, saved locally as a real `.png` file in `Collections/`, and embedded into the Obsidian chat logs using standard `![[Collections/image.png]]` wikilink syntax.

---

## 📂 Directory Structure

* **`frontend/`**
  * `src/components/` - React UI components (Chat, Sidebar, ModelSelect, Composer).
  * `src/lib/api.js` - Handles fetch requests, streaming SSE loops, and Vercel proxy routing.
  * `vercel.json` - Configures the proxy rewrite layer mapping Vercel to the Ngrok tunnel.
* **`backend/`**
  * `server.js` - Express API handling chat endpoints, image saving, and `activeMemoryTag` command parsing.
  * `lib/vault.js` - Handles file operations: saving chat logs, creating Supermemory nodes, and dynamically reading/filtering targeted memories into the context window.
  * `lib/memory.js` - AI-powered extraction pipeline for "remember this" cues.
  * `lib/ollama.js` - Direct interface with the local Ollama daemon.
* **Root Utilities**
  * `readme_server.txt` - Cheatsheet for PM2 daemon management.
  * `start-ngrok.bat` - Custom batch script configured to run Ngrok silently (`--log=stdout`) under PM2 without crashing the Windows TTY layer.

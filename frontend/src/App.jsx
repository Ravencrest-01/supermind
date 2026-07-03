import { useCallback, useEffect, useRef, useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import Topbar from './components/Topbar.jsx';
import Messages from './components/Messages.jsx';
import Composer from './components/Composer.jsx';
import { api } from './lib/api.js';
import { APP_NAME, DEFAULT_MODEL, MODELS, BACKEND_URL } from './lib/config.js';

export default function App() {
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [streamingId, setStreamingId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const visionEnabled = MODELS.find((m) => m.id === model)?.vision;

  const refreshConvos = useCallback(async () => {
    try {
      setConversations(await api.listConversations());
    } catch (e) {
      /* offline handled by status poll */
    }
  }, []);

  const pollStatus = useCallback(async () => {
    try {
      const s = await api.status();
      setStatus(s);
      setError(null);
    } catch {
      setStatus({ online: false });
      setError(`Can't reach the compute node at ${BACKEND_URL}.`);
    }
  }, []);

  useEffect(() => {
    refreshConvos();
    pollStatus();
    const t = setInterval(pollStatus, 5000);
    return () => clearInterval(t);
  }, [refreshConvos, pollStatus]);

  const openConversation = async (id) => {
    setSidebarOpen(false);
    if (id === activeId) return;
    try {
      const c = await api.getConversation(id);
      setActiveId(c.id);
      setMessages(c.messages || []);
      if (c.model) setModel(c.model);
    } catch {
      setError('Could not load that conversation.');
    }
  };

  const newChat = () => {
    setActiveId(null);
    setMessages([]);
    setSidebarOpen(false);
  };

  const renameConvo = async (id, title) => {
    await api.renameConversation(id, title);
    refreshConvos();
  };

  const deleteConvo = async (id) => {
    await api.deleteConversation(id);
    if (id === activeId) newChat();
    refreshConvos();
  };

  const stop = () => {
    abortRef.current?.();
    setBusy(false);
    setStreamingId(null);
    setSwapping(false);
  };

  const send = async (text, images) => {
    setError(null);
    const userMsg = { role: 'user', content: text, at: Date.now(), images };
    const aiIndex = messages.length + 1;
    setMessages((prev) => [...prev, userMsg, { role: 'assistant', content: '', at: Date.now() }]);
    setBusy(true);
    setStreamingId(aiIndex);

    let convoId = activeId;

    abortRef.current = api.streamChat(
      { conversationId: convoId, model, message: text, images },
      {
        onMeta: (m) => {
          convoId = m.conversationId;
          if (!activeId) setActiveId(m.conversationId);
        },
        onSwap: () => {
          setSwapping(true);
          setTimeout(() => setSwapping(false), 4500);
        },
        onToken: (t) => {
          setSwapping(false);
          setMessages((prev) => {
            const next = [...prev];
            const lastIndex = next.length - 1;
            const last = next[lastIndex];
            if (last?.role === 'assistant') {
              next[lastIndex] = { ...last, content: last.content + t };
            }
            return next;
          });
        },
        onDone: () => {
          setBusy(false);
          setStreamingId(null);
          setSwapping(false);
          refreshConvos();
        },
        onError: (err) => {
          setBusy(false);
          setStreamingId(null);
          setSwapping(false);
          setError(err.message || 'Stream failed.');
        },
      }
    );
  };

  const empty = messages.length === 0;

  return (
    <div className="app">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={openConversation}
        onNew={newChat}
        onRename={renameConvo}
        onDelete={deleteConvo}
        status={status}
        swapping={swapping}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="main">
        <Topbar
          model={model}
          onModelChange={setModel}
          status={status}
          onMenu={() => setSidebarOpen(true)}
          disabled={busy}
        />

        {error && (
          <div className="banner">
            <span>{error}</span>
            <span className="banner__hint">
              Is the backend running and is this origin in ALLOWED_ORIGINS?
            </span>
          </div>
        )}

        <div className="stage">
          {empty ? (
            <div className="hello">
              <div className="hello__mark">
                <span className={`led ${status?.online ? 'led--on' : 'led--off'}`} />
              </div>
              <h1 className="hello__title">{APP_NAME}</h1>
              <p className="hello__sub">
                Your private cognitive extension, running on your own metal.
              </p>
              <div className="hello__chips">
                <span>grounded in your Obsidian vault</span>
                <span>no cloud · no telemetry</span>
                <span>4K context, VRAM-safe</span>
              </div>
            </div>
          ) : (
            <Messages messages={messages} streamingId={streamingId} />
          )}

          {swapping && (
            <div className="swap">
              <div className="swap__pulse" />
              <span>Flashing weights into VRAM… reallocating GPU layers</span>
            </div>
          )}
        </div>

        <Composer
          onSend={send}
          onStop={stop}
          busy={busy}
          visionEnabled={visionEnabled}
        />
      </main>
    </div>
  );
}

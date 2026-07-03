import { useState } from 'react';
import NodeStatus from './NodeStatus.jsx';
import { APP_NAME } from '../lib/config.js';

function timeLabel(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onRename,
  onDelete,
  status,
  swapping,
  open,
  onClose,
}) {
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState('');

  const startRename = (c) => {
    setEditing(c.id);
    setDraft(c.title);
  };
  const commit = (id) => {
    const t = draft.trim();
    if (t) onRename(id, t);
    setEditing(null);
  };

  return (
    <>
      <div className={`scrim ${open ? 'scrim--show' : ''}`} onClick={onClose} />
      <aside className={`sidebar ${open ? 'sidebar--open' : ''}`}>
        <div className="brand">
          <div className="brand__mark" aria-hidden>
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path
                d="M12 3c-2 0-3.4 1.3-3.6 3C6.7 6.3 5.5 7.7 5.5 9.4c0 .6.1 1.1.4 1.6C5 11.6 4.5 12.6 4.5 13.7c0 1.9 1.5 3.4 3.4 3.6.3 1.6 1.7 2.7 3.3 2.7"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
              <path
                d="M12 3c2 0 3.4 1.3 3.6 3 1.7.3 2.9 1.7 2.9 3.4 0 .6-.1 1.1-.4 1.6.9.6 1.4 1.6 1.4 2.7 0 1.9-1.5 3.4-3.4 3.6-.3 1.6-1.7 2.7-3.3 2.7"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
              <circle cx="12" cy="12" r="1.6" fill="currentColor" />
            </svg>
          </div>
          <span className="brand__name">{APP_NAME}</span>
        </div>

        <button className="newchat" onClick={onNew}>
          <span className="newchat__plus">+</span> New chat
        </button>

        <nav className="convos">
          {conversations.length === 0 && (
            <p className="convos__empty">No conversations yet. Start one above.</p>
          )}
          {conversations.map((c) => (
            <div
              key={c.id}
              className={`convo ${c.id === activeId ? 'convo--active' : ''}`}
              onClick={() => editing !== c.id && onSelect(c.id)}
            >
              {editing === c.id ? (
                <input
                  autoFocus
                  className="convo__edit"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => commit(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commit(c.id);
                    if (e.key === 'Escape') setEditing(null);
                  }}
                />
              ) : (
                <>
                  <div className="convo__main">
                    <span className="convo__title">{c.title}</span>
                    <span className="convo__time">{timeLabel(c.updatedAt)}</span>
                  </div>
                  <div className="convo__actions" onClick={(e) => e.stopPropagation()}>
                    <button title="Rename" onClick={() => startRename(c)}>✎</button>
                    <button
                      title="Delete"
                      className="convo__del"
                      onClick={() => onDelete(c.id)}
                    >
                      ×
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </nav>

        <NodeStatus status={status} swapping={swapping} />
      </aside>
    </>
  );
}

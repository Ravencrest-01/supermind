import { useEffect, useRef, useState } from 'react';
import { MODELS } from '../lib/config.js';

export default function Topbar({ model, onModelChange, status, onMenu, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const active = MODELS.find((m) => m.id === model) || MODELS[0];

  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const installed = status?.installed || [];

  return (
    <header className="topbar">
      <button className="hamburger" onClick={onMenu} aria-label="Menu">
        <span /><span /><span />
      </button>

      <div className="picker" ref={ref}>
        <button
          className="picker__btn"
          onClick={() => setOpen((o) => !o)}
          disabled={disabled}
        >
          <span className="picker__name">{active.label}</span>
          <span className="picker__role">{active.role}</span>
          <span className={`chev ${open ? 'chev--up' : ''}`}>▾</span>
        </button>
        {open && (
          <div className="picker__menu">
            {MODELS.map((m) => {
              const present = installed.some((n) => n === m.id || n.startsWith(m.id.split(':')[0]));
              return (
                <button
                  key={m.id}
                  className={`picker__opt ${m.id === model ? 'picker__opt--on' : ''}`}
                  onClick={() => {
                    onModelChange(m.id);
                    setOpen(false);
                  }}
                >
                  <div>
                    <div className="picker__opt-name">{m.label}</div>
                    <div className="picker__opt-role">{m.role}</div>
                  </div>
                  <span className={`tag ${present ? 'tag--ok' : 'tag--miss'}`}>
                    {present ? 'ready' : 'not pulled'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className={`conn ${status?.online ? 'conn--on' : 'conn--off'}`}>
        <span className="conn__dot" />
        {status?.online ? 'connected' : 'no node'}
      </div>
    </header>
  );
}

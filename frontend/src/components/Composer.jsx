import { useRef, useState } from 'react';
import { fileToBase64 } from '../lib/api.js';

export default function Composer({ onSend, onStop, busy, visionEnabled }) {
  const [text, setText] = useState('');
  const [images, setImages] = useState([]); // base64 strings
  const [rememberActive, setRememberActive] = useState(false);
  const taRef = useRef(null);
  const fileRef = useRef(null);

  const grow = (el) => {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  };

  const pickImages = async (e) => {
    const files = [...e.target.files];
    const b64s = await Promise.all(files.map(fileToBase64));
    setImages((prev) => [...prev, ...b64s].slice(0, 4));
    e.target.value = '';
  };

  const send = () => {
    if (busy) return;
    let t = text.trim();
    if (!t && images.length === 0) return;
    
    if (rememberActive) {
      t = `Remember this:\n${t}`;
      setRememberActive(false);
    }
    
    onSend(t, images);
    setText('');
    setImages([]);
    if (taRef.current) taRef.current.style.height = 'auto';
  };

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="composer">
      {images.length > 0 && (
        <div className="composer__thumbs">
          {images.map((b64, i) => (
            <div key={i} className="thumb">
              <img src={`data:image/*;base64,${b64}`} alt="" />
              <button onClick={() => setImages(images.filter((_, x) => x !== i))}>×</button>
            </div>
          ))}
        </div>
      )}
      <div className="composer__bar">
        <button
          className={`iconbtn ${rememberActive ? 'active' : ''}`}
          title="Mark as important (creates a memory node)"
          onClick={() => setRememberActive(!rememberActive)}
          style={{ color: rememberActive ? '#facc15' : 'inherit' }}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill={rememberActive ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </button>
        {visionEnabled && (
          <>
            <button
              className="iconbtn"
              title="Attach image"
              onClick={() => fileRef.current?.click()}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6">
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={pickImages}
            />
          </>
        )}
        <textarea
          ref={taRef}
          className="composer__input"
          placeholder={visionEnabled ? 'Ask, or drop an image…' : 'Message your Supermind…'}
          value={text}
          rows={1}
          onChange={(e) => {
            setText(e.target.value);
            grow(e.target);
          }}
          onKeyDown={onKey}
        />
        {busy ? (
          <button className="sendbtn sendbtn--stop" onClick={onStop} title="Stop">
            <svg viewBox="0 0 24 24" width="16" height="16"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" /></svg>
          </button>
        ) : (
          <button className="sendbtn" onClick={send} title="Send">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 11l5-5 5 5M12 6v13" />
            </svg>
          </button>
        )}
      </div>
      <p className="composer__hint">
        Enter to send · Shift+Enter for newline · context locked to 4K
      </p>
    </div>
  );
}

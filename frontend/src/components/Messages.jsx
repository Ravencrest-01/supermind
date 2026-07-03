import { useEffect, useRef } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ breaks: true, gfm: true });

function renderMarkdown(text) {
  return DOMPurify.sanitize(marked.parse(text || ''));
}

function Bubble({ msg, streaming }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`msg ${isUser ? 'msg--user' : 'msg--ai'}`}>
      <div className="msg__role">{isUser ? 'You' : 'Supermind'}</div>
      <div className="msg__body">
        {msg.images?.length > 0 && (
          <div className="msg__imgs">
            {msg.images.map((b64, i) => (
              <img key={i} src={`data:image/*;base64,${b64}`} alt="attachment" />
            ))}
          </div>
        )}
        {isUser ? (
          <p className="msg__text">{msg.content}</p>
        ) : (
          <div
            className="msg__md"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
          />
        )}
        {streaming && <span className="cursor" />}
      </div>
    </div>
  );
}

export default function Messages({ messages, streamingId }) {
  const endRef = useRef(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="messages">
      <div className="messages__inner">
        {messages.map((m, i) => (
          <Bubble key={i} msg={m} streaming={m.role === 'assistant' && streamingId === i} />
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}

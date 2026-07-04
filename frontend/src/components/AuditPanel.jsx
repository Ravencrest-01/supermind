import { useState, useEffect, useCallback } from 'react';
import { BACKEND_URL } from '../lib/config.js';

export default function AuditPanel() {
  const [auditData, setAuditData] = useState({ pdf: {}, images: {} });
  const [logs, setLogs] = useState([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState('all');

  const fetchAudit = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/audit`);
      const data = await res.json();
      setAuditData(data);
    } catch (e) {
      console.error('Audit fetch error:', e);
    }
  }, []);

  useEffect(() => {
    fetchAudit();
    
    const es = new EventSource(`${BACKEND_URL}/api/logs`);
    es.onmessage = (e) => {
      const parsed = JSON.parse(e.data);
      setLogs((prev) => [...prev, parsed.message].slice(-50)); // Keep last 50
    };

    return () => {
      es.close();
    };
  }, [fetchAudit]);

  const workspaces = Array.from(new Set([
    ...Object.keys(auditData.pdf || {}),
    ...Object.keys(auditData.images || {})
  ]));

  return (
    <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Filesystem Audit</h3>
        <button onClick={fetchAudit} style={{ padding: '4px 8px', background: '#333', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          Scan Drive
        </button>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '4px' }}>Interactive Image Collection Dropdown</label>
        <select 
          value={selectedWorkspace} 
          onChange={(e) => setSelectedWorkspace(e.target.value)}
          style={{ width: '100%', padding: '8px', background: '#222', border: '1px solid #444', color: '#fff', borderRadius: '4px' }}
        >
          <option value="all">-- All Workspaces --</option>
          {workspaces.map(ws => (
            <option key={ws} value={ws}>{ws}</option>
          ))}
        </select>
      </div>

      <div style={{ flex: 1, background: '#111', border: '1px solid #333', borderRadius: '4px', padding: '8px', overflowY: 'auto', marginBottom: '16px', fontSize: '0.85rem' }}>
        <div style={{ marginBottom: '8px', color: '#888' }}>Collections Preview:</div>
        {selectedWorkspace === 'all' ? (
          <div>
            <div><strong>PDFs:</strong></div>
            <pre style={{ margin: '4px 0 12px 0' }}>{JSON.stringify(auditData.pdf, null, 2)}</pre>
            <div><strong>Images:</strong></div>
            <pre style={{ margin: '4px 0 0 0' }}>{JSON.stringify(auditData.images, null, 2)}</pre>
          </div>
        ) : (
          <div>
            <div><strong>PDFs ({selectedWorkspace}):</strong> {auditData.pdf[selectedWorkspace] || 0} files</div>
            <div><strong>Images ({selectedWorkspace}):</strong> {auditData.images[selectedWorkspace] || 0} files</div>
          </div>
        )}
      </div>

      <div style={{ flex: 1, background: '#000', border: '1px solid #333', borderRadius: '4px', padding: '8px', overflowY: 'auto', fontSize: '0.85rem', color: '#0f0', fontFamily: 'monospace' }}>
        <div style={{ color: '#aaa', marginBottom: '8px', borderBottom: '1px solid #333', paddingBottom: '4px' }}>Unified System Logging Panel</div>
        {logs.map((log, idx) => (
          <div key={idx} style={{ marginBottom: '4px' }}>&gt; {log}</div>
        ))}
        {logs.length === 0 && <div style={{ color: '#555' }}>Waiting for events...</div>}
      </div>
    </div>
  );
}

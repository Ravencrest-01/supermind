import { useState } from 'react';
import { BACKEND_URL } from '../lib/config.js';

export default function AssetCapture() {
  const [workspace, setWorkspace] = useState('');
  const [files, setFiles] = useState([]);
  const [status, setStatus] = useState('');

  const handleFileChange = (e) => {
    setFiles([...e.target.files]);
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setStatus('Uploading...');
    
    const formData = new FormData();
    formData.append('workspace', workspace);
    for (const file of files) {
      formData.append('files', file);
    }

    try {
      const res = await fetch(`${BACKEND_URL}/api/ingest`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.ok) {
        setStatus(`Success: ${data.message}`);
        setFiles([]);
        setWorkspace('');
      } else {
        setStatus(`Error: ${data.error}`);
      }
    } catch (e) {
      setStatus(`Error: ${e.message}`);
    }
  };

  return (
    <div style={{ padding: '16px', borderBottom: '1px solid #333' }}>
      <h3 style={{ margin: '0 0 12px 0', fontSize: '1.2rem' }}>Asset Capture Interface</h3>
      
      <div style={{ marginBottom: '12px' }}>
        <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '4px' }}>Workspace Assignment</label>
        <input 
          type="text" 
          value={workspace}
          onChange={(e) => setWorkspace(e.target.value)}
          placeholder="e.g. ProjectX (optional)"
          style={{ width: '100%', padding: '8px', background: '#222', border: '1px solid #444', color: '#fff', borderRadius: '4px' }}
        />
      </div>

      <div style={{ marginBottom: '12px' }}>
        <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '4px' }}>Batch Selection (PDF / Images)</label>
        <input 
          type="file" 
          multiple 
          accept="application/pdf, image/*"
          onChange={handleFileChange}
          style={{ width: '100%', padding: '8px', background: '#222', border: '1px solid #444', color: '#fff', borderRadius: '4px' }}
        />
        {files.length > 0 && <div style={{ marginTop: '8px', fontSize: '0.85rem', color: '#aaa' }}>{files.length} file(s) queued.</div>}
      </div>

      <button 
        onClick={handleUpload}
        style={{ padding: '8px 16px', background: '#0070f3', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
      >
        Execute Ingestion
      </button>

      {status && <div style={{ marginTop: '12px', fontSize: '0.9rem', color: '#55ff55' }}>{status}</div>}
    </div>
  );
}

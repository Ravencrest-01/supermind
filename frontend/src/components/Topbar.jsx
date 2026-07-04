import ModelSelect from './ModelSelect.jsx';
import NodeStatus from './NodeStatus.jsx';

export default function Topbar({ model, onModelChange, status, onMenu, onToggleAssets, disabled }) {
  return (
    <header className="topbar">
      <button className="hamburger" onClick={onMenu} aria-label="Menu">
        <span /><span /><span />
      </button>

      <ModelSelect 
        model={model} 
        onModelChange={onModelChange} 
        status={status} 
        disabled={disabled} 
      />

      <NodeStatus status={status} />

      <button className="iconbtn" onClick={onToggleAssets} title="Toggle Assets View" style={{ marginLeft: '12px' }}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      </button>

      <div className={`conn ${status?.online ? 'conn--on' : 'conn--off'}`}>
        <span className="conn__dot" />
        {status?.online ? 'connected' : 'no node'}
      </div>
    </header>
  );
}

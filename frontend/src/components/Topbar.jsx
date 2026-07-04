import ModelSelect from './ModelSelect.jsx';
import NodeStatus from './NodeStatus.jsx';

export default function Topbar({ model, onModelChange, status, onMenu, disabled }) {
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

      <div className={`conn ${status?.online ? 'conn--on' : 'conn--off'}`}>
        <span className="conn__dot" />
        {status?.online ? 'connected' : 'no node'}
      </div>
    </header>
  );
}

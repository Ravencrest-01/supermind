import ModelSelect from './ModelSelect.jsx';

export default function Topbar({ model, onModelChange, status, onMenu, disabled }) {
  return (
    <header className="topbar">
      <button className="hamburger" onClick={onMenu} aria-label="Menu">
        <span /><span /><span />
      </button>

      <div className="picker">
        <ModelSelect model={model} onModelChange={onModelChange} status={status} disabled={disabled} />
      </div>

      <div className={`conn ${status?.online ? 'conn--on' : 'conn--off'}`}>
        <span className="conn__dot" />
        {status?.online ? 'connected' : 'no node'}
      </div>
    </header>
  );
}

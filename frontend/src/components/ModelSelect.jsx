import { MODELS } from '../lib/config.js';
import './ModelSelect.css';

export default function ModelSelect({ model, onModelChange, status, disabled }) {
  const active = MODELS.find((m) => m.id === model) || MODELS[0];
  const installed = status?.installed || [];

  return (
    <div className="model-select-wrapper">
      <select
        className="model-select-native"
        value={model}
        disabled={disabled}
        onChange={(e) => onModelChange(e.target.value)}
      >
        {MODELS.map((m) => {
          const present = installed.some((n) => n === m.id || n.startsWith(m.id.split(':')[0]));
          const label = `${m.label} ${present ? '' : '(Not Pulled)'}`;
          return (
            <option key={m.id} value={m.id}>
              {label}
            </option>
          );
        })}
      </select>
      <div className="model-select-display" aria-hidden="true">
        <span className="model-select-name">{active.label}</span>
        <span className="model-select-role">{active.role}</span>
        <span className="chev">▾</span>
      </div>
    </div>
  );
}

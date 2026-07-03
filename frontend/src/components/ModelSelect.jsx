import { Listbox } from '@headlessui/react';
import { MODELS } from '../lib/config.js';

export default function ModelSelect({ model, onModelChange, status, disabled }) {
  const active = MODELS.find((m) => m.id === model) || MODELS[0];
  const installed = status?.installed || [];

  return (
    <div className="picker">
      <Listbox value={model} onChange={onModelChange} disabled={disabled}>
        {({ open }) => (
          <>
            <Listbox.Button className="picker__btn">
              <span className="picker__name">{active.label}</span>
              <span className="picker__role">{active.role}</span>
              <span className={`chev ${open ? 'chev--up' : ''}`}>▾</span>
            </Listbox.Button>

            {open && (
              <Listbox.Options static as="div" className="picker__menu">
                {MODELS.map((m) => {
                  const present = installed.some((n) => n === m.id || n.startsWith(m.id.split(':')[0]));
                  return (
                    <Listbox.Option key={m.id} value={m.id} disabled={m.disabled} as="button" className={({ active, selected, disabled }) => `picker__opt ${selected ? 'picker__opt--on' : ''} ${active && !selected && !disabled ? 'picker__opt--active' : ''} ${disabled ? 'picker__opt--disabled' : ''}`}>
                      {({ selected, active }) => (
                        <>
                          <div style={{ textAlign: 'left' }}>
                            <div className="picker__opt-name">{m.label}</div>
                            <div className="picker__opt-role">{m.role}</div>
                          </div>
                          <span className={`tag ${present ? 'tag--ok' : 'tag--miss'}`}>
                            {present ? 'ready' : 'not pulled'}
                          </span>
                        </>
                      )}
                    </Listbox.Option>
                  );
                })}
              </Listbox.Options>
            )}
          </>
        )}
      </Listbox>
    </div>
  );
}

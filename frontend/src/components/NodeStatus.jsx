import { CONTEXT_LOCK } from '../lib/config.js';

// The private compute node's vital signs. This is the piece that
// says "you own this machine" — an instrument readout, not chrome.
const VRAM_CEILING = 6144; // MB, per the RTX 3060 Mobile blueprint

function mb(bytes) {
  return bytes ? Math.round(bytes / (1024 * 1024)) : 0;
}

export default function NodeStatus({ status, swapping }) {
  const online = status?.online;
  const loaded = status?.loaded?.[0];
  const usedMb = loaded ? mb(loaded.sizeVram) : 0;
  const pct = Math.min(100, Math.round((usedMb / VRAM_CEILING) * 100));
  const activeName = loaded?.name || status?.residentModel || '—';

  return (
    <div className="node">
      <div className="node__head">
        <span className={`led ${swapping ? 'led--swap' : online ? 'led--on' : 'led--off'}`} />
        <span className="node__label">
          {swapping ? 'reallocating vram' : online ? 'compute node · live' : 'node offline'}
        </span>
      </div>

      <div className="node__row">
        <span className="node__k">model</span>
        <span className="node__v mono" title={activeName}>
          {activeName.split(':')[0].split('/').pop()}
        </span>
      </div>

      <div className="node__vram">
        <div className="node__vram-top">
          <span className="node__k">vram</span>
          <span className="node__v mono">
            {usedMb ? `${usedMb} / ${VRAM_CEILING} mb` : `— / ${VRAM_CEILING} mb`}
          </span>
        </div>
        <div className="meter">
          <div
            className={`meter__fill ${pct > 92 ? 'meter__fill--hot' : ''}`}
            style={{ width: `${online ? pct : 0}%` }}
          />
        </div>
      </div>

      <div className="node__row">
        <span className="node__k">ctx lock</span>
        <span className="node__v mono">{CONTEXT_LOCK.toLocaleString()}</span>
      </div>
    </div>
  );
}

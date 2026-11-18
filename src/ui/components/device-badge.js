import { h, statusIcon } from '../dom.js';

/**
 * The source badge in the header. It says where the signal comes from and, for the real board, whether
 * it is connected or acquiring, so the status line under the header only has to show problems.
 */
export function deviceBadge({ simulated = false } = {}) {
  const icon = h('span', { class: 'td-source-icon' });
  const text = h('span');
  const el = h('span', { class: 'td-source', dataset: { kind: simulated ? 'simulated' : 'off' }, role: 'status' }, icon, text);
  const paint = (kind, label) => {
    el.dataset.kind = kind;
    icon.replaceChildren(statusIcon(kind === 'simulated' ? 'simulated' : kind === 'ble' ? 'live' : 'idle'));
    text.textContent = label;
  };
  paint(simulated ? 'simulated' : 'off', simulated ? 'Simulated test pattern' : 'NPG Lite · Not connected');
  return {
    el,
    update(c) {
      if (simulated) return;
      if (c.connection === 'connected') paint('ble', c.acquisition === 'acquiring' ? 'NPG Lite · Acquiring' : 'NPG Lite · Connected');
      else paint('off', 'NPG Lite · Not connected');
    },
  };
}

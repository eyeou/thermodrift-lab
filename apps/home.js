/** Lab home: the instruments, the sessions saved in this browser, and storage status. */
import { h, setText } from '../src/ui/dom.js';
import { openIdbStore } from '../src/session/store-idb.js';

const root = document.getElementById('app');
const localTime = (utc) => (utc ? new Date(utc).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

const APPS = [
  {
    index: '01',
    name: 'Berger Lab',
    text: 'Eyes open, eyes closed: the 1929 alpha test. The first check that a homemade EEG setup measures something real.',
    links: [['Open with NPG Lite', 'berger/', 'td-btn td-btn--primary'], ['Try the simulator', 'berger/?source=simulated', 'td-btn']],
  },
  { index: '02', name: 'Session report', text: 'Reopen a saved session or an exported bundle: results, timeline, blocks, integrity.', links: [['Open reports', 'report/', 'td-btn']] },
  { index: '03', name: 'Design catalogue', text: 'Tokens, components, states and chart grammar shared by every instrument.', links: [['Open catalogue', 'catalog/', 'td-btn']] },
];

root.append(h('header', { class: 'td-header' },
  h('img', { class: 'td-logo', src: '../brand/thermodrift-logo.png', width: 1172, height: 227, alt: 'Thermodrift' }),
  h('div', { class: 'td-app-name' }, h('strong', { text: 'Lab' }), h('span', { class: 'td-caption', text: 'Local instruments · nothing leaves this computer' }))));

const sessionsBody = h('div', { class: 'td-body' });
const storageLine = h('p');
const persistButton = h('button', { class: 'td-btn', type: 'button', hidden: true }, 'Keep sessions when the browser frees space');
const persistStatus = h('p', { role: 'status' });

root.append(h('main', { class: 'td-main' },
  h('div', { class: 'hm-intro' },
    h('h1', { text: 'Thermodrift Lab' }),
    h('p', { class: 'td-muted', text: 'Open-source browser instruments for self-run EEG experiments with an NPG Lite. Raw data stay on this computer; every result can be traced back to its samples.' })),
  h('div', { class: 'hm-apps' }, ...APPS.map((a) => h('section', { class: 'td-panel hm-app', 'aria-label': a.name },
    h('header', {}, h('h2', {}, h('span', { class: 'td-index', text: a.index }), a.name)),
    h('div', { class: 'td-body' }, h('p', { text: a.text }), h('div', { class: 'hm-links' }, ...a.links.map(([label, href, cls]) => h('a', { class: cls, href }, label))))))),
  h('section', { class: 'td-panel', 'aria-label': 'Sessions' },
    h('header', {}, h('h2', {}, h('span', { class: 'td-index', text: '04' }), 'Sessions in this browser'), h('span', { class: 'td-kicker', text: 'IndexedDB' })),
    sessionsBody,
    h('div', { class: 'td-body hm-storage' }, storageLine, persistButton, persistStatus))));

async function renderSessions() {
  let store;
  try {
    store = await openIdbStore();
  } catch (error) {
    sessionsBody.replaceChildren(h('p', { class: 'td-muted', text: `Browser storage unavailable: ${error.message}` }));
    return;
  }
  const sessions = await store.listSessions();
  if (!sessions.length) {
    sessionsBody.replaceChildren(h('p', { class: 'td-muted', text: 'No sessions yet. Sessions are saved here automatically while you record.' }));
    return;
  }
  const rows = sessions.map((s) => h('tr', {},
    h('td', { text: localTime(s.created_utc) }),
    h('td', { text: s.app }),
    h('td', { text: s.source?.kind === 'simulated' ? 'SIMULATED' : s.source?.device_name ?? 'unknown' }),
    h('td', { text: s.status }),
    h('td', { class: 'td-num', text: (s.counts?.samples ?? 0).toLocaleString('en-GB') }),
    h('td', { text: (s.protocols ?? []).map((p) => `${p.name} (${p.end_reason ?? 'running'})`).join(', ') || '—' }),
    h('td', {}, h('a', { href: `report/?session=${encodeURIComponent(s.id)}`, text: 'Report' }))));
  sessionsBody.replaceChildren(h('div', { class: 'td-scroll-x' }, h('table', { class: 'td-table' },
    h('thead', {}, h('tr', {}, ...['Started', 'App', 'Source', 'Status', 'Samples', 'Protocols', ''].map((t) => h('th', { scope: 'col', text: t })))),
    h('tbody', {}, ...rows))));
}

async function renderStorage() {
  const estimate = await navigator.storage?.estimate?.().catch(() => null);
  const persisted = await navigator.storage?.persisted?.().catch(() => false);
  setText(storageLine, estimate ? `Using ${(estimate.usage / 1e6).toFixed(1)} MB of ${(estimate.quota / 1e9).toFixed(1)} GB available to this site.${persisted ? ' Sessions are kept even if the browser runs low on space.' : ''}` : 'Storage estimate unavailable.');
  persistButton.hidden = !!persisted || !navigator.storage?.persist;
}

persistButton.onclick = async () => {
  const granted = await navigator.storage.persist().catch(() => false);
  setText(persistStatus, granted ? 'Done.' : 'The browser declined for now; it decides based on how often you use this site. Export important sessions.');
  renderStorage();
};

renderSessions();
renderStorage();

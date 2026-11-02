/** Lab home: the instruments, the sessions saved in this browser, and storage status. */
import { brand } from '../src/ui/components/lab-mark.js';
import { h, setText } from '../src/ui/dom.js';
import { openIdbStore } from '../src/session/store-idb.js';
import { lengthText, recordingSummaries } from '../src/session/recordings.js';

const root = document.getElementById('app');
const localTime = (utc) => (utc ? new Date(utc).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

const APPS = [
  {
    index: '01',
    name: 'Berger Effect',
    text: 'Eyes open, eyes closed: the 1929 alpha test, the classic check of a recording chain.',
    links: [['Open with NPG Lite', 'berger/', 'td-btn td-btn--primary'], ['Try the simulator', 'berger/?source=simulated', 'td-btn'], ['See the protocol', 'berger/#protocol', 'td-btn']],
  },
  {
    index: '02',
    name: 'Breathwork',
    text: 'ECG, EEG, EOG and EMG around a guided breathing session: a signal check, then the same rest before and after.',
    links: [['Open with NPG Lite', 'breathwork/', 'td-btn td-btn--primary'], ['Try the simulator', 'breathwork/?source=simulated', 'td-btn'], ['See the protocol', 'breathwork/#protocol', 'td-btn']],
  },
  { index: '03', name: 'Session report', text: 'Reopen a saved session or an exported bundle: results, timeline, blocks, integrity.', links: [['Open reports', 'report/', 'td-btn']] },
  { index: '04', name: 'Design catalogue', text: 'Tokens, components, states and chart grammar shared by every instrument.', links: [['Open catalogue', 'catalog/', 'td-btn']] },
];

root.append(h('header', { class: 'td-header' },
  brand({ logo: '../brand/thermodrift-logo.png' })));

const sessionsBody = h('div', { class: 'td-body' });
const storageLine = h('p');
const persistButton = h('button', { class: 'td-btn', type: 'button', hidden: true }, 'Keep sessions when the browser frees space');
const persistStatus = h('p', { role: 'status' });

root.append(h('main', { class: 'td-main' },
  h('div', { class: 'hm-intro' },
    h('h1', { text: 'Open-source browser instruments for self-run biosignal experiments with an NPG Lite.' }),
    h('p', {}, h('a', { href: 'https://github.com/eyeou/thermodrift-lab', target: '_blank', rel: 'noopener noreferrer', text: 'Source code on GitHub' }))),
  h('div', { class: 'hm-apps' }, ...APPS.map((a) => h('section', { class: 'td-panel hm-app', 'aria-label': a.name },
    h('header', {}, h('h2', {}, h('span', { class: 'td-index', text: a.index }), a.name)),
    h('div', { class: 'td-body' }, h('p', { text: a.text }), h('div', { class: 'hm-links' }, ...a.links.map(([label, href, cls]) => h('a', { class: cls, href }, label))))))),
  h('section', { class: 'td-panel', 'aria-label': 'Sessions' },
    h('header', {}, h('h2', {}, h('span', { class: 'td-index', text: '05' }), 'Sessions in this browser'), h('span', { class: 'td-kicker', text: 'IndexedDB' })),
    sessionsBody,
    h('div', { class: 'td-body hm-storage' }, storageLine, persistButton, persistStatus)),
  h('p', { class: 'td-caption', text: 'Recordings stay in your browser until exported.' })));

function recordingsText(session) {
  const list = recordingSummaries(session);
  if (!list.length) return '—';
  const tests = list.filter((r) => r.flag === 'test').length;
  return `${list.length} · ${list.map((r) => lengthText(r.seconds)).join(' + ')}${tests ? ` · ${tests} test` : ''}`;
}

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
    h('td', { class: 'td-num', text: recordingsText(s) }),
    h('td', { text: (s.protocols ?? []).map((p) => `${p.name} (${p.end_reason ?? 'running'})`).join(', ') || '—' }),
    h('td', {}, h('a', { href: `report/?session=${encodeURIComponent(s.id)}`, text: 'Report' }))));
  sessionsBody.replaceChildren(h('div', { class: 'td-scroll-x' }, h('table', { class: 'td-table' },
    h('thead', {}, h('tr', {}, ...['Started', 'App', 'Source', 'Status', 'Samples', 'Recordings', 'Protocols', ''].map((t) => h('th', { scope: 'col', text: t })))),
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
  setText(persistStatus, granted ? 'Done.' : 'The browser declined; it decides based on how often you use this site. Export important sessions.');
  renderStorage();
};

renderSessions();
renderStorage();

/**
 * Tabs: one row of buttons, one visible panel. Keyboard: arrows, Home, End. With `hash` the page
 * address follows the tab, so a link can open on it (`breathwork/#protocol`).
 */
import { h, uid } from '../dom.js';

/**
 * @param {{label:string, tabs:{id:string, title:string, index?:string, panel:Node}[], initial?:string, hash?:boolean, aside?:Node, className?:string, rail?:Node, railOn?:string[]}} options
 * rail: a side panel kept beside the panels of the tabs named in railOn.
 * onSelect: called with the id of the tab that opens.
 */
export function createTabs({ label, tabs, initial, hash = false, aside = null, className = '', rail = null, railOn = [], onSelect = null }) {
  const base = uid('tabs');
  const items = new Map();
  let current = null;

  const select = (id, { focus = false, updateHash = true } = {}) => {
    const next = items.get(id);
    if (!next) return false;
    if (current && current !== next) {
      current.button.setAttribute('aria-selected', 'false');
      current.button.tabIndex = -1;
      current.panel.hidden = true;
    }
    current = next;
    next.button.setAttribute('aria-selected', 'true');
    next.button.tabIndex = 0;
    next.panel.hidden = false;
    if (rail) {
      rail.hidden = !railOn.includes(id);
      workspace.dataset.rail = rail.hidden ? 'off' : 'on';
      workspace.dataset.tab = id;
    }
    onSelect?.(id);
    keepInView(next.button);
    if (focus) next.button.focus();
    if (hash && updateHash && location.hash !== `#${id}`) history.replaceState(null, '', `#${id}`);
    return true;
  };

  const list = h('div', { class: 'td-tablist', role: 'tablist', 'aria-label': label });
  const panels = h('div', { class: 'td-tabpanels' });
  const workspace = rail ? h('div', { class: 'td-workspace' }, panels, rail) : panels;
  for (const tab of tabs) {
    const tabId = `${base}-${tab.id}`;
    const panelId = `${tabId}-panel`;
    const button = h('button', { class: 'td-tab', type: 'button', role: 'tab', id: tabId, 'aria-controls': panelId, 'aria-selected': 'false', tabindex: '-1', onclick: () => select(tab.id) },
      tab.index ? h('span', { class: 'td-index', text: tab.index }) : null, tab.title);
    const panel = h('div', { class: 'td-tabpanel', role: 'tabpanel', id: panelId, 'aria-labelledby': tabId, hidden: true }, tab.panel);
    list.append(button);
    panels.append(panel);
    items.set(tab.id, { id: tab.id, button, panel });
  }
  // With a live line beside them, the tabs and the line share a bar; on a phone the line drops under the tabs.
  const bar = aside ? h('div', { class: 'td-tabbar' }, list, aside) : list;

  // On a narrow screen the row of tabs scrolls sideways: the chosen tab stays in view, and a cut edge fades.
  function keepInView(button) {
    if (list.scrollWidth <= list.clientWidth) return;
    const left = button.offsetLeft - list.offsetLeft, right = left + button.offsetWidth;
    if (left < list.scrollLeft) list.scrollLeft = left - 16;
    else if (right > list.scrollLeft + list.clientWidth) list.scrollLeft = right - list.clientWidth + 16;
  }
  const markEdges = () => {
    const start = list.scrollLeft > 2, end = list.scrollLeft + list.clientWidth < list.scrollWidth - 2;
    const more = start && end ? 'both' : start ? 'start' : end ? 'end' : '';
    if (more) list.dataset.more = more; else delete list.dataset.more;
  };
  list.addEventListener('scroll', markEdges, { passive: true });
  if (globalThis.ResizeObserver) new ResizeObserver(markEdges).observe(list);

  list.addEventListener('keydown', (event) => {
    const ids = [...items.keys()];
    const at = ids.indexOf(current?.id);
    const target = { ArrowRight: ids[(at + 1) % ids.length], ArrowLeft: ids[(at - 1 + ids.length) % ids.length], Home: ids[0], End: ids[ids.length - 1] }[event.key];
    if (!target) return;
    event.preventDefault();
    select(target, { focus: true });
  });

  const fromHash = () => (hash ? location.hash.slice(1) : '');
  // On a small screen the header can push the tabs below the first view: a link naming a tab brings them up.
  const reveal = () => { if (list.getBoundingClientRect().top > innerHeight / 2) list.scrollIntoView({ block: 'start' }); };
  if (hash) addEventListener('hashchange', () => { if (select(fromHash(), { updateHash: false })) reveal(); });
  if (select(fromHash(), { updateHash: false })) setTimeout(reveal, 400);
  else select(initial ?? tabs[0]?.id, { updateHash: false });

  return { el: h('div', { class: `td-tabs ${className}`.trim() }, bar, workspace), select, get current() { return current?.id; } };
}

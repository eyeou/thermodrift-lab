/**
 * The written protocol of an app: the whole session step by step, then one tab per timed protocol.
 * Block tables come from the same definitions the protocol engine runs, so what is read is what
 * runs. Starting a protocol stays with the launcher beside it.
 */
import { h } from '../dom.js';
import { createTabs } from './tabs.js';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function blockTable(definition, blockName) {
  let at = 0;
  const rows = definition.blocks.map((block) => {
    const row = h('tr', {},
      h('td', { class: 'td-num', text: clock(at) }),
      h('td', { text: blockName(block.label) }),
      h('td', { class: 'td-num', text: `${block.seconds} s` }),
      h('td', { text: block.instruction }));
    at += block.seconds;
    return row;
  });
  return h('div', { class: 'td-scroll-x' }, h('table', { class: 'td-table td-guide-table' },
    h('thead', {}, h('tr', {}, ...['Starts', 'Block', 'Length', 'What you do'].map((t) => h('th', { scope: 'col', text: t })))),
    h('tbody', {}, ...rows)));
}

/**
 * @param {{guide:object, blockName:(label:string)=>string, goToTab:(id:string)=>void, intro?:Node|null}} options
 * guide: { question, needs[], time, steps[{title, text, tab?, protocol?}], protocols{name: {purpose, note?}}, limits, care? }
 * intro: shown under the question of the whole session. The node stays in place when the guide changes.
 */
export function createProtocolGuide({ guide: initial, blockName, goToTab, intro = null }) {
  const host = h('div', { class: 'td-guide' });
  let tabs = null;
  let guide = initial;

  const show = (name) => tabs?.select(name);

  const stepLink = (step) => {
    if (step.protocol) return h('button', { class: 'td-link-btn', type: 'button', onclick: () => show(step.protocol) }, 'See the blocks');
    if (step.tab) return h('button', { class: 'td-link-btn', type: 'button', onclick: () => goToTab(step.tab) }, step.tabLabel ?? 'Open');
    return null;
  };

  const written = h('div', { class: 'td-guide-body' });
  const whole = h('div', { class: 'td-guide-body' }, h('p', { class: 'td-guide-question', text: guide.question }), intro, written);
  const paintWritten = () => written.replaceChildren(
    h('div', { class: 'td-guide-facts' },
      h('div', {}, h('span', { class: 'td-kicker', text: 'You need' }), h('ul', {}, ...guide.needs.map((n) => h('li', { text: n })))),
      h('div', {}, h('span', { class: 'td-kicker', text: 'Time' }), h('p', { text: guide.time }))),
    h('ol', { class: 'td-steps' }, ...guide.steps.map((step, i) => h('li', { class: 'td-step' },
      h('span', { class: 'td-step-n', 'aria-hidden': 'true', text: ROMAN[i] ?? String(i + 1) }),
      h('div', {}, h('strong', { text: step.title }), h('p', { text: step.text }), stepLink(step))))),
    ...(guide.care ? [h('p', { class: 'td-guide-limit' }, h('strong', { text: 'Care. ' }), guide.care)] : []),
    h('p', { class: 'td-guide-limit' }, h('strong', { text: 'Limits. ' }), guide.limits));
  paintWritten();

  const one = (entry) => {
    const text = guide.protocols[entry.name] ?? {};
    return h('div', { class: 'td-guide-body' },
      h('p', { class: 'td-guide-question', text: text.purpose ?? entry.detail }),
      h('p', { class: 'td-caption', text: entry.detail }),
      blockTable(entry.create(), blockName),
      text.note ? h('p', { class: 'td-caption', text: text.note }) : null);
  };

  return {
    el: host,
    show,
    /** Rewrites the whole-session text for a new guide; the open tab and the intro stay as they are. */
    setGuide(next) {
      guide = next;
      paintWritten();
    },
    /** Rebuilds the tabs when the protocols change (block length, for example); keeps the open tab. */
    update(entries) {
      const open = tabs?.current;
      tabs = createTabs({
        label: 'Written protocol',
        className: 'td-tabs--sub',
        initial: entries.some((e) => e.name === open) ? open : 'whole',
        tabs: [
          { id: 'whole', title: 'Whole session', panel: whole },
          ...entries.map((entry) => ({ id: entry.name, title: entry.tabTitle ?? entry.label, panel: one(entry) })),
        ],
      });
      host.replaceChildren(tabs.el);
    },
  };
}

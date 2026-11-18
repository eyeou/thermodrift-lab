/**
 * The written protocol of an app: the whole session, step by step.
 * Starting a protocol stays with the launcher beside it.
 *
 * Selecting a step shows what it looks like: in the side rail on a wide screen, under the step on a
 * narrow one. The first step is selected at the start, so the rail is never empty.
 */
import { h, uid } from '../dom.js';
import { NARROW_FIGURES } from './guide-figures.js';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const WIDE = '(min-width: 1101px)';

/**
 * @param {{guide:object, blockName:(label:string)=>string, goToTab:(id:string)=>void, intro?:Node|null, visuals?:Record<string, ()=>Node>}} options
 * guide: { question, needs[], steps[{title, text, tab?, protocol?, protocols?, visual?}], protocols{name: {purpose, note?}}, care? }
 * A step shows visuals[step.visual] when it names one.
 * intro: shown under the question of the whole session. The node stays in place when the guide changes.
 */
export function createProtocolGuide({ guide: initial, blockName, goToTab, intro = null, visuals = {} }) {
  const host = h('div', { class: 'td-guide' });
  let tabs = null;
  let guide = initial;
  let entries = [];
  let selected = 0;
  let items = [];
  let railSlot = null;
  let subTab = 'whole';
  let ready = false; // visuals draw from the first update, once the app has finished building
  const wide = globalThis.matchMedia?.(WIDE);
  const narrow = globalThis.matchMedia?.(NARROW_FIGURES);
  let hasVisual = false;

  const show = (name) => tabs?.select(name);
  const stageId = uid('stage');
  const stageKicker = h('span', { class: 'td-kicker' });
  const stageTitle = h('h3', { class: 'td-stage-title' });
  const stageBody = h('div', { class: 'td-stage-body' });
  const stage = h('section', { class: 'td-guide-stage', id: stageId, 'aria-label': 'What this step looks like' },
    h('header', {}, stageKicker, stageTitle), stageBody);

  const stepLink = (step) => {
    if (step.tab) return h('button', { class: 'td-step-link', type: 'button', onclick: () => goToTab(step.tab) }, step.tabLabel ?? 'Open');
    return null;
  };

  const visualOf = (step) => {
    if (step.visual && visuals[step.visual]) return visuals[step.visual]();
    return null;
  };

  /** Puts the stage in the rail on a wide screen and under the chosen step otherwise. */
  const place = () => {
    const item = items[selected];
    const inRail = railSlot && wide?.matches;
    if (inRail) railSlot.append(stage);
    else item?.append(stage);
    stage.dataset.place = inRail ? 'rail' : 'inline';
    // Under a step the stage only adds a picture: without one it would repeat the step's own text.
    stage.hidden = inRail ? subTab !== 'whole' : !hasVisual;
  };

  const paintStage = () => {
    if (!ready) return;
    const step = guide.steps[selected];
    if (!step) return;
    stageKicker.textContent = `Step ${ROMAN[selected] ?? selected + 1}`;
    stageTitle.textContent = step.title;
    const visual = visualOf(step);
    hasVisual = !!visual;
    stageBody.replaceChildren(visual ?? h('p', { class: 'td-caption', text: step.text }));
    items.forEach((item, i) => {
      item.classList.toggle('is-selected', i === selected);
      item.querySelector('.td-step-head')?.setAttribute('aria-expanded', String(i === selected));
    });
    place();
  };

  const select = (i) => {
    if (i === selected && stage.isConnected) return;
    selected = i;
    paintStage();
  };

  const written = h('div', { class: 'td-guide-body' });
  const whole = h('div', { class: 'td-guide-body' }, h('p', { class: 'td-guide-question', text: guide.question }), intro, written);
  const paintWritten = () => {
    items = guide.steps.map((step, i) => {
      const head = h('button', { class: 'td-step-head', type: 'button', 'aria-controls': stageId, 'aria-expanded': 'false', onclick: () => select(i) },
        h('span', { class: 'td-step-n', 'aria-hidden': 'true', text: ROMAN[i] ?? String(i + 1) }),
        h('span', { class: 'td-step-title', text: step.title }));
      const li = h('li', { class: 'td-step' }, head,
        h('div', { class: 'td-step-text' }, h('p', { text: step.text }), stepLink(step)));
      li.addEventListener('focusin', () => select(i));
      li.addEventListener('click', (event) => { if (!event.target.closest('a, .td-step-link, .td-guide-stage')) select(i); });
      return li;
    });
    written.replaceChildren(
      h('ol', { class: 'td-steps' }, ...items),
      ...(guide.care ? [h('p', { class: 'td-guide-limit' }, h('strong', { text: 'Care. ' }), guide.care)] : []));
    if (selected >= items.length) selected = 0;
    paintStage();
  };
  paintWritten();
  wide?.addEventListener?.('change', place);
  narrow?.addEventListener?.('change', paintStage); // the step pictures have a phone drawing


  return {
    el: host,
    show,
    /** Rewrites the whole-session text for a new guide; the open tab and the intro stay as they are. */
    setGuide(next) {
      guide = next;
      paintWritten();
    },
    /** Redraws the visual of the chosen step, after a montage or format change. */
    refreshVisual() { paintStage(); },
    /**
     * Gives the stage a place at the top of the run rail. The run controls stay open below it.
     */
    mountRail(rail) {
      railSlot = h('div', { class: 'td-rail-stage' });
      rail.prepend(railSlot);
      rail.dataset.device = 'off';
      place();
    },
    /**
     * Unfolds the run controls when a device is connected or acquiring. While a protocol runs, the
     * figure steps aside so the current block stays at the top of the rail.
     */
    setDevice(on, running = false) {
      const rail = railSlot?.parentElement;
      if (!rail) return;
      rail.dataset.device = on ? 'on' : 'off';
      railSlot.hidden = running;
    },
    /** Rebuilds the tabs when the protocols change (block length, for example); keeps the open tab. */
    update(next) {
      entries = next;
      // One written protocol, no sub-tabs: each protocol's blocks show in the rail when its step is chosen.
      subTab = 'whole';
      host.replaceChildren(whole);
      ready = true;
      paintStage();
    },
  };
}

/** The equipment list, shown at the bottom of the Setup tab. */
export function needsList(needs = []) {
  return h('section', { class: 'td-needs', 'aria-label': 'What you need' },
    h('span', { class: 'td-kicker', text: 'What you need' }),
    h('ul', {}, ...needs.map((n) => h('li', { text: n }))));
}

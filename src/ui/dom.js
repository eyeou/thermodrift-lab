/** Tiny DOM helpers. No framework: components are functions that build elements and update them. */

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const child of children.flat()) if (child !== null && child !== undefined && child !== false) el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return el;
}

export function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) el.setAttribute(k, String(v));
  for (const child of children.flat()) if (child) el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return el;
}

export function setText(el, value) {
  const s = value ?? '';
  if (el.textContent !== s) el.textContent = s;
}

let ids = 0;
export const uid = (prefix = 'td') => `${prefix}-${++ids}`;

/** Status icon by semantic tone: shape carries meaning without colour. */
export function statusIcon(tone) {
  const s = (d) => svg('svg', { class: 'td-icon', viewBox: '0 0 12 12', 'aria-hidden': 'true' }, d);
  switch (tone) {
    case 'ready': return s(svg('path', { d: 'M2 6.5 5 9.5 10 3', fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }));
    case 'live': return s(svg('circle', { cx: 6, cy: 6, r: 4.5, fill: 'currentColor' }));
    case 'warning': return s(svg('path', { d: 'M6 1.5 11 10.5H1Z', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6 }));
    case 'error': return s(svg('path', { d: 'M2.5 2.5 9.5 9.5M9.5 2.5 2.5 9.5', stroke: 'currentColor', 'stroke-width': 2 }));
    case 'simulated': return s(svg('path', { d: 'M0 12 12 0M-3 9 9-3M3 15 15 3', stroke: 'currentColor', 'stroke-width': 2 }));
    case 'stale': return s(svg('circle', { cx: 6, cy: 6, r: 4.5, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-dasharray': '2 2' }));
    default: return s(svg('circle', { cx: 6, cy: 6, r: 4.5, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 }));
  }
}

/** Button + adjacent reason line, linked with aria-describedby. */
export function actionButton({ className = 'td-btn', onClick }) {
  const whyId = uid('why');
  const button = h('button', { class: className, type: 'button', 'aria-describedby': whyId, onclick: onClick });
  const why = h('p', { class: 'td-why', id: whyId, hidden: true, 'aria-live': 'polite' });
  const wrap = h('div', { class: 'td-action' }, button, why);
  return {
    el: wrap,
    button,
    update(state) {
      if (!state) return;
      wrap.hidden = !!state.hidden;
      if (button.dataset.label !== state.label) { button.dataset.label = state.label; button.replaceChildren(...(state.content ? state.content() : [state.label])); }
      button.disabled = !state.enabled;
      why.hidden = !state.why;
      setText(why, state.why ?? '');
      if (state.note && state.enabled) { why.hidden = false; setText(why, state.note); why.style.color = 'var(--td-color-ink-muted)'; } else why.style.color = '';
    },
  };
}

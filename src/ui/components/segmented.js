/**
 * Segmented control: one choice among a few, all in view. Native radio buttons underneath, so arrow
 * keys, focus and the disabled state come from the browser.
 */
import { h, uid } from '../dom.js';

/**
 * @param {{label:string, options:{value:string, label:string}[], value:string, onChange:(value:string)=>void, describedBy?:string}} options
 * @returns {{el:HTMLElement, inputs:HTMLInputElement[]}}
 */
export function createSegmented({ label, options, value, onChange, describedBy }) {
  const name = uid('segmented');
  const inputs = options.map((option) => h('input', { type: 'radio', name, value: option.value, checked: option.value === value, onchange: () => onChange(option.value) }));
  const el = h('div', { class: 'td-segmented', role: 'radiogroup', 'aria-label': label, 'aria-describedby': describedBy },
    ...options.map((option, i) => h('label', { class: 'td-segment' }, inputs[i], h('span', { text: option.label }))));
  return { el, inputs };
}

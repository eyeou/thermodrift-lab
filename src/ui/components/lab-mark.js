/**
 * The Thermodrift Lab header mark: the logo, a brass diamond, then LAB in Limelight by Sorkin Type Co
 * (SIL Open Font License), converted to paths. A brand element, see brand/NOTICE.md.
 */
import { h } from '../dom.js';

const LETTERS = '<svg viewBox="0 0 77.37 30" aria-hidden="true">'
  + '<path d="M18.17 28.07Q19.29 28.07 19.29 29.02Q19.29 29.41 18.84 29.7Q18.38 30 17.22 30H0V0H10.81V28.6H14.78Q16.11 28.6 17.08 28.34Q18.04 28.07 18.17 28.07ZM29.76 26.23Q25.88 26.23 24.46 26.16L23.84 27.63Q23.56 28.24 23.33 28.92Q22.84 30.23 21.97 30.23Q21.57 30.23 21.32 29.98Q21.06 29.72 21.06 29.45Q21.06 28.98 21.47 28.41Q22.1 27.52 22.72 26.08Q20.89 25.91 20.89 25.02Q20.89 24.13 21.93 24.13Q22.57 24.13 23.42 24.34L34 -1.36L48.5 30H37.45L35.69 26.23ZM25.13 24.51Q27.17 24.68 28.78 24.68H34.99L29.69 13.25ZM50.7 0Q56.42 0 59.8 0Q63.19 0 63.91 0.02Q67.04 0.17 68.34 0.75Q69.63 1.34 70.39 2.06Q72.03 3.67 72.03 5.96Q72.03 8.23 70.44 9.94Q69.95 10.47 69.31 10.86Q72.77 11.49 74.97 13.76Q77.37 16.22 77.37 19.76Q77.37 23.36 75.14 25.97Q72.03 29.58 65.52 29.92Q63.86 30 62.25 30H50.7ZM64.61 10.43 65.69 10.56H66.03Q67.7 10.56 68.93 9.33Q70.25 8.01 70.25 6.11Q70.25 3.77 68.23 2.52Q67.21 1.89 66.21 1.77Q65.2 1.65 64.63 1.61Q63.44 1.53 61.51 1.53V28.43H63.86Q67.47 28.43 69.74 27.54Q72.45 26.61 74.04 24.53Q75.55 22.56 75.55 20.4Q75.55 18.23 74.91 16.75Q74.27 15.27 73.07 14.23Q70.61 12.08 66.22 12.08L64.75 12.21Q64.08 12.21 63.76 11.94Q63.44 11.66 63.44 11.3Q63.44 10.43 64.61 10.43Z"/>'
  + '</svg>';

const diamond = () => h('span', { class: 'td-diamond', 'aria-hidden': 'true' });

/** Logo, diamond and LAB, as a link when `href` is given. */
export function brand({ logo, href }) {
  const parts = [
    h('img', { class: 'td-logo', src: logo, width: 1172, height: 227, alt: 'Thermodrift' }),
    diamond(),
    h('span', { class: 'td-lab-letters', role: 'img', 'aria-label': 'Lab', html: LETTERS }),
  ];
  return href ? h('a', { class: 'td-brand', href, 'aria-label': 'Thermodrift Lab home' }, parts) : h('div', { class: 'td-brand' }, parts);
}

/** The app's own name, further right: Thermodrift ◆ LAB ◆ name. */
export function appName(name, caption) {
  return h('div', { class: 'td-app-id' }, diamond(),
    h('div', { class: 'td-app-name' }, h('strong', { text: name }), h('span', { class: 'td-caption', text: caption })));
}

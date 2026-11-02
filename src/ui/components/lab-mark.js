/**
 * The Thermodrift Lab header mark: the logo, a brass diamond, then LAB in inline capitals drawn for
 * this project. A brand element, see brand/NOTICE.md.
 */
import { h } from '../dom.js';

const LETTERS = '<svg viewBox="0 0 74 30" aria-hidden="true"><g transform="scale(.86 1)" fill-rule="evenodd">'
  + '<path d="M0 0H9V1.3H7.3V28.7H19.5V30H0V28.7H1.7V1.3H0ZM3.7 1.3H5.3V28.7H3.7Z"/>'
  + '<path d="M36.2 0H37.6L26.6 28.7H25.2ZM22.8 28.7H29V30H22.8ZM36.6 0H38.6L51 28.7H49ZM40.2 0H42.2L54.6 28.7H52.6ZM36.2 0H42.2V1.1H36.2ZM47 28.7H56.6V30H47ZM28.4 20.2H45.3V21.4H28Z"/>'
  + '<path d="M60 0H73.5C79 0 82 3 82 7C82 10.6 79.6 12.8 76.4 13.6C81.6 14.4 85.6 17.4 85.6 22C85.6 27 81.6 30 75.5 30H60V28.7H61.7V1.3H60ZM63.7 1.3H65.3V28.7H63.7ZM67.3 1.3V13H72.4C75.8 13 77.6 10.6 77.6 7C77.6 3.6 75.8 1.3 72.4 1.3ZM67.3 14.2V28.7H73.8C78 28.7 80.6 26 80.6 22C80.6 17.4 78 14.2 73.8 14.2Z"/>'
  + '</g></svg>';

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

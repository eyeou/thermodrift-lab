/**
 * The plan of a whole sitting on one time axis, to scale: signal check, rest, session, rest.
 * A plan and not a measurement, so it carries no recorded value.
 */
import { theme } from '../../design/theme.js';
import { EYES_OPEN, MUTED, SAND, isNarrow, legend, round, sizeFor, spanLabels, svgChart, text } from '../charts/report.js';

const FILLS = Object.freeze({
  plain: [theme.color.data.neutral, 0.4],
  breathing: [EYES_OPEN, 0.65],
  hold: [SAND, 0.8],
  closing: [SAND, 0.8],
  recovery: [MUTED, 0.22],
});

const secondsOf = (group) => group.parts.reduce((sum, part) => sum + part.seconds, 0);

/**
 * @param {{names:string[], parts:{kind:string, seconds:number}[]}[]} groups in the order they run
 * @param {{kind:string, label:string}[]} key what the coloured parts of the session are
 */
export function sessionTimelineSvg(groups, key, { width: W = 860 } = {}) {
  const narrow = isNarrow(W), size = sizeFor(W);
  const lg = legend(key.map(({ kind, label }) => ({ label, kind: 'band', color: FILLS[kind][0], opacity: FILLS[kind][1] })), { W, size });
  const total = groups.reduce((sum, group) => sum + secondsOf(group), 0);
  const x = (s) => (s / total) * W;
  let at = 0;
  const spans = groups.map((group) => {
    const span = { x0: x(at), x1: x(at + secondsOf(group)), names: group.names };
    at += secondsOf(group);
    return span;
  });
  const labels = spanLabels(spans, { y: lg.bottom + size + 12, size: 12, left: 2, right: W - 2, overhang: true });
  const top = lg.bottom + size + 12 + (labels.rows - 1) * 15 + 8, height = narrow ? 18 : 22;
  let body = lg.markup + labels.markup;
  at = 0;
  for (const group of groups) {
    for (const part of group.parts) {
      const [fill, opacity] = FILLS[part.kind];
      body += `<rect x="${round(x(at) + 1)}" y="${top}" width="${round(Math.max(1, x(part.seconds) - 2))}" height="${height}" fill="${fill}" fill-opacity="${opacity}"/>`;
      at += part.seconds;
    }
  }
  const step = total <= 1800 ? 300 : 600;
  const baseline = top + height + size + 5;
  for (let t = 0; t <= total; t += step) {
    const value = t === 0 ? '0' : t + step > total ? `${t / 60} min` : String(t / 60);
    const anchor = t === 0 ? 'start' : x(t) + value.length * 3.5 > W ? 'end' : 'middle';
    body += text(anchor === 'end' ? W : x(t), baseline, value, { size: 12, anchor });
  }
  const said = groups.map((group) => `${group.names[0]}, ${Math.round(secondsOf(group) / 60)} minutes`).join('; ');
  return svgChart({ W, H: baseline + 5, label: `Plan of a sitting, in order: ${said}. Planned lengths, not a recording.`, body });
}

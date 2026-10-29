/**
 * Montage diagram: top view of the head with the international 10–20 site names, the sites in
 * use highlighted, and each lead labelled by board pin (pin labels are authoritative; cable
 * colours are drawn for recognition only).
 *
 * Geometry: spherical head, Cz at the pole; azimuthal equidistant projection where 90° from Cz
 * (the nasion–inion–preauricular plane) maps to radius 1. Fpz/Oz/T7/T8 sit at 72° (radius 0.8).
 * F3/F4/P3/P4 are midpoints on the sphere between F7–Fz, F8–Fz, P7–Pz, P8–Pz.
 */
import { svg } from '../dom.js';

const RING = [
  ['Fpz', 0], ['Fp2', 18], ['F8', 54], ['T8', 90], ['P8', 126], ['O2', 162], ['Oz', 180], ['O1', -162], ['P7', -126], ['T7', -90], ['F7', -54], ['Fp1', -18],
];

function toVec(polarDeg, azDeg) {
  const p = (polarDeg * Math.PI) / 180, a = (azDeg * Math.PI) / 180;
  return [Math.sin(p) * Math.sin(a), Math.sin(p) * Math.cos(a), Math.cos(p)];
}
function project([x, y, z]) {
  const polar = Math.acos(Math.max(-1, Math.min(1, z)));
  const az = Math.atan2(x, y);
  const r = polar / (Math.PI / 2);
  return { x: r * Math.sin(az), y: -r * Math.cos(az) };
}
function mid(a, b) {
  const v = a.map((ai, i) => ai + b[i]);
  const n = Math.hypot(...v);
  return v.map((vi) => vi / n);
}

/** 2-D positions (unit head radius, nose up) for the 21 standard sites plus mastoids. */
export const SITES_1020 = (() => {
  const v = {};
  for (const [name, az] of RING) v[name] = toVec(72, az);
  v.Fz = toVec(36, 0); v.Cz = [0, 0, 1]; v.Pz = toVec(36, 180);
  v.C3 = toVec(36, -90); v.C4 = toVec(36, 90);
  v.F3 = mid(v.F7, v.Fz); v.F4 = mid(v.F8, v.Fz); v.P3 = mid(v.P7, v.Pz); v.P4 = mid(v.P8, v.Pz);
  const out = Object.fromEntries(Object.entries(v).map(([k, vec]) => [k, project(vec)]));
  out.M1 = { x: -1.06, y: 0.36 };
  out.M2 = { x: 1.06, y: 0.36 };
  return Object.freeze(out);
})();

/** Letter → region (approximate: names describe the area underneath, not exact anatomy). */
export const REGION_LETTERS = Object.freeze({ Fp: 'frontopolar', F: 'frontal', C: 'central', T: 'temporal', P: 'parietal', O: 'occipital', M: 'mastoid (behind the ear)' });

/**
 * @param {{leads:{site:string, pin:string, cable:string, cableColor:string, role:string}[], title?:string, compact?:boolean}} options
 */
export function montageSvg({ leads, title = 'Electrode montage, top view, nose up', compact = false }) {
  const S = 100;
  const used = new Map(leads.map((l) => [l.site, l]));
  const root = svg('svg', { viewBox: '-140 -132 280 268', role: 'img', 'aria-label': `${title}. ${leads.map((l) => `${l.pin} (${l.cable} cable) at ${l.site}`).join('; ')}.` });
  root.append(svg('title', {}, title));
  // head, nose, ears
  root.append(svg('circle', { cx: 0, cy: 0, r: S, fill: 'none', stroke: '#F2F2F2', 'stroke-width': 2.5 }));
  root.append(svg('path', { d: `M -10 ${-S + 1} L 0 ${-S - 14} L 10 ${-S + 1}`, fill: 'none', stroke: '#F2F2F2', 'stroke-width': 2.5 }));
  root.append(svg('path', { d: `M ${-S} -14 C ${-S - 13} -14 ${-S - 13} 18 ${-S} 18`, fill: 'none', stroke: '#F2F2F2', 'stroke-width': 2.5 }));
  root.append(svg('path', { d: `M ${S} -14 C ${S + 13} -14 ${S + 13} 18 ${S} 18`, fill: 'none', stroke: '#F2F2F2', 'stroke-width': 2.5 }));
  // midline and coronal guides
  root.append(svg('line', { x1: 0, y1: -80, x2: 0, y2: 80, stroke: '#1F2850', 'stroke-width': 1 }));
  root.append(svg('line', { x1: -80, y1: 0, x2: 80, y2: 0, stroke: '#1F2850', 'stroke-width': 1 }));
  root.append(svg('circle', { cx: 0, cy: 0, r: 80, fill: 'none', stroke: '#1F2850', 'stroke-width': 1 }));
  const usedPoints = leads.map((l) => SITES_1020[l.site]).filter(Boolean);
  for (const [name, p] of Object.entries(SITES_1020)) {
    if (used.has(name)) continue;
    const x = p.x * S, y = p.y * S;
    root.append(svg('circle', { cx: x, cy: y, r: 3, fill: '#2C3870' }));
    // Names next to a used electrode would collide with its pin label: the dot stays, the name goes.
    const crowded = usedPoints.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 0.3);
    if (!compact && !crowded) root.append(svg('text', { x, y: y + 12, 'text-anchor': 'middle', 'font-size': 8.5, fill: '#A2AAC8', 'font-family': 'system-ui, sans-serif' }, name));
  }
  for (const lead of leads) {
    const p = SITES_1020[lead.site];
    if (!p) continue;
    const x = p.x * S, y = p.y * S;
    root.append(svg('circle', { cx: x, cy: y, r: 9, fill: lead.cableColor, stroke: '#000', 'stroke-width': 2.5 }));
    const below = y < 60;
    root.append(svg('text', { x, y: below ? y + 21 : y - 14, 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 700, fill: '#F2F2F2', 'font-family': 'system-ui, sans-serif' }, `${lead.pin} · ${lead.short ?? lead.site}`));
  }
  return root;
}

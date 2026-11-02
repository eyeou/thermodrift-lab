/**
 * Electrode placement plates: front, back, left side and top of the head, drawn in one style from
 * a montage's leads. Pure functions returning SVG markup, so the apps and the README figures
 * (tools/build-figures.mjs) share one source and it can be tested without a browser.
 *
 * Illustrations, leads named by board pin. Picture-left is
 * the person's right on the front view, and the person's left on the back and top views.
 */
import { SITES_1020 } from './montage.js';

const W = 600, H = 620;
const INK = '#F2F2F2', MUTED = '#A2AAC8', LINE = '#2C3870', BG = '#070A22', BODY = '#0E1433', SAND = '#E8C18D';
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const round = (v) => Math.round(v * 10) / 10;

/** Plate labels per site: what the figure says next to the pin. The lead table gives the full text. */
const SITE_TEXT = Object.freeze({
  Oz: 'Oz', Cz: 'Cz', Fpz: 'Fpz',
  M1: 'behind L ear', M2: 'behind R ear',
  'chest-left': 'L lower ribs', 'chest-right': 'below R collarbone',
  'eye-right': 'R eye corner', 'eye-left': 'L eye corner',
  'neck-upper': 'L neck, mid-muscle', 'neck-lower': '2 cm lower',
  'shoulder-medial': 'R shoulder', 'shoulder-lateral': '2 cm to the tip',
});

// ---------------------------------------------------------------- side view geometry
// One spherical head, the same model as the top view: x towards the right ear, y towards the nose,
// z up, Cz at the pole. The side view looks from the left, 14° above the ear line.
const RAD = Math.PI / 180;
const ELEV = 14 * RAD;
const sph = (polarDeg, azDeg) => {
  const p = polarDeg * RAD, a = azDeg * RAD;
  return [Math.sin(p) * Math.sin(a), Math.sin(p) * Math.cos(a), Math.cos(p)];
};
const projectSide = ([x, y, z]) => ({ x: -y * 100, y: -(x * Math.sin(ELEV) + z * Math.cos(ELEV)) * 100 });
const SIDE_SITES = Object.freeze({
  Fpz: sph(72, 0), Fz: sph(36, 0), Cz: [0, 0, 1], Pz: sph(36, 180), Oz: sph(72, 180),
  T7: sph(72, -90), C3: sph(36, -90), M1: sph(102, -112),
});
const tracePath = (fn, a, b, n = 40) => Array.from({ length: n + 1 }, (_, i) => {
  const p = projectSide(fn(a + ((b - a) * i) / n));
  return `${i ? 'L' : 'M'}${round(p.x)} ${round(p.y)}`;
}).join('');
const SIDE_GRID = [
  tracePath((t) => sph(72, t), 0, -180), // the 10% ring: Fpz, T7, Oz
  tracePath((t) => (t < 0 ? sph(-t, 0) : sph(t, 180)), -72, 72), // midline: Fpz, Fz, Cz, Pz, Oz
  tracePath((t) => sph(t, -90), 72, 0), // ear to vertex: T7, C3, Cz
];
const COS_E = Math.cos(ELEV);
const ARC_R = 122;
const onArc = (deg, r = ARC_R) => ({ x: -r * Math.cos(deg * RAD), y: -r * Math.sin(deg * RAD) * COS_E });

// Anatomy in the sphere's frame: radius 100, nasion at (−100, 0), ear below T7. The skull stays the
// sphere the sites are computed on; only the face, jaw, neck and trunk are drawn around it.
const SIDE_HEAD = 'M60 142C59 122 60 100 65 82C70 66 84 46 94 26C98 17 100 8 100 0A100 100 0 1 0 -99.2 -12.6'
  + 'C-101.4 -9.4 -103 -5.6 -102 -2.6C-101.4 -0.8 -100 0.8 -98.8 2'
  + 'C-101 11 -110 27 -116.8 37.2C-119.4 41 -118.2 45.2 -114 45.8C-110.6 46.2 -107.6 46.6 -105.8 47.8'
  + 'C-106.2 51 -108 54 -108.6 57.2C-108.8 59.6 -106.8 61.2 -104.2 62'
  + 'C-106.6 63.8 -107.4 66.8 -106 69.6C-104.8 71.8 -102.4 73.2 -101 75.2'
  + 'C-102.8 80 -105.6 85.6 -104.6 90.6C-103.6 95.6 -98.6 98.4 -91.6 98.8'
  + 'C-78 99.6 -62 100.4 -50 103.4C-46 114 -44.6 128 -44 142';
const SIDE_TRUNK = 'M60 142C63 156 72 168 84 182C97 198 105 222 106 248C107 266 106 284 104 300'
  + 'M-44 142C-49 152 -60 160 -74 170C-90 182 -102 202 -104 226C-105 248 -102 274 -98 300';
const SIDE_FILL = 'M60 142C63 156 72 168 84 182C97 198 105 222 106 248C107 266 106 284 104 300L-98 300'
  + 'C-102 274 -105 248 -104 226C-102 202 -90 182 -74 170C-60 160 -49 152 -44 142Z';
const SIDE_EAR = 'M2 7C6 -3 21 -5 25.6 6C29 14 26.4 24 22.8 31C20.4 36 18.8 41 17.8 46C16.4 53 9.4 57.4 5.6 52.6C3.6 50 3 45 3.2 40';
const SIDE_EAR_INNER = 'M8.6 10.6C14 5.6 21 9.4 20.6 17C20.2 24 15.4 28 13.2 34.4M2.4 22.4C5 21.4 6 27 2.8 28.6';
const SIDE_EYE = 'M-91.5 9.4C-88 12.8 -82.6 13.2 -78.8 10.4';
const SIDE_BROW = 'M-98 -5.4C-90 -9.4 -80 -9.6 -72.6 -5.8';
const SIDE_HAIR = 'M-84 -54.3C-66 -46 -44 -38 -26 -33C-14 -29 -8 -16 -4 -4L-2 10C0 4 2 1 4 -1C10 -6 22 -6 27 4C30 12 30 22 28 32C34 50 48 72 65 82'
  + 'C70 66 84 46 94 26C98 17 100 8 100 0A100 100 0 0 0 -84 -54.3Z';
const SIDE_UNDER_JAW = 'M-50 103.4C-34 99 -14 92 -4 84C2 79 6 68 8 57C10 70 6 88 -6 100C-18 110 -34 114 -46 116C-46 110 -48 106 -50 103.4Z';
const SIDE_SCM = 'M28 42C22 72 -4 112 -41 150C-4 128 34 84 41 47C37 43 32 41 28 42Z';
const SIDE_DETAIL = [
  'M-50 103.4C-34 99 -14 92 -4 84C2 79 6 68 8 57', // jaw, from the neck to the ear
  'M-104.2 62C-98 63.4 -91 64 -85 63.2', // mouth
  'M28 42C22 72 -4 112 -41 150', // front edge of the neck muscle
  'M41 47C34 84 -4 128 -41 150', // back edge of the neck muscle
  'M-18 196C-10 182 14 176 30 186C41 193 46 208 45 226C44 238 42 250 41 262', // shoulder and back of the arm
  'M-18 196C-24 208 -24 222 -21 236', // front of the shoulder
  'M-23 228C-44 240 -72 244 -94 236', // lower edge of the chest muscle
];

// ---------------------------------------------------------------- front and back geometry
// Half figures, person-symmetric; the other half is the same path mirrored.
/** A half outline (M and C only) joined to its mirror image as one path, so no seam shows. */
function whole(half) {
  const n = half.match(/-?\d+(?:\.\d+)?/g).map(Number);
  const points = [];
  for (let i = 0; i < n.length; i += 2) points.push([n[i], n[i + 1]]);
  const back = points.slice().reverse().map(([x, y]) => [x === 0 ? 0 : -x, y]);
  return `M${back[0].join(' ')}C${back.slice(1).flat().join(' ')}C${points.slice(1).flat().join(' ')}`;
}
// One skull for both views. Front: cheek at eye level, jaw angle at mouth level, a fine, slightly square lower face.
const HEAD_TOP = 'M0 -184C26 -184 43.8 -168 46.8 -140C47.6 -133 47.8 -126 47.2 -118';
const HEAD_OUTLINE = `${whole(`${HEAD_TOP}C46.6 -108 45 -99.6 42.8 -91.4C41.8 -87 41 -83 39 -79.4C36.8 -76 32.6 -70.8 29 -67C24.4 -62 20.2 -58 16 -55.4C13.4 -53.6 10 -52.3 6 -51.8C4 -51.5 2 -51.4 0 -51.4`)}Z`;
const SKULL_OUTLINE = whole(`${HEAD_TOP}C46.6 -108 44.6 -97 40.8 -86C37.6 -79 33 -71.4 29.4 -66.4`);
const FRONT_HAIR = `${whole('M0 -184C26 -184 43.8 -168 46.8 -140C47.4 -135 47.6 -129 47.4 -124C45.8 -128 44.6 -133 43.2 -139C41.2 -148 37.4 -154 31 -157.8C22 -162.4 10 -164 0 -164')}Z`;
const FRONT_HAIRLINE = whole('M0 -164C10 -164 22 -162.4 31 -157.8C37.4 -154 41.2 -148 43.2 -139C44.6 -133 45.8 -128 47.4 -124');
const BACK_HAIR = `${whole(`${HEAD_TOP}C46.6 -108 44.6 -97 40.8 -86C38.6 -82 35.6 -78 32.2 -75C23 -71 10 -69 0 -69`)}Z`;
const HALF_EAR = 'M47 -126C51 -130.6 55.8 -125 54.8 -112.6C54 -104 49.8 -95.6 44.2 -97.6';
const HALF_EAR_INNER = 'M49.2 -120C51.6 -121.4 52.2 -116 51.2 -110.6';
const NECK_AND_SHOULDER = 'C28.8 -58 27.8 -50 28 -43C28.4 -34 39 -17.4 53 -11.6C72 -3.7 96 -1.6 115 9.2';
const OUTER_CONTOUR = `${NECK_AND_SHOULDER}C131.6 19 142.6 40 146 68C148 88 148.2 112 147 134C146 152 145 170 145.4 188C145.8 204 149.4 222 151 240C153 262 154.4 298 154.8 330L155.4 500`;
const HALF_TRUNK = `M29.4 -66.4${OUTER_CONTOUR}`;
const HALF_FILL = `M0 -66.4L29.4 -66.4${OUTER_CONTOUR}L0 500Z`;
const HALF_FLANK = 'M98.4 112C97.6 130 95.4 152 91 174C87 194 81.2 208 79.2 224C77.4 244 80.2 268 83.8 290C86.2 306 88.4 324 89.8 350L96.8 500';
const HALF_INNER_ARM = 'M98.4 112C99.8 132 101.4 156 103.2 180C104.4 198 105.8 216 107.4 236C109.4 262 112.8 296 116.4 318C118.4 330 121 340 122.4 350L130.4 500';
const HALF_GAP = `${HALF_INNER_ARM}L96.8 500L89.8 350C88.4 324 86.2 306 83.8 290C80.2 268 77.4 244 79.2 224C81.2 208 87 194 91 174C95.4 152 97.6 130 98.4 112Z`;
const SCM_OUTER = 'M28.6 -64C28.2 -50 27.6 -30 21.6 -10C18 -2 11 8 6 15';
const SCM_INNER = 'M24 -61.4C21.4 -47 15.4 -29 11 -14C9 -6 6 4 1.5 12';
const HALF_SCM = `${SCM_OUTER}L1.5 12C6 4 9 -6 11 -14C15.4 -29 21.4 -47 24 -61.4Z`;
const FRONT_DETAIL = [
  'M8 17C26 9 44 8 62 9.6C78 10.8 92 10 108 12', // collarbone
  'M4 98C24 116 62 118 84 99C91 93 95.6 85 98.6 76', // chest muscle
  'M106.6 20C100.6 42 97.6 70 99.2 102', // front edge of the shoulder
  'M147.4 90C140.6 106 131 114 122 116', // lower edge of the shoulder
  'M2 120C22 150 44 176 62 198', // ribcage margin
  'M92 150C84 158 76 164 68 168', 'M86 186C81 191 76 195 71 198', // ribs
  SCM_OUTER, SCM_INNER, // neck muscle
];
// Soft planes, not lines: the jaw is the contour, with shade under it, below the cheekbone and along the nose.
const UNDER_JAW = `${whole('M0 -41C10 -41.4 20 -45 27.8 -51.6C28.6 -56 29.2 -61 29.4 -66.4')}Z`;
const CHEEK_PLANE = 'M45.8 -106C41.4 -99 38.6 -90 38.2 -78.4C40.2 -82 41.8 -87 42.8 -91.4C44.2 -96.6 45.2 -101 45.8 -106Z';
const NOSE_PLANE = 'M4.6 -126C3.8 -118 3.4 -108 4 -100C5.2 -104 6.2 -116 8 -124Z';
const FRONT_ABDOMEN = ['M0 118L0 228', 'M-3.4 236C-2 239 2 239 3.4 236', 'M40 160C42 188 42 222 37 262', 'M-40 160C-42 188 -42 222 -37 262'];
const FRONT_FACE = [
  'M10.4 -119.2C13.4 -122.2 18.2 -123.3 22.6 -122.4C25.4 -121.8 27.6 -120.6 29.2 -119.4', // upper eyelid
  'M5.2 -96.6C6.9 -95.8 7.2 -93.8 6 -92.8C5.4 -92.3 4.5 -92.3 3.7 -92.6', // wing of the nose
];
const FRONT_FACE_SOFT = [
  'M10.4 -119.2C14 -117.3 19.6 -116.7 23.8 -117.2C26 -117.6 28 -118.4 29.2 -119.4', // lower eyelid
];
const FRONT_BROW = 'M9.6 -127.4C13.4 -129.4 20.4 -130.4 25.8 -129.6C28.4 -129.2 30.4 -128.4 31.6 -127.4C28.2 -127.9 23 -128.2 18 -127.7C14.6 -127.4 12 -126.8 9.6 -126Z';
const FRONT_IRIS = [19.8, -120, 2.7];
const FRONT_MIDLINE = [
  'M-3.7 -92.6C-2.4 -91.6 -1.2 -91.2 0 -91.2C1.2 -91.2 2.4 -91.6 3.7 -92.6', // base of the nose
  'M-10.8 -79.6C-7 -79.1 -3.4 -78.7 -1.6 -78.9C-0.7 -79.1 0.7 -79.1 1.6 -78.9C3.4 -78.7 7 -79.1 10.8 -79.6', // mouth
];
const FRONT_MIDLINE_SOFT = [
  'M-5.6 -75.2C-3 -74 3 -74 5.6 -75.2', // lower lip
];
const BODY_MIDLINE = [
  'M0 22L0 118', 'M-4 18C-2 21 2 21 4 18', // breastbone and its notch
];
const HALF_TRAPEZIUS = `M0 -60C10 -61 20 -63 29.4 -66.4${NECK_AND_SHOULDER}C88 40 36 90 0 148Z`;
const BACK_DETAIL = [
  'M115 9.2C88 40 36 90 0 148', // trapezius lower edge
  'M30 44C56 32 86 24 110 22', // spine of the shoulder blade
  'M30 44C28 70 28 92 30 112C48 98 72 74 90 50', // shoulder blade
  'M110 22C122 38 127.6 64 125.6 94', // back of the shoulder
  'M98.4 112C92 136 70 160 42 176', // upper edge of the back muscle
  'M79.2 224C60 214 32 194 12 180', // lower edge of the back muscle
  'M14 160C12 196 13 230 17 268', // along the spine
];

const TOP_S = 165;
const SIDE_S = 1.4;
const BODY_S = 1.05;

const VIEWS = Object.freeze({
  front: {
    title: 'Front', map: (x, y) => ({ x: 300 + x * BODY_S, y: 250 + y * BODY_S }),
    leftMark: ['R', "person's right"], rightMark: ['L', "person's left"],
    sites: {
      'chest-right': [-52, 40], 'chest-left': [60, 190],
      'eye-right': [-40.5, -120], 'eye-left': [40.5, -120],
      'neck-upper': [22, -30], 'neck-lower': [15.5, -12],
      'shoulder-medial': [-68, 3], 'shoulder-lateral': [-87, 8],
      Fpz: [0, -150],
    },
    labelSide: { Fpz: 'left' },
  },
  back: {
    title: 'Back', map: (x, y) => ({ x: 300 + x * BODY_S, y: 250 + y * BODY_S }),
    leftMark: ['L', "person's left"], rightMark: ['R', "person's right"],
    sites: {
      Oz: [0, -102], Cz: [0, -176], M1: [-41, -94], M2: [41, -94],
      'shoulder-medial': [68, 3], 'shoulder-lateral': [87, 8],
    },
    labelSide: { Oz: 'right', Cz: 'right' },
    stack: { M1: [0, 12] },
  },
  side: {
    title: 'Left side', map: (x, y) => ({ x: 300 + x * SIDE_S, y: 262 + y * SIDE_S }),
    leftMark: null, rightMark: null,
    sites: {
      ...Object.fromEntries(Object.entries(SIDE_SITES).map(([k, v]) => { const p = projectSide(v); return [k, [p.x, p.y]]; })),
      'eye-left': [-67, 11], 'neck-upper': [9.5, 95.5], 'neck-lower': [-1.5, 112],
    },
    labelSide: { Fpz: 'left', Cz: 'right', Oz: 'right', M1: 'right', 'eye-left': 'left', 'neck-upper': 'right', 'neck-lower': 'left' },
    stack: { M1: [0, 10] },
  },
  top: {
    title: 'Top of the head', map: (x, y) => ({ x: 300 + x, y: 322 + y }),
    leftMark: ['L', "person's left"], rightMark: ['R', "person's right"],
    sites: Object.fromEntries(Object.entries(SITES_1020).map(([k, p]) => [k, [p.x * TOP_S, p.y * TOP_S]])),
    labelSide: { Cz: 'right', Oz: 'right', Fpz: 'left', Fz: 'left', Pz: 'left' },
    stack: { M1: [0, 12] },
  },
});

/** Figure positions of a site, per view, in plate pixels. Used by the figures and by the tests. */
export function sitePosition(view, site) {
  const v = VIEWS[view];
  const p = v?.sites[site];
  return p ? v.map(p[0], p[1]) : null;
}

/** Which plates a montage needs, up to three: front when it has a lead there, then back, side, top. */
export function placementViews(leads) {
  const has = (view) => leads.some((l) => VIEWS[view].sites[l.site]);
  return ['front', 'back', 'side', 'top'].filter(has).slice(0, 3);
}

/** Groups leads on the same site; several leads on one site get stacked dots and one label. */
function groupLeads(view, leads) {
  const v = VIEWS[view];
  const groups = new Map();
  for (const lead of leads) {
    if (!v.sites[lead.site]) continue;
    if (!groups.has(lead.site)) groups.set(lead.site, []);
    groups.get(lead.site).push(lead);
  }
  return [...groups.entries()].map(([site, list]) => {
    const [x, y] = v.sites[site];
    const step = v.stack?.[site] ?? [0, 12];
    const dots = list.map((lead, i) => {
      const off = i - (list.length - 1) / 2;
      const p = v.map(x + step[0] * off, y + step[1] * off);
      return { lead, ...p };
    });
    const center = v.map(x, y);
    const side = v.labelSide?.[site] ?? (center.x < W / 2 ? 'left' : 'right');
    return { site, dots, center, side, pins: list.map((l) => l.pin).join(' · '), text: SITE_TEXT[site] ?? site };
  });
}

/**
 * Vertical label positions: keeps each label near its dot, at least `gap` apart, inside the plate.
 * @param {number[]} wanted sorted ascending
 */
export function spreadLabels(wanted, { gap = 44, top = 84, bottom = H - 50 } = {}) {
  const out = wanted.map((y) => Math.max(top, Math.min(bottom, y)));
  for (let i = 1; i < out.length; i++) out[i] = Math.max(out[i], out[i - 1] + gap);
  if (out.length && out[out.length - 1] > bottom) {
    out[out.length - 1] = bottom;
    for (let i = out.length - 2; i >= 0; i--) out[i] = Math.min(out[i], out[i + 1] - gap);
  }
  return out;
}

function marker({ lead, x, y }, compact = false) {
  const cup = /cup/.test(lead.electrode ?? '');
  const color = lead.cableColor ?? MUTED;
  const fill = `<circle cx="${round(x)}" cy="${round(y)}" r="${compact ? 11 : 8}" fill="${esc(color)}" stroke="${cup ? SAND : INK}" stroke-width="${cup ? 2.4 : 1.6}"/>`;
  const snap = cup ? '' : `<circle cx="${round(x)}" cy="${round(y)}" r="${compact ? 3 : 2.2}" fill="${BG}"/>`;
  return `${fill}${snap}`;
}

function labels(groups, compact = false) {
  let lines = '', dots = '', text = '';
  for (const side of ['left', 'right']) {
    const col = groups.filter((g) => g.side === side).sort((a, b) => a.center.y - b.center.y);
    const ys = spreadLabels(col.map((g) => g.center.y));
    col.forEach((g, i) => {
      const y = ys[i];
      const width = compact ? g.pins.length * 16 : Math.max(g.pins.length * 8.8, g.text.length * 6.7);
      const anchor = side === 'left' ? 'start' : 'end';
      const tx = side === 'left' ? 24 : W - 24;
      const end = side === 'left' ? tx + width + 8 : tx - width - 8;
      lines += `<path d="M${round(g.center.x)} ${round(g.center.y)}L${round(end)} ${round(y)}" stroke="${MUTED}" stroke-opacity="0.7" stroke-width="${compact ? 1.6 : 1}" fill="none"/>`;
      if (compact) {
        text += `<text x="${tx}" y="${round(y + 9)}" text-anchor="${anchor}" font-family="${FONT}" font-size="26" font-weight="700" fill="${INK}" style="font-variant-numeric:tabular-nums">${esc(g.pins)}</text>`;
        return;
      }
      text += `<text x="${tx}" y="${round(y - 1)}" text-anchor="${anchor}" font-family="${FONT}" font-size="16" font-weight="700" fill="${INK}" style="font-variant-numeric:tabular-nums">${esc(g.pins)}</text>`;
      text += `<text x="${tx}" y="${round(y + 16)}" text-anchor="${anchor}" font-family="${FONT}" font-size="13" fill="${MUTED}">${esc(g.text)}</text>`;
    });
  }
  for (const g of groups) for (const d of g.dots) dots += marker(d, compact);
  return lines + dots + text;
}

const mirrored = (d, attrs) => `<path d="${d}" ${attrs}/><path d="${d}" ${attrs} transform="scale(-1 1)"/>`;
const hair = (list, opacity = 0.34, width = 1) => list.map((d) => `<path d="${d}" fill="none" stroke="${INK}" stroke-opacity="${opacity}" stroke-width="${width}" stroke-linecap="round"/>`).join('');
const inner = (body) => `<svg x="10" y="10" width="${W - 20}" height="${H - 20}" viewBox="10 10 ${W - 20} ${H - 20}">${body}</svg>`;

const iris = ([x, y, r]) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
const both = (markup) => `${markup}<g transform="scale(-1 1)">${markup}</g>`;

function bodyFront(leads) {
  const neck = leads.some((l) => l.site.startsWith('neck'));
  const shoulder = leads.some((l) => l.site.startsWith('shoulder'));
  const line = `fill="none" stroke="${INK}" stroke-opacity="0.82" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"`;
  return `<g transform="translate(300 250) scale(${BODY_S})">`
    + mirrored(HALF_FILL, `fill="${BODY}"`) + mirrored(HALF_GAP, `fill="${BG}"`)
    + `<path d="${UNDER_JAW}" fill="${BG}" fill-opacity="0.5"/>`
    + `<path d="${HEAD_OUTLINE}" fill="${BODY}"/>`
    + `<path d="${FRONT_HAIR}" fill="${BG}" fill-opacity="0.5"/>` + hair([FRONT_HAIRLINE], 0.3, 0.8)
    + mirrored(CHEEK_PLANE, `fill="${BG}" fill-opacity="0.28"`) + mirrored(NOSE_PLANE, `fill="${BG}" fill-opacity="0.12"`)
    + (shoulder ? `<path d="M-36 -20C-50 -12 -72 -3 -96 1C-88 15 -60 18 -40 10C-34 4 -31 -6 -36 -20Z" fill="${SAND}" fill-opacity="0.09"/>` : '')
    + (neck ? `<path d="${HALF_SCM}" fill="${SAND}" fill-opacity="0.1" stroke="${SAND}" stroke-opacity="0.45" stroke-width="0.7"/>` : '')
    + both(hair(FRONT_DETAIL))
    + hair(FRONT_ABDOMEN, 0.16) + hair(BODY_MIDLINE, 0.42)
    + mirrored(FRONT_BROW, `fill="${INK}" fill-opacity="0.42"`)
    + mirrored(iris(FRONT_IRIS), `fill="${INK}" fill-opacity="0.34"`)
    + both(hair(FRONT_FACE_SOFT, 0.3, 0.8)) + both(hair(FRONT_FACE, 0.62, 0.85))
    + hair(FRONT_MIDLINE_SOFT, 0.28, 0.8) + hair(FRONT_MIDLINE, 0.58, 0.85)
    + `<path d="${HEAD_OUTLINE}" ${line}/>` + mirrored(HALF_EAR, line) + mirrored(HALF_EAR_INNER, `fill="none" stroke="${INK}" stroke-opacity="0.4" stroke-width="1"`)
    + mirrored(HALF_TRUNK, line) + mirrored(HALF_FLANK, line) + mirrored(HALF_INNER_ARM, line)
    + '</g>';
}

function bodyBack(leads) {
  const shoulder = leads.some((l) => l.site.startsWith('shoulder'));
  const line = `fill="none" stroke="${INK}" stroke-opacity="0.82" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"`;
  return `<g transform="translate(300 250) scale(${BODY_S})">`
    + mirrored(HALF_FILL, `fill="${BODY}"`) + mirrored(HALF_GAP, `fill="${BG}"`)
    + `<path d="${SKULL_OUTLINE}Z" fill="${BODY}"/>`
    + `<path d="${BACK_HAIR}" fill="${BG}" fill-opacity="0.5"/>`
    + `<path d="${HALF_TRAPEZIUS}" fill="${SAND}" fill-opacity="${shoulder ? 0.06 : 0.02}"/><path d="${HALF_TRAPEZIUS}" fill="${SAND}" fill-opacity="0.02" transform="scale(-1 1)"/>`
    + hair(BACK_DETAIL, 0.28) + `<g transform="scale(-1 1)">${hair(BACK_DETAIL, 0.28)}</g>`
    + `<path d="M0 -184L0 -60" fill="none" stroke="${INK}" stroke-opacity="0.28" stroke-width="1" stroke-dasharray="3 4"/>`
    + `<path d="M0 -40L0 420" fill="none" stroke="${INK}" stroke-opacity="0.3" stroke-width="1" stroke-dasharray="2 5"/>`
    + `<path d="${SKULL_OUTLINE}" ${line}/>` + mirrored(HALF_EAR, line) + mirrored(HALF_EAR_INNER, `fill="none" stroke="${INK}" stroke-opacity="0.4" stroke-width="1"`)
    + mirrored(HALF_TRUNK, line) + mirrored(HALF_FLANK, line) + mirrored(HALF_INNER_ARM, line)
    + '</g>';
}

function bodySide(leads, compact = false) {
  const neck = leads.some((l) => l.site.startsWith('neck'));
  const usedSites = new Set(leads.map((l) => l.site));
  const line = `fill="none" stroke="${INK}" stroke-opacity="0.82" stroke-width="${1.6 / SIDE_S}" stroke-linecap="round" stroke-linejoin="round"`;
  let out = `<g transform="translate(300 262) scale(${SIDE_S})">`
    + `<path d="${SIDE_HEAD}L60 142Z" fill="${BODY}"/>`
    + `<path d="${SIDE_FILL}" fill="${BODY}"/>`
    + `<path d="${SIDE_HAIR}" fill="${BG}" fill-opacity="0.5"/><path d="${SIDE_UNDER_JAW}" fill="${BG}" fill-opacity="0.5"/>`
    + (neck ? `<path d="${SIDE_SCM}" fill="${SAND}" fill-opacity="0.12" stroke="${SAND}" stroke-opacity="0.45" stroke-width="0.5"/>` : '')
    + SIDE_GRID.map((d) => `<path d="${d}" fill="none" stroke="${LINE}" stroke-width="0.9"/>`).join('')
    + hair(SIDE_DETAIL, 0.3, 0.7)
    + `<path d="${SIDE_HEAD}" ${line}/><path d="${SIDE_TRUNK}" ${line}/><path d="${SIDE_EAR}" ${line}/>`
    + `<path d="${SIDE_EAR_INNER}" fill="none" stroke="${INK}" stroke-opacity="0.4" stroke-width="0.7"/>`
    + `<path d="${SIDE_BROW}" fill="none" stroke="${INK}" stroke-opacity="0.6" stroke-width="0.8"/>`
    + `<path d="${SIDE_EYE}" fill="none" stroke="${INK}" stroke-opacity="0.8" stroke-width="1"/>`;
  // The nasion to inion arc, divided 10, 20, 20, 20, 20, 10%: where the system gets its name.
  const arc = Array.from({ length: 73 }, (_, i) => { const p = onArc(i * 2.5); return `${i ? 'L' : 'M'}${round(p.x)} ${round(p.y)}`; }).join('');
  out += `<path d="${arc}" fill="none" stroke="${SAND}" stroke-opacity="0.8" stroke-width="0.7"/>`;
  for (const deg of [0, 18, 54, 90, 126, 162, 180]) {
    const a = onArc(deg, ARC_R - 3.5), b = onArc(deg, ARC_R + 3.5);
    out += `<line x1="${round(a.x)}" y1="${round(a.y)}" x2="${round(b.x)}" y2="${round(b.y)}" stroke="${SAND}" stroke-opacity="0.9" stroke-width="0.7"/>`;
  }
  out += `<path d="M${-ARC_R + 3} 0L-101.5 0M${ARC_R - 3} 0L101 0" stroke="${SAND}" stroke-opacity="0.7" stroke-width="0.6" stroke-dasharray="1.5 2"/>`;
  out += '</g>';
  const map = VIEWS.side.map;
  for (const [deg, label] of [[9, '10%'], [36, '20%'], [72, '20%'], [108, '20%'], [144, '20%'], [171, '10%']]) {
    const p = onArc(deg, ARC_R + 8.5);
    const q = map(p.x, p.y);
    out += `<text x="${round(q.x)}" y="${round(q.y + (compact ? 6 : 3))}" text-anchor="middle" font-family="${SERIF}" font-style="italic" font-size="${compact ? 18 : 11.5}" fill="${SAND}">${label}</text>`;
  }
  const n = map(-ARC_R, 0), i = map(ARC_R, 0);
  // Clear of the eye marker's leader, which runs along this height.
  const landmark = compact ? 38 : -7;
  out += `<text x="${round(n.x)}" y="${round(n.y + landmark)}" text-anchor="middle" font-family="${SERIF}" font-style="italic" font-size="${compact ? 19 : 12}" fill="${SAND}">nasion</text>`;
  out += `<text x="${round(i.x)}" y="${round(i.y + landmark)}" text-anchor="middle" font-family="${SERIF}" font-style="italic" font-size="${compact ? 19 : 12}" fill="${SAND}">inion</text>`;
  for (const name of ['Fpz', 'Fz', 'Cz', 'Pz', 'Oz', 'T7', 'C3']) {
    if (usedSites.has(name)) continue;
    const [x, y] = VIEWS.side.sites[name];
    const q = map(x, y);
    out += `<circle cx="${round(q.x)}" cy="${round(q.y)}" r="${compact ? 4.6 : 3.4}" fill="${MUTED}"/>`;
    out += `<text x="${round(q.x + (compact ? 10 : 8))}" y="${round(q.y + (compact ? 6 : 4))}" font-family="${FONT}" font-size="${compact ? 18 : 11}" fill="${MUTED}">${name}</text>`;
  }
  return out;
}

function bodyTop(leads) {
  const used = new Set(leads.map((l) => l.site));
  const map = VIEWS.top.map;
  const c = map(0, 0);
  let out = `<circle cx="${c.x}" cy="${c.y}" r="${TOP_S}" fill="${BODY}"/>`;
  out += `<line x1="${c.x}" y1="${c.y - TOP_S * 0.8}" x2="${c.x}" y2="${c.y + TOP_S * 0.8}" stroke="${LINE}"/>`;
  out += `<line x1="${c.x - TOP_S * 0.8}" y1="${c.y}" x2="${c.x + TOP_S * 0.8}" y2="${c.y}" stroke="${LINE}"/>`;
  out += `<circle cx="${c.x}" cy="${c.y}" r="${TOP_S * 0.8}" fill="none" stroke="${LINE}"/>`;
  out += `<circle cx="${c.x}" cy="${c.y}" r="${TOP_S * 0.4}" fill="none" stroke="${LINE}"/>`;
  const line = `fill="none" stroke="${INK}" stroke-opacity="0.82" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"`;
  out += `<circle cx="${c.x}" cy="${c.y}" r="${TOP_S}" ${line}/>`;
  out += `<path d="M${c.x - 15} ${c.y - TOP_S + 1}L${c.x} ${c.y - TOP_S - 21}L${c.x + 15} ${c.y - TOP_S + 1}" ${line}/>`;
  out += `<path d="M${c.x - TOP_S} ${c.y - 21}C${c.x - TOP_S - 20} ${c.y - 21} ${c.x - TOP_S - 20} ${c.y + 27} ${c.x - TOP_S} ${c.y + 27}" ${line}/>`;
  out += `<path d="M${c.x + TOP_S} ${c.y - 21}C${c.x + TOP_S + 20} ${c.y - 21} ${c.x + TOP_S + 20} ${c.y + 27} ${c.x + TOP_S} ${c.y + 27}" ${line}/>`;
  for (const [name, [x, y]] of Object.entries(VIEWS.top.sites)) {
    if (used.has(name) || name === 'M1' || name === 'M2') continue;
    const q = map(x, y);
    out += `<circle cx="${round(q.x)}" cy="${round(q.y)}" r="3.2" fill="${MUTED}" fill-opacity="0.7"/>`;
    out += `<text x="${round(q.x)}" y="${round(q.y + 16)}" text-anchor="middle" font-family="${FONT}" font-size="11" fill="${MUTED}">${name}</text>`;
  }
  return out;
}

const BODIES = { front: bodyFront, back: bodyBack, side: bodySide, top: bodyTop };

const FRAME = `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" fill="${BG}" stroke="${LINE}"/>`
  + `<path d="M10 28V10H28M${W - 28} 10H${W - 10}V28M${W - 10} ${H - 28}V${H - 10}H${W - 28}M28 ${H - 10}H10V${H - 28}" fill="none" stroke="${SAND}" stroke-opacity="0.5"/>`;

function mark(entry, side, compact = false) {
  if (!entry) return '';
  const [letter, caption] = entry;
  const x = side === 'left' ? 24 : W - 24;
  const anchor = side === 'left' ? 'start' : 'end';
  if (compact) return `<text x="${x}" y="${H - 28}" text-anchor="${anchor}" font-family="${SERIF}" font-size="30" fill="${SAND}">${letter}</text>`;
  return `<text x="${x}" y="${H - 30}" text-anchor="${anchor}" font-family="${SERIF}" font-size="20" fill="${SAND}">${letter}<tspan font-family="${FONT}" font-size="12" fill="${MUTED}" dx="6">${caption}</tspan></text>`;
}

/**
 * One plate as an SVG string.
 * @param {'front'|'back'|'side'|'top'} view
 * @param {{site:string, pin:string, cableColor?:string, electrode?:string}[]} leads
 * @param {{compact?:boolean}} [options] compact: a plate for a phone screen. Same anatomy and site
 * positions, larger markers and pins; site names go in a list beside it (placementLeads).
 */
export function placementSvg(view, leads, { compact = false } = {}) {
  const v = VIEWS[view];
  const groups = groupLeads(view, leads);
  const description = `${v.title} view. ${groups.map((g) => `${g.pins} at ${g.text}`).join('; ')}.`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(description)}">`
    + `<title>${esc(description)}</title>${FRAME}`
    + inner(BODIES[view](leads, compact))
    + `<text x="24" y="${compact ? 54 : 50}" font-family="${SERIF}" font-size="${compact ? 32 : 22}" fill="${INK}">${esc(v.title)}</text>`
    + labels(groups, compact) + mark(v.leftMark, 'left', compact) + mark(v.rightMark, 'right', compact)
    + '</svg>';
}

/** The lead list a plate's labels come from: pin, signal, where it goes, cable colour. */
export function placementLeads(leads) {
  return leads.map((l) => ({ pin: l.pin, role: l.role, where: l.siteLabel, color: l.cableColor }));
}

/** All the plates of a montage on one sheet, for the README and for sharing. */
export function placementSheet(leads, { title } = {}) {
  const views = placementViews(leads);
  const gap = 16, top = title ? 62 : 0;
  const width = views.length * W + (views.length - 1) * gap;
  const height = top + H;
  const plates = views.map((view, i) => placementSvg(view, leads).replace('<svg ', `<svg x="${i * (W + gap)}" y="${top}" width="${W}" height="${H}" `)).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 ${width + 40} ${height + 40}" role="img" aria-label="${esc(title ?? 'Electrode placement')}">`
    + `<rect x="-20" y="-20" width="${width + 40}" height="${height + 40}" fill="${BG}"/>`
    + (title ? `<text x="2" y="34" font-family="${SERIF}" font-size="30" fill="${INK}">${esc(title)}</text>` : '')
    + plates
    + '</svg>';
}

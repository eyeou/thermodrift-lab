/**
 * Reference Butterworth designs (analog prototype → band transform → bilinear transform with
 * pre-warping), as in scipy.signal.butter. Tests only: shows that every coefficient set in
 * src/core/filters.js is a standard design, reproducible from its parameters.
 * Returns the overall transfer function {b, a} (sections multiplied out).
 */
const C = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1]],
  mul: (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]],
  div: (a, b) => { const d = b[0] ** 2 + b[1] ** 2; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; },
  sqrt: (a) => { const r = Math.hypot(a[0], a[1]); return [Math.sqrt((r + a[0]) / 2), (Math.sign(a[1]) || 1) * Math.sqrt((r - a[0]) / 2)]; },
};
const real = (x) => [x, 0];
const poly = (roots) => roots.reduce((p, r) => {
  const out = Array.from({ length: p.length + 1 }, () => [0, 0]);
  p.forEach((c, i) => { out[i] = C.add(out[i], c); out[i + 1] = C.sub(out[i + 1], C.mul(c, r)); });
  return out;
}, [[1, 0]]);

export function butterworth(N, freqs, type, fs) {
  const warp = (f) => 2 * fs * Math.tan((Math.PI * f) / fs);
  const p = Array.from({ length: N }, (_, i) => { const t = (Math.PI * (2 * (i + 1) + N - 1)) / (2 * N); return [Math.cos(t), Math.sin(t)]; });
  let z = [], poles = [], k = real(1);
  if (type === 'low' || type === 'high') {
    const wc = warp(freqs);
    if (type === 'low') { poles = p.map((q) => C.mul(real(wc), q)); k = real(wc ** N); }
    else { poles = p.map((q) => C.div(real(wc), q)); z = Array.from({ length: N }, () => real(0)); k = real(1); for (const q of p) k = C.div(k, C.mul(real(-1), q)); }
  } else {
    const [w1, w2] = freqs.map(warp);
    const wo = Math.sqrt(w1 * w2), bw = w2 - w1;
    if (type === 'bandpass') {
      for (const q of p) { const a = C.mul(q, real(bw / 2)); const d = C.sqrt(C.sub(C.mul(a, a), real(wo * wo))); poles.push(C.add(a, d), C.sub(a, d)); }
      z = Array.from({ length: N }, () => real(0));
      k = real(bw ** N);
    } else {
      for (const q of p) { const a = C.div(real(bw / 2), q); const d = C.sqrt(C.sub(C.mul(a, a), real(wo * wo))); poles.push(C.add(a, d), C.sub(a, d)); }
      for (let i = 0; i < N; i++) z.push([0, wo], [0, -wo]);
      for (const q of p) k = C.div(k, C.mul(real(-1), q));
    }
  }
  // bilinear transform; zeros at infinity map to z = -1
  const fs2 = 2 * fs;
  const degree = poles.length - z.length;
  const zd = [...z.map((r) => C.div(C.add(real(fs2), r), C.sub(real(fs2), r))), ...Array.from({ length: degree }, () => real(-1))];
  const pd = poles.map((r) => C.div(C.add(real(fs2), r), C.sub(real(fs2), r)));
  let num = real(1), den = real(1);
  for (const r of z) num = C.mul(num, C.sub(real(fs2), r));
  for (const r of poles) den = C.mul(den, C.sub(real(fs2), r));
  const kd = C.mul(k, C.div(num, den))[0];
  return { b: poly(zd).map((c) => c[0] * kd), a: poly(pd).map((c) => c[0]) };
}

/** Multiply second-order sections [b0,b1,b2,a0,a1,a2] into one transfer function. */
export function sosToTf(sections) {
  const conv = (x, y) => { const o = Array(x.length + y.length - 1).fill(0); x.forEach((xi, i) => y.forEach((yj, j) => { o[i + j] += xi * yj; })); return o; };
  return sections.reduce((acc, s) => ({ b: conv(acc.b, s.slice(0, 3)), a: conv(acc.a, s.slice(3)) }), { b: [1], a: [1] });
}

export const maxDiff = (x, y) => Math.max(...x.map((v, i) => Math.abs(v - y[i])));

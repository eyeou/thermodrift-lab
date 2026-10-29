/**
 * Canvas chart primitives sharing one grammar: every chart states its axes, units and data
 * status. Gaps are never bridged: a series is drawn only from contiguous data the caller passes.
 * Colours come from the generated theme; meaning is also carried by labels and line style.
 */
import { theme } from '../../design/theme.js';

const C = theme.color;

/** Responsive, DPR-correct canvas inside `container`. */
export function createCanvas(container, { height = 200, label = 'chart' } = {}) {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', label);
  container.append(canvas);
  const state = { width: 600, height, dpr: 1, draw: null };
  const resize = () => {
    const width = Math.max(240, Math.round(container.clientWidth || 600));
    const dpr = Math.min(3, globalThis.devicePixelRatio || 1);
    if (width === state.width && dpr === state.dpr && canvas.width) return;
    Object.assign(state, { width, dpr });
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.height = `${height}px`;
    state.draw?.();
  };
  if (globalThis.ResizeObserver) new ResizeObserver(resize).observe(container);
  resize();
  return {
    canvas,
    get width() { return state.width; },
    get height() { return state.height; },
    /** Run `fn(ctx, width, height)` with DPR scaling; remembered for resizes. */
    draw(fn) {
      state.draw = () => {
        const ctx = canvas.getContext('2d');
        ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
        ctx.clearRect(0, 0, state.width, state.height);
        ctx.fillStyle = C.surface.base;
        ctx.fillRect(0, 0, state.width, state.height);
        fn(ctx, state.width, state.height);
      };
      state.draw();
    },
    setLabel(text) { canvas.setAttribute('aria-label', text); },
  };
}

/** Short tick label: 0, 0.25, 12, 1.2k, 3e-4. */
export function compact(v) {
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1000) return `${(v / 1000).toPrecision(2)}k`;
  if (a >= 0.01) return String(Number(v.toPrecision(2)));
  return v.toExponential(0);
}

export function niceTicks(min, max, count = 5) {
  const span = max - min || 1;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? 10 * mag;
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) ticks.push(Number(v.toFixed(10)));
  return ticks;
}

/**
 * Axes, grid and labels. Returns scale functions for the plot box.
 * @param {{x:{min:number,max:number,ticks?:number[],format?:(v)=>string,label:string}, y:{...}}} spec
 */
export function frame(ctx, width, height, spec) {
  const pad = { ...theme.chart.padding, ...(spec.padding ?? {}) };
  const box = { left: pad.left, right: width - pad.right, top: pad.top, bottom: height - pad.bottom };
  const x = (v) => box.left + ((v - spec.x.min) / (spec.x.max - spec.x.min || 1)) * (box.right - box.left);
  const y = (v) => box.bottom - ((v - spec.y.min) / (spec.y.max - spec.y.min || 1)) * (box.bottom - box.top);
  ctx.fillStyle = C.surface.panel;
  ctx.fillRect(box.left, box.top, box.right - box.left, box.bottom - box.top);
  ctx.font = `${theme.chart['tick-font-size']}px ${theme.font.numeric}`;
  ctx.lineWidth = theme.chart['grid-width'];
  const yt = spec.y.ticks ?? niceTicks(spec.y.min, spec.y.max, 4);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const t of yt) {
    const py = Math.round(y(t)) + 0.5;
    ctx.strokeStyle = t === 0 && spec.y.zeroLine ? C.surface['border-strong'] : C.surface.grid;
    ctx.beginPath(); ctx.moveTo(box.left, py); ctx.lineTo(box.right, py); ctx.stroke();
    ctx.fillStyle = C.ink.muted;
    ctx.fillText((spec.y.format ?? String)(t), box.left - 6, py);
  }
  const xt = spec.x.ticks ?? niceTicks(spec.x.min, spec.x.max, 6);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const t of xt) {
    const px = Math.round(x(t)) + 0.5;
    const highlight = spec.x.highlight?.(t);
    ctx.strokeStyle = highlight ? C.data.neutral : C.surface.grid;
    ctx.setLineDash(highlight ? [3, 3] : []);
    ctx.beginPath(); ctx.moveTo(px, box.top); ctx.lineTo(px, box.bottom); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = C.ink.muted;
    ctx.fillText((spec.x.format ?? String)(t), px, box.bottom + 5);
  }
  ctx.font = `${theme.chart['label-font-size']}px ${theme.font.ui}`;
  ctx.fillStyle = C.ink.primary;
  ctx.textAlign = 'center';
  ctx.fillText(spec.x.label, (box.left + box.right) / 2, box.bottom + 21);
  ctx.save();
  ctx.translate(14, (box.top + box.bottom) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textBaseline = 'middle';
  ctx.fillText(spec.y.label, 0, 0);
  ctx.restore();
  ctx.strokeStyle = C.surface['border-strong'];
  ctx.strokeRect(box.left + 0.5, box.top + 0.5, box.right - box.left - 1, box.bottom - box.top - 1);
  return { x, y, box };
}

export function clip(ctx, box, fn) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.left, box.top, box.right - box.left, box.bottom - box.top);
  ctx.clip();
  fn();
  ctx.restore();
}

export function line(ctx, points, { color = C.data.periwinkle, width = theme.chart['line-width'], dash = [] } = {}) {
  if (points.length < 2) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.beginPath();
  points.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.stroke();
  ctx.setLineDash([]);
}

/** Centered message in the plot box: no data, stale, hidden. Never a fake trace. */
export function message(ctx, box, text, color = C.ink.muted) {
  ctx.fillStyle = color;
  ctx.font = `14px ${theme.font.ui}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, (box.left + box.right) / 2, (box.top + box.bottom) / 2);
}

/** Diagonal hatch overlay + label for synthetic data. */
export function simulatedWatermark(ctx, box, text = 'SIMULATED — synthetic test pattern') {
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = C.status.simulated;
  for (let x = box.left - (box.bottom - box.top); x < box.right; x += 14) {
    ctx.beginPath(); ctx.moveTo(x, box.bottom); ctx.lineTo(x + (box.bottom - box.top), box.top); ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = C.status.simulated;
  ctx.font = `600 12px ${theme.font.ui}`;
  ctx.textAlign = 'right';
  if (box.right - box.left < 360) text = 'SIMULATED';
  // In the top padding when there is room (charts with a legend), else inside the plot.
  const outside = box.top >= 24;
  ctx.textBaseline = outside ? 'middle' : 'top';
  ctx.fillText(text, box.right, outside ? box.top - 14 : box.top + 6);
}

// ---------- specific charts ----------

/**
 * Time trace of the newest samples (newest at 0 s). `samples` must be contiguous.
 */
export function drawTrace(chart, { samples, fs = 500, range, unit, color = C.data.periwinkle, status, simulated, centre = true }) {
  chart.draw((ctx, w, h) => {
    const n = samples?.length ?? 0;
    const seconds = n ? (n - 1) / fs : 4;
    const f = frame(ctx, w, h, {
      x: { min: -seconds, max: 0, label: w < 480 ? 'Time (s)' : 'Time (s) · newest sample at 0', format: (v) => v.toFixed(1) },
      y: { min: -range, max: range, label: unit, zeroLine: true, format: (v) => (Math.abs(v) < 10 && v !== 0 ? v.toPrecision(2) : v.toFixed(0)) },
    });
    if (status || !n) return message(ctx, f.box, status ?? 'Waiting for contiguous samples');
    let mean = 0;
    if (centre) { for (const v of samples) mean += v; mean /= n; }
    let outside = false;
    clip(ctx, f.box, () => line(ctx, samples.map((v, i) => {
      const val = v - mean;
      if (Math.abs(val) > range) outside = true;
      return [f.x(-seconds + i / fs), f.y(val)];
    }), { color }));
    if (outside) { ctx.fillStyle = C.status.warning; ctx.font = `12px ${theme.font.ui}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('▲ Beyond display range — widen the scale (data unaffected)', f.box.left + 6, f.box.top + 6); }
    if (simulated) simulatedWatermark(ctx, f.box);
  });
}

/**
 * Spectrum on a frequency axis. kind 'psd' → dB re 1 unit²/Hz; 'magnitude' → linear.
 */
export function drawSpectrum(chart, { values, fs = 500, n = 1024, maxHz = 45, kind = 'psd', unit, status, simulated, band = [8, 13] }) {
  chart.draw((ctx, w, h) => {
    let ys = [];
    let lo = 0, hi = 1;
    if (values?.length && !status) { // a status (hidden, stale…) also hides the data-driven axis
      const end = Math.min(values.length - 1, Math.ceil((maxHz * n) / fs));
      ys = values.slice(0, end + 1).map((v) => (kind === 'psd' ? 10 * Math.log10(Math.max(v, 1e-12)) : v));
      if (kind === 'psd') { lo = Math.floor(Math.min(...ys.slice(1)) / 5) * 5; hi = Math.ceil(Math.max(...ys.slice(1)) / 5) * 5; if (hi - lo < 10) hi = lo + 10; }
      else { lo = 0; hi = Math.max(...ys.slice(1)) * 1.08 || 1; }
    }
    const step = maxHz <= 45 ? 5 : maxHz <= 100 ? 10 : 25;
    const f = frame(ctx, w, h, {
      x: { min: 0, max: maxHz, ticks: Array.from({ length: Math.floor(maxHz / step) + 1 }, (_, i) => i * step), label: 'Frequency (Hz)', highlight: (t) => t > 0 && t % 50 === 0 },
      y: { min: lo, max: hi, label: unit, format: (v) => (kind === 'psd' ? v.toFixed(0) : compact(v)) },
      padding: { left: 64 },
    });
    ctx.fillStyle = 'rgba(182, 194, 255, 0.10)';
    ctx.fillRect(f.x(band[0]), f.box.top, f.x(band[1]) - f.x(band[0]), f.box.bottom - f.box.top);
    ctx.fillStyle = C.ink.muted;
    ctx.font = `11px ${theme.font.ui}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`α ${band[0]}–${band[1]}`, (f.x(band[0]) + f.x(band[1])) / 2, f.box.top + 4);
    if (status || !ys.length) return message(ctx, f.box, status ?? 'Waiting for 4.1 s of contiguous samples');
    clip(ctx, f.box, () => line(ctx, ys.map((v, k) => [f.x((k * fs) / n), f.y(v)]), { color: C.data.rose }));
    if (simulated) simulatedWatermark(ctx, f.box);
  });
}

/**
 * Paired comparison: open vs closed per pair on one shared axis (counts²), ratio labels.
 * @param {{pair:number, open:number|null, closed:number|null, status:string, ratio:number|null}[]} pairs
 */
export function drawPairs(chart, { pairs, unit = 'α power (count-equiv.²)', simulated }) {
  chart.draw((ctx, w, h) => {
    const values = pairs.flatMap((p) => [p.open, p.closed]).filter(Number.isFinite);
    const max = values.length ? Math.max(...values) * 1.22 : 1;
    const f = frame(ctx, w, h, {
      x: { min: 0.4, max: pairs.length + 0.6, ticks: pairs.map((p) => p.pair), format: (v) => `Pair ${v}`, label: 'Prompted pairs (each: eyes open | eyes closed)' },
      y: { min: 0, max, label: unit, format: compact },
      padding: { left: 64, top: 30 },
    });
    legend(ctx, f.box, [['Eyes open', C.data.periwinkle], ['Eyes closed', C.data.rose], ['Not eligible', C.data.neutral]]);
    if (!values.length) return message(ctx, f.box, 'No complete pairs yet');
    const bw = Math.min(42, (f.x(1.4) - f.x(1)) * 0.9);
    for (const p of pairs) {
      const cx = f.x(p.pair);
      const bars = [[p.open, C.data.periwinkle, -1], [p.closed, C.data.rose, 1]];
      for (const [v, color, side] of bars) {
        if (!Number.isFinite(v)) continue;
        const x0 = side < 0 ? cx - bw - 2 : cx + 2;
        ctx.fillStyle = p.status === 'eligible' ? color : C.data.neutral;
        ctx.fillRect(x0, f.y(v), bw, f.box.bottom - f.y(v));
        if (p.status !== 'eligible') {
          clip(ctx, { left: x0, right: x0 + bw, top: f.y(v), bottom: f.box.bottom }, () => {
            ctx.strokeStyle = C.surface.base;
            for (let k = -bw; k < f.box.bottom - f.y(v); k += 6) { ctx.beginPath(); ctx.moveTo(x0, f.y(v) + k + bw); ctx.lineTo(x0 + bw, f.y(v) + k); ctx.stroke(); }
          });
        }
      }
      ctx.fillStyle = p.status === 'eligible' ? C.ink.primary : C.ink.muted;
      ctx.font = `600 13px ${theme.font.numeric}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const top = Math.max(...[p.open, p.closed].filter(Number.isFinite).map((v) => f.y(v)), f.box.top + 16);
      ctx.fillText(p.status === 'eligible' ? `${p.ratio.toFixed(2)}×` : p.status.replace('_', ' '), cx, Math.min(...[p.open, p.closed].filter(Number.isFinite).map((v) => f.y(v))) - 4 || top);
    }
    if (simulated) simulatedWatermark(ctx, f.box);
  });
}

/** Legend in the top padding, left-aligned with the plot box (never over data). */
export function legend(ctx, box, items) {
  ctx.font = `12px ${theme.font.ui}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const y = box.top - 14;
  let x = box.left;
  for (const [label, color] of items) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y - 5, 10, 10);
    ctx.fillStyle = C.ink.primary;
    ctx.fillText(label, x + 14, y);
    x += ctx.measureText(label).width + 30;
  }
}

/**
 * Session timeline: accepted-window alpha over protocol time, blocks shaded, markers drawn.
 */
export function drawTimeline(chart, { windows, blocks, markers = [], origin = 0, unit = 'α power (count-equiv.²)', simulated }) {
  chart.draw((ctx, w, h) => {
    const t = (ms) => (ms - origin) / 1000;
    const end = Math.max(10, ...blocks.map((b) => t(b.end_arrival_ms ?? b.start_arrival_ms)));
    const vals = windows.map((x) => x.value).filter(Number.isFinite);
    const max = vals.length ? Math.max(...vals) * 1.12 : 1;
    const f = frame(ctx, w, h, { x: { min: 0, max: end, label: 'Seconds since protocol start (browser arrival time)', format: (v) => v.toFixed(0) }, y: { min: 0, max, label: unit, format: compact }, padding: { left: 64, top: 30 } });
    for (const b of blocks) {
      const closed = b.label.startsWith('eyes_closed');
      const open = b.label.startsWith('eyes_open');
      const x0 = f.x(t(b.start_arrival_ms)), x1 = f.x(t(b.end_arrival_ms ?? b.start_arrival_ms));
      ctx.fillStyle = closed ? 'rgba(250, 139, 148, 0.10)' : open ? 'rgba(182, 194, 255, 0.08)' : 'rgba(138, 143, 168, 0.06)';
      ctx.fillRect(x0, f.box.top, x1 - x0, f.box.bottom - f.box.top);
      ctx.fillStyle = C.ink.muted;
      ctx.font = `11px ${theme.font.ui}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const short = b.label.replace(/^eyes_closed_pair/, 'C').replace(/^eyes_open_pair/, 'O').replace('settling_eyes_open', 'settle').replace('recovery_eyes_open', 'rec.');
      ctx.fillText(short, (x0 + x1) / 2, f.box.top + 3);
    }
    for (const m of markers) {
      const x = f.x(t(m.arrival_ms));
      ctx.strokeStyle = C.status.warning; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(x, f.box.top); ctx.lineTo(x, f.box.bottom); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = C.status.warning; ctx.textAlign = 'left'; ctx.fillText(`▲ ${m.note || 'marker'}`, x + 3, f.box.bottom - 16);
    }
    for (const p of windows) {
      if (!Number.isFinite(p.value)) continue;
      const x = f.x(t(p.mid_ms)), y = f.y(p.value);
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      const color = p.state === 'closed' ? C.data.rose : p.state === 'open' ? C.data.periwinkle : C.data.neutral;
      if (p.good) { ctx.fillStyle = color; ctx.fill(); } else { ctx.strokeStyle = color; ctx.lineWidth = 1.2; ctx.stroke(); }
    }
    legend(ctx, f.box, [['Eyes open', C.data.periwinkle], ['Eyes closed', C.data.rose], ['Hollow: rejected or not counted', C.data.neutral]]);
    if (simulated) simulatedWatermark(ctx, f.box);
  });
}

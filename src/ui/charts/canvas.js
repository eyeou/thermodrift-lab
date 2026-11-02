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
 * Every channel stacked on one time axis, newest sample on the right. Each row has its own scale,
 * named beside it, because ECG and EEG differ by orders of magnitude. Display only.
 * @param {{rows:{name:string, detail?:string, samples:ArrayLike<number>|null, floor:number}[], fs?:number, status?:string, simulated?:boolean}} options
 */
export function drawStack(chart, { rows, fs = 500, status, simulated }) {
  chart.draw((ctx, w, h) => {
    const narrow = w < 560;
    const box = { left: narrow ? 74 : 150, right: w - 8, top: 6, bottom: h - 34 };
    const rowH = (box.bottom - box.top) / rows.length;
    ctx.fillStyle = C.surface.panel;
    ctx.fillRect(box.left, box.top, box.right - box.left, box.bottom - box.top);
    rows.forEach((row, i) => {
      const mid = box.top + rowH * (i + 0.5);
      const samples = row.samples && row.samples.length > 1 && !status ? row.samples : null;
      let mean = 0, peak = 0;
      if (samples) {
        for (let k = 0; k < samples.length; k++) mean += samples[k];
        mean /= samples.length;
        for (let k = 0; k < samples.length; k++) peak = Math.max(peak, Math.abs(samples[k] - mean));
      }
      const range = Math.max(row.floor, peak * 1.1);
      ctx.strokeStyle = i ? C.surface.grid : 'transparent';
      ctx.lineWidth = theme.chart['grid-width'];
      ctx.beginPath(); ctx.moveTo(0, Math.round(mid - rowH / 2) + 0.5); ctx.lineTo(box.right, Math.round(mid - rowH / 2) + 0.5); ctx.stroke();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = C.ink.primary;
      ctx.font = `600 12px ${theme.font.ui}`;
      ctx.fillText(row.name, 0, mid - (narrow ? 7 : 8));
      ctx.fillStyle = C.ink.muted;
      ctx.font = `11px ${theme.font.numeric}`;
      ctx.fillText(`±${Math.round(range)}`, 0, mid + (narrow ? 7 : 8));
      if (!narrow && row.detail) {
        ctx.font = `11px ${theme.font.ui}`;
        ctx.fillText(row.detail.length > 17 ? `${row.detail.slice(0, 16)}…` : row.detail, 42, mid + 8);
      }
      if (samples) {
        const n = samples.length;
        const span = (box.right - box.left) / ((n - 1) / fs);
        const points = new Array(n);
        for (let k = 0; k < n; k++) points[k] = [box.right - ((n - 1 - k) / fs) * span, mid - ((samples[k] - mean) / range) * (rowH * 0.46)];
        const rowBox = { left: box.left, right: box.right, top: mid - rowH / 2, bottom: mid + rowH / 2 };
        clip(ctx, rowBox, () => line(ctx, points, { color: C.data.periwinkle, width: 1 }));
      }
    });
    ctx.fillStyle = C.ink.muted;
    ctx.font = `${theme.chart['label-font-size']}px ${theme.font.ui}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('Last 4 seconds, newest on the right', (box.left + box.right) / 2, box.bottom + 10);
    if (status) message(ctx, box, status);
    if (simulated) simulatedWatermark(ctx, box);
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
    ctx.fillStyle = C.data['band-fill'];
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

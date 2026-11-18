/**
 * Live channel status monitor: 10-s raw rings per channel, a level every 2 s (src/core/live-status.js),
 * the sound policy, and the log entries that put every alert in the export.
 *
 * Modes:
 *  - setup:   every change of level that holds 4 s is announced (voice names the channel).
 *  - session: only sustained problems sound (red 20 s, orange 60 s, replayed policy), a soft tone
 *             every 5 min says the app is alive, a distinct sound says the link is lost.
 *  - silent:  lights only.
 * A tone is a stimulus: every sound is logged with its time, so it can be dropped or analysed.
 */
import { STATUS_WINDOW, STATUS_STEP, STATUS_FS, GREEN, ORANGE, RED, LEVEL_NAME, statusFeatures, channelLevel, infoLine, createAlertTracker } from '../core/live-status.js';

const ALIVE_EVERY_S = 300;
const LINK_LOST_AFTER_MS = 5000;
const LINK_REPEAT_MS = 60000;
const LINK_MAX_REPEATS = 5;

class Ring {
  constructor(n) { this.buf = new Float64Array(n); this.n = n; this.len = 0; this.pos = 0; }
  push(v) { this.buf[this.pos] = v; this.pos = (this.pos + 1) % this.n; if (this.len < this.n) this.len++; }
  full() { return this.len === this.n; }
  values() { const out = new Array(this.n); for (let i = 0; i < this.n; i++) out[i] = this.buf[(this.pos + i) % this.n]; return out; }
  clear() { this.len = 0; this.pos = 0; }
}

/** Web Audio tones. Created lazily; the context needs one user gesture to start. */
export function createTones() {
  let ctx = null;
  const ensure = () => {
    if (!ctx) { const A = globalThis.AudioContext ?? globalThis.webkitAudioContext; if (!A) return null; ctx = new A(); }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  };
  const beep = (freqs, { dur = 0.22, gap = 0.08, gain = 0.25, type = 'sine' } = {}) => {
    const c = ensure();
    if (!c) return false;
    let t = c.currentTime + 0.02;
    for (const f of freqs) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(gain, t + 0.02);
      g.gain.setValueAtTime(gain, t + dur - 0.05);
      g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(g).connect(c.destination);
      o.start(t); o.stop(t + dur + 0.01);
      t += dur + gap;
    }
    return true;
  };
  return {
    unlock: ensure,
    red: () => beep([660, 440], { dur: 0.32, gain: 0.32, type: 'triangle' }),
    orange: () => beep([550], { dur: 0.35, gain: 0.25, type: 'triangle' }),
    green: () => beep([520, 780], { dur: 0.16, gap: 0.04, gain: 0.18 }),
    alive: () => beep([880], { dur: 0.12, gain: 0.07 }),
    link: () => beep([880, 660, 440], { dur: 0.25, gap: 0.12, gain: 0.35, type: 'square' }),
  };
}

function speak(text) {
  const synth = globalThis.speechSynthesis;
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return false;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-GB'; u.rate = 1.05;
  synth.speak(u);
  return true;
}

export class StatusMonitor {
  /**
   * @param {{channels: number, log: (label: string, payload: object) => void, tones?: object}} deps
   */
  constructor({ channels, log, tones = createTones(), onAlert = null, onAnnounce = null, onEvaluate = null }) {
    this.onEvaluate = onEvaluate;
    this.onAlert = onAlert;
    this.onAnnounce = onAnnounce;
    this.channels = channels;
    this.logFn = log;
    this.tones = tones;
    this.mode = 'setup';
    this.rings = Array.from({ length: channels }, () => new Ring(STATUS_WINDOW));
    this.kinds = Array(channels).fill('unused');
    this.names = Array(channels).fill('');
    this.reset();
  }

  /** Montage kinds and short names; 'unused' channels never alert. */
  configure(kinds, names) {
    this.kinds = Array.from({ length: this.channels }, (_, i) => kinds[i] ?? 'unused');
    this.names = Array.from({ length: this.channels }, (_, i) => names[i] ?? `channel ${i + 1}`);
  }

  /** New acquisition: everything starts over. */
  reset() {
    for (const r of this.rings) r.clear();
    this.samples = 0;
    this.sinceStep = 0;
    this.state = Array.from({ length: this.channels }, () => ({ level: null, reasons: [], info: '', sound: false, features: null }));
    this.trackers = Array.from({ length: this.channels }, () => createAlertTracker());
    this.pendingAnnounce = Array(this.channels).fill(null);
    this.lastAnnounced = Array(this.channels).fill(null);
    this.emgFloor = Array.from({ length: this.channels }, () => []);
    this.lastAlive = 0;
    this.link = { lostAt: null, repeats: 0, lastSound: -Infinity };
    this.alerts = [];
  }

  /** Discontinuity (gap, bad packet): rings restart, levels wait for 10 s of new samples. */
  gap() {
    for (const r of this.rings) r.clear();
    this.sinceStep = 0;
    for (const s of this.state) { s.level = null; s.reasons = ['gap, refilling']; }
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.tones.unlock?.();
    this.log('live_status_mode', { mode });
    for (const t of this.trackers) t.reset();
    this.lastAnnounced = this.state.map((s) => s.level);
    this.lastAlive = this.time;
  }

  get time() { return this.samples / STATUS_FS; }

  log(label, payload) { try { this.logFn?.(label, payload); } catch { /* logging must never stop acquisition */ } }

  push(row) {
    for (let ch = 0; ch < this.channels; ch++) {
      const v = row.channels[ch];
      if (Number.isFinite(v)) this.rings[ch].push(v);
    }
    this.samples++;
    if (++this.sinceStep >= STATUS_STEP) { this.sinceStep = 0; this.#evaluate(); }
  }

  #evaluate() {
    const t = this.time;
    const changes = [];
    for (let ch = 0; ch < this.channels; ch++) {
      const kind = this.kinds[ch];
      if (kind === 'unused' || !this.rings[ch].full()) continue;
      const f = statusFeatures(this.rings[ch].values(), kind);
      const lv = channelLevel(f, kind);
      if (kind === 'emg' && lv.level === GREEN) { const fl = this.emgFloor[ch]; fl.push(f.rms); if (fl.length > 150) fl.shift(); }
      const floor = kind === 'emg' ? lowQuantile(this.emgFloor[ch]) : 0;
      const prev = this.state[ch].level;
      this.state[ch] = { level: lv.level, reasons: lv.reasons, info: infoLine(f, kind, floor), sound: lv.sound, features: f };
      if (prev !== lv.level) changes.push({ ch, from: prev, to: lv.level });
      const step = this.trackers[ch].step(t, lv.level, lv.sound);
      if (this.mode === 'session' && step.alert) this.#alert(ch, step.alert, lv.reasons);
    }
    for (const c of changes) this.log('live_status_change', { channel: c.ch + 1, from: c.from === null ? null : LEVEL_NAME[c.from], to: LEVEL_NAME[c.to], reasons: this.state[c.ch].reasons, t_s: Math.round(t) });
    if (this.mode === 'setup') this.#announceSetup();
    if (this.mode === 'session' && t - this.lastAlive >= ALIVE_EVERY_S) {
      this.lastAlive = t;
      const allOk = this.state.every((s, i) => this.kinds[i] === 'unused' || s.level === GREEN || (s.level === ORANGE && !s.sound));
      this.tones.alive?.();
      this.log('live_status_sound', { sound: 'alive', all_connected: allOk, t_s: Math.round(t) });
    }
    // Sample-driven, so it keeps running in a hidden tab where timers are throttled.
    try { this.onEvaluate?.(); } catch { /* feedback must never stop acquisition */ }
  }

  /**
   * Setup mode: say a change once it has held 6 s (three evaluations), 10 s for a colour-only
   * doubt such as EEG muscle, so flicker stays quiet. "Good" is said only after a spoken problem.
   */
  #announceSetup() {
    const said = [];
    for (let ch = 0; ch < this.channels; ch++) {
      const { level, sound } = this.state[ch];
      if (this.kinds[ch] === 'unused' || level === null) continue;
      if (level === this.lastAnnounced[ch]) { this.pendingAnnounce[ch] = null; continue; }
      const p = this.pendingAnnounce[ch];
      if (!p || p.level !== level) { this.pendingAnnounce[ch] = { level, n: 1 }; continue; }
      p.n++;
      const need = level === ORANGE && !sound ? 5 : 3;
      if (p.n < need) continue;
      this.pendingAnnounce[ch] = null;
      const prev = this.lastAnnounced[ch];
      this.lastAnnounced[ch] = level;
      if (level === GREEN && (prev === null || prev === GREEN)) continue;
      said.push({ ch, level });
    }
    if (!said.length) return;
    try { this.onAnnounce?.(said); } catch { /* idem */ }
    const word = (l) => (l === GREEN ? 'good' : l === ORANGE ? 'check' : 'no signal');
    const text = said.map(({ ch, level }) => `${ch + 1}, ${this.names[ch]}, ${word(level)}${level !== GREEN && this.state[ch].reasons[0] ? `, ${this.state[ch].reasons[0]}` : ''}`).join('. ');
    const spoken = speak(text);
    if (!spoken) (said.some((s) => s.level === RED) ? this.tones.red : said.some((s) => s.level === ORANGE) ? this.tones.orange : this.tones.green)?.();
    this.log('live_status_sound', { sound: spoken ? 'voice' : 'tone', text, t_s: Math.round(this.time) });
  }

  #alert(ch, level, reasons) {
    (level === 'red' ? this.tones.red : this.tones.orange)?.();
    try { this.onAlert?.(level, ch); } catch { /* feedback must never stop acquisition */ }
    const entry = { channel: ch + 1, name: this.names[ch], level, reasons, t_s: Math.round(this.time), at: new Date().toISOString() };
    this.alerts.unshift(entry);
    this.log('live_status_sound', { sound: `alert_${level}`, ...entry });
  }

  /**
   * Called every UI tick with the controller's link state. Sounds once the link has been silent for
   * 5 s (packets stop) or the device dropped, then every minute, at most five times.
   */
  watchLink({ acquiring, msSinceLastPacket, disconnectedWhileArmed, now = performance.now() }) {
    const lost = (acquiring && msSinceLastPacket > LINK_LOST_AFTER_MS) || disconnectedWhileArmed;
    if (!lost) { if (this.link.lostAt !== null) this.log('live_status_link', { state: 'back' }); this.link = { lostAt: null, repeats: 0, lastSound: -Infinity }; return false; }
    if (this.link.lostAt === null) { this.link.lostAt = now; this.log('live_status_link', { state: 'lost', reason: disconnectedWhileArmed ? 'device disconnected' : 'no packets for 5 s' }); }
    if (this.mode !== 'silent' && this.link.repeats < LINK_MAX_REPEATS && now - this.link.lastSound >= LINK_REPEAT_MS) {
      this.link.lastSound = now; this.link.repeats++;
      this.tones.link?.();
      if (this.mode === 'setup') speak('Link lost. Reconnect the device.');
    }
    return true;
  }
}

function lowQuantile(values) {
  if (values.length < 5) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(0.2 * (s.length - 1))];
}

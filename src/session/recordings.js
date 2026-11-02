/**
 * Recordings: the operator's word for session segments. One session can hold several, and each can
 * be listed, flagged as a test and exported alone, so repeated or false takes never get mixed up.
 * Pure functions over stored session records: sessions saved by earlier versions (no `flag`, no
 * `end_utc`) work unchanged. Flagging never deletes anything.
 */
const pad = (n) => String(n).padStart(2, '0');

/** Local clock time for file names: `19h43`. Session ids are UTC; file names use local time. */
export function localStamp(utc) {
  const d = new Date(utc);
  return Number.isNaN(d.getTime()) ? 'unknown' : `${pad(d.getHours())}h${pad(d.getMinutes())}`;
}

/** Length for lists: seconds while short, so a new recording doesn't read "0.0 min". */
export function lengthText(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  return seconds < 120 ? `${Math.round(seconds)} s` : `${(seconds / 60).toFixed(1)} min`;
}

/**
 * Sample-index range (inclusive) and event time window of one recording. Bounded by its neighbours,
 * because a recording left open by a crash or a failed start has no end of its own.
 */
export function recordingScope(segments, segmentId) {
  const i = segments.findIndex((s) => s.id === segmentId);
  if (i < 0) return null;
  const segment = segments[i], prev = segments[i - 1], next = segments[i + 1];
  return {
    segment,
    first: segment.start_index,
    last: Math.min(segment.end_index ?? Infinity, next ? next.start_index - 1 : Infinity),
    // Events between two recordings (reconnection, cue test) belong to both exports.
    from_ms: prev ? prev.end_arrival_ms ?? prev.start_arrival_ms : -Infinity,
    to_ms: next ? next.start_arrival_ms : Infinity,
  };
}

/** The recording a plain "export" means: the latest one that actually started. */
export function latestRecording(segments = []) {
  return segments.filter((s) => s.end_reason !== 'start_failed').at(-1) ?? null;
}

export const inScope = (index, scope) => !scope || (index >= scope.first && index <= scope.last);

/** The parts of a session that belong to one recording, under the same field names. */
export function scopeSessionItems({ session, events, windows, annotations }, scope) {
  const blocks = (session.blocks ?? []).filter((b) => inScope(b.start_index, scope));
  const blockIds = new Set(blocks.map((b) => b.id));
  return {
    session: { ...session, blocks, protocols: (session.protocols ?? []).filter((p) => inScope(p.start_index, scope)), segments: [scope.segment] },
    // An event naming a recording goes with it, even when logged later (a test flag, for instance).
    events: events.filter((e) => (e.segment_id === undefined ? e.arrival_ms >= scope.from_ms && e.arrival_ms < scope.to_ms : e.segment_id === scope.segment.id)),
    windows: windows.filter((w) => inScope(w.index, scope)),
    annotations: annotations.filter((a) => a.block_id === undefined || a.block_id === null || blockIds.has(a.block_id)),
  };
}

/** File and folder name of a bundle: says which recording it holds, and when it started. */
export function bundleStem(session, segment = null) {
  const simulated = session.source?.kind === 'simulated' ? 'SIMULATED-' : '';
  const base = `${simulated}${session.app}-${session.id}`;
  const code = String(session.setup?.condition ?? '').replace(/[^A-Za-z0-9-]/g, '');
  const condition = code && code !== 'unset' ? `-${code}` : '';
  const segments = session.segments ?? [];
  if (segment) return `${base}${condition}-rec${segment.id}-at-${localStamp(segment.start_utc)}${segment.flag === 'test' ? '-TEST' : ''}`;
  if (segments.length > 1) return `${base}${condition}-all-${segments.length}-recordings`;
  return `${base}${condition}${segments[0]?.flag === 'test' ? '-TEST' : ''}`;
}

/**
 * One line per recording for lists. A recording still open is live in this tab (pass `liveIndex`
 * and `nowUtc`) or was cut short by a closed tab or a crash (its end comes from the last save).
 */
export function recordingSummaries(session, { liveIndex = null, nowUtc = null } = {}) {
  const segments = session.segments ?? [];
  const epoch = session.session_start_epoch_ms;
  const utcOf = (ms) => (Number.isFinite(epoch) && Number.isFinite(ms) ? new Date(epoch + ms).toISOString() : null);
  let counted = 0;
  return segments.map((s) => {
    const scope = recordingScope(segments, s.id);
    const open = s.end_arrival_ms === undefined;
    const live = open && session.status === 'recording';
    let last = scope.last;
    if (!Number.isFinite(last)) last = liveIndex ?? (session.counts?.samples != null ? s.start_index + session.counts.samples - counted - 1 : null);
    const samples = last === null ? null : Math.max(0, last - scope.first + 1);
    counted += samples ?? 0;
    const startUtc = s.start_utc ?? utcOf(s.start_arrival_ms);
    const endUtc = s.end_utc ?? utcOf(s.end_arrival_ms) ?? (live ? nowUtc : session.last_flush_utc ?? null);
    return {
      id: s.id,
      flag: s.flag ?? null,
      open,
      live,
      start_utc: startUtc,
      end_utc: endUtc,
      seconds: Number.isFinite(s.end_arrival_ms) ? Math.max(0, (s.end_arrival_ms - s.start_arrival_ms) / 1000)
        : startUtc && endUtc ? Math.max(0, (Date.parse(endUtc) - Date.parse(startUtc)) / 1000) : null,
      samples,
      ended: live ? 'recording' : open ? 'tab closed or crashed' : String(s.end_reason ?? 'unknown').replaceAll('_', ' '),
      protocols: (session.protocols ?? []).filter((p) => inScope(p.start_index, scope)).map((p) => ({ name: p.name, state: p.end_reason ?? 'running' })),
    };
  });
}

/** Flag or unflag a recording of a session that is not being recorded (review pages). */
export async function flagStoredRecording(store, sessionId, segmentId, flag) {
  const session = await store.getSession(sessionId);
  if (!session) throw new Error(`Unknown session ${sessionId}`);
  if (session.status === 'recording') throw new Error('This session is open in a recording tab: flag it there.');
  const segments = structuredClone(session.segments ?? []);
  const segment = segments.find((s) => s.id === segmentId);
  if (!segment) throw new Error(`Unknown recording ${segmentId}`);
  if (flag) segment.flag = flag;
  else delete segment.flag;
  return store.updateSession(sessionId, { segments });
}

/**
 * Session report logic that needs no page: which results a session can show, from which channel,
 * under which plan. A session is always read under its own app and plan.
 */
import { pairedResults } from '../../src/analysis/berger-v3.js';

/** Protocols of a session that hold eyes-open / eyes-closed blocks. */
export function eyeProtocolIds(view) {
  return [...new Set(view.blocks.filter((b) => b.label.startsWith('eyes_')).map((b) => b.protocol_id))];
}

/** Paired results per eye protocol, on `channel`. Nothing when the channel is unknown (null). */
export function eyeResults(view, channel, adherenceOf) {
  if (channel === null) return [];
  return eyeProtocolIds(view).map((id) => ({
    id,
    protocol: view.protocols.find((p) => p.id === id),
    res: pairedResults({ blocks: view.blocks, windows: view.windows, protocolId: id, channel, adherenceOf }),
  }));
}

/** Rest before and rest after, for an app that compares them. Null when there is nothing to compare. */
export function restResults(view, app, channel, adherenceOf) {
  if (channel === null || !app.restComparison) return null;
  const comparison = app.restComparison({ blocks: view.blocks, windows: view.windows, channel, adherenceOf });
  return comparison.rows.some((row) => row.before && row.after) ? comparison : null;
}

/** The result recorded at export for one protocol. Only Berger Effect records them per protocol, as a list. */
export function recordedResultFor(view, protocolId) {
  return Array.isArray(view.recorded_results) ? view.recorded_results.find((r) => r.protocol_id === protocolId) ?? null : null;
}

/** What the Processing panel states: the plan the session recorded, and its app's metric and rules. */
export function processingFor(view, app, channel) {
  const recorded = view.analysis_plan && view.analysis_plan !== 'unknown' ? view.analysis_plan : null;
  let channelName = null;
  if (channel === null) channelName = 'Not recorded: this session does not say which channel holds the EEG.';
  else if (channel > 0) channelName = `${channel + 1} · ${view.channel_names?.[channel] ?? app.channelLabel(app.montages[view.montage], channel)}`;
  return { plan: recorded ?? app.plan, metric: app.metric, eligibility: app.eligibility, channelName };
}

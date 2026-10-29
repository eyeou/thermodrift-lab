/**
 * Instruments known to the review surfaces. The report looks a session's app up here to label
 * montages, describe exports and draw results. No transport is imported from this file.
 */
import { APP as BERGER, MONTAGES as BERGER_MONTAGES, channelLabel as bergerChannelLabel, describeBergerSession, LIMITATIONS as BERGER_LIMITATIONS } from './berger/config.js';

export const REGISTRY = Object.freeze({
  [BERGER.id]: {
    name: BERGER.name,
    montages: BERGER_MONTAGES,
    channelLabel: bergerChannelLabel,
    describe: describeBergerSession,
    limitations: BERGER_LIMITATIONS,
    results: 'eye-pairs',
  },
});

/** Entry for a session's app id; Berger Lab v3 file sets carry no id and map to Berger. */
export function instrumentFor(appId) {
  return REGISTRY[appId] ?? (appId === 'unknown' ? REGISTRY[BERGER.id] : null);
}

/**
 * Instruments known to the review surfaces. The report looks a session's app up here to label
 * montages, describe exports and draw results. No transport is imported from this file.
 * `analysisChannel(view)` is the live-window channel a session's results read, or null when the
 * session does not say. `metric` and `eligibility` describe the app's analysis plan.
 */
import { BERGER_V3 } from '../src/analysis/berger-v3.js';
import { APP as BERGER, MONTAGES as BERGER_MONTAGES, channelLabel as bergerChannelLabel, describeBergerSession, LIMITATIONS as BERGER_LIMITATIONS } from './berger/config.js';
import { APP as BREATHWORK, MONTAGES as BREATHWORK_MONTAGES, channelLabel as breathworkChannelLabel, describeBreathworkSession, LIMITATIONS as BREATHWORK_LIMITATIONS, eegChannelOf, PRIMARY_METRIC as BREATHWORK_METRIC, ELIGIBILITY as BREATHWORK_ELIGIBILITY } from './breathwork/config.js';

export const REGISTRY = Object.freeze({
  [BERGER.id]: {
    name: BERGER.name,
    plan: BERGER.analysisPlan,
    montages: BERGER_MONTAGES,
    channelLabel: bergerChannelLabel,
    describe: describeBergerSession,
    limitations: BERGER_LIMITATIONS,
    results: 'eye-pairs',
    analysisChannel: () => 0,
    metric: BERGER_V3.primary_metric,
    eligibility: BERGER_V3.eligibility,
  },
  [BREATHWORK.id]: {
    name: BREATHWORK.name,
    plan: BREATHWORK.analysisPlan,
    montages: BREATHWORK_MONTAGES,
    channelLabel: breathworkChannelLabel,
    describe: describeBreathworkSession,
    limitations: BREATHWORK_LIMITATIONS,
    results: 'rest-comparison',
    analysisChannel: eegChannelOf,
    metric: BREATHWORK_METRIC,
    eligibility: BREATHWORK_ELIGIBILITY,
  },
});

/** Entry for a session's app id; Berger v3 file sets carry no id and map to Berger. */
export function instrumentFor(appId) {
  return REGISTRY[appId] ?? (appId === 'unknown' ? REGISTRY[BERGER.id] : null);
}

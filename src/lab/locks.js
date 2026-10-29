/**
 * Session ownership via the Web Locks API: a recording tab holds `thermodrift-session:<id>`.
 * When the tab closes or crashes the browser releases the lock, so another tab can tell an
 * abandoned session (status still 'recording', no holder) from one that is live elsewhere.
 */
export function createSessionLocks(locks = globalThis.navigator?.locks) {
  const held = new Map();
  return {
    available: !!locks,
    async hold(id) {
      if (!locks || held.has(id)) return;
      await new Promise((acquired) => {
        locks.request(`thermodrift-session:${id}`, { mode: 'exclusive' }, () => new Promise((release) => {
          held.set(id, release);
          acquired();
        }));
      });
    },
    async release(id) {
      held.get(id)?.();
      held.delete(id);
    },
    async isHeld(id) {
      if (!locks) return null;
      const state = await locks.query();
      return state.held.some((l) => l.name === `thermodrift-session:${id}`);
    },
  };
}

/**
 * Mark sessions abandoned by a closed/crashed tab as interrupted. Data already flushed are kept
 * as-is; nothing is deleted. Without Web Locks, a session is considered abandoned when its last
 * flush is older than `staleMs`.
 */
export async function recoverAbandonedSessions(store, locks, { staleMs = 30000 } = {}) {
  const recovered = [];
  for (const s of await store.listSessions()) {
    if (s.status !== 'recording') continue;
    const held = await locks.isHeld(s.id);
    const lastFlush = Date.parse(s.last_flush_utc ?? s.created_utc);
    const abandoned = held === null ? Date.now() - lastFlush > staleMs : !held;
    if (!abandoned) continue;
    await store.updateSession(s.id, { status: 'interrupted', close_reason: 'Tab closed or crashed before the session was finished; data up to the last save are intact.', recovered_utc: new Date().toISOString() });
    recovered.push(s.id);
  }
  return recovered;
}

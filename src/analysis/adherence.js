/**
 * Adherence is an annotation layer: prompted labels in raw rows never change.
 * Effective adherence = a system exclusion (e.g. failed cue), else the latest operator annotation
 * for the block, else what was recorded with the block ('unconfirmed' by default).
 */
export const ADHERENCE = Object.freeze(['unconfirmed', 'as_instructed', 'exclude']);

export function effectiveAdherence(block, annotations = []) {
  if (block.adherence === 'exclude') return 'exclude';
  let value = block.adherence ?? 'unconfirmed';
  let seq = -1;
  for (const a of annotations) if (a.kind === 'adherence' && a.block_id === block.id && a.seq > seq) { seq = a.seq; value = a.value; }
  return value;
}

/** Eye-state blocks that a blanket "I followed every instruction" confirmation applies to. */
export function confirmableEyeBlocks(blocks, annotations = []) {
  return blocks.filter((b) => b.complete && b.label.startsWith('eyes_') && effectiveAdherence(b, annotations) !== 'exclude');
}

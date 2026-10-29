/**
 * Save a session bundle: the browser's save dialog when available (the page then knows the file
 * was written), otherwise a download (the page cannot observe completion).
 * Call it directly from the click handler: the dialog must open before any other await.
 *
 * @param {{suggestedName:string, assemble:(sink:(bytes:Uint8Array)=>any, method:string)=>Promise<{filename:string, manifest:object}>, onStatus:(text:string, tone?:string)=>void}} options
 * @returns {Promise<null|{method:string, filename:string, manifest:object}>}
 */
export async function saveBundle({ suggestedName, assemble, onStatus }) {
  let handle = null, writable = null;
  if (globalThis.showSaveFilePicker) {
    try {
      handle = await globalThis.showSaveFilePicker({ suggestedName, types: [{ description: 'Session bundle', accept: { 'application/zip': ['.zip'] } }] });
      writable = await handle.createWritable();
    } catch (error) {
      if (error?.name === 'AbortError') { onStatus('Export cancelled.'); return null; }
      handle = writable = null; // dialog unavailable here: fall back to a download
    }
  }
  onStatus('Assembling bundle…');
  try {
    if (writable) {
      const result = await assemble((bytes) => writable.write(bytes), 'file-picker');
      await writable.close();
      const ok = result.manifest.integrity.ok;
      onStatus(`Saved ${handle.name}${ok ? '' : ' · integrity issues listed in manifest.json'}`, ok ? 'ready' : 'error');
      return { ...result, method: 'file-picker', filename: handle.name };
    }
    const parts = [];
    const result = await assemble((bytes) => { parts.push(bytes.slice()); }, 'download');
    const url = URL.createObjectURL(new Blob(parts, { type: 'application/zip' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = result.filename;
    a.hidden = true;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 120000);
    onStatus(`Download started: ${result.filename}`, 'ready');
    return { ...result, method: 'download' };
  } catch (error) {
    try { await writable?.abort(); } catch { /* nothing to abort */ }
    onStatus(`Export failed: ${error.message}. The data are still in this browser.`, 'error');
    return null;
  }
}

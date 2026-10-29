/**
 * Chords / NPG Lite BLE packet decoder.
 *
 * Contract checked against Upside Down Labs Chords-Arduino-Firmware, NPG-LITE-BLE.ino at
 * commit 57adf4d (source snapshot, not proof of the firmware flashed on a given board):
 *   record  = [counter: uint8][channel 1: uint16 big-endian][channel 2: uint16 BE]...
 *   3-channel boards: 7-byte records; 6-channel (VibZ+) boards: 13-byte records
 *   one notification = 10 records (70 or 130 bytes); single records (7/13 bytes) are also accepted.
 * Values are 12-bit ADC counts in 16-bit containers. They are not microvolts.
 */

/** Record size in bytes, keyed by notification length. */
export const PACKET_RECORD_BYTES = Object.freeze({ 7: 7, 13: 13, 70: 7, 130: 13 });

export const ADC_MIN = 0;
export const ADC_MAX = 4095;

export class UnsupportedPacketError extends Error {
  constructor(byteLength) {
    super(`Unsupported packet length ${byteLength}`);
    this.name = 'UnsupportedPacketError';
    this.byteLength = byteLength;
  }
}

/**
 * Decode one notification. Respects DataView byteOffset (Web Bluetooth may hand out views
 * into a larger buffer).
 * @param {DataView} view
 * @returns {{counter:number, channels:number[]}[]}
 */
export function decodePacket(view) {
  const recordBytes = PACKET_RECORD_BYTES[view.byteLength];
  if (!recordBytes) throw new UnsupportedPacketError(view.byteLength);
  const rows = [];
  for (let offset = 0; offset < view.byteLength; offset += recordBytes) {
    const channels = [];
    for (let c = 1; c < recordBytes; c += 2) channels.push(view.getUint16(offset + c, false));
    rows.push({ counter: view.getUint8(offset), channels });
  }
  return rows;
}

/**
 * Encode records into a notification with the same layout. Used by replay and by isolated
 * tests; never by live acquisition.
 * @param {{counter:number, channels:number[]}[]} records
 */
export function encodePacket(records) {
  if (!records.length) throw new Error('No records to encode');
  const recordBytes = 1 + 2 * records[0].channels.length;
  if (recordBytes !== 7 && recordBytes !== 13) throw new Error(`Unsupported channel count ${records[0].channels.length}`);
  const view = new DataView(new ArrayBuffer(recordBytes * records.length));
  records.forEach((record, i) => {
    const offset = i * recordBytes;
    view.setUint8(offset, record.counter & 0xff);
    record.channels.forEach((value, c) => view.setUint16(offset + 1 + 2 * c, value, false));
  });
  return view;
}

/** True when the first `required` channels are finite 12-bit ADC values. */
export function channelsValid(channels, required) {
  if (channels.length < required) return false;
  for (let c = 0; c < required; c++) {
    const v = channels[c];
    if (!Number.isFinite(v) || v < ADC_MIN || v > ADC_MAX) return false;
  }
  return true;
}

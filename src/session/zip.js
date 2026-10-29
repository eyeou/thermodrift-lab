/**
 * Minimal ZIP (stored, no compression) writer and reader. Stored entries keep the bundle
 * byte-transparent: a CSV inside the zip is exactly the CSV that was hashed.
 * The writer streams to an async sink, so large files never need to sit in memory twice.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export class Crc32 {
  constructor() { this.crc = 0xffffffff; }
  update(bytes) {
    let c = this.crc;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    this.crc = c;
    return this;
  }
  value() { return (this.crc ^ 0xffffffff) >>> 0; }
}

export function crc32(bytes) {
  return new Crc32().update(bytes).value();
}

function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

/**
 * Streaming zip writer for entries whose size and CRC are known before their data are written.
 * `sink(bytes)` may be async (FileSystemWritableFileStream.write) or collect parts for a Blob.
 */
export class ZipWriter {
  constructor(sink, date = new Date()) {
    this.sink = sink;
    this.date = dosDateTime(date);
    this.offset = 0;
    this.central = [];
    this.encoder = new TextEncoder();
  }

  async #write(bytes) {
    this.offset += bytes.length;
    await this.sink(bytes);
  }

  /** @param {(write:(bytes:Uint8Array)=>Promise<void>)=>Promise<void>} writeData must write exactly `size` bytes */
  async addEntry(name, { size, crc }, writeData) {
    const nameBytes = this.encoder.encode(name);
    const { time, day } = this.date;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true);
    local.setUint16(10, time, true);
    local.setUint16(12, day, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, nameBytes.length, true);
    const headerOffset = this.offset;
    await this.#write(new Uint8Array(local.buffer));
    await this.#write(nameBytes);
    const before = this.offset;
    await writeData((bytes) => this.#write(bytes));
    if (this.offset - before !== size) throw new Error(`Zip entry ${name}: wrote ${this.offset - before} bytes, declared ${size}`);
    this.central.push({ nameBytes, size, crc, headerOffset });
  }

  async addBytes(name, bytes) {
    await this.addEntry(name, { size: bytes.length, crc: crc32(bytes) }, (write) => write(bytes));
  }

  async finish() {
    const { time, day } = this.date;
    const start = this.offset;
    for (const e of this.central) {
      const h = new DataView(new ArrayBuffer(46));
      h.setUint32(0, 0x02014b50, true);
      h.setUint16(4, 20, true);
      h.setUint16(6, 20, true);
      h.setUint16(8, 0x0800, true);
      h.setUint16(12, time, true);
      h.setUint16(14, day, true);
      h.setUint32(16, e.crc, true);
      h.setUint32(20, e.size, true);
      h.setUint32(24, e.size, true);
      h.setUint16(28, e.nameBytes.length, true);
      h.setUint32(42, e.headerOffset, true);
      await this.#write(new Uint8Array(h.buffer));
      await this.#write(e.nameBytes);
    }
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, this.central.length, true);
    end.setUint16(10, this.central.length, true);
    end.setUint32(12, this.offset - start, true);
    end.setUint32(16, start, true);
    await this.#write(new Uint8Array(end.buffer));
  }
}

/** Read a stored-only zip into { name: Uint8Array }. Rejects compressed entries. */
export function readZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a zip file');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const files = {};
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('Corrupt central directory');
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLength = view.getUint16(p + 28, true);
    const extra = view.getUint16(p + 30, true);
    const comment = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLength));
    if (method !== 0) throw new Error(`Compressed entry not supported: ${name}`);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtra = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localNameLength + localExtra;
    files[name] = bytes.subarray(start, start + size);
    p += 46 + nameLength + extra + comment;
  }
  return files;
}

// Minimal binary reader/writer. The save format is a packed byte stream, then
// DEFLATE-compressed -- JSON for chunk deltas would be roughly 8x larger and
// noticeably slower to parse on load.

export class Writer {
  constructor(initial = 1 << 16) {
    this.buf = new ArrayBuffer(initial);
    this.view = new DataView(this.buf);
    this.u8 = new Uint8Array(this.buf);
    this.p = 0;
  }
  _need(n) {
    if (this.p + n <= this.buf.byteLength) return;
    let cap = this.buf.byteLength;
    while (cap < this.p + n) cap *= 2;
    const nb = new ArrayBuffer(cap);
    new Uint8Array(nb).set(this.u8);
    this.buf = nb; this.view = new DataView(nb); this.u8 = new Uint8Array(nb);
  }
  u8w(v) { this._need(1); this.view.setUint8(this.p, v); this.p += 1; }
  u16w(v) { this._need(2); this.view.setUint16(this.p, v, true); this.p += 2; }
  u32w(v) { this._need(4); this.view.setUint32(this.p, v >>> 0, true); this.p += 4; }
  i32w(v) { this._need(4); this.view.setInt32(this.p, v | 0, true); this.p += 4; }
  f32w(v) { this._need(4); this.view.setFloat32(this.p, v, true); this.p += 4; }
  f64w(v) { this._need(8); this.view.setFloat64(this.p, v, true); this.p += 8; }
  /** LEB128-style varint; most chunk-delta indices fit in 2-3 bytes. */
  varw(v) {
    v = v >>> 0;
    do {
      let b = v & 0x7f;
      v >>>= 7;
      if (v) b |= 0x80;
      this.u8w(b);
    } while (v);
  }
  strw(s) {
    const enc = new TextEncoder().encode(s == null ? '' : String(s));
    this.u16w(enc.length);
    this._need(enc.length);
    this.u8.set(enc, this.p);
    this.p += enc.length;
  }
  boolw(b) { this.u8w(b ? 1 : 0); }
  bytes() { return this.u8.subarray(0, this.p); }
}

export class Reader {
  constructor(bytes) {
    this.u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    this.view = new DataView(this.u8.buffer, this.u8.byteOffset, this.u8.byteLength);
    this.p = 0;
  }
  get remaining() { return this.u8.byteLength - this.p; }
  u8r() { const v = this.view.getUint8(this.p); this.p += 1; return v; }
  u16r() { const v = this.view.getUint16(this.p, true); this.p += 2; return v; }
  u32r() { const v = this.view.getUint32(this.p, true); this.p += 4; return v; }
  i32r() { const v = this.view.getInt32(this.p, true); this.p += 4; return v; }
  f32r() { const v = this.view.getFloat32(this.p, true); this.p += 4; return v; }
  f64r() { const v = this.view.getFloat64(this.p, true); this.p += 8; return v; }
  varr() {
    let v = 0, shift = 0, b;
    do { b = this.u8r(); v |= (b & 0x7f) << shift; shift += 7; } while (b & 0x80);
    return v >>> 0;
  }
  strr() {
    const n = this.u16r();
    const s = new TextDecoder().decode(this.u8.subarray(this.p, this.p + n));
    this.p += n;
    return s;
  }
  boolr() { return this.u8r() !== 0; }
}

/** DEFLATE via CompressionStream, with a graceful fallback. */
export async function compress(bytes) {
  if (typeof CompressionStream === 'undefined') return { data: bytes, compressed: false };
  const cs = new CompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(cs);
  const out = new Uint8Array(await new Response(stream).arrayBuffer());
  return { data: out, compressed: true };
}

export async function decompress(bytes, compressed) {
  if (!compressed) return bytes;
  if (typeof DecompressionStream === 'undefined') throw new Error('save is compressed but this browser cannot decompress it');
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

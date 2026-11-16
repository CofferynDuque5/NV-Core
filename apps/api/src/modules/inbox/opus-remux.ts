/**
 * Voice notes recorded in the browser come as WebM/Opus (Chrome, Edge,
 * Firefox on some systems). WhatsApp only plays a voice note when it is
 * Ogg/Opus, so this rewraps the same Opus packets into an Ogg file: no
 * re-encoding, no ffmpeg on the server. Pure, tested.
 */

const ID_SEGMENT = 0x18538067;
const ID_CLUSTER = 0x1f43b675;
const ID_TRACKS = 0x1654ae6b;
const ID_TRACK_ENTRY = 0xae;
const ID_BLOCK_GROUP = 0xa0;
const ID_CODEC_ID = 0x86;
const ID_CODEC_PRIVATE = 0x63a2;
const ID_TRACK_NUMBER = 0xd7;
const ID_SIMPLE_BLOCK = 0xa3;
const ID_BLOCK = 0xa1;
const ID_CHANNELS = 0x9f;
const ID_AUDIO = 0xe1;

/** Elements whose children we read (everything else is skipped by size). */
const MASTERS = new Set([ID_SEGMENT, ID_CLUSTER, ID_TRACKS, ID_TRACK_ENTRY, ID_BLOCK_GROUP, ID_AUDIO]);

export class RemuxError extends Error {}

/** EBML variable-length integer at `pos`. `keepMarker` for element ids. */
function vint(buf: Buffer, pos: number, keepMarker: boolean): { value: number; length: number; unknown: boolean } {
  const first = buf[pos];
  if (first === undefined || first === 0) throw new RemuxError("Archivo de audio dañado.");
  let length = 1;
  while (length <= 8 && !(first & (0x80 >> (length - 1)))) length++;
  if (length > 8 || pos + length > buf.length) throw new RemuxError("Archivo de audio dañado.");
  let value = keepMarker ? first : first & (0xff >> length);
  let allOnes = value === 0xff >> length;
  for (let i = 1; i < length; i++) {
    const b = buf[pos + i]!;
    if (b !== 0xff) allOnes = false;
    value = value * 256 + b;
  }
  return { value, length, unknown: !keepMarker && allOnes };
}

/** Samples (at 48 kHz) in one Opus packet, from its TOC byte (RFC 6716 §3.1). */
export function opusPacketSamples(packet: Buffer): number {
  if (packet.length === 0) return 0;
  const toc = packet[0]!;
  const config = toc >> 3;
  let ms: number;
  if (config < 12) ms = [10, 20, 40, 60][config % 4]!;
  else if (config < 16) ms = [10, 20][config % 2]!;
  else ms = [2.5, 5, 10, 20][config % 4]!;
  const code = toc & 3;
  const frames = code === 0 ? 1 : code === 3 ? (packet[1] ?? 0) & 0x3f : 2;
  return Math.round(frames * ms * 48);
}

interface WebmOpus {
  head: Buffer;
  packets: Buffer[];
}

/** Read the Opus track (header + packets) out of a WebM file. */
export function readWebmOpus(buf: Buffer): WebmOpus {
  if (buf.length < 4 || buf.readUInt32BE(0) !== 0x1a45dfa3) throw new RemuxError("No es un audio WebM.");
  let pos = 0;
  let codec = "";
  let head: Buffer | null = null;
  let channels = 1;
  let opusTrack: number | null = null;
  let currentTrack: number | null = null;
  const packets: Buffer[] = [];
  while (pos < buf.length) {
    let id: ReturnType<typeof vint>;
    let size: ReturnType<typeof vint>;
    try {
      id = vint(buf, pos, true);
      size = vint(buf, pos + id.length, false);
    } catch {
      break; // trailing garbage / cut recording: keep what we have
    }
    const start = pos + id.length + size.length;
    if (MASTERS.has(id.value)) {
      if (id.value === ID_TRACK_ENTRY) currentTrack = null;
      pos = start; // read the children in place (works with unknown sizes too)
      continue;
    }
    if (size.unknown) throw new RemuxError("Archivo de audio dañado.");
    const end = Math.min(start + size.value, buf.length);
    const data = buf.subarray(start, end);
    switch (id.value) {
      case ID_TRACK_NUMBER:
        currentTrack = data.reduce((n, b) => n * 256 + b, 0);
        break;
      case ID_CODEC_ID:
        codec = data.toString("ascii");
        if (codec === "A_OPUS" && currentTrack !== null) opusTrack = currentTrack;
        break;
      case ID_CODEC_PRIVATE:
        if (data.subarray(0, 8).toString("ascii") === "OpusHead") head = Buffer.from(data);
        break;
      case ID_CHANNELS:
        channels = Math.max(1, Math.min(2, data[0] ?? 1));
        break;
      case ID_SIMPLE_BLOCK:
      case ID_BLOCK: {
        const track = vint(data, 0, false);
        if (opusTrack !== null && track.value !== opusTrack) break;
        const flags = data[track.length + 2] ?? 0;
        if (flags & 0x06) throw new RemuxError("Formato de audio no compatible (lacing).");
        const frame = data.subarray(track.length + 3);
        if (frame.length) packets.push(Buffer.from(frame));
        break;
      }
    }
    pos = end;
  }
  if (codec && codec !== "A_OPUS") throw new RemuxError("El audio no es Opus.");
  if (!packets.length) throw new RemuxError("La grabación está vacía.");
  return { head: head ?? opusHead(channels), packets };
}

/** A minimal OpusHead (RFC 7845 §5.1) when the WebM didn't carry one. */
function opusHead(channels: number): Buffer {
  const h = Buffer.alloc(19);
  h.write("OpusHead", 0, "ascii");
  h[8] = 1;
  h[9] = channels;
  h.writeUInt16LE(312, 10);
  h.writeUInt32LE(48000, 12);
  h.writeInt16LE(0, 16);
  h[18] = 0;
  return h;
}

function opusTags(): Buffer {
  const vendor = Buffer.from("NV Marketing", "utf8");
  const t = Buffer.alloc(8 + 4 + vendor.length + 4);
  t.write("OpusTags", 0, "ascii");
  t.writeUInt32LE(vendor.length, 8);
  vendor.copy(t, 12);
  t.writeUInt32LE(0, 12 + vendor.length);
  return t;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let r = i << 24;
    for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1;
    table[i] = r >>> 0;
  }
  return table;
})();

/** Ogg's CRC-32 (polynomial 0x04c11db7, no reflection, initial 0). */
export function oggCrc(buf: Buffer): number {
  let crc = 0;
  for (const b of buf) crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ b) & 0xff]!) >>> 0;
  return crc >>> 0;
}

function oggPage(packets: Buffer[], granule: number, serial: number, seq: number, flags: number): Buffer {
  const lacing: number[] = [];
  for (const p of packets) {
    let left = p.length;
    while (left >= 255) {
      lacing.push(255);
      left -= 255;
    }
    lacing.push(left);
  }
  const header = Buffer.alloc(27 + lacing.length);
  header.write("OggS", 0, "ascii");
  header[4] = 0;
  header[5] = flags;
  header.writeBigInt64LE(BigInt(granule), 6);
  header.writeUInt32LE(serial, 14);
  header.writeUInt32LE(seq, 18);
  header.writeUInt32LE(0, 22);
  header[26] = lacing.length;
  lacing.forEach((v, i) => (header[27 + i] = v));
  const page = Buffer.concat([header, ...packets]);
  page.writeUInt32LE(oggCrc(page), 22);
  return page;
}

/**
 * WebM/Opus → Ogg/Opus, plus the length in seconds. Throws {@link RemuxError}
 * with a message for people when the file can't be converted.
 */
export function webmToOggOpus(webm: Buffer, serial = 0x4e564d4b): { ogg: Buffer; seconds: number } {
  const { head, packets } = readWebmOpus(webm);
  const pages: Buffer[] = [];
  let seq = 0;
  pages.push(oggPage([head], 0, serial, seq++, 0x02));
  pages.push(oggPage([opusTags()], 0, serial, seq++, 0));
  let granule = 0;
  let batch: Buffer[] = [];
  let segments = 0;
  const flush = (last: boolean) => {
    if (!batch.length) return;
    pages.push(oggPage(batch, granule, serial, seq++, last ? 0x04 : 0));
    batch = [];
    segments = 0;
  };
  packets.forEach((p, i) => {
    const need = Math.floor(p.length / 255) + 1;
    if (segments + need > 255) flush(false);
    batch.push(p);
    segments += need;
    granule += opusPacketSamples(p);
    if (i === packets.length - 1) flush(true);
  });
  const preSkip = head.readUInt16LE(10);
  return { ogg: Buffer.concat(pages), seconds: Math.max(1, Math.round((granule - preSkip) / 48000)) };
}

// Packs the Blouse Studio mannequin (dist/model.js from the studio's
// scripts/build-model.py, ~9 MB of base64 floats) into a small binary file
// for the website, decoded in the browser by src/lib/studio/model.js:
// - positions and UVs quantised to 16 bits, normals octahedral-encoded,
// - triangles reordered for the vertex cache within each material group
//   (groups stay contiguous), vertices in order of first use,
// - every stream meshopt-compressed.
//
//   node scripts/encode-mannequin.mjs path/to/model.js public/3d/mannequin.bin
//
// Only `skin` and `shell` are stored. The default blouse is the shell cut by
// src/lib/studio/garment.js at load time, like any other neckline setting.
import { readFileSync, writeFileSync } from 'node:fs';
import { MeshoptEncoder } from 'meshoptimizer/encoder';

const NORMAL_BITS = 10;

const [src, out] = process.argv.slice(2);
if (!src || !out) throw new Error('Usage: node scripts/encode-mannequin.mjs <model.js> <out.bin>');
const text = readFileSync(src, 'utf8');
const model = JSON.parse(text.slice(text.indexOf('=') + 1).trim().replace(/;$/, ''));
await MeshoptEncoder.ready;

const decode = (b64, Type) => {
  const buf = Buffer.from(b64, 'base64');
  return new Type(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
};
const range = (arr, stride, j, count) => {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < count; i++) {
    const v = arr[i * stride + j];
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return [lo, hi];
};

const chunks = [];
let offset = 0;
/** Appends a 4-byte aligned chunk; returns [offset, length]. */
const push = (bytes) => {
  const at = offset;
  chunks.push(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length));
  offset += bytes.length;
  const pad = (4 - (offset % 4)) % 4;
  if (pad) {
    chunks.push(Buffer.alloc(pad));
    offset += pad;
  }
  return [at, bytes.length];
};

const meshes = {};
for (const name of ['skin', 'shell']) {
  const m = model[name];
  const pos = decode(m.position, Float32Array);
  const nor = decode(m.normal, Float32Array);
  const uv = decode(m.uv, Float32Array);
  const index = decode(m.index, Uint32Array);
  const count = pos.length / 3;

  // Vertex-cache order inside each group, keeping the original vertex ids.
  const ordered = new Uint32Array(index.length);
  for (const [start, len] of m.groups) {
    const part = index.slice(start, start + len);
    const [remap] = MeshoptEncoder.reorderMesh(part, true, false);
    const back = new Uint32Array(remap.length);
    remap.forEach((to, from) => {
      if (to !== 0xffffffff) back[to] = from;
    });
    for (let i = 0; i < len; i++) ordered[start + i] = back[part[i]];
  }

  // Vertices in order of first use.
  const remap = new Int32Array(count).fill(-1);
  const order = [];
  for (const i of ordered) if (remap[i] < 0) { remap[i] = order.length; order.push(i); }
  for (let i = 0; i < count; i++) if (remap[i] < 0) { remap[i] = order.length; order.push(i); }
  const newIndex = Uint32Array.from(ordered, (i) => remap[i]);

  const pRange = [0, 1, 2].map((j) => range(pos, 3, j, count));
  const uRange = [0, 1].map((j) => range(uv, 2, j, count));
  const q = (v, [lo, hi]) => Math.round(((v - lo) / (hi - lo || 1)) * 65535);
  const P = new Uint16Array(count * 4);
  const N = new Float32Array(count * 4);
  const U = new Uint16Array(count * 2);
  order.forEach((s, d) => {
    for (let j = 0; j < 3; j++) {
      P[d * 4 + j] = q(pos[s * 3 + j], pRange[j]);
      N[d * 4 + j] = nor[s * 3 + j];
    }
    for (let j = 0; j < 2; j++) U[d * 2 + j] = q(uv[s * 2 + j], uRange[j]);
  });
  const oct = MeshoptEncoder.encodeFilterOct(N, count, 8, NORMAL_BITS);

  meshes[name] = {
    vertices: count,
    indices: newIndex.length,
    groups: m.groups,
    position: { min: pRange.map((r) => r[0]), max: pRange.map((r) => r[1]), stream: push(MeshoptEncoder.encodeVertexBuffer(new Uint8Array(P.buffer), count, 8)) },
    normal: { stream: push(MeshoptEncoder.encodeVertexBuffer(oct, count, 8)) },
    uv: { min: uRange.map((r) => r[0]), max: uRange.map((r) => r[1]), stream: push(MeshoptEncoder.encodeVertexBuffer(new Uint8Array(U.buffer), count, 4)) },
    index: { stream: push(MeshoptEncoder.encodeIndexBuffer(new Uint8Array(newIndex.buffer), newIndex.length, 4)) },
  };
}

const header = Buffer.from(JSON.stringify({ format: 'paavai-mannequin', version: 1, meshes }));
const headerLength = Math.ceil(header.length / 4) * 4;
const prefix = Buffer.alloc(8);
prefix.writeUInt32LE(0x4d415650, 0); // "PVAM"
prefix.writeUInt32LE(headerLength, 4);
const file = Buffer.concat([prefix, header, Buffer.alloc(headerLength - header.length, 0x20), ...chunks]);
writeFileSync(out, file);
console.log(`${out}: ${(file.length / 1e6).toFixed(2)} MB`);

// Loads the compressed mannequin (public/3d/mannequin.bin, written by
// scripts/encode-mannequin.mjs) into three.js geometries with the same
// attributes and material groups as the Blouse Studio's model.js.
import * as THREE from 'three';
import { MeshoptDecoder } from 'meshoptimizer/decoder';

export const MANNEQUIN_URL = '/3d/mannequin.bin?v=1';

let cache = null;

/** Resolves to { skin, shell } BufferGeometries. Downloaded once per page. */
export function loadMannequin(url = MANNEQUIN_URL) {
  cache ??= (async () => {
    const [res] = await Promise.all([fetch(url), MeshoptDecoder.ready]);
    if (!res.ok) throw new Error(`The mannequin could not be downloaded (${res.status}).`);
    const buf = await res.arrayBuffer();
    const view = new DataView(buf);
    if (view.getUint32(0, true) !== 0x4d415650) throw new Error('The mannequin file is damaged.');
    const headerLength = view.getUint32(4, true);
    const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, headerLength)));
    const data = 8 + headerLength;
    const chunk = ([at, len]) => new Uint8Array(buf, data + at, len);

    const out = {};
    for (const [name, m] of Object.entries(header.meshes)) {
      const n = m.vertices;
      const p16 = new Uint8Array(n * 8);
      MeshoptDecoder.decodeVertexBuffer(p16, n, 8, chunk(m.position.stream));
      const nor16 = new Uint8Array(n * 8);
      MeshoptDecoder.decodeVertexBuffer(nor16, n, 8, chunk(m.normal.stream), 'OCTAHEDRAL');
      const uv16 = new Uint8Array(n * 4);
      MeshoptDecoder.decodeVertexBuffer(uv16, n, 4, chunk(m.uv.stream));
      const idx = new Uint8Array(m.indices * 4);
      MeshoptDecoder.decodeIndexBuffer(idx, m.indices, 4, chunk(m.index.stream));

      const P = new Uint16Array(p16.buffer);
      const N = new Int16Array(nor16.buffer);
      const U = new Uint16Array(uv16.buffer);
      const pos = new Float32Array(n * 3);
      const nor = new Float32Array(n * 3);
      const uv = new Float32Array(n * 2);
      const { min: pmin, max: pmax } = m.position;
      const { min: umin, max: umax } = m.uv;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < 3; j++) pos[i * 3 + j] = pmin[j] + (P[i * 4 + j] / 65535) * (pmax[j] - pmin[j]);
        const x = N[i * 4] / 32767;
        const y = N[i * 4 + 1] / 32767;
        const z = N[i * 4 + 2] / 32767;
        const len = Math.hypot(x, y, z) || 1;
        nor[i * 3] = x / len;
        nor[i * 3 + 1] = y / len;
        nor[i * 3 + 2] = z / len;
        for (let j = 0; j < 2; j++) uv[i * 2 + j] = umin[j] + (U[i * 2 + j] / 65535) * (umax[j] - umin[j]);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx.buffer), 1));
      for (const [start, count, material] of m.groups) g.addGroup(start, count, material);
      g.computeBoundingSphere();
      out[name] = g;
    }
    return out;
  })();
  cache.catch(() => (cache = null));
  return cache;
}

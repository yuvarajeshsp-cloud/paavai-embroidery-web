// Shows a design's saved 3D blouse (Blouse3D) on the Blouse Studio mannequin.
// Used by "View in 3D" on design pages; loaded on demand.
import { createStudio } from '../lib/studio/engine.js';
import { PART_KEYS, type Blouse3D } from '../lib/blouse3d';

export type Studio = Awaited<ReturnType<typeof createStudio>>;
export type View = 'front' | 'back' | 'right' | 'left';

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${url}`));
    img.src = url;
  });
}

/** Puts a saved configuration on the mannequin. `resolveUrl` maps stored image URLs (e.g. to a resized CDN copy). */
export async function applyBlouse3D(studio: Studio, cfg: Blouse3D, resolveUrl: (url: string) => string = (u) => u) {
  studio.setFabric(cfg.color);
  studio.setSize(cfg.size, 0);
  await Promise.all(
    PART_KEYS.map(async (key, i) => {
      const part = cfg.parts[key];
      if (!part) return studio.updatePanel(i, { image: null, edgeImage: null, dst: null, border: false });
      const [image, edgeImage] = await Promise.all([loadImage(resolveUrl(part.url)), part.edge_url ? loadImage(resolveUrl(part.edge_url)) : null]);
      studio.updatePanel(i, {
        image,
        edgeImage,
        dst: null,
        border: false,
        mode: part.mode,
        layout: part.layout,
        width: part.width,
        height: part.height,
        x: part.x,
        y: part.y,
        angle: part.angle,
      });
    }),
  );
}

export async function createViewer(container: HTMLElement, cfg: Blouse3D, opts: { autoRotate?: boolean; resolveUrl?: (url: string) => string } = {}) {
  const studio = await createStudio(container, { fabric: cfg.color, size: cfg.size, sampleBorder: false, autoRotate: opts.autoRotate ?? true });
  await applyBlouse3D(studio, cfg, opts.resolveUrl);
  return {
    studio,
    setColor: (hex: string) => studio.setFabric(hex),
    view: (v: View) => studio.view(v),
    dispose: () => studio.dispose(),
  };
}

export type Viewer = Awaited<ReturnType<typeof createViewer>>;

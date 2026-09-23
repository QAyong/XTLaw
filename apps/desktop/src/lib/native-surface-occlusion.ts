export type NativeSurfaceRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

const surfaces = new Map<string, NativeSurfaceRect>();
const listeners = new Set<() => void>();

export function getNativeSurfaceRects(): NativeSurfaceRect[] {
  return [...surfaces.values()];
}

export function subscribeNativeSurfaceRects(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setNativeSurfaceRect(
  id: string,
  rect: NativeSurfaceRect | null,
): void {
  if (rect) {
    const current = surfaces.get(id);
    if (
      current &&
      current.left === rect.left &&
      current.top === rect.top &&
      current.right === rect.right &&
      current.bottom === rect.bottom
    ) {
      return;
    }
    surfaces.set(id, rect);
  } else if (!surfaces.delete(id)) {
    return;
  }
  for (const listener of listeners) listener();
}

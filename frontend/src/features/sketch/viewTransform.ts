// ============================================================================
// VIEW TRANSFORM, with ROTATION
// ----------------------------------------------------------------------------
// A tech stands in the building and wants the plan on screen to face the way THEY
// are facing. So the canvas turns.
//
// The forward transform (scene -> screen), as an SVG transform string:
//
//   translate(cx cy) rotate(rot) translate(-cx -cy) translate(tx ty) scale(k)
//
// SVG applies these RIGHT TO LEFT, so a scene point p becomes:
//   1. scale:            k*p
//   2. translate(t):     k*p + t
//   3. translate(-c):    k*p + t - c
//   4. rotate(rot):      R(k*p + t - c)
//   5. translate(c):     R(k*p + t - c) + c
//
// The INVERSE is the part that matters. Every tap, drag, and drop is a screen point
// that has to become a scene point, and if the inverse does not un-rotate, every
// element lands somewhere the tech never put it. A rotation you can see but cannot
// tap on is worse than no rotation at all.
//
//   p = ( R(-rot) . (screen - c) + c - t ) / k
//
// Panning also has to be un-rotated: t is applied BEFORE the rotation, so a drag
// measured in screen pixels must be rotated by -rot before it is added to t.
// ============================================================================
export interface View { tx: number; ty: number; k: number; rot: number; }
export type P2 = [number, number];

const DEG = Math.PI / 180;

/** The SVG transform string for the content group. */
export function viewTransform(v: View, w: number, h: number): string {
  const cx = w / 2, cy = h / 2;
  return `translate(${cx} ${cy}) rotate(${v.rot}) translate(${-cx} ${-cy}) translate(${v.tx} ${v.ty}) scale(${v.k})`;
}

/** screen (svg viewport) point -> scene point. The exact inverse of the above. */
export function screenToScene([sx, sy]: P2, v: View, w: number, h: number): P2 {
  const cx = w / 2, cy = h / 2;
  const a = -v.rot * DEG, cos = Math.cos(a), sin = Math.sin(a);
  const dx = sx - cx, dy = sy - cy;
  const rx = cx + dx * cos - dy * sin;
  const ry = cy + dx * sin + dy * cos;
  return [(rx - v.tx) / v.k, (ry - v.ty) / v.k];
}

/** scene point -> screen point. Used for hit-testing UI drawn in screen space. */
export function sceneToScreen([px, py]: P2, v: View, w: number, h: number): P2 {
  const cx = w / 2, cy = h / 2;
  const a = v.rot * DEG, cos = Math.cos(a), sin = Math.sin(a);
  const x = v.k * px + v.tx - cx, y = v.k * py + v.ty - cy;
  return [cx + x * cos - y * sin, cy + x * sin + y * cos];
}

/**
 * A pan measured in SCREEN pixels, converted to a change in tx/ty. Because t is
 * applied before the rotation, the delta must be rotated by -rot or the plan slides
 * sideways when you drag down.
 */
export function panDelta([dx, dy]: P2, v: View): P2 {
  const a = -v.rot * DEG, cos = Math.cos(a), sin = Math.sin(a);
  return [dx * cos - dy * sin, dx * sin + dy * cos];
}

/** Keep rotation in 0..359 so the compass readout never shows -90 or 450. */
export const normRot = (r: number) => ((r % 360) + 360) % 360;
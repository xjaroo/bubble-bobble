export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t)    { return a + (b - a) * t; }
export function sign(v)          { return v < 0 ? -1 : v > 0 ? 1 : 0; }
export function randInt(lo, hi)  { return Math.floor(Math.random() * (hi - lo + 1)) + lo; }
export function rand(lo, hi)     { return Math.random() * (hi - lo) + lo; }

/** Axis-aligned bounding-box overlap test. */
export function aabbOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx &&
           ay < by + bh && ay + ah > by;
}

/** Distance squared (avoids sqrt). */
export function dist2(ax, ay, bx, by) {
    const dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
}

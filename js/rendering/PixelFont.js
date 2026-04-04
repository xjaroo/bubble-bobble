/**
 * GameFont — canvas text renderer using web retro fonts.
 * Falls back to monospace if the font hasn't loaded yet.
 *
 * API mirrors the old bitmap font so callers don't change:
 *   drawText(ctx, str, x, y, scale, color)
 *   drawTextCentered(ctx, str, cx, y, scale, color)
 *   drawGlowText(ctx, str, cx, y, scale, color, glowColor)   ← new: neon glow
 *   textWidth(str, scale)
 *
 * Scale → font size mapping:
 *   scale 1  →  6 px  (HUD labels, controls)
 *   scale 2  → 10 px  (scores, item text)
 *   scale 3  → 14 px  (round banners)
 *   scale 4  → 18 px  (big titles)
 *   scale 5  → 24 px  (hero title)
 */

const FONT  = '"Orbitron", "Rajdhani", "Silkscreen", "Press Start 2P", monospace';
const SCALE_TO_PX = [0, 6, 10, 14, 18, 24];

// Offscreen canvas for text measurement (avoids polluting the main ctx state)
const _mc  = document.createElement('canvas').getContext('2d');

function _px(scale) {
    if (Number.isInteger(scale) && scale >= 1 && scale < SCALE_TO_PX.length) {
        return SCALE_TO_PX[scale];
    }
    return Math.max(6, Math.round(scale * 4 + 2));
}

function _setFont(ctx, scale) {
    ctx.font         = `700 ${_px(scale)}px ${FONT}`;
    ctx.fontKerning  = 'none';
    ctx.textBaseline = 'top';
}

// ── Core draw ─────────────────────────────────────────────────────────────────

/**
 * Draw text left-aligned at (x, y).
 */
export function drawText(ctx, str, x, y, scale = 2, color = '#FFFFFF') {
    ctx.save();
    _setFont(ctx, scale);
    ctx.fillStyle = color;
    ctx.fillText(str, Math.round(x), Math.round(y));
    ctx.restore();
}

/**
 * Draw text horizontally centred at canvas x = cx.
 */
export function drawTextCentered(ctx, str, cx, y, scale = 2, color = '#FFFFFF') {
    ctx.save();
    _setFont(ctx, scale);
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.fillText(str, Math.round(cx), Math.round(y));
    ctx.restore();
}

/**
 * Neon glow text — draws a soft coloured halo then sharp text on top.
 * Perfect for titles and score highlights in modern game UIs.
 */
export function drawGlowText(ctx, str, cx, y, scale, color, glowColor = color) {
    ctx.save();
    _setFont(ctx, scale);
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'top';

    // Outer glow (large blur, semi-transparent)
    ctx.shadowColor  = glowColor;
    ctx.shadowBlur   = _px(scale) * 2.5;
    ctx.fillStyle    = glowColor;
    ctx.globalAlpha  = 0.45;
    ctx.fillText(str, Math.round(cx), Math.round(y));

    // Inner glow (tighter blur)
    ctx.shadowBlur  = _px(scale) * 0.9;
    ctx.globalAlpha = 0.7;
    ctx.fillText(str, Math.round(cx), Math.round(y));

    // Crisp top layer
    ctx.shadowBlur  = 0;
    ctx.globalAlpha = 1;
    ctx.fillStyle   = color;
    ctx.fillText(str, Math.round(cx), Math.round(y));

    ctx.restore();
}

/**
 * Drop-shadow text — sharp foreground text with a dark offset shadow.
 * Great for HUD numbers (readable over any background).
 */
export function drawShadowText(ctx, str, x, y, scale, color, shadowColor = 'rgba(0,0,0,0.8)') {
    ctx.save();
    _setFont(ctx, scale);
    ctx.textBaseline = 'top';

    const off = Math.max(1, Math.round(_px(scale) * 0.18));
    ctx.fillStyle = shadowColor;
    ctx.fillText(str, Math.round(x) + off, Math.round(y) + off);

    ctx.fillStyle = color;
    ctx.fillText(str, Math.round(x), Math.round(y));
    ctx.restore();
}

export function drawShadowTextCentered(ctx, str, cx, y, scale, color, shadowColor = 'rgba(0,0,0,0.8)') {
    ctx.save();
    _setFont(ctx, scale);
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'top';

    const off = Math.max(1, Math.round(_px(scale) * 0.18));
    ctx.fillStyle = shadowColor;
    ctx.fillText(str, Math.round(cx) + off, Math.round(y) + off);

    ctx.fillStyle = color;
    ctx.fillText(str, Math.round(cx), Math.round(y));
    ctx.restore();
}

// ── Measurement ───────────────────────────────────────────────────────────────

/**
 * Returns the rendered pixel width of a string at the given scale.
 * Uses an offscreen canvas so no side-effects on the main ctx.
 */
export function textWidth(str, scale = 2) {
    _mc.font = `700 ${_px(scale)}px ${FONT}`;
    return _mc.measureText(str).width;
}

/**
 * Returns the approximate line height (cap-height + descent) for a scale.
 */
export function textHeight(scale = 2) { return _px(scale) + 2; }

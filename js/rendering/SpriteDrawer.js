/**
 * High-fidelity procedural sprites (no image files).
 * Hitboxes stay unchanged; only presentation is upgraded.
 */
import { drawText, drawTextCentered, textWidth } from './PixelFont.js';
import { STATIC_CHARACTER_VISUALS, NO_FLICKER_MODE } from '../constants.js';
import { formatScore } from '../utils/NumberFormat.js';

function roundedRect(ctx, x, y, w, h, r) {
    const rr = Math.max(0, Math.min(r, Math.min(w, h) * 0.5));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
}

function circleGlow(ctx, x, y, r, color, blur = 8, alpha = 0.65) {
    if (NO_FLICKER_MODE) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function pupilX(frame, angry) {
    if (NO_FLICKER_MODE) return 0;
    const amp = angry ? 0.24 : 0.08;
    return Math.sin(frame * 0.65) * amp;
}

/**
 * Cute dragon palettes.
 * P1: sky blue dragon, P2: mint green dragon.
 */
const PLAYER_COLORS = [
    {
        body: '#8EDCFF',
        bodyDeep: '#6BC4EF',
        outline: '#0F1A28',
        belly: '#FFFFFF',
        plate: '#E6FBFF',
        plateStroke: '#2C6A86',
        wing: '#F2FEFF',
        wingDeep: '#CFF4FF',
        wingGlow: '#D9FFFF',
        cheekMark: '#FFD2DE',
        pad: '#F6B3C8',
        mouthDark: '#1A2734',
        tail: '#79CCF6',
    },
    {
        body: '#B3F297',
        bodyDeep: '#8CDD72',
        outline: '#0F1A28',
        belly: '#FFFFFF',
        plate: '#EDFFD9',
        plateStroke: '#2F6D42',
        wing: '#F7FFE9',
        wingDeep: '#DDFFCA',
        wingGlow: '#F1FFE1',
        cheekMark: '#FFD2DE',
        pad: '#F6B3C8',
        mouthDark: '#1D2E19',
        tail: '#9AE882',
    },
];

/** Rounded fin / scale plate along the back (teal) */
function drawDorsalPlate(ctx, cx, cy, w, h, fill, stroke, lw) {
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.5, cy + h * 0.35);
    ctx.quadraticCurveTo(cx - w * 0.15, cy - h * 0.55, cx, cy - h * 0.62);
    ctx.quadraticCurveTo(cx + w * 0.15, cy - h * 0.55, cx + w * 0.5, cy + h * 0.35);
    ctx.quadraticCurveTo(cx, cy + h * 0.12, cx - w * 0.5, cy + h * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
}

function drawDragonWing(ctx, C, x, y, flap, scale = 1, alpha = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, 1);
    ctx.rotate(-0.28 + flap);
    ctx.globalAlpha = alpha;

    const wingGrad = ctx.createLinearGradient(0, -3.6, 4.2, 2.6);
    wingGrad.addColorStop(0, C.wing);
    wingGrad.addColorStop(1, C.wingDeep);
    ctx.fillStyle = wingGrad;
    ctx.beginPath();
    ctx.moveTo(-0.2, 0.8);
    ctx.quadraticCurveTo(0.5, -1.9, 2.2, -3.7);
    ctx.quadraticCurveTo(4.0, -2.4, 3.9, -0.1);
    ctx.quadraticCurveTo(3.2, 1.5, 1.4, 1.55);
    ctx.quadraticCurveTo(0.45, 1.45, -0.2, 0.8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 0.68;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 0.36;
    ctx.beginPath();
    ctx.moveTo(0.55, 0.75);
    ctx.lineTo(1.35, -1.75);
    ctx.moveTo(1.1, 1.05);
    ctx.lineTo(2.45, -0.95);
    ctx.moveTo(1.85, 1.25);
    ctx.lineTo(3.05, 0.15);
    ctx.stroke();

    circleGlow(ctx, 2.2, -1.2, 1.35, C.wingGlow, 6, 0.13);
    ctx.restore();
}

function drawPlayerFoot(ctx, C, outlineW, fx, fy, lift) {
    ctx.fillStyle = C.bodyDeep;
    roundedRect(ctx, fx, fy + lift, 1.9, 0.92, 0.45);
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = outlineW;
    roundedRect(ctx, fx, fy + lift, 1.9, 0.92, 0.45);
    ctx.stroke();
    ctx.fillStyle = C.pad;
    roundedRect(ctx, fx + 0.22, fy + 0.45 + lift, 1.35, 0.34, 0.17);
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 0.45;
    roundedRect(ctx, fx + 0.22, fy + 0.45 + lift, 1.35, 0.34, 0.17);
    ctx.stroke();
}

export function drawPlayer(
    ctx, x, y, playerId, frame, facingRight, isJumping, isDead,
    animPhase = frame * (Math.PI * 0.5), tailPhase = animPhase,
    idleBob = 0, idleCalm = false
) {
    if (STATIC_CHARACTER_VISUALS) {
        frame = 0;
        isJumping = false;
        animPhase = 0;
        tailPhase = 0;
        idleBob = 0;
        idleCalm = true;
    }
    const C = PLAYER_COLORS[playerId] || PLAYER_COLORS[0];
    const motionOn = !STATIC_CHARACTER_VISUALS;
    const walk = (motionOn && !isJumping) ? Math.sin(animPhase * 0.42) : 0;
    const bodyLift = (motionOn && isJumping ? -0.2 : 0) + (motionOn ? idleBob : 0);
    const tailAmp = idleCalm ? 0.028 : 0.055;
    const tailSwing = motionOn
        ? ((isJumping ? -0.06 : 0) + Math.sin(tailPhase) * tailAmp)
        : 0;
    const wingFlap = motionOn
        ? ((isJumping ? -0.02 : 0.008) + Math.sin(animPhase * 0.28 + 0.8) * 0.045)
        : 0;
    const footLiftA = motionOn ? (isJumping ? -0.15 : Math.max(0, walk) * 0.07) : 0;
    const footLiftB = motionOn ? (isJumping ? -0.15 : Math.max(0, -walk) * 0.07) : 0;
    const handLift = motionOn ? (isJumping ? -0.05 : walk * 0.02) : 0;
    const ol = 1.0;

    ctx.save();
    // Snap both axes to pixel grid to avoid visible shimmer on movement.
    ctx.translate(Math.round(x + 7), Math.round(y + 7 + bodyLift));
    if (!facingRight) ctx.scale(-1, 1);

    if (isDead) {
        ctx.rotate(-0.28);
        ctx.globalAlpha = 0.55;
    }

    // Ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(-0.4, 7.0, 5.0, 1.25, 0, 0, Math.PI * 2);
    ctx.fill();

    // Dragon tail
    ctx.save();
    ctx.translate(-4.5, 2.95);
    ctx.rotate(-0.4 + tailSwing);
    const tailGrad = ctx.createLinearGradient(-3.1, -1.0, 0.9, 2.7);
    tailGrad.addColorStop(0, C.body);
    tailGrad.addColorStop(1, C.tail);
    ctx.fillStyle = tailGrad;
    ctx.beginPath();
    ctx.moveTo(-2.8, 1.0);
    ctx.quadraticCurveTo(-1.4, -1.0, 0.45, -0.45);
    ctx.quadraticCurveTo(0.1, 0.65, -1.05, 1.9);
    ctx.quadraticCurveTo(-2.2, 2.05, -2.8, 1.0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 0.8;
    ctx.stroke();
    drawDorsalPlate(ctx, -1.35, -0.2, 1.9, 1.35, C.plate, C.outline, 0.78);
    ctx.restore();

    // Bright wings behind body
    drawDragonWing(ctx, C, -1.95, 1.05, wingFlap * 0.75, -1, 0.72);
    drawDragonWing(ctx, C, -0.7, 0.85, wingFlap, 1, 0.95);

    // Body
    const bodyGrad = ctx.createLinearGradient(0, -1.2, 0, 6.8);
    bodyGrad.addColorStop(0, C.body);
    bodyGrad.addColorStop(1, C.bodyDeep);
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.ellipse(-0.9, 2.45, 3.2, 2.75, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = ol;
    ctx.stroke();

    // Head
    const headGrad = ctx.createLinearGradient(0, -6, 0, 2);
    headGrad.addColorStop(0, C.body);
    headGrad.addColorStop(1, C.bodyDeep);
    ctx.fillStyle = headGrad;
    ctx.beginPath();
    ctx.ellipse(2.95, -1.3, 3.5, 3.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = ol;
    ctx.stroke();

    // Horns
    ctx.fillStyle = C.plate;
    ctx.beginPath();
    ctx.moveTo(1.35, -3.45);
    ctx.lineTo(1.9, -4.8);
    ctx.lineTo(2.45, -3.5);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(3.5, -3.55);
    ctx.lineTo(3.95, -4.75);
    ctx.lineTo(4.45, -3.6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 0.72;
    ctx.stroke();

    // Snout
    ctx.fillStyle = C.body;
    roundedRect(ctx, 3.95, -0.3, 2.45, 1.82, 0.84);
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 0.72;
    roundedRect(ctx, 3.95, -0.3, 2.45, 1.82, 0.84);
    ctx.stroke();

    // Dorsal spikes
    drawDorsalPlate(ctx, -0.7, -4.05, 1.65, 1.25, C.plate, C.plateStroke || C.outline, 0.78);
    drawDorsalPlate(ctx, -1.95, -2.9, 1.72, 1.35, C.plate, C.plateStroke || C.outline, 0.78);
    drawDorsalPlate(ctx, -3.05, -1.5, 1.65, 1.25, C.plate, C.plateStroke || C.outline, 0.78);

    // Belly
    ctx.fillStyle = C.belly;
    ctx.beginPath();
    ctx.ellipse(1.1, 2.75, 1.95, 1.62, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 0.58;
    ctx.stroke();

    // Eyes
    const eyeY = -1.62;
    const eyeXL = 3.0;
    const eyeXR = 5.05;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.ellipse(eyeXL, eyeY, 0.75, 1.1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(eyeXR, eyeY, 0.75, 1.1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 0.72;
    ctx.beginPath(); ctx.ellipse(eyeXL, eyeY, 0.75, 1.1, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(eyeXR, eyeY, 0.75, 1.1, 0, 0, Math.PI * 2); ctx.stroke();

    ctx.fillStyle = C.outline;
    ctx.beginPath(); ctx.ellipse(eyeXL + 0.1, eyeY + 0.06, 0.28, 0.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(eyeXR + 0.1, eyeY + 0.06, 0.28, 0.5, 0, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.arc(eyeXL - 0.12, eyeY - 0.3, 0.1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(eyeXR - 0.12, eyeY - 0.3, 0.1, 0, Math.PI * 2); ctx.fill();

    // Mouth
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 0.55;
    ctx.beginPath();
    ctx.moveTo(4.85, 0.98);
    ctx.quadraticCurveTo(5.35, 1.28, 5.95, 0.98);
    ctx.stroke();

    // Nostrils
    ctx.fillStyle = C.outline;
    ctx.beginPath();
    ctx.arc(6.05, 0.46, 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(5.66, 0.5, 0.11, 0, Math.PI * 2);
    ctx.fill();

    // Front arm
    ctx.fillStyle = C.body;
    roundedRect(ctx, 1.9, 2.22 + handLift, 0.82, 0.54, 0.26);
    ctx.fill();
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 0.6;
    roundedRect(ctx, 1.9, 2.22 + handLift, 0.82, 0.54, 0.26);
    ctx.stroke();

    // Arm pad
    ctx.fillStyle = C.pad;
    roundedRect(ctx, 2.1, 2.52 + handLift, 0.56, 0.26, 0.12);
    ctx.fill();

    // Feet
    drawPlayerFoot(ctx, C, ol, -2.5, 5.62, footLiftA);
    drawPlayerFoot(ctx, C, ol, -0.46, 5.62, footLiftB);

    ctx.restore();
}

export function drawBubble(ctx, x, y, wobble, hasEnemy, state, popFrame) {
    const cx = x + 6;
    const cy = y + 6;
    const r = 5.85;

    if (state === 'popping') {
        const t = Math.min(1, popFrame / 8);
        const inv = 1 - t;
        const base = hasEnemy ? '255,130,95' : '128,222,255';
        const burstR = r * (0.56 + t * 0.76);

        ctx.save();

        // Core collapse flash
        ctx.fillStyle = `rgba(${base},${0.30 * inv})`;
        ctx.beginPath();
        ctx.arc(cx, cy, burstR, 0, Math.PI * 2);
        ctx.fill();

        // Main ring
        ctx.lineWidth = 1.5 + inv * 0.6;
        ctx.strokeStyle = `rgba(${base},${0.95 * inv})`;
        ctx.beginPath();
        ctx.arc(cx, cy, r + t * 3.1, wobble - 0.2, wobble + 5.9);
        ctx.stroke();

        // Secondary ring
        ctx.lineWidth = 1.1;
        ctx.strokeStyle = `rgba(255,255,255,${0.75 * inv})`;
        ctx.beginPath();
        ctx.arc(cx, cy, r + t * 1.9, wobble + 0.4, wobble + 4.7);
        ctx.stroke();

        // Bubble shards
        const shards = 7;
        for (let i = 0; i < shards; i++) {
            const a = wobble + i * (Math.PI * 2 / shards);
            const dist = 1.4 + t * (3.6 + (i % 2) * 0.7);
            const sx = cx + Math.cos(a) * dist;
            const sy = cy + Math.sin(a) * dist - t * 0.7;
            const sr = 0.25 + inv * 0.75;
            ctx.fillStyle = `rgba(235,250,255,${0.82 * inv})`;
            ctx.beginPath();
            ctx.arc(sx, sy, sr, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
        return;
    }

    const palette = hasEnemy
        ? { rim: '#FF8A70', inner0: 'rgba(255,145,120,0.45)', inner1: 'rgba(255,90,70,0.12)', glow: '#FF8A70' }
        : { rim: '#9FE9FF', inner0: 'rgba(178,243,255,0.50)', inner1: 'rgba(120,200,255,0.14)', glow: '#8ADFFF' };

    ctx.save();

    circleGlow(ctx, cx, cy, 5.2, palette.glow, 10, 0.16);

    const fill = ctx.createRadialGradient(cx - 2.0, cy - 2.8, 0.5, cx, cy, r + 0.8);
    fill.addColorStop(0, palette.inner0);
    fill.addColorStop(0.65, palette.inner1);
    fill.addColorStop(1, 'rgba(255,255,255,0.02)');
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = palette.rim;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,0.86)';
    ctx.lineWidth = 1.05;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 1.45, wobble + 0.45, wobble + 1.52);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.arc(cx - 2.0, cy - 2.2, 0.9, 0, Math.PI * 2);
    ctx.fill();

    if (hasEnemy) {
        const pulse = NO_FLICKER_MODE ? 0.65 : (0.65 + Math.sin(wobble * 2.5) * 0.2);
        ctx.fillStyle = `rgba(255,74,74,${0.5 + pulse * 0.25})`;
        ctx.beginPath();
        ctx.arc(cx, cy, 2.4 + pulse * 0.25, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

export function drawZenChan(ctx, x, y, frame, angry, trapped) {
    if (STATIC_CHARACTER_VISUALS) frame = 0;
    const px = x;
    const py = y;
    const top = angry ? '#FF8966' : '#FFBA56';
    const bottom = angry ? '#FF3419' : '#FF7A1C';
    const outline = angry ? '#8D1409' : '#8B4B10';

    ctx.save();
    ctx.translate(px, py);

    // Ground contact shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    roundedRect(ctx, 1.6, 11.4, 10.8, 2.2, 1.0);
    ctx.fill();

    const grad = ctx.createLinearGradient(0, 0.2, 0, 12.5);
    grad.addColorStop(0, top);
    grad.addColorStop(1, bottom);
    ctx.fillStyle = grad;
    roundedRect(ctx, 1.1, 1.0, 11.8, 11.3, 2.7);
    ctx.fill();

    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.0;
    roundedRect(ctx, 1.1, 1.0, 11.8, 11.3, 2.7);
    ctx.stroke();

    const p = pupilX(frame, angry);

    ctx.fillStyle = '#FFFFFF';
    roundedRect(ctx, 3.0, 3.1, 3.4, 2.9, 0.9); ctx.fill();
    roundedRect(ctx, 7.6, 3.1, 3.4, 2.9, 0.9); ctx.fill();

    ctx.fillStyle = angry ? '#FFEC66' : '#1D1D1D';
    roundedRect(ctx, 4.2 + p, 4.0, 1.45, 1.55, 0.4); ctx.fill();
    roundedRect(ctx, 8.8 + p, 4.0, 1.45, 1.55, 0.4); ctx.fill();

    // Mouth
    ctx.strokeStyle = angry ? '#5B0500' : '#733500';
    ctx.lineWidth = 0.95;
    ctx.beginPath();
    ctx.moveTo(4.2, 8.5);
    ctx.quadraticCurveTo(7.0, 9.4, 9.9, 8.4);
    ctx.stroke();

    // Feet wobble
    const step = 0;
    ctx.fillStyle = outline;
    roundedRect(ctx, 2.3, 11.4 + step, 2.7, 2.4, 0.8); ctx.fill();
    roundedRect(ctx, 9.1, 11.2 - step, 2.7, 2.6, 0.8); ctx.fill();

    if (trapped) {
        ctx.strokeStyle = 'rgba(220,240,255,0.7)';
        ctx.lineWidth = 0.8;
        roundedRect(ctx, 0.7, 0.7, 12.6, 12.1, 3.0);
        ctx.stroke();
    }

    ctx.restore();
}

export function drawMighta(ctx, x, y, frame, angry) {
    if (STATIC_CHARACTER_VISUALS) frame = 0;
    const px = x;
    const py = y;
    const hoodTop = angry ? '#FFB4B4' : '#FAFAFA';
    const hoodBottom = angry ? '#FF7070' : '#D4D4D4';
    const hem = angry ? '#B62B2B' : '#8E8E8E';

    ctx.save();
    ctx.translate(px, py);

    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    roundedRect(ctx, 1.8, 11.3, 10.4, 2.3, 1.1);
    ctx.fill();

    const robe = ctx.createLinearGradient(0, 0, 0, 13.0);
    robe.addColorStop(0, hoodTop);
    robe.addColorStop(1, hoodBottom);
    ctx.fillStyle = robe;
    roundedRect(ctx, 2.1, 0.6, 9.8, 12.0, 3.0);
    ctx.fill();

    ctx.strokeStyle = hem;
    ctx.lineWidth = 1;
    roundedRect(ctx, 2.1, 0.6, 9.8, 12.0, 3.0);
    ctx.stroke();

    // Hood opening
    ctx.fillStyle = 'rgba(20,20,20,0.75)';
    roundedRect(ctx, 3.5, 2.0, 7.0, 4.7, 2.0);
    ctx.fill();

    const p = pupilX(frame, angry);
    ctx.fillStyle = '#FFFFFF';
    roundedRect(ctx, 4.0, 3.1, 2.2, 2.0, 0.6); ctx.fill();
    roundedRect(ctx, 7.7, 3.1, 2.2, 2.0, 0.6); ctx.fill();

    ctx.fillStyle = angry ? '#FF2D2D' : '#E02020';
    roundedRect(ctx, 4.8 + p * 0.7, 3.7, 0.9, 1.0, 0.3); ctx.fill();
    roundedRect(ctx, 8.5 + p * 0.7, 3.7, 0.9, 1.0, 0.3); ctx.fill();

    const wave = 0;
    ctx.fillStyle = hem;
    roundedRect(ctx, 2.3, 11.2 + wave, 2.4, 2.5, 0.7); ctx.fill();
    roundedRect(ctx, 5.8, 11.0 - wave, 2.4, 2.7, 0.7); ctx.fill();
    roundedRect(ctx, 9.3, 11.2 + wave, 2.4, 2.5, 0.7); ctx.fill();

    ctx.restore();
}

export function drawMonsta(ctx, x, y, frame, angry) {
    if (STATIC_CHARACTER_VISUALS) frame = 0;
    const px = x;
    const py = y;
    const top = angry ? '#FF8DFF' : '#C46CFF';
    const bottom = angry ? '#D130D8' : '#7225B3';
    const outline = angry ? '#7D0D88' : '#3B0F67';

    ctx.save();
    ctx.translate(px, py);

    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    roundedRect(ctx, 1.4, 11.5, 11.2, 2.1, 1.0);
    ctx.fill();

    const body = ctx.createRadialGradient(6.8, 4.3, 1.0, 7.0, 7.0, 7.2);
    body.addColorStop(0, top);
    body.addColorStop(1, bottom);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(7, 7, 5.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.arc(7, 7, 5.8, 0, Math.PI * 2);
    ctx.stroke();

    const p = pupilX(frame, angry);
    ctx.fillStyle = '#FFFFFF';
    roundedRect(ctx, 3.0, 4.0, 3.0, 2.8, 0.9); ctx.fill();
    roundedRect(ctx, 8.0, 4.0, 3.0, 2.8, 0.9); ctx.fill();

    ctx.fillStyle = angry ? '#FF2A2A' : '#151515';
    roundedRect(ctx, 4.1 + p, 4.9, 1.3, 1.4, 0.4); ctx.fill();
    roundedRect(ctx, 9.1 + p, 4.9, 1.3, 1.4, 0.4); ctx.fill();

    // Mouth + teeth
    ctx.fillStyle = 'rgba(25,10,35,0.75)';
    roundedRect(ctx, 4.1, 8.7, 5.8, 2.4, 0.7); ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    roundedRect(ctx, 4.6, 8.8, 1.0, 1.5, 0.3); ctx.fill();
    roundedRect(ctx, 6.8, 8.8, 1.0, 1.5, 0.3); ctx.fill();
    roundedRect(ctx, 8.9, 8.8, 1.0, 1.5, 0.3); ctx.fill();

    ctx.restore();
}

export function drawBaron(ctx, x, y, frame) {
    const px = x;
    const py = y;
    const bob = 0;

    ctx.save();
    ctx.translate(px, py + bob);

    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    roundedRect(ctx, 1.2, 10.9, 12.3, 2.3, 1.0);
    ctx.fill();

    circleGlow(ctx, 7, 6.8, 5.6, '#C0EEFF', 9, 0.12);

    const skull = ctx.createLinearGradient(0, 1, 0, 12.5);
    skull.addColorStop(0, '#FFFFFF');
    skull.addColorStop(1, '#C8D6E4');
    ctx.fillStyle = skull;
    roundedRect(ctx, 1.3, 1.3, 12.0, 10.8, 3.2);
    ctx.fill();

    ctx.strokeStyle = '#8EA0B2';
    ctx.lineWidth = 1;
    roundedRect(ctx, 1.3, 1.3, 12.0, 10.8, 3.2);
    ctx.stroke();

    // Eye sockets
    ctx.fillStyle = '#101018';
    roundedRect(ctx, 3.0, 3.7, 3.4, 2.8, 0.8); ctx.fill();
    roundedRect(ctx, 9.0, 3.7, 3.4, 2.8, 0.8); ctx.fill();

    ctx.fillStyle = '#B267FF';
    roundedRect(ctx, 4.2, 4.5, 1.0, 1.0, 0.3); ctx.fill();

    // Jaw
    ctx.fillStyle = '#A7B7C7';
    roundedRect(ctx, 3.0, 8.2, 8.5, 2.9, 0.8);
    ctx.fill();

    ctx.strokeStyle = 'rgba(20,30,45,0.55)';
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 4; i++) {
        const tx = 4.0 + i * 1.8;
        ctx.beginPath();
        ctx.moveTo(tx, 8.5);
        ctx.lineTo(tx, 10.9);
        ctx.stroke();
    }

    // Fins
    ctx.fillStyle = '#9AA9B9';
    roundedRect(ctx, 0.3, 5.1, 2.2, 4.1, 0.7); ctx.fill();
    roundedRect(ctx, 12.4, 5.2, 2.5, 3.8, 0.7); ctx.fill();

    ctx.restore();
}

const ITEM_COLORS = {
    candy:  ['#FF5D7D', '#FFC3D2'],
    ring:   ['#F7B500', '#FFF08A'],
    gem:    ['#44E7FF', '#E9FBFF'],
    shoe:   ['#9A542B', '#E6A574'],
    extend: ['#C157FF', '#FF9BFF'],
    potion: ['#35B4FF', '#95EAFF'],
    umbrella: ['#4EC7FF', '#D9F7FF'],
    cake: ['#FF8FB0', '#FFE8F0'],
};

const EXTEND_CHARS = 'EXTEND';

function drawFoodStrawberry(ctx, px, py) {
    circleGlow(ctx, px + 5, py + 6, 3.6, '#FF7FA5', 6, 0.12);
    ctx.fillStyle = '#34A853';
    ctx.beginPath();
    ctx.moveTo(px + 3.3, py + 2.4);
    ctx.lineTo(px + 5.0, py + 1.2);
    ctx.lineTo(px + 6.7, py + 2.4);
    ctx.lineTo(px + 5.0, py + 2.9);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#FF4E76';
    ctx.beginPath();
    ctx.moveTo(px + 2.2, py + 3.1);
    ctx.quadraticCurveTo(px + 5.0, py + 1.9, px + 7.8, py + 3.1);
    ctx.quadraticCurveTo(px + 7.1, py + 7.8, px + 5.0, py + 8.7);
    ctx.quadraticCurveTo(px + 2.9, py + 7.8, px + 2.2, py + 3.1);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(135,24,51,0.55)';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    ctx.fillStyle = '#FFE07A';
    ctx.fillRect(px + 4.2, py + 4.2, 1, 1);
    ctx.fillRect(px + 3.4, py + 5.6, 1, 1);
    ctx.fillRect(px + 5.3, py + 5.8, 1, 1);
}

function drawFoodGrape(ctx, px, py) {
    circleGlow(ctx, px + 5, py + 6, 3.8, '#B57DFF', 6, 0.12);
    ctx.fillStyle = '#3FA65A';
    ctx.fillRect(px + 4.6, py + 1.3, 1.0, 1.6);

    ctx.fillStyle = '#8A4BEE';
    const pts = [[4,3.3],[6,3.3],[3.2,5.0],[5,5.0],[6.8,5.0],[4,6.7],[6,6.7]];
    for (const p of pts) {
        ctx.beginPath();
        ctx.arc(px + p[0], py + p[1], 1.35, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.arc(px + 4.5, py + 4.3, 0.6, 0, Math.PI * 2);
    ctx.fill();
}

function drawFoodApple(ctx, px, py) {
    circleGlow(ctx, px + 5, py + 5.6, 3.8, '#FF8E7D', 6, 0.12);
    ctx.fillStyle = '#E63F36';
    ctx.beginPath();
    ctx.arc(px + 5, py + 5.9, 3.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,20,18,0.55)';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    ctx.fillStyle = '#6E3D20';
    ctx.fillRect(px + 4.8, py + 1.7, 0.8, 1.6);
    ctx.fillStyle = '#56B457';
    ctx.beginPath();
    ctx.ellipse(px + 6.5, py + 2.3, 1.4, 0.8, -0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(px + 3.8, py + 4.9, 0.75, 0, Math.PI * 2);
    ctx.fill();
}

function drawFoodBanana(ctx, px, py) {
    circleGlow(ctx, px + 5, py + 6, 3.4, '#FFE787', 6, 0.1);
    ctx.save();
    ctx.translate(px + 5, py + 5.6);
    ctx.rotate(-0.38);
    ctx.fillStyle = '#FFD95B';
    roundedRect(ctx, -3.6, -1.1, 7.2, 2.2, 1.05);
    ctx.fill();
    ctx.strokeStyle = 'rgba(140,110,26,0.55)';
    ctx.lineWidth = 0.75;
    roundedRect(ctx, -3.6, -1.1, 7.2, 2.2, 1.05);
    ctx.stroke();
    ctx.fillStyle = '#8F6B21';
    ctx.fillRect(2.8, -0.3, 0.8, 0.6);
    ctx.restore();
}

function drawFoodCherry(ctx, px, py) {
    circleGlow(ctx, px + 5, py + 6, 3.5, '#FF7DA2', 6, 0.1);
    ctx.strokeStyle = '#5E8E34';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(px + 4.0, py + 3.2);
    ctx.quadraticCurveTo(px + 4.6, py + 1.6, px + 5.0, py + 1.4);
    ctx.moveTo(px + 6.1, py + 3.2);
    ctx.quadraticCurveTo(px + 5.8, py + 1.7, px + 5.0, py + 1.4);
    ctx.stroke();
    ctx.fillStyle = '#E3385A';
    ctx.beginPath(); ctx.arc(px + 3.8, py + 5.6, 1.9, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(px + 6.2, py + 5.6, 1.9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.arc(px + 3.2, py + 5.0, 0.45, 0, Math.PI * 2); ctx.fill();
}

function drawCandyFruit(ctx, px, py, kind) {
    switch (kind) {
        case 'strawberry': drawFoodStrawberry(ctx, px, py); break;
        case 'grape':      drawFoodGrape(ctx, px, py); break;
        case 'apple':      drawFoodApple(ctx, px, py); break;
        case 'banana':     drawFoodBanana(ctx, px, py); break;
        case 'cherry':     drawFoodCherry(ctx, px, py); break;
        default:           drawFoodStrawberry(ctx, px, py); break;
    }
}

export function drawItem(ctx, x, y, type, extendIndex, foodKind = 'strawberry') {
    const px = Math.round(x);
    const py = Math.round(y);
    const [c1, c2] = ITEM_COLORS[type] || ITEM_COLORS.candy;

    if (type === 'umbrella') {
        circleGlow(ctx, px + 6, py + 4, 4.2, '#9BE5FF', 8, 0.18);
        const canopy = ctx.createLinearGradient(0, py, 0, py + 6);
        canopy.addColorStop(0, '#F6FEFF');
        canopy.addColorStop(1, c1);
        ctx.fillStyle = canopy;
        ctx.beginPath();
        ctx.moveTo(px + 0.8, py + 5.1);
        ctx.quadraticCurveTo(px + 6.0, py - 0.8, px + 11.2, py + 5.1);
        ctx.lineTo(px + 0.8, py + 5.1);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(40,90,130,0.9)';
        ctx.lineWidth = 0.9;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.65)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(px + 6.0, py + 0.3);
        ctx.lineTo(px + 6.0, py + 5.3);
        ctx.stroke();
        ctx.fillStyle = '#EFC88E';
        roundedRect(ctx, px + 5.4, py + 5.1, 1.2, 5.1, 0.45);
        ctx.fill();
        ctx.strokeStyle = '#7A542B';
        ctx.lineWidth = 0.75;
        ctx.beginPath();
        ctx.moveTo(px + 6.0, py + 10.0);
        ctx.quadraticCurveTo(px + 7.5, py + 10.9, px + 8.0, py + 9.6);
        ctx.stroke();
        return;
    }

    if (type === 'cake') {
        const w = 16;
        const h = 12;
        const cx = px + w * 0.5;
        circleGlow(ctx, cx, py + h * 0.52, 6.6, '#FFD6E3', 9, 0.18);

        // Cream top
        const cream = ctx.createLinearGradient(0, py + 1, 0, py + 4.6);
        cream.addColorStop(0, '#FFFFFF');
        cream.addColorStop(1, '#FFEFEF');
        ctx.fillStyle = cream;
        roundedRect(ctx, px + 0.8, py + 1.1, w - 1.6, 3.7, 1.6);
        ctx.fill();
        ctx.strokeStyle = 'rgba(170,120,130,0.55)';
        ctx.lineWidth = 0.8;
        roundedRect(ctx, px + 0.8, py + 1.1, w - 1.6, 3.7, 1.6);
        ctx.stroke();

        // Cake body
        const body = ctx.createLinearGradient(0, py + 4.6, 0, py + h);
        body.addColorStop(0, '#FF9ABB');
        body.addColorStop(1, '#E95D8E');
        ctx.fillStyle = body;
        roundedRect(ctx, px + 1.0, py + 4.1, w - 2.0, h - 4.5, 1.3);
        ctx.fill();
        ctx.strokeStyle = 'rgba(120,25,58,0.65)';
        ctx.lineWidth = 0.9;
        roundedRect(ctx, px + 1.0, py + 4.1, w - 2.0, h - 4.5, 1.3);
        ctx.stroke();

        // Sprinkles
        ctx.fillStyle = '#FFF6A0';
        ctx.fillRect(px + 3.1, py + 6.0, 1.2, 0.7);
        ctx.fillRect(px + 6.4, py + 7.2, 1.1, 0.7);
        ctx.fillRect(px + 9.5, py + 5.8, 1.2, 0.7);
        ctx.fillRect(px + 12.1, py + 7.0, 1.1, 0.7);

        // Cherry
        ctx.fillStyle = '#D7234E';
        ctx.beginPath();
        ctx.arc(px + 8.0, py + 1.0, 1.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath();
        ctx.arc(px + 7.55, py + 0.55, 0.45, 0, Math.PI * 2);
        ctx.fill();
        return;
    }

    if (type === 'extend') {
        ctx.save();
        circleGlow(ctx, px + 5, py + 5, 4.3, '#E96CFF', 8, 0.15);
        const g = ctx.createLinearGradient(0, py, 0, py + 10);
        g.addColorStop(0, '#7F2FB3');
        g.addColorStop(1, '#421167');
        ctx.fillStyle = g;
        roundedRect(ctx, px + 0.5, py + 0.5, 9.0, 9.0, 2.0);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,170,255,0.75)';
        ctx.lineWidth = 1;
        roundedRect(ctx, px + 0.5, py + 0.5, 9.0, 9.0, 2.0);
        ctx.stroke();
        const ch = EXTEND_CHARS[extendIndex] || 'E';
        drawTextCentered(ctx, ch, px + 5, py + 3, 1, c2);
        ctx.restore();
        return;
    }

    if (type === 'candy') {
        drawCandyFruit(ctx, px, py, foodKind);
        return;
    }

    if (type === 'ring') {
        circleGlow(ctx, px + 5, py + 5, 3.5, '#FFD950', 7, 0.18);
        ctx.strokeStyle = c1;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px + 5, py + 5, 3.6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 1;
        ctx.strokeStyle = c2;
        ctx.beginPath();
        ctx.arc(px + 5, py + 5, 2.7, -0.6, 2.4);
        ctx.stroke();
        return;
    }

    if (type === 'gem') {
        circleGlow(ctx, px + 5, py + 5, 4.0, '#6CF2FF', 8, 0.2);
        const g = ctx.createLinearGradient(0, py + 0.8, 0, py + 9.2);
        g.addColorStop(0, '#F3FEFF');
        g.addColorStop(1, c1);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(px + 5.0, py + 0.8);
        ctx.lineTo(px + 8.6, py + 4.2);
        ctx.lineTo(px + 6.8, py + 8.6);
        ctx.lineTo(px + 3.2, py + 8.6);
        ctx.lineTo(px + 1.4, py + 4.2);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(20,120,150,0.85)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.strokeStyle = 'rgba(210,252,255,0.9)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(px + 5.0, py + 1.2);
        ctx.lineTo(px + 5.0, py + 8.2);
        ctx.moveTo(px + 2.2, py + 4.2);
        ctx.lineTo(px + 7.8, py + 4.2);
        ctx.stroke();
        return;
    }

    if (type === 'shoe') {
        const g = ctx.createLinearGradient(0, py + 2, 0, py + 9);
        g.addColorStop(0, c2);
        g.addColorStop(1, c1);
        ctx.fillStyle = g;
        roundedRect(ctx, px + 1.1, py + 2.3, 8.3, 6.1, 1.7);
        ctx.fill();
        ctx.fillStyle = 'rgba(70,30,10,0.55)';
        roundedRect(ctx, px + 1.2, py + 6.5, 8.6, 2.2, 0.8);
        ctx.fill();
        return;
    }

    if (type === 'potion') {
        ctx.fillStyle = '#E6F7FF';
        roundedRect(ctx, px + 3.2, py + 0.1, 3.6, 1.9, 0.5);
        ctx.fill();
        const g = ctx.createLinearGradient(0, py + 2, 0, py + 9.7);
        g.addColorStop(0, c2);
        g.addColorStop(1, c1);
        ctx.fillStyle = g;
        roundedRect(ctx, px + 1.9, py + 2.0, 6.2, 7.7, 1.9);
        ctx.fill();
        ctx.strokeStyle = 'rgba(180,240,255,0.85)';
        ctx.lineWidth = 1;
        roundedRect(ctx, px + 1.9, py + 2.0, 6.2, 7.7, 1.9);
        ctx.stroke();
    }
}

export function drawScorePopup(ctx, x, y, score, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const str = formatScore(score);
    const w = textWidth(str, 1);

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundedRect(ctx, Math.round(x - w / 2 - 2), Math.round(y - 1), w + 4, 8, 2);
    ctx.fill();

    drawText(ctx, str, Math.round(x - w / 2), Math.round(y), 1, '#FFE76B');
    ctx.restore();
}

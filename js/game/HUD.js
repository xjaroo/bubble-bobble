import { HUD_HEIGHT, CANVAS_W, NO_FLICKER_MODE } from '../constants.js';
import { formatScore } from '../utils/NumberFormat.js';
import {
    drawText, drawTextCentered,
    drawShadowText, drawShadowTextCentered,
    textWidth, textHeight
} from '../rendering/PixelFont.js';

const EXTEND_LETTERS = 'EXTEND';
const EXTEND_RAINBOW_COLORS = ['#FF4D6D', '#FF8A3D', '#FFE35B', '#57E389', '#62A8FF', '#B47CFF'];

export class HUD {
    draw(ctx, game) {
        // ── Background bar ───────────────────────────────────────────────────
        // Dark gradient strip + subtle glass tint
        const grad = ctx.createLinearGradient(0, 0, 0, HUD_HEIGHT);
        grad.addColorStop(0, '#0b1430');
        grad.addColorStop(0.48, '#070f23');
        grad.addColorStop(1, '#040914');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, CANVAS_W, HUD_HEIGHT);

        // Top soft highlight
        ctx.fillStyle = 'rgba(180,220,255,0.08)';
        ctx.fillRect(0, 0, CANVAS_W, 1);

        // Bottom accent line (cyan glow strip)
        ctx.fillStyle = '#00193a';
        ctx.fillRect(0, HUD_HEIGHT - 2, CANVAS_W, 2);
        ctx.fillStyle = '#00457a';
        ctx.fillRect(0, HUD_HEIGHT - 1, CANVAS_W, 1);

        // Segment panels for readability
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.fillRect(2, 2, 74, 17);
        ctx.fillRect(CANVAS_W / 2 - 40, 2, 80, 17);
        ctx.fillRect(CANVAS_W - 52, 2, 50, 17);

        // ── Scale definitions (canvas pixels) ────────────────────────────────
        const SL  = 1;   // scale for tiny labels  (5px font)
        const SS  = 2;   // scale for score values  (9px font)

        const LH  = textHeight(SL); // ≈ 7px
        const LH2 = textHeight(SS); // ≈ 11px

        // Row 1 top-pad
        const R1 = 3;
        // Row 2 (lives + extend)
        const R2 = R1 + LH + 2 + LH2 + 1;

        // ── P1 block (left) ──────────────────────────────────────────────────
        drawText(ctx, '1UP', 4, R1, SL, '#FFE566');
        const p1Score = formatScore(game.scores[0]);
        drawShadowText(ctx, p1Score, 4, R1 + LH + 2, SS, '#FFFFFF', 'rgba(255,200,0,0.25)');

        // ── Hi-score block (centre) ──────────────────────────────────────────
        drawTextCentered(ctx, 'HI', CANVAS_W / 2, R1, SL, '#FF9944');
        const hiName = (game.highScoreName || '---').slice(0, 8).toUpperCase();
        drawTextCentered(ctx, hiName, CANVAS_W / 2 + 22, R1, SL, '#87B4E6');
        const hiScore = formatScore(game.highScore);
        drawShadowTextCentered(ctx, hiScore, CANVAS_W / 2, R1 + LH + 2, SS, '#FFFFFF', 'rgba(255,150,0,0.2)');

        // ── P2 / Level block (right) ─────────────────────────────────────────
        if (game.twoPlayer) {
            const p2Score = formatScore(game.scores[1]);
            const p2w    = textWidth(p2Score, SS);
            drawText(ctx, '2UP', CANVAS_W - textWidth('2UP', SL) - 4, R1, SL, '#66FFEE');
            drawShadowText(ctx, p2Score, CANVAS_W - p2w - 4, R1 + LH + 2, SS, '#FFFFFF', 'rgba(0,200,220,0.2)');
        } else {
            const stage = typeof game.getStageNumber === 'function'
                ? game.getStageNumber()
                : (game.levelIndex + 1);
            const lvlStr = 'L' + String(stage).padStart(2, '0');
            const lvlW   = textWidth(lvlStr, SL);
            drawText(ctx, lvlStr, CANVAS_W - lvlW - 4, R1, SL, '#88AAFF');
        }

        // ── Lives (heart pips) ────────────────────────────────────────────────
        for (let i = 0; i < Math.max(0, game.lives[0]); i++) {
            // Heart shape: 2×2 lobes + 2-pixel bottom point
            const hx = 4 + i * 8;
            const hy = R2;
            const hg = ctx.createLinearGradient(0, hy, 0, hy + 6);
            hg.addColorStop(0, '#FF7D93');
            hg.addColorStop(1, '#D71646');
            ctx.fillStyle = hg;
            ctx.fillRect(hx,   hy,   3, 2); // left lobe
            ctx.fillRect(hx+3, hy,   3, 2); // right lobe
            ctx.fillRect(hx,   hy+2, 6, 2); // body
            ctx.fillRect(hx+1, hy+4, 4, 1); // taper
            ctx.fillRect(hx+2, hy+5, 2, 1); // tip
            // Highlight
            ctx.fillStyle = '#FF7799';
            ctx.fillRect(hx+1, hy,   1, 1);
        }

        // ── EXTEND letters (centred) ─────────────────────────────────────────
        const extTotal = EXTEND_LETTERS.length;
        const charW    = textWidth('E', SL) + 2;   // width of one EXTEND char + gap
        const extW     = extTotal * charW;
        const extX     = Math.round((CANVAS_W - extW) / 2) + 2;
        const rainbowActive = (game.extendRainbowTimer || 0) > 0;
        const rainbowStep = rainbowActive && !NO_FLICKER_MODE
            ? Math.floor((game.levelTimer || 0) / 5)
            : 0;

        for (let i = 0; i < extTotal; i++) {
            const collected = game.extendCollected.has(i);
            const cx        = extX + i * charW;
            const rainbowArc = rainbowActive
                ? Math.round(Math.sin((i / Math.max(1, extTotal - 1)) * Math.PI) * 3)
                : 0;
            const y = R2 - rainbowArc;

            let color = '#4A6888';
            if (rainbowActive) {
                color = EXTEND_RAINBOW_COLORS[(i + rainbowStep) % EXTEND_RAINBOW_COLORS.length];
            } else if (collected) {
                color = '#FF55EE';
            }

            if (rainbowActive || collected) {
                // Glow underline / rainbow celebration
                ctx.fillStyle = color;
                ctx.shadowColor = color;
                ctx.shadowBlur  = rainbowActive ? 5 : 4;
                ctx.fillRect(cx, y + LH + 1, charW - 2, 1);
                ctx.shadowBlur  = 0;
            }
            drawText(ctx, EXTEND_LETTERS[i], cx, y, SL, color);
        }

        // ── Hurry-Up banner (drawn inside playfield area, just below HUD) ───
        if (game.hurryUp) {
            const blink = NO_FLICKER_MODE ? true : (Math.floor(game.hurryUpTimer / 15) % 2 === 0);
            if (blink) {
                // Semi-transparent red flash bar
                ctx.fillStyle = 'rgba(180,0,0,0.22)';
                ctx.fillRect(0, HUD_HEIGHT, CANVAS_W, 14);
                drawShadowTextCentered(
                    ctx, 'HURRY UP!',
                    CANVAS_W / 2, HUD_HEIGHT + 2,
                    2, '#FF4444', 'rgba(0,0,0,0.9)'
                );
            }
        }

        const rushActive = !!game.rainbowRushActive;
        const rushResult = (game.rainbowRushResultTimer || 0) > 0;
        if (rushActive || rushResult) {
            const p1 = game.rainbowRushCollected ? (game.rainbowRushCollected[0] || 0) : 0;
            const p2 = game.rainbowRushCollected ? (game.rainbowRushCollected[1] || 0) : 0;
            const eaten = p1 + p2;
            const total = Math.max(0, game.rainbowRushTotal || 0);
            const panelW = 102;
            const panelX = CANVAS_W - panelW - 3;
            const panelY = R2 - 1;

            ctx.fillStyle = 'rgba(80,120,190,0.18)';
            ctx.fillRect(panelX, panelY, panelW, 9);
            const line = game.twoPlayer
                ? `RB ${eaten}/${total} P1:${p1} P2:${p2}`
                : `RB ${eaten}/${total} YOU:${p1}`;
            drawText(ctx, line, panelX + 2, panelY + 1, 1, '#BDF8FF');

            if (rushResult && game.rainbowRushWinner) {
                drawTextCentered(ctx, game.rainbowRushWinner, CANVAS_W / 2, HUD_HEIGHT + 3, 1, '#FFE96E');
            }
        }
    }
}

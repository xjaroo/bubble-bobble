import {
    HUD_HEIGHT, CANVAS_W, CANVAS_H,
    SCENE_TITLE, SCENE_GAMEOVER, SCENE_TRANSITION,
    STATIC_CHARACTER_VISUALS, NO_FLICKER_MODE
} from '../constants.js';
import { HUD } from '../game/HUD.js';
import {
    drawPlayer, drawBubble, drawZenChan, drawMighta, drawMonsta,
    drawBaron, drawDragonKing, drawItem, drawScorePopup
} from './SpriteDrawer.js';
import { BS_FLOAT } from '../entities/Bubble.js';
import {
    drawText, drawTextCentered,
    drawGlowText, drawShadowText, drawShadowTextCentered,
    textWidth, textHeight
} from './PixelFont.js';
import { formatScore } from '../utils/NumberFormat.js';

function hexToRgb(hex, fallback = [8, 12, 32]) {
    if (!hex || hex[0] !== '#') return fallback;
    const raw = hex.slice(1);
    if (raw.length === 3) {
        return [
            parseInt(raw[0] + raw[0], 16),
            parseInt(raw[1] + raw[1], 16),
            parseInt(raw[2] + raw[2], 16),
        ];
    }
    if (raw.length === 6) {
        return [
            parseInt(raw.slice(0, 2), 16),
            parseInt(raw.slice(2, 4), 16),
            parseInt(raw.slice(4, 6), 16),
        ];
    }
    return fallback;
}

function mixRgb(a, b, t) {
    return [
        Math.round(a[0] + (b[0] - a[0]) * t),
        Math.round(a[1] + (b[1] - a[1]) * t),
        Math.round(a[2] + (b[2] - a[2]) * t),
    ];
}

export class Renderer {
    constructor(ctx) {
        this.ctx = ctx;
        this.hud = new HUD();
    }

    draw(game, alpha) {
        const ctx = this.ctx;

        if (game.scene === SCENE_TITLE) {
            this._drawTitle(ctx, game);
            return;
        }
        if (game.scene === SCENE_GAMEOVER) {
            this._drawGameOver(ctx, game);
            return;
        }

        // ── Background ──────────────────────────────────────────────────────
        this._drawPlayfieldBackground(ctx, game);

        // ── Tile layer ──────────────────────────────────────────────────────
        if (game.level) game.level.draw(ctx, HUD_HEIGHT);

        const oy = HUD_HEIGHT;

        // ── Items ────────────────────────────────────────────────────────────
        for (const item of game.items) {
            if (!item.active || (!NO_FLICKER_MODE && item.blinking)) continue;
            const ix = item.settled ? item.pos.x : item.renderX(alpha);
            const iy = item.settled ? item.pos.y : item.renderY(alpha);
            drawItem(ctx, Math.round(ix), Math.round(iy) + oy,
                     item.type, item.extendIndex, item.foodKind);
        }

        // ── Bubbles ──────────────────────────────────────────────────────────
        for (const b of game.bubbles) {
            if (!b.active) continue;
            drawBubble(
                ctx,
                b.renderX(alpha), b.renderY(alpha) + oy,
                NO_FLICKER_MODE ? 0 : b.wobbleT, !!b.trappedEnemy, b.state, b.popTimer,
                b.kind || 'normal', b.lightningRequiredFacing || 0
            );
        }

        // ── Enemies ──────────────────────────────────────────────────────────
        for (const e of game.enemies) {
            if (!e.active || e.trapped) continue;
            const baseX = STATIC_CHARACTER_VISUALS ? e.pos.x : (e.onGround ? e.pos.x : e.renderX(alpha));
            const rx = Math.round(baseX);
            const baseY = STATIC_CHARACTER_VISUALS
                ? Math.round(e.pos.y)
                : Math.round((e.onGround && Math.abs(e.vel.y) < 0.15) ? e.pos.y : e.renderY(alpha));
            const ry = baseY + oy;
            this._drawEnemy(ctx, e, rx, ry);
        }

        // ── Players ──────────────────────────────────────────────────────────
        for (const p of game.players) {
            if (!p.visible) continue;
            const baseX = STATIC_CHARACTER_VISUALS ? p.pos.x : (p.onGround ? p.pos.x : p.renderX(alpha));
            const px = Math.round(baseX);
            const py = Math.round((
                STATIC_CHARACTER_VISUALS
                    ? p.pos.y
                    : ((p.onGround && Math.abs(p.vel.y) < 0.15) ? p.pos.y : p.renderY(alpha))
            ) + oy);
            drawPlayer(
                ctx,
                px, py,
                p.id,
                STATIC_CHARACTER_VISUALS ? 0 : p.animFrame,
                p.facing > 0,
                STATIC_CHARACTER_VISUALS ? false : !p.onGround,
                p.dead,
                STATIC_CHARACTER_VISUALS ? 0 : p.animPhase,
                STATIC_CHARACTER_VISUALS ? 0 : p.tailPhase,
                0, true
            );
        }

        // ── Projectiles ──────────────────────────────────────────────────────
        for (const proj of game.projectiles) {
            if (!proj.active) continue;
            const x = Math.round(proj.renderX(alpha));
            const y = Math.round(proj.renderY(alpha)) + oy;
            if (proj.mode === 'lightning') {
                ctx.fillStyle = 'rgba(132,235,255,0.26)';
                ctx.fillRect(x - 2, y - 2, proj.size.w + 4, proj.size.h + 4);
                const g = ctx.createLinearGradient(x, y, x + proj.size.w, y + proj.size.h);
                g.addColorStop(0, '#E8FFFF');
                g.addColorStop(0.55, '#86E2FF');
                g.addColorStop(1, '#4FB7FF');
                ctx.fillStyle = g;
                ctx.fillRect(x, y, proj.size.w, proj.size.h);
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(x + 1, y + 1, Math.max(2, proj.size.w - 2), 1);
            } else {
                ctx.fillStyle = 'rgba(255,180,40,0.22)';
                ctx.fillRect(x - 1, y - 1, proj.size.w + 2, proj.size.h + 2);
                const g = ctx.createLinearGradient(x, y, x + proj.size.w, y + proj.size.h);
                g.addColorStop(0, '#FFF18A');
                g.addColorStop(1, '#FF9D17');
                ctx.fillStyle = g;
                ctx.fillRect(x, y, proj.size.w, proj.size.h);
            }
        }

        this._drawWeatherEffects(ctx, game, oy);

        // ── Baron Von Blubba ─────────────────────────────────────────────────
        if (game.baron && game.baron.active) {
            const bx = Math.round(STATIC_CHARACTER_VISUALS ? game.baron.pos.x : game.baron.renderX(alpha));
            const by = Math.round(STATIC_CHARACTER_VISUALS ? game.baron.pos.y : game.baron.renderY(alpha)) + oy;
            drawBaron(ctx,
                bx,
                by,
                STATIC_CHARACTER_VISUALS ? 0 : game.baron.animFrame);
        }

        // ── Score popups ─────────────────────────────────────────────────────
        for (const sp of game.scorePopups) {
            drawScorePopup(ctx, sp.x, sp.y + oy, sp.score, sp.alpha);
        }

        // ── Level-transition overlay ─────────────────────────────────────────
        if (game.scene === SCENE_TRANSITION) {
            const t     = 1 - game.transitionTimer / game.transitionDuration;
            if (game.transitionStyle === 'umbrella-travel') {
                this._drawUmbrellaTravelOverlay(ctx, game, t);
            } else {
                const flash = NO_FLICKER_MODE ? 0 : Math.abs(Math.sin(t * Math.PI * 6));
                ctx.fillStyle = `rgba(255,255,255,${flash * 0.12})`;
                ctx.fillRect(0, HUD_HEIGHT, CANVAS_W, CANVAS_H - HUD_HEIGHT);

                const mid = Math.round(HUD_HEIGHT + (CANVAS_H - HUD_HEIGHT) / 2);
                const stage = typeof game.getStageNumber === 'function'
                    ? game.getStageNumber()
                    : (game.levelIndex + 1);
                drawGlowText(ctx, 'ROUND ' + String(stage).padStart(2, '0'),
                    CANVAS_W / 2, mid - 14, 2, '#FFFF66', '#FFAA00');
                drawGlowText(ctx, 'GREAT!',
                    CANVAS_W / 2, mid + 4, 2, '#FFFFFF', '#88FFFF');
            }
        }

        // ── Inner vignette on playfield edges ────────────────────────────────
        const playH = CANVAS_H - HUD_HEIGHT;
        const vEdge = ctx.createLinearGradient(0, HUD_HEIGHT, 0, HUD_HEIGHT + playH);
        vEdge.addColorStop(0,   'rgba(0,0,0,0.18)');
        vEdge.addColorStop(0.08,'rgba(0,0,0,0)');
        vEdge.addColorStop(0.92,'rgba(0,0,0,0)');
        vEdge.addColorStop(1,   'rgba(0,0,0,0.25)');
        ctx.fillStyle = vEdge;
        ctx.fillRect(0, HUD_HEIGHT, CANVAS_W, playH);

        if (game.isBossStage && game.bossEnemy && !game.bossEnemy.dead) {
            this._drawBossHud(ctx, game);
        }

        // ── HUD ──────────────────────────────────────────────────────────────
        this.hud.draw(ctx, game);
    }

    _drawWeatherEffects(ctx, game, oy) {
        const strikes = Array.isArray(game.stormStrikes) ? game.stormStrikes : [];
        for (const s of strikes) {
            const maxT = Math.max(1, s.maxTimer || 1);
            const a = Math.max(0, Math.min(1, (s.timer || 0) / maxT));
            const points = Array.isArray(s.points) ? s.points : null;

            if (points && points.length >= 2) {
                const main = points.map((p) => ({
                    x: Math.round(Number(p?.x || 0)),
                    y: Math.round(Number(p?.y || 0) + oy),
                }));
                const thickness = Math.max(1, Number(s.thickness || 2));

                ctx.strokeStyle = `rgba(120,230,255,${0.18 + a * 0.34})`;
                ctx.lineWidth = thickness + 2;
                ctx.beginPath();
                ctx.moveTo(main[0].x, main[0].y);
                for (let i = 1; i < main.length; i++) {
                    ctx.lineTo(main[i].x, main[i].y);
                }
                ctx.stroke();

                ctx.strokeStyle = `rgba(255,255,210,${0.34 + a * 0.56})`;
                ctx.lineWidth = Math.max(1, thickness * 0.6);
                ctx.beginPath();
                ctx.moveTo(main[0].x, main[0].y);
                for (let i = 1; i < main.length; i++) {
                    ctx.lineTo(main[i].x, main[i].y);
                }
                ctx.stroke();

                const branches = Array.isArray(s.branches) ? s.branches : [];
                if (branches.length > 0) {
                    ctx.strokeStyle = `rgba(170,245,255,${0.22 + a * 0.42})`;
                    ctx.lineWidth = Math.max(1, thickness * 0.55);
                    for (const b of branches) {
                        const bx0 = Math.round(Number(b?.x0 || 0));
                        const by0 = Math.round(Number(b?.y0 || 0) + oy);
                        const bx1 = Math.round(Number(b?.x1 || 0));
                        const by1 = Math.round(Number(b?.y1 || 0) + oy);
                        ctx.beginPath();
                        ctx.moveTo(bx0, by0);
                        ctx.lineTo(bx1, by1);
                        ctx.stroke();
                    }
                }
            } else {
                // Backward-compatible fallback for older strike snapshots.
                const x = Math.round(s.x || 0);
                const y0 = Math.round((s.y0 || -10) + oy);
                const y1 = Math.round((s.y1 || 0) + oy);
                const midY = Math.round((y0 + y1) * 0.5);
                const dx = ((x * 13 + midY * 3) % 5) - 2;

                ctx.strokeStyle = `rgba(120,230,255,${0.2 + a * 0.3})`;
                ctx.lineWidth = 6;
                ctx.beginPath();
                ctx.moveTo(x, y0);
                ctx.lineTo(x + dx, midY);
                ctx.lineTo(x - dx, y1);
                ctx.stroke();

                ctx.strokeStyle = `rgba(255,255,210,${0.45 + a * 0.5})`;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x, y0);
                ctx.lineTo(x + dx, midY);
                ctx.lineTo(x - dx, y1);
                ctx.stroke();
            }
        }

        const floodP = Math.max(0, Math.min(1, Number(game.floodVisualProgress || 0)));
        if (floodP <= 0) return;
        const playH = CANVAS_H - HUD_HEIGHT;
        const h = Math.round(playH * floodP * 0.82);
        const y = CANVAS_H - h;
        const wave = (floodP * 12) % (Math.PI * 2);

        const g = ctx.createLinearGradient(0, y, 0, CANVAS_H);
        g.addColorStop(0, 'rgba(120,215,255,0.26)');
        g.addColorStop(1, 'rgba(34,128,210,0.52)');
        ctx.fillStyle = g;
        ctx.fillRect(0, y, CANVAS_W, h);

        ctx.strokeStyle = 'rgba(210,245,255,0.88)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= CANVAS_W; x += 6) {
            const yy = y + Math.sin(x * 0.09 + wave) * 2;
            if (x === 0) ctx.moveTo(x, yy);
            else ctx.lineTo(x, yy);
        }
        ctx.stroke();
    }

    _drawPlayfieldBackground(ctx, game) {
        const playH = CANVAS_H - HUD_HEIGHT;
        const levelBg = game.level ? game.level.data.bgColor : '#050A22';
        const baseRgb = hexToRgb(levelBg);
        const topRgb = mixRgb(baseRgb, [18, 32, 78], 0.42);
        const botRgb = mixRgb(baseRgb, [2, 5, 16], 0.58);

        const grad = ctx.createLinearGradient(0, HUD_HEIGHT, 0, CANVAS_H);
        grad.addColorStop(0, `rgb(${topRgb[0]}, ${topRgb[1]}, ${topRgb[2]})`);
        grad.addColorStop(1, `rgb(${botRgb[0]}, ${botRgb[1]}, ${botRgb[2]})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, HUD_HEIGHT, CANVAS_W, playH);

        const timer = game.levelTimer || 0;
        const t = NO_FLICKER_MODE ? 0 : (timer * 0.0012);

        // Nebula-like soft color volumes
        const n1x = CANVAS_W * (0.25 + 0.08 * Math.sin(t * 1.3));
        const n1y = HUD_HEIGHT + playH * 0.34;
        const n1 = ctx.createRadialGradient(n1x, n1y, 8, n1x, n1y, 72);
        n1.addColorStop(0, 'rgba(90,180,255,0.17)');
        n1.addColorStop(1, 'rgba(90,180,255,0)');
        ctx.fillStyle = n1;
        ctx.fillRect(0, HUD_HEIGHT, CANVAS_W, playH);

        const n2x = CANVAS_W * (0.74 + 0.06 * Math.cos(t * 1.05));
        const n2y = HUD_HEIGHT + playH * 0.68;
        const n2 = ctx.createRadialGradient(n2x, n2y, 10, n2x, n2y, 88);
        n2.addColorStop(0, 'rgba(163,104,255,0.14)');
        n2.addColorStop(1, 'rgba(163,104,255,0)');
        ctx.fillStyle = n2;
        ctx.fillRect(0, HUD_HEIGHT, CANVAS_W, playH);

        // Star specks
        const starCount = 44;
        for (let i = 0; i < starCount; i++) {
            const hx = Math.sin((i + 1) * 12.9898 + 77.1) * 43758.5453;
            const hy = Math.sin((i + 1) * 78.233 + 9.73) * 12741.2381;
            const x0 = (hx - Math.floor(hx)) * CANVAS_W;
            const y0 = (hy - Math.floor(hy)) * (playH - 4);
            const drift = NO_FLICKER_MODE ? 0 : ((timer * 0.006 * ((i % 5) + 1)) % CANVAS_W);
            const x = (x0 + drift) % CANVAS_W;
            const y = HUD_HEIGHT + y0;
            const twinkle = NO_FLICKER_MODE ? 0.72 : (0.35 + 0.65 * Math.abs(Math.sin(timer * 0.006 + i * 0.71)));
            const size = i % 11 === 0 ? 2 : 1;
            ctx.fillStyle = `rgba(185,220,255,${0.15 + twinkle * 0.35})`;
            ctx.fillRect(Math.round(x), Math.round(y), size, size);
        }
    }

    _drawEnemy(ctx, e, x, y) {
        const type = e.kind || e.constructor?.name;
        const frame = STATIC_CHARACTER_VISUALS ? 0 : (e.animFrame || 0);
        if      (type === 'ZenChan') drawZenChan(ctx, x, y, frame, e.angry, e.trapped);
        else if (type === 'Mighta')  drawMighta (ctx, x, y, frame, e.angry);
        else if (type === 'Monsta')  drawMonsta (ctx, x, y, frame, e.angry);
        else if (type === 'DragonKing') drawDragonKing(
            ctx,
            x,
            y,
            frame,
            Number.isFinite(e.hp) ? e.hp : 0,
            Number.isFinite(e.maxHp) ? e.maxHp : 1,
            Number.isFinite(e.invuln) ? e.invuln : 0
        );
        else {
            ctx.fillStyle = e.angry ? '#FF3300' : '#FF8800';
            ctx.fillRect(Math.round(x), Math.round(y), e.size.w, e.size.h);
        }
    }

    _drawBossHud(ctx, game) {
        const boss = game.bossEnemy;
        if (!boss) return;
        const hp = Math.max(0, Number.isFinite(boss.hp) ? boss.hp : 0);
        const maxHp = Math.max(1, Number.isFinite(boss.maxHp) ? boss.maxHp : 1);
        const frac = Math.max(0, Math.min(1, hp / maxHp));
        const barW = 140;
        const barH = 8;
        const bx = Math.round((CANVAS_W - barW) * 0.5);
        const by = HUD_HEIGHT + 6;

        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(bx - 2, by - 2, barW + 4, barH + 4);
        ctx.fillStyle = 'rgba(30,40,58,0.95)';
        ctx.fillRect(bx, by, barW, barH);

        const g = ctx.createLinearGradient(bx, by, bx + barW, by);
        g.addColorStop(0, '#FFF08A');
        g.addColorStop(1, '#FF6A5A');
        ctx.fillStyle = g;
        ctx.fillRect(bx, by, Math.round(barW * frac), barH);
        ctx.strokeStyle = 'rgba(214,241,255,0.8)';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx + 0.5, by + 0.5, barW - 1, barH - 1);
        drawTextCentered(ctx, `BOSS HP ${hp}/${maxHp}`, CANVAS_W / 2, by - 8, 1, '#FFEFA0');
    }

    _drawUmbrellaTravelOverlay(ctx, game, t) {
        const oy = HUD_HEIGHT;
        const playH = CANVAS_H - HUD_HEIGHT;
        ctx.fillStyle = 'rgba(6, 12, 30, 0.72)';
        ctx.fillRect(0, oy, CANVAS_W, playH);

        const panelX = 20;
        const panelY = oy + 26;
        const panelW = CANVAS_W - 40;
        const panelH = 112;

        const panelGrad = ctx.createLinearGradient(panelX, panelY, panelX, panelY + panelH);
        panelGrad.addColorStop(0, 'rgba(22,56,108,0.92)');
        panelGrad.addColorStop(1, 'rgba(7,18,44,0.92)');
        ctx.fillStyle = panelGrad;
        ctx.fillRect(panelX, panelY, panelW, panelH);
        ctx.strokeStyle = 'rgba(136, 214, 255, 0.7)';
        ctx.lineWidth = 1;
        ctx.strokeRect(panelX + 0.5, panelY + 0.5, panelW - 1, panelH - 1);

        drawGlowText(ctx, 'UMBRELLA TRAVEL', CANVAS_W / 2, panelY + 10, 1, '#E9FDFF', '#5EC8FF');

        const route = (Array.isArray(game.transitionRouteRounds) && game.transitionRouteRounds.length > 0)
            ? game.transitionRouteRounds.slice()
            : [typeof game.getStageNumber === 'function' ? game.getStageNumber(1) : (game.levelIndex + 2)];
        const startRound = game.transitionStartRound || (
            typeof game.getStageNumber === 'function'
                ? game.getStageNumber()
                : (game.levelIndex + 1)
        );
        const nodeRounds = [startRound, ...route];
        const steps = Math.max(1, nodeRounds.length - 1);

        const x0 = panelX + 18;
        const x1 = panelX + panelW - 18;
        const y0 = panelY + 62;
        const nodes = [];
        for (let i = 0; i <= steps; i++) {
            const f = steps > 0 ? i / steps : 0;
            const arc = Math.sin((f - 0.5) * Math.PI) * 9;
            nodes.push({
                x: x0 + (x1 - x0) * f,
                y: y0 - arc,
            });
        }

        const segSize = 1 / steps;
        const stepRaw = Math.min(steps - 1, Math.floor(Math.min(0.999999, t) / segSize));
        const segT = Math.max(0, Math.min(1, (t - stepRaw * segSize) / segSize));
        const moveT = Math.min(1, segT / 0.78); // short pause at each stop
        const travelPos = stepRaw + moveT;
        const i0 = Math.max(0, Math.min(steps - 1, Math.floor(travelPos)));
        const i1 = Math.min(steps, i0 + 1);
        const lt = travelPos - i0;
        const bx = nodes[i0].x + (nodes[i1].x - nodes[i0].x) * lt;
        const by = nodes[i0].y + (nodes[i1].y - nodes[i0].y) * lt + (NO_FLICKER_MODE ? 0 : (Math.sin(t * Math.PI * 12) * 1.8));
        const reachedNodes = stepRaw + (moveT >= 0.98 ? 1 : 0);

        for (let i = 0; i < steps; i++) {
            const passed = i < reachedNodes;
            ctx.strokeStyle = passed ? 'rgba(120, 245, 255, 0.95)' : 'rgba(120, 170, 230, 0.35)';
            ctx.lineWidth = passed ? 2 : 1;
            ctx.beginPath();
            ctx.moveTo(Math.round(nodes[i].x), Math.round(nodes[i].y));
            ctx.lineTo(Math.round(nodes[i + 1].x), Math.round(nodes[i + 1].y));
            ctx.stroke();
        }

        for (let i = 0; i <= steps; i++) {
            const passed = i <= reachedNodes;
            ctx.fillStyle = passed ? '#AFFFFF' : '#5F86C2';
            ctx.beginPath();
            ctx.arc(Math.round(nodes[i].x), Math.round(nodes[i].y), passed ? 4 : 3, 0, Math.PI * 2);
            ctx.fill();
            const label = String(nodeRounds[i]).padStart(2, '0');
            drawTextCentered(
                ctx,
                `R${label}`,
                Math.round(nodes[i].x),
                Math.round(nodes[i].y) - 12,
                1,
                passed ? '#F3FBFF' : '#8FA8CC'
            );
        }

        this._drawTravelBalloon(ctx, bx, by);

        const fromRound = nodeRounds[Math.min(stepRaw, nodeRounds.length - 1)];
        const toRound = nodeRounds[Math.min(stepRaw + 1, nodeRounds.length - 1)];
        const arrived = t >= 0.995;
        const travelLabel = arrived
            ? `ARRIVED ROUND ${String(nodeRounds[nodeRounds.length - 1]).padStart(2, '0')}`
            : `ROUND ${String(fromRound).padStart(2, '0')} -> ${String(toRound).padStart(2, '0')}`;

        drawShadowTextCentered(ctx, travelLabel, CANVAS_W / 2, panelY + 88, 1, '#EAF7FF');
        drawTextCentered(ctx, 'SKIPPING LEVELS WITH UMBRELLA', CANVAS_W / 2, panelY + 99, 1, '#9EC4F5');
    }

    _drawTravelBalloon(ctx, x, y) {
        const bx = Math.round(x);
        const by = Math.round(y);
        ctx.save();
        ctx.translate(bx, by);

        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        ctx.ellipse(0, 10, 9, 3, 0, 0, Math.PI * 2);
        ctx.fill();

        // Balloon canopy
        ctx.fillStyle = '#7FE2FF';
        ctx.beginPath();
        ctx.arc(-5, -4, 5, 0, Math.PI * 2);
        ctx.arc(0, -6, 6, 0, Math.PI * 2);
        ctx.arc(6, -4, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#D9F8FF';
        ctx.fillRect(-4, -10, 2, 2);
        ctx.fillRect(2, -9, 2, 2);

        // Strings
        ctx.strokeStyle = '#CFE9FF';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-5, 0);
        ctx.lineTo(-2, 5);
        ctx.moveTo(0, 0);
        ctx.lineTo(0, 5);
        ctx.moveTo(6, 0);
        ctx.lineTo(2, 5);
        ctx.stroke();

        // Basket
        ctx.fillStyle = '#B5742E';
        ctx.fillRect(-3, 5, 6, 4);
        ctx.fillStyle = '#F7C082';
        ctx.fillRect(-2, 6, 4, 1);

        ctx.restore();
    }

    // ── Title screen ─────────────────────────────────────────────────────────
    _drawTitle(ctx, game) {
        // Deep gradient background + moving color clouds
        const titleGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
        titleGrad.addColorStop(0, '#030C30');
        titleGrad.addColorStop(1, '#060013');
        ctx.fillStyle = titleGrad;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        const pulse = NO_FLICKER_MODE ? 0.08 : (0.08 + 0.04 * Math.sin(game.titleTimer * 0.035));
        const glowA = ctx.createRadialGradient(CANVAS_W * 0.28, CANVAS_H * 0.36, 12, CANVAS_W * 0.28, CANVAS_H * 0.36, 88);
        glowA.addColorStop(0, `rgba(95,190,255,${0.25 + pulse})`);
        glowA.addColorStop(1, 'rgba(95,190,255,0)');
        ctx.fillStyle = glowA;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        const glowB = ctx.createRadialGradient(CANVAS_W * 0.78, CANVAS_H * 0.74, 16, CANVAS_W * 0.78, CANVAS_H * 0.74, 96);
        glowB.addColorStop(0, `rgba(224,110,255,${0.2 + pulse})`);
        glowB.addColorStop(1, 'rgba(224,110,255,0)');
        ctx.fillStyle = glowB;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        const vig = ctx.createRadialGradient(CANVAS_W / 2, CANVAS_H / 2, 18, CANVAS_W / 2, CANVAS_H / 2, 146);
        vig.addColorStop(0, 'rgba(0,0,0,0)');
        vig.addColorStop(1, 'rgba(0,0,8,0.72)');
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        // Decorative floating bubbles
        for (const b of game._titleBubbles || []) {
            drawBubble(ctx, b.x, b.y, b.w, false, BS_FLOAT, 0);
        }

        // ── Main title with neon glow ────────────────────────────────────────
        drawGlowText(ctx, 'BUBBLE', CANVAS_W / 2, 34, 4, '#FFE033', '#FF8800');
        drawGlowText(ctx, 'BOBBLE', CANVAS_W / 2, 55, 4, '#FF44DD', '#AA00FF');

        // ── Character sprites (animated, side by side) ───────────────────────
        const frame = STATIC_CHARACTER_VISUALS ? 0 : (Math.floor(game.titleTimer / 10) % 4);
        drawPlayer(ctx, CANVAS_W / 2 - 24, 86, 0, frame, true,  false, false, frame * (Math.PI * 0.5), frame * (Math.PI * 0.5), 0, false);
        drawPlayer(ctx, CANVAS_W / 2 +  8, 86, 1, frame, false, false, false, frame * (Math.PI * 0.5), frame * (Math.PI * 0.5), 0, false);

        // ── Thin divider ─────────────────────────────────────────────────────
        ctx.fillStyle = 'rgba(120,170,255,0.26)';
        ctx.fillRect(40, 107, CANVAS_W - 80, 1);

        // ── Story short text ────────────────────────────────────────────────
        drawTextCentered(ctx, 'STORY  BUB & BOB IN MONSTER CAVE', CANVAS_W / 2, 111, 1, '#4B638B');
        drawTextCentered(ctx, 'LIGHTNING=SKY STRIKE   WATER=FLOOD', CANVAS_W / 2, 118, 1, '#3D5B84');

        const kb = game.input && game.input.describeBindings
            ? game.input.describeBindings()
            : null;
        const startLabel = kb ? kb.start : 'ENTER';
        const p1Text = kb
            ? `P1  ${kb.p1.left}/${kb.p1.right}  ${kb.p1.jump}  ${kb.p1.shoot}`
            : 'P1  ARROWS  Z  X';
        const p2Text = kb
            ? `P2  ${kb.p2.left}/${kb.p2.right}  ${kb.p2.jump}  ${kb.p2.shoot}`
            : 'P2  A/D  Q  E';
        const modeText = game.startPlayerCount === 2 ? 'MODE  2P START' : 'MODE  1P START';
        const gamepadCount = Math.max(0, game.titleGamepads || 0);
        const padReadyText = gamepadCount >= 2
            ? `GAMEPAD ${gamepadCount}P  2P AUTO READY`
            : `GAMEPAD ${gamepadCount}P  CONNECT 2 PADS FOR AUTO 2P`;

        // ── Blinking start prompt ─────────────────────────────────────────────
        if (NO_FLICKER_MODE || (Math.floor(game.titleTimer / 22) % 2 === 0)) {
            drawGlowText(ctx, `PRESS ${startLabel} TO START`, CANVAS_W / 2, 130, 1, '#55FF88', '#00AA44');
        }

        // ── Hi-score ─────────────────────────────────────────────────────────
        ctx.fillStyle = 'rgba(255,150,50,0.08)';
        ctx.fillRect(60, 143, CANVAS_W - 120, 18);
        drawTextCentered(ctx, 'HI-SCORE', CANVAS_W / 2, 144, 1, '#FF9944');
        const hs = formatScore(game.highScore);
        drawGlowText(ctx, hs, CANVAS_W / 2, 153, 2, '#FFFFFF', '#AADDFF');
        const hsName = (game.highScoreName || '---').slice(0, 12).toUpperCase();
        drawTextCentered(ctx, hsName, CANVAS_W / 2, 164, 1, '#8EB7E8');

        // ── Divider ───────────────────────────────────────────────────────────
        ctx.fillStyle = 'rgba(100,150,255,0.15)';
        ctx.fillRect(40, 171, CANVAS_W - 80, 1);

        // ── Controls ─────────────────────────────────────────────────────────
        drawTextCentered(ctx, modeText, CANVAS_W / 2, 175, 1, '#90A8DD');
        drawTextCentered(ctx, p1Text, CANVAS_W / 2, 184, 1, '#6677AA');
        drawTextCentered(ctx, p2Text, CANVAS_W / 2, 193, 1, '#6677AA');
        drawTextCentered(ctx, 'GAMEPAD  LS/DPAD MOVE  A JUMP  X SHOOT  START', CANVAS_W / 2, 201, 1, '#6C84BE');
        drawTextCentered(ctx, padReadyText, CANVAS_W / 2, 209, 1, gamepadCount >= 2 ? '#86EEFF' : '#6A7DAE');
        drawTextCentered(ctx, kb ? `ULTRA VISUAL LOCKED  ${kb.mute}=MUTE  ${kb.settings}=SETTINGS` : 'ULTRA VISUAL LOCKED  M = MUTE  F1 = SETTINGS', CANVAS_W / 2, 217, 1, '#334455');
    }

    // ── Game Over screen ──────────────────────────────────────────────────────
    _drawGameOver(ctx, game) {
        const cleared = !!game.gameClear;
        // Dark background with purple-red gradient
        const bg = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
        if (cleared) {
            bg.addColorStop(0, '#02132A');
            bg.addColorStop(1, '#01050E');
        } else {
            bg.addColorStop(0, '#120012');
            bg.addColorStop(1, '#040007');
        }
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        // Pulsing red vignette
        const pulse = NO_FLICKER_MODE ? 0.3 : (0.3 + 0.3 * Math.sin(game.gameOverTimer * 0.05));
        const rg = ctx.createRadialGradient(CANVAS_W/2, CANVAS_H/2, 0, CANVAS_W/2, CANVAS_H/2, 140);
        rg.addColorStop(0, cleared ? `rgba(0,80,120,${pulse})` : `rgba(60,0,0,${pulse})`);
        rg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = rg;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        if (cleared) {
            drawGlowText(ctx, 'GAME', CANVAS_W / 2, 58, 4, '#8AF2FF', '#2A8CD8');
            drawGlowText(ctx, 'CLEAR', CANVAS_W / 2, 79, 4, '#E8FF8A', '#8AC92A');
            drawTextCentered(ctx, 'DRAGON KING DOWN!', CANVAS_W / 2, 96, 1, '#AEEBFF');
        } else {
            // GAME OVER with red neon glow
            drawGlowText(ctx, 'GAME', CANVAS_W / 2, 58, 4, '#FF2222', '#CC0000');
            drawGlowText(ctx, 'OVER', CANVAS_W / 2, 79, 4, '#FF2222', '#CC0000');
        }

        // Score panel
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(50, 108, CANVAS_W - 100, 24);
        drawTextCentered(ctx, 'SCORE', CANVAS_W / 2, 110, 1, '#FFDD00');
        const finalScore = Number.isFinite(game.gameOverFinalScore)
            ? game.gameOverFinalScore
            : Math.max(...(Array.isArray(game.scores) ? game.scores : [0]), 0);
        const sc = formatScore(finalScore);
        drawGlowText(ctx, sc, CANVAS_W / 2, 119, 2, '#FFFFFF', '#AADDFF');

        // New high score flash
        if (!cleared && finalScore > 0 && finalScore >= game.highScore) {
            if (NO_FLICKER_MODE || (Math.floor(game.gameOverTimer / 18) % 2 === 0)) {
                drawGlowText(ctx, 'NEW RECORD!', CANVAS_W / 2, 148, 1, '#FFE033', '#FF8800');
            }
        }

        // Continue prompt
        const startLabel = game.input && game.input.getBindingLabel
            ? game.input.getBindingLabel('start')
            : 'ENTER';
        if (NO_FLICKER_MODE || (Math.floor(game.gameOverTimer / 22) % 2 === 0)) {
            drawTextCentered(ctx, `PRESS ${startLabel}`, CANVAS_W / 2, 166, 1, '#55FF88');
        }
    }
}

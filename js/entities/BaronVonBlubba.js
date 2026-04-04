import { Entity } from './Entity.js';
import { PLAY_W, PLAY_H } from '../constants.js';
import { aabbOverlap } from '../utils/MathUtil.js';

const W = 16, H = 16;
const SPEED = 1.0;

/**
 * Baron Von Blubba — the indestructible skeleton-whale that appears after the
 * Hurry Up timer expires.  Passes through all tiles and bubbles.
 * Steers toward the nearest player at constant speed.
 */
export class BaronVonBlubba extends Entity {
    constructor(x, y) {
        super(x, y, W, H);
        this.animFrame = 0;
        this.animTimer = 0;
        this.active    = true;
    }

    update(game) {
        this.savePrev();

        // Find nearest player
        let target = null, minD = Infinity;
        for (const p of game.players) {
            if (!p.active || p.dead || (p.invincible || 0) > 0) continue;
            const dx = p.pos.x - this.pos.x;
            const dy = p.pos.y - this.pos.y;
            const d  = dx * dx + dy * dy;
            if (d < minD) { minD = d; target = p; }
        }

        if (target) {
            const dx = target.cx() - this.cx();
            const dy = target.cy() - this.cy();
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            this.vel.x = (dx / len) * SPEED;
            this.vel.y = (dy / len) * SPEED;
        }

        this.pos.x += this.vel.x;
        this.pos.y += this.vel.y;

        // Wrap
        if (this.pos.x < -W) this.pos.x += PLAY_W + W;
        if (this.pos.x > PLAY_W) this.pos.x -= PLAY_W + W;
        if (this.pos.y < -H) this.pos.y += PLAY_H + H;
        if (this.pos.y > PLAY_H) this.pos.y -= PLAY_H + H;

        // Animation
        this.animTimer++;
        if (this.animTimer >= 8) { this.animTimer = 0; this.animFrame ^= 1; }

        // Kill player on contact
        for (const p of game.players) {
            if (!p.active || p.dead || p.invincible > 0) continue;
            if (aabbOverlap(
                this.pos.x, this.pos.y, W, H,
                p.pos.x, p.pos.y, p.size.w, p.size.h
            )) {
                p.kill(game);
            }
        }
    }
}

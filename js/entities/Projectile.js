import { Entity } from './Entity.js';
import { PROJ_W, PROJ_H, PROJ_SPEED, PLAY_W, PLAY_H } from '../constants.js';
import { aabbOverlap } from '../utils/MathUtil.js';

export class Projectile extends Entity {
    constructor() {
        super(0, 0, PROJ_W, PROJ_H);
        this.active = false;
    }

    init(x, y, dir, options = null) {
        const opts = options || {};
        const mode = typeof opts.mode === 'string' ? opts.mode : 'enemy';
        const ownerId = Number.isFinite(opts.ownerId) ? (opts.ownerId | 0) : 0;
        const damage = Number.isFinite(opts.damage) ? Math.max(1, opts.damage | 0) : 1;
        this.pos.x    = x;
        this.pos.y    = y;
        this.prevPos.x = x;
        this.prevPos.y = y;
        this.mode     = mode;
        this.ownerId  = ownerId;
        this.damage   = damage;
        this.size.w   = mode === 'lightning' ? 12 : PROJ_W;
        this.size.h   = mode === 'lightning' ? 6 : PROJ_H;
        this.vel.x    = dir * (mode === 'lightning' ? 4.8 : PROJ_SPEED);
        this.vel.y    = 0;
        this.active   = true;
        this.lifetime = 0;
    }

    update(game) {
        this.savePrev();
        this.lifetime++;

        if (this.mode === 'lightning') {
            const boss = game.isBossStage ? game.bossEnemy : null;
            const lightningSpeed = 5.6;
            const maxLife = 260;
            if (boss && !boss.dead) {
                // Home toward the boss so bursted lightning can actually connect.
                const tx = boss.pos.x + boss.size.w * 0.5;
                const ty = boss.pos.y + boss.size.h * 0.5;
                const cx = this.pos.x + this.size.w * 0.5;
                const cy = this.pos.y + this.size.h * 0.5;
                const dx = tx - cx;
                const dy = ty - cy;
                const len = Math.hypot(dx, dy) || 1;
                this.vel.x = (dx / len) * lightningSpeed;
                this.vel.y = (dy / len) * lightningSpeed;
            }
            this.pos.x += this.vel.x;
            this.pos.y += this.vel.y;

            if (!boss || boss.dead) {
                if (
                    this.pos.x < -this.size.w || this.pos.x > PLAY_W + this.size.w ||
                    this.pos.y < -this.size.h || this.pos.y > PLAY_H + this.size.h
                ) {
                    this.active = false;
                    return;
                }
            } else {
                // Keep lightning in a generous gameplay area while the boss is alive.
                // This prevents early disappearance if the boss is near screen edges.
                const minX = -24;
                const maxX = PLAY_W + 24;
                const minY = -28;
                const maxY = PLAY_H + 24;
                if (this.pos.x < minX) this.pos.x = minX;
                if (this.pos.x > maxX) this.pos.x = maxX;
                if (this.pos.y < minY) this.pos.y = minY;
                if (this.pos.y > maxY) this.pos.y = maxY;
            }

            // Boss-targeted lightning: flies straight and can hit the boss (or normal enemies).
            if (game.isBossStage && boss && !boss.dead) {
                const bossPad = 2;
                if (aabbOverlap(
                    this.pos.x, this.pos.y, this.size.w, this.size.h,
                    boss.pos.x - bossPad, boss.pos.y - bossPad, boss.size.w + bossPad * 2, boss.size.h + bossPad * 2
                )) {
                    if (typeof boss.takeLightningHit === 'function') {
                        const face = this.vel.x >= 0 ? 1 : -1;
                        const hit = boss.takeLightningHit(this.damage || 1, game, this.ownerId || 0, face);
                        if (hit) {
                            game.scorePopups.push({
                                x: boss.pos.x + boss.size.w * 0.5,
                                y: boss.pos.y + boss.size.h * 0.3,
                                score: 1400,
                                timer: 45,
                                get alpha() { return this.timer / 45; },
                                get active() { return this.timer > 0; },
                                update() { this.timer--; this.y -= 0.4; },
                            });
                        }
                    }
                    this.active = false;
                    return;
                }
            }

            for (const enemy of game.enemies) {
                if (!enemy || enemy.dead || !enemy.active) continue;
                if (enemy === game.bossEnemy) continue;
                if (aabbOverlap(
                    this.pos.x, this.pos.y, this.size.w, this.size.h,
                    enemy.pos.x, enemy.pos.y, enemy.size.w, enemy.size.h
                )) {
                    game.onEnemyKilled(enemy, enemy.pos.x, enemy.pos.y, this.ownerId || 0);
                    this.active = false;
                    return;
                }
            }

            if (this.lifetime > maxLife) {
                this.active = false;
                return;
            }
            return;
        }

        this.pos.x += this.vel.x;
        if (this.pos.x < -this.size.w || this.pos.x > PLAY_W) {
            this.active = false;
            return;
        }

        // Hit solid tile
        if (game.collisionMap.isSolidAt(this.pos.x + this.size.w * 0.5, this.pos.y + this.size.h * 0.5)) {
            this.active = false;
            return;
        }

        // Hit player
        for (const player of game.players) {
            if (!player.active || player.dead || player.invincible > 0) continue;
            if (aabbOverlap(
                this.pos.x, this.pos.y, this.size.w, this.size.h,
                player.pos.x, player.pos.y, player.size.w, player.size.h
            )) {
                player.kill(game);
                this.active = false;
                return;
            }
        }

        if (this.lifetime > 200) this.active = false;
    }
}

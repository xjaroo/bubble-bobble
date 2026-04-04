import { Enemy } from './Enemy.js';
import { PLAY_W } from '../../constants.js';
import { aabbOverlap } from '../../utils/MathUtil.js';

/**
 * Stage 100 boss: Dragon King
 * - Large body
 * - Patrols near top
 * - Spawns lightning bubbles that players must pop with tail-side control
 */
export class DragonKing extends Enemy {
    constructor(x, y) {
        super(x, y, 34, 26);
        this.kind = 'DragonKing';
        this.bubbleImmune = true;
        this.speed = 0.58;
        this.dir = 1;
        this.hp = 14;
        this.maxHp = 14;
        this.invuln = 0;
        this.spawnTimer = 105;
        this.waveT = 0;
        this.introDrop = true;
        this.spawnGrace = 120;
        this.angry = true;
    }

    update(game) {
        if (this.dead) return;
        this.savePrev();

        if (this.spawnGrace > 0) this.spawnGrace--;
        if (this.invuln > 0) this.invuln--;

        if (this.introDrop) {
            this.vel.y = Math.min(this.vel.y + 0.18, 1.5);
            this.pos.y += this.vel.y;
            if (this.pos.y >= 26) {
                this.pos.y = 26;
                this.vel.y = 0;
                this.introDrop = false;
            }
        } else {
            this.waveT += 0.05;
            this.pos.x += this.dir * this.speed;
            this.pos.y = 26 + Math.sin(this.waveT) * 3.4;

            const leftLimit = 10;
            const rightLimit = PLAY_W - this.size.w - 10;
            if (this.pos.x <= leftLimit) {
                this.pos.x = leftLimit;
                this.dir = 1;
            } else if (this.pos.x >= rightLimit) {
                this.pos.x = rightLimit;
                this.dir = -1;
            }

            this.spawnTimer--;
            if (this.spawnTimer <= 0) {
                const requiredFacing = Math.random() < 0.5 ? 1 : -1;
                const lx = this.pos.x + this.size.w * 0.5 + (requiredFacing > 0 ? -10 : 10);
                const ly = this.pos.y + this.size.h * 0.56;
                game.spawnBossLightningBubble(lx, ly, requiredFacing);

                const hpFrac = this.hp / Math.max(1, this.maxHp);
                this.spawnTimer = hpFrac < 0.35 ? 44 : hpFrac < 0.65 ? 58 : 74;
            }
        }

        if (this.spawnGrace <= 0) {
            for (const p of game.players) {
                if (!p.active || p.dead || p.invincible > 0) continue;
                if (aabbOverlap(
                    this.pos.x, this.pos.y, this.size.w, this.size.h,
                    p.pos.x, p.pos.y, p.size.w, p.size.h
                )) {
                    p.kill(game);
                }
            }
        }

        this.animTimer++;
        if (this.animTimer >= 8) {
            this.animTimer = 0;
            this.animFrame = (this.animFrame + 1) % 4;
        }
    }

    takeLightningHit(damage, game, playerId = 0, _facing = 1) {
        if (this.dead || this.invuln > 0) return false;
        const dmg = Math.max(1, damage | 0);
        this.hp = Math.max(0, this.hp - dmg);
        this.invuln = 10;
        game.addScore(playerId, 1400);
        game.sound.play('pop');
        if (this.hp <= 0) {
            this.dead = true;
            this.active = false;
            game.onBossDefeated(playerId);
        }
        return true;
    }
}

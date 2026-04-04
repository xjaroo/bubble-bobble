import { Enemy } from './Enemy.js';
import { ENEMY_W, ENEMY_H, JUMP_VEL } from '../../constants.js';
import { randInt } from '../../utils/MathUtil.js';

/**
 * Monsta (Beluga) — faster, more aggressive variant.
 * Chases the player directly.
 */
export class Monsta extends Enemy {
    constructor(x, y) {
        super(x, y, ENEMY_W, ENEMY_H);
        this.speed           = 1.05;
        this.jumpTimer       = randInt(40, 100);
        this.baseEscapeTimer = 160;
    }

    _ai(game) {
        // Always chase nearest player
        let target = null;
        let minD   = Infinity;
        for (const p of game.players) {
            if (!p.active || p.dead) continue;
            const dx = p.pos.x - this.pos.x;
            const dy = p.pos.y - this.pos.y;
            const d  = dx * dx + dy * dy;
            if (d < minD) { minD = d; target = p; }
        }

        if (target) {
            this.dir   = target.pos.x > this.pos.x ? 1 : -1;
            this.vel.x = this.dir * this.speed;

            // Jump if target is above and we're on the ground
            if (this.onGround && target.pos.y < this.pos.y - 16) {
                this.jumpTimer--;
                if (this.jumpTimer <= 0) {
                    this.vel.y   = JUMP_VEL;
                    this.jumpTimer = randInt(40, 100);
                }
            }
        } else {
            this.vel.x = this.dir * this.speed;
        }
    }
}

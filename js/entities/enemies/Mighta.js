import { Enemy } from './Enemy.js';
import { ENEMY_W, ENEMY_H, JUMP_VEL } from '../../constants.js';
import { randInt } from '../../utils/MathUtil.js';

/**
 * Mighta — robed enemy that shoots projectiles toward the nearest player.
 */
export class Mighta extends Enemy {
    constructor(x, y) {
        super(x, y, ENEMY_W, ENEMY_H);
        this.speed         = 0.62;
        this.shootTimer    = randInt(90, 180);
        this.jumpTimer     = randInt(100, 220);
        this.baseEscapeTimer = 180;
    }

    _ai(game) {
        this.vel.x = this.dir * this.speed;

        // Find nearest player
        let nearestPlayer = null;
        let nearestDist   = Infinity;
        for (const p of game.players) {
            if (!p.active || p.dead) continue;
            const dx = p.pos.x - this.pos.x;
            const dy = p.pos.y - this.pos.y;
            const d  = dx * dx + dy * dy;
            if (d < nearestDist) { nearestDist = d; nearestPlayer = p; }
        }

        if (nearestPlayer) {
            this.dir = nearestPlayer.pos.x > this.pos.x ? 1 : -1;
        }

        // Shoot
        if (this.onGround) {
            this.shootTimer--;
            if (this.shootTimer <= 0) {
                this.shootTimer = randInt(80, 180);
                if (nearestPlayer) {
                    game.spawnProjectile(
                        this.pos.x + (this.dir > 0 ? this.size.w : 0),
                        this.pos.y + this.size.h * 0.5 - 3,
                        this.dir
                    );
                }
            }

            // Occasional jump
            this.jumpTimer--;
            if (this.jumpTimer <= 0) {
                this.vel.y     = JUMP_VEL * 0.9;
                this.jumpTimer = randInt(120, 240);
            }
        }
    }
}

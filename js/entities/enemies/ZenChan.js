import { Enemy } from './Enemy.js';
import { ENEMY_W, ENEMY_H, JUMP_VEL } from '../../constants.js';
import { randInt } from '../../utils/MathUtil.js';

/**
 * Zen-Chan — the basic box-shaped enemy.
 * Patrols left/right, occasionally jumps, reverses on wall hit.
 */
export class ZenChan extends Enemy {
    constructor(x, y) {
        super(x, y, ENEMY_W, ENEMY_H);
        this.speed       = 0.72;
        this.jumpTimer   = randInt(60, 180);
        this.baseEscapeTimer = 220;
    }

    _ai(game) {
        this.vel.x = this.dir * this.speed;

        // Random jump
        if (this.onGround) {
            this.jumpTimer--;
            if (this.jumpTimer <= 0) {
                this.vel.y     = JUMP_VEL * 0.85;
                this.jumpTimer = randInt(80, 200);
                // Bias toward the nearest player
                const player = game.players[0];
                if (player && player.active) {
                    this.dir = player.pos.x > this.pos.x ? 1 : -1;
                }
            }
        }
    }
}

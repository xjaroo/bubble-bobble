import { Entity } from './Entity.js';
import { PROJ_W, PROJ_H, PROJ_SPEED, PLAY_W } from '../constants.js';
import { aabbOverlap } from '../utils/MathUtil.js';

export class Projectile extends Entity {
    constructor() {
        super(0, 0, PROJ_W, PROJ_H);
        this.active = false;
    }

    init(x, y, dir) {
        this.pos.x    = x;
        this.pos.y    = y;
        this.prevPos.x = x;
        this.prevPos.y = y;
        this.vel.x    = dir * PROJ_SPEED;
        this.vel.y    = 0;
        this.active   = true;
        this.lifetime = 0;
    }

    update(game) {
        this.savePrev();
        this.lifetime++;

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

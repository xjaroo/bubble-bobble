import { Entity } from '../Entity.js';
import { GRAVITY, MAX_FALL_SPEED, PLAY_W, PLAY_H, STATIC_CHARACTER_VISUALS } from '../../constants.js';
import { aabbOverlap } from '../../utils/MathUtil.js';

/**
 * Base enemy class.
 * Subclasses override _ai() to implement specific movement patterns.
 */
export class Enemy extends Entity {
    constructor(x, y, w, h) {
        super(x, y, w, h);
        this.dir           = Math.random() < 0.5 ? 1 : -1;
        this.speed         = 0.8;
        this.angry         = false;
        this.trapped       = false;
        this.dead          = false;
        this.deadTimer     = 0;
        this.animFrame     = 0;
        this.animTimer     = 0;
        this.animSpeed     = 14;
        this.baseEscapeTimer = 220;
        this.angrySpeedMul = 2.2;
        this._groundLockY  = Math.round(y);
    }

    setAngry() {
        if (this.angry || this.trapped || this.dead) return;
        this.angry   = true;
        this.speed  *= this.angrySpeedMul;
        this.baseEscapeTimer = Math.floor(this.baseEscapeTimer * 0.4);
    }

    update(game) {
        if (this.dead || this.trapped) return;
        this.savePrev();

        // AI logic (overridden by subclasses)
        this._ai(game);

        // Gravity
        this.vel.y = Math.min(this.vel.y + GRAVITY, MAX_FALL_SPEED);

        // Resolve Y
        const { dy, onGround } = game.collisionMap.sweepY(this, this.vel.y);
        this.pos.y += dy;
        this.onGround = onGround;
        if (onGround) this.vel.y = 0;
        if (onGround) this.pos.y = Math.round(this.pos.y);
        if (STATIC_CHARACTER_VISUALS) {
            if (onGround) {
                if (Number.isFinite(this._groundLockY)) {
                    if (Math.abs(this.pos.y - this._groundLockY) <= 1) {
                        this.pos.y = this._groundLockY;
                    } else {
                        this._groundLockY = Math.round(this.pos.y);
                    }
                } else {
                    this._groundLockY = Math.round(this.pos.y);
                }
                this.vel.y = 0;
                this.prevPos.y = this.pos.y;
            } else {
                this._groundLockY = null;
            }
        }

        // Resolve X
        const dx = game.collisionMap.sweepX(this, this.vel.x);
        if (dx !== this.vel.x) {
            this.dir *= -1;
            this.vel.x = this.dir * this.speed;
        }
        this.pos.x += dx;

        if (STATIC_CHARACTER_VISUALS) {
            // Keep only vertical anchor locked when static visuals are enabled.
            // Do not quantize X every frame, otherwise low enemy speeds collapse to 0 movement.
            this.pos.y = Math.round(this.pos.y);
            this.prevPos.y = this.pos.y;
        }

        // Prevent tiny residual X drift from looking like vibration.
        if (this.onGround && Math.abs(this.vel.x) < 0.08) {
            this.vel.x = 0;
            this.pos.x = Math.round(this.pos.x);
            this.prevPos.x = this.pos.x;
        }

        if (STATIC_CHARACTER_VISUALS) {
            this.animTimer = 0;
            this.animFrame = 0;
        } else {
            // Animation: only step when actually moving (or airborne).
            const movedX = Math.abs(this.pos.x - this.prevPos.x);
            const moving = movedX > 0.05 || !this.onGround;
            if (moving) {
                this.animTimer++;
                if (this.animTimer >= this.animSpeed) {
                    this.animTimer = 0;
                    this.animFrame = (this.animFrame + 1) % 4;
                }
            } else {
                this.animTimer = 0;
                this.animFrame = 0;
            }
        }

        // Screen wrap
        if (this.pos.x < -this.size.w) this.pos.x += PLAY_W;
        if (this.pos.x > PLAY_W)        this.pos.x -= PLAY_W;

        // Clamp vertically (shouldn't fall off bottom, but just in case)
        if (this.pos.y > PLAY_H) this.pos.y = 0;

        // Collision with players
        for (const player of game.players) {
            if (!player.active || player.dead) continue;
            const canSmash = (player.smashInvincible || 0) > 0;
            if (!canSmash && player.invincible > 0) continue;
            if (aabbOverlap(
                this.pos.x, this.pos.y, this.size.w, this.size.h,
                player.pos.x, player.pos.y, player.size.w, player.size.h
            )) {
                if (canSmash) {
                    game.onEnemyKilled(this, this.pos.x, this.pos.y, player.id);
                    game.sound.play('pop');
                } else {
                    player.kill(game);
                }
                return;
            }
        }
    }

    /** Override in subclasses to set vel.x and handle special behaviour. */
    _ai(game) {
        this.vel.x = this.dir * this.speed;
    }
}

import { Entity } from './Entity.js';
import {
    PLAYER_W, PLAYER_H, GRAVITY, MAX_FALL_SPEED,
    JUMP_VEL, WALK_SPEED, SHOOT_COOLDOWN, PLAY_W, PLAY_H,
    STATIC_CHARACTER_VISUALS
} from '../constants.js';

const INVINCIBLE_TICKS = 180; // after respawn
const RESPAWN_TICKS    = 90;  // death animation duration
const GROUND_ACCEL      = 0.065;
const AIR_ACCEL         = 0.045;
const GROUND_FRICTION   = 0.10;
const AIR_FRICTION      = 0.03;
const TURN_BOOST        = 0.08;
const WALK_ANIM_MIN_VX  = 0.10;
const JUMP_BUFFER_TICKS = 7;
const COYOTE_TICKS      = 6;
const JUMP_HOLD_TICKS   = 10;
const JUMP_HOLD_GRAVITY_SCALE = 0.42;
const JUMP_RELEASE_CUT  = 0.45;
const DROP_THROUGH_TICKS = 10;
const SHOE_SPEED_MULT   = 1.85;
const BUBBLE_SPEED_MULT = 1.55;
const BUBBLE_RAPID_COOLDOWN = Math.max(6, Math.floor(SHOOT_COOLDOWN * 0.65));

export class Player extends Entity {
    /**
     * @param {number} id  0 = Bub (P1), 1 = Bob (P2)
     * @param {number} x   initial playfield x
     * @param {number} y   initial playfield y
     */
    constructor(id, x, y) {
        super(x, y, PLAYER_W, PLAYER_H);
        this.id          = id;
        this.facing      = 1;         // 1=right, -1=left
        this.dead        = false;
        this.deadTimer   = 0;
        this.invincible  = 0;
        this.smashInvincible = 0;
        this.shootCooldown = 0;
        this.animFrame   = 0;
        this.animTimer   = 0;
        this.animPhase   = 0;
        this.tailPhase   = STATIC_CHARACTER_VISUALS ? 0 : Math.random() * Math.PI * 2;
        this.jumpBuffer  = 0;
        this.coyoteTimer = 0;
        this.jumpHoldTimer = 0;
        this.jumpCutApplied = false;
        this.dropThroughTimer = 0;
        this.speedBoost  = 0;
        this.bubbleBoost = 0;
        this._spawnX     = x;
        this._spawnY     = y;
        this._groundLockY = Math.round(y);
    }

    update(game) {
        if (this.dead) {
            this.deadTimer--;
            if (this.deadTimer <= 0) {
                this._respawn(game);
            }
            return;
        }

        this.savePrev();

        if (this.invincible > 0) this.invincible--;
        if (this.smashInvincible > 0) this.smashInvincible--;
        if (this.shootCooldown > 0) this.shootCooldown--;
        if (this.speedBoost > 0) this.speedBoost--;
        if (this.bubbleBoost > 0) this.bubbleBoost--;
        if (this.dropThroughTimer > 0) this.dropThroughTimer--;

        const input = game.input;
        const speed = WALK_SPEED * (this.speedBoost > 0 ? SHOE_SPEED_MULT : 1);

        // Horizontal input
        const left  = this.id === 0 ? input.p1Left()  : input.p2Left();
        const right = this.id === 0 ? input.p1Right() : input.p2Right();
        const inputDir = (right ? 1 : 0) - (left ? 1 : 0);

        if (inputDir !== 0) {
            const accel = this.onGround ? GROUND_ACCEL : AIR_ACCEL;
            const turning = this.vel.x !== 0 && Math.sign(this.vel.x) !== inputDir;
            this.vel.x += inputDir * (turning ? TURN_BOOST : accel);
            if (this.vel.x > speed) this.vel.x = speed;
            if (this.vel.x < -speed) this.vel.x = -speed;
            this.facing = inputDir;
        } else {
            const friction = this.onGround ? GROUND_FRICTION : AIR_FRICTION;
            if (Math.abs(this.vel.x) <= friction) this.vel.x = 0;
            else this.vel.x -= Math.sign(this.vel.x) * friction;
            if (STATIC_CHARACTER_VISUALS && this.onGround) {
                // Eliminate idle drift completely in static mode.
                this.vel.x = 0;
            }
        }

        const jumpPressed = this.id === 0 ? input.p1Jump() : input.p2Jump();
        const jumpHeld = this.id === 0 ? input.p1JumpHeld() : input.p2JumpHeld();
        const downHeld = this.id === 0 ? input.p1DownHeld() : input.p2DownHeld();
        if (jumpPressed) {
            if (downHeld && this.onGround && game.collisionMap.isStandingOnPlatform(this)) {
                // Down + jump on one-way platform: drop through to lower lane.
                this.dropThroughTimer = DROP_THROUGH_TICKS;
                this.jumpBuffer = 0;
                this.coyoteTimer = 0;
                this.onGround = false;
                this.pos.y += 1;
            } else {
                this.jumpBuffer = JUMP_BUFFER_TICKS;
            }
        } else if (this.jumpBuffer > 0) {
            this.jumpBuffer--;
        }

        if (this.onGround) this.coyoteTimer = COYOTE_TICKS;
        else if (this.coyoteTimer > 0) this.coyoteTimer--;

        // Jump (buffered + coyote time for reliable one-press response)
        if (this.jumpBuffer > 0 && this.coyoteTimer > 0) {
            this.jumpBuffer = 0;
            this.coyoteTimer = 0;
            this.vel.y = JUMP_VEL;
            this.onGround = false;
            this.jumpHoldTimer = JUMP_HOLD_TICKS;
            this.jumpCutApplied = false;
            game.sound.play('jump');
        }

        // Shoot
        const shootPressed = this.id === 0 ? input.p1Shoot() : input.p2Shoot();
        if (shootPressed && this.shootCooldown <= 0) {
            this._shoot(game);
        }

        // Variable jump:
        // quick tap => short jump, hold => longer jump.
        let gravityScale = 1;
        if (this.vel.y < 0) {
            if (jumpHeld && this.jumpHoldTimer > 0) {
                gravityScale = JUMP_HOLD_GRAVITY_SCALE;
                this.jumpHoldTimer--;
            } else if (!jumpHeld && !this.jumpCutApplied) {
                this.vel.y *= JUMP_RELEASE_CUT;
                this.jumpCutApplied = true;
            }
        } else {
            this.jumpHoldTimer = 0;
            this.jumpCutApplied = false;
        }

        // Gravity
        this.vel.y = Math.min(this.vel.y + GRAVITY * gravityScale, MAX_FALL_SPEED);

        // Resolve Y
        const { dy, onGround, hitCeiling } = game.collisionMap.sweepY(
            this,
            this.vel.y,
            { ignorePlatforms: this.dropThroughTimer > 0 }
        );
        this.pos.y += dy;
        this.onGround = onGround;
        if (onGround || hitCeiling) this.vel.y = 0;
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
        this.pos.x += dx;

        // Screen wrap (left-right)
        if (this.vel.x < 0 && this.pos.x < -this.size.w + 4) {
            this.pos.x = PLAY_W - 4;
        } else if (this.vel.x > 0 && this.pos.x + this.size.w > PLAY_W + this.size.w - 4) {
            this.pos.x = -this.size.w + 4;
        }

        // Vertical wrap — fall off bottom reappears at top
        if (this.pos.y > PLAY_H + 8) {
            this.pos.y = -this.size.h;
            this.vel.y = 0;
        }

        // Hard stabilize X when coming to rest on ground.
        if (this.onGround && inputDir === 0 && (STATIC_CHARACTER_VISUALS || Math.abs(this.vel.x) < 0.08)) {
            this.vel.x = 0;
            this.pos.x = Math.round(this.pos.x);
            this.prevPos.x = this.pos.x;
        }

        // Animation
        if (STATIC_CHARACTER_VISUALS) {
            this.tailPhase = 0;
            this.animPhase = 0;
            this.animFrame = 0;
            this.animTimer = 0;
        } else {
            const absVX = Math.abs(this.vel.x);
            const tailSpeed = this.onGround
                ? (absVX >= WALK_ANIM_MIN_VX ? 0.02 + absVX * 0.01 : 0)
                : 0.028;
            this.tailPhase = (this.tailPhase + tailSpeed) % (Math.PI * 2);

            if (this.onGround && absVX >= WALK_ANIM_MIN_VX) {
                this.animPhase = (this.animPhase + absVX * 0.05) % (Math.PI * 2);
                this.animFrame = (Math.floor(this.animPhase / (Math.PI * 0.5)) & 3);
            } else if (!this.onGround) {
                this.animPhase = (this.animPhase + 0.022) % (Math.PI * 2);
                this.animFrame = 1;
            } else {
                // Keep idle perfectly stable; prevents residual shake.
                this.animPhase = 0;
                this.animFrame = 0;
                this.animTimer = 0;
            }
        }
    }

    _shoot(game) {
        const boostedBubble = this.bubbleBoost > 0;
        this.shootCooldown = boostedBubble ? BUBBLE_RAPID_COOLDOWN : SHOOT_COOLDOWN;
        const bx = this.facing > 0
            ? this.pos.x + this.size.w
            : this.pos.x - 12;
        // Spawn slightly higher so shots do not scrape the ground on flat floors.
        const by = Math.max(0, this.pos.y - 2);
        game.spawnBubble(
            bx,
            by,
            this.facing,
            this.id,
            boostedBubble ? BUBBLE_SPEED_MULT : 1
        );
        game.sound.play('shoot');
    }

    kill(game) {
        if (this.dead || this.invincible > 0) return;
        this.dead      = true;
        this.deadTimer = RESPAWN_TICKS;
        this.vel.x     = 0;
        this.vel.y     = 0;
        game.sound.play('death');
        game.onPlayerDeath(this.id);
    }

    _respawn(game) {
        if (game.lives[this.id] < 0) {
            // Game over handled by Game
            return;
        }
        this.dead       = false;
        this.invincible = INVINCIBLE_TICKS;
        this.smashInvincible = 0;
        this.pos.x      = this._spawnX;
        this.pos.y      = this._spawnY;
        this.vel.x      = 0;
        this.vel.y      = 0;
        this.animFrame  = 0;
        this.animPhase  = 0;
        this.tailPhase  = STATIC_CHARACTER_VISUALS ? 0 : Math.random() * Math.PI * 2;
        this._groundLockY = Math.round(this.pos.y);
        this.jumpBuffer = 0;
        this.coyoteTimer = 0;
        this.jumpHoldTimer = 0;
        this.jumpCutApplied = false;
        this.dropThroughTimer = 0;
        this.bubbleBoost = 0;
        this.onGround   = false;
        if (typeof game.onPlayerRespawn === 'function') {
            game.onPlayerRespawn(this);
        }
    }

    get visible() {
        // Keep character fully visible at all times (no flicker/blink).
        return !this.dead;
    }
}

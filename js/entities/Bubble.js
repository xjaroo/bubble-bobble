import { Entity } from './Entity.js';
import {
    BUBBLE_W, BUBBLE_H,
    BUBBLE_TRAVEL_SPEED, BUBBLE_DECEL,
    BUBBLE_FLOAT_TRIGGER_SPEED,
    BUBBLE_MIN_TRAVEL_TICKS,
    BUBBLE_TRAVEL_LIFT_START, BUBBLE_TRAVEL_LIFT_DAMP,
    BUBBLE_FLOAT_SPEED, BUBBLE_WOBBLE_AMP, BUBBLE_WOBBLE_SPEED,
    BUBBLE_LIFETIME, PLAY_W, PLAY_H, TILE_SIZE, JUMP_VEL
} from '../constants.js';
import { aabbOverlap } from '../utils/MathUtil.js';

export const BS_TRAVEL  = 'travel';
export const BS_FLOAT   = 'float';
export const BS_POPPING = 'popping';

// Trapped-enemy escape timing:
// stage 1 around 10s, then faster each stage.
const ESCAPE_BASE_TICKS = 600;      // ~10s at 60fps
const ESCAPE_STAGE_REDUCE = 40;     // ~0.67s faster per stage
const ESCAPE_MIN_TICKS = 180;       // floor ~3s
const FACE_PUSH_SPEED_TRAVEL = 2.4;
const FACE_PUSH_SPEED_FLOAT = 1.5;
const FACE_PUSH_NUDGE = 0.9;
const SIDE_ZONE_RATIO = 0.42;
const PUSH_CRASH_POP_TICKS = 12;
const WALL_CRASH_MIN_SPEED = 0.9;
const POP_CHAIN_RADIUS = 14;
const POP_CHAIN_RADIUS_SQ = POP_CHAIN_RADIUS * POP_CHAIN_RADIUS;

export class Bubble extends Entity {
    constructor() {
        super(0, 0, BUBBLE_W, BUBBLE_H);
        this.active = false;
    }

    init(x, y, dir, ownerId, speedMul = 1, options = null) {
        const opts = options || {};
        const kind = typeof opts.kind === 'string' ? opts.kind : 'normal';
        const lightningFacing = Number.isFinite(opts.lightningRequiredFacing)
            ? (opts.lightningRequiredFacing >= 0 ? 1 : -1)
            : 1;
        const startState = opts.startState === BS_FLOAT ? BS_FLOAT : BS_TRAVEL;
        this.pos.x    = x;
        this.pos.y    = y;
        this.prevPos.x = x;
        this.prevPos.y = y;
        this.vel.x    = dir * BUBBLE_TRAVEL_SPEED * Math.max(0.7, speedMul);
        this.vel.y    = BUBBLE_TRAVEL_LIFT_START;
        this.dir      = dir;          // 1 = right, -1 = left
        this.ownerId  = ownerId;      // player index
        this.state    = startState;
        this.kind     = kind;
        this.lightningRequiredFacing = kind === 'lightning' ? lightningFacing : 0;
        this.maxLifetime = Number.isFinite(opts.maxLifetime) ? Math.max(30, opts.maxLifetime | 0) : BUBBLE_LIFETIME;
        this.lifetime = 0;
        this.travelTicks = 0;
        this.wobbleT  = Math.random() * Math.PI * 2;
        this.trappedEnemy = null;
        this.popTimer = 0;
        this.pushCrashTimer = 0;
        this.lastPushPlayerId = ownerId;
        this.lightningSettled = false;
        this.active   = true;
        if (this.state === BS_FLOAT) {
            this.vel.x = 0;
            this.vel.y = kind === 'lightning' ? 0.52 : -BUBBLE_FLOAT_SPEED;
        }
    }

    update(game) {
        this.savePrev();
        this.lifetime++;
        if (this.pushCrashTimer > 0) this.pushCrashTimer--;

        switch (this.state) {
            case BS_TRAVEL:  this._updateTravel(game); break;
            case BS_FLOAT:   this._updateFloat(game);  break;
            case BS_POPPING: this._updatePopping(game); break;
        }
    }

    _updateTravel(game) {
        this.travelTicks++;

        // Decelerate
        this.vel.x *= BUBBLE_DECEL;
        if (this.vel.y < 0) this.vel.y *= BUBBLE_TRAVEL_LIFT_DAMP;
        else this.vel.y = 0;

        // Move horizontally; bounce off solid walls
        const dx = game.collisionMap.sweepX(this, this.vel.x);
        if (dx !== this.vel.x) {
            const crashPop = this.pushCrashTimer > 0 && Math.abs(this.vel.x) >= WALL_CRASH_MIN_SPEED;
            if (crashPop) {
                this.pop(game, true, this.lastPushPlayerId || this.ownerId || 0);
                return;
            }
            this.vel.x *= -0.7; // bounce
        }
        this.pos.x += dx;

        // Wrap if somehow past horizontal edge (no solid side walls variant)
        if (this.pos.x < 0) this.pos.x += PLAY_W;
        if (this.pos.x + this.size.w > PLAY_W) this.pos.x -= PLAY_W;

        // Check ceiling collision
        const { dy, hitCeiling } = game.collisionMap.sweepY(this, this.vel.y);
        this.pos.y += dy;
        if (hitCeiling) this.vel.y = 0;

        // Transition to FLOAT when nearly stopped
        if (this.travelTicks >= BUBBLE_MIN_TRAVEL_TICKS &&
            Math.abs(this.vel.x) < BUBBLE_FLOAT_TRIGGER_SPEED) {
            this.vel.x = 0;
            this._enterFloat();
            return;
        }

        if (this._checkPopByNearbyPoppingBubble(game)) return;

        // Try to trap an enemy
        if (!this.trappedEnemy && this.kind === 'normal') {
            for (const enemy of game.enemies) {
                if (!enemy.active || enemy.trapped) continue;
                if (enemy.bubbleImmune) continue;
                if (aabbOverlap(
                    this.pos.x, this.pos.y, this.size.w, this.size.h,
                    enemy.pos.x, enemy.pos.y, enemy.size.w, enemy.size.h
                )) {
                    this._trapEnemy(enemy, game);
                    break;
                }
            }
        }

        // Pop when a player bumps the bubble from below with their head.
        if (this._handleHeadHitPop(game)) return;

        // Player interaction with own bubble:
        // face/front side = push bubble, tail/back side = pop bubble.
        if (this._handlePlayerSideInteraction(game)) return;
    }

    _enterFloat() {
        this.state  = BS_FLOAT;
        this.vel.y  = -BUBBLE_FLOAT_SPEED;
        this.vel.x  = 0;
        this.wobbleT = 0;
    }

    _updateFloat(game) {
        if (this.kind === 'lightning') {
            this.vel.x = 0;
            if (!this.lightningSettled) {
                // Boss lightning bubbles drop to reachable lanes first.
                this.vel.y = Math.max(this.vel.y, 0.52);
            } else {
                this.vel.y = 0;
            }
        } else {
            this.wobbleT += BUBBLE_WOBBLE_SPEED;
            this.vel.x = Math.sin(this.wobbleT) * BUBBLE_WOBBLE_AMP * 0.04;
        }

        const dx = game.collisionMap.sweepX(this, this.vel.x);
        this.pos.x += dx;
        if (this.pos.x < 0) this.pos.x += PLAY_W;
        if (this.pos.x + this.size.w > PLAY_W) this.pos.x -= PLAY_W;

        const { dy, hitCeiling, onGround } = game.collisionMap.sweepY(this, this.vel.y);
        this.pos.y += dy;

        // Stick at ceiling once we float up there
        if (hitCeiling || onGround) {
            this.vel.y = 0;
            if (this.kind === 'lightning') this.lightningSettled = true;
        }

        // Auto-pop after lifetime expires
        if (this.lifetime >= this.maxLifetime) {
            this.pop(game, false);
            return;
        }

        // Trapped enemy escape countdown
        if (this.trappedEnemy) {
            this.trappedEnemy.escapeTimer--;
            if (this.trappedEnemy.escapeTimer <= 0) {
                this._releaseEnemy(game);
                return;
            }
        }

        // Pop when a player bumps the bubble from below with their head.
        if (this._handleHeadHitPop(game)) return;

        if (this._handlePlayerSideInteraction(game)) return;

        if (this._checkPopByNearbyPoppingBubble(game)) return;

        // On top contact:
        // hold jump -> bounce like trampoline
        // no jump hold while descending -> bubble pops
        if (this._handleTopContact(game)) return;
    }

    _handleHeadHitPop(game) {
        if (this.kind === 'lightning') return false;
        if (this.state === BS_POPPING) return false;
        const bBottom = this.pos.y + this.size.h;
        for (const player of game.players) {
            if (!player.active || player.dead) continue;
            // Only count upward movement as a head-bump.
            if (player.vel.y >= -0.05) continue;

            const pTop = player.pos.y;
            const pPrevTop = player.prevPos.y;
            if (pPrevTop < bBottom - 2 || pTop > bBottom + 1) continue;

            const headH = Math.max(2, Math.floor(player.size.h * 0.28));
            const headX = player.pos.x + 1;
            const headW = Math.max(2, player.size.w - 2);
            if (!aabbOverlap(
                headX, pTop, headW, headH,
                this.pos.x + 1, bBottom - 4, this.size.w - 2, 5
            )) continue;

            // Push player slightly down to avoid sticking into the popped bubble.
            player.pos.y = Math.max(player.pos.y, bBottom + 1);
            player.vel.y = Math.max(0.7, Math.abs(player.vel.y) * 0.2);
            player.onGround = false;
            this.pop(game, true, player.id);
            return true;
        }
        return false;
    }

    _handleTopContact(game) {
        if (this.kind === 'lightning') return false;
        if (this.state === BS_POPPING) return false;
        for (const player of game.players) {
            if (!player.active || player.dead) continue;
            if (player.vel.y <= 0) continue;

            const bTop = this.pos.y;
            const pPrevBottom = player.prevPos.y + player.size.h;
            if (pPrevBottom > bTop + 2) continue;
            if (!aabbOverlap(
                player.pos.x, player.pos.y, player.size.w, player.size.h,
                this.pos.x, bTop - 2, this.size.w, 6
            )) continue;

            const jumpHeld = player.id === 0
                ? game.input.p1JumpHeld()
                : game.input.p2JumpHeld();

            player.pos.y = bTop - player.size.h;
            if (jumpHeld) {
                player.vel.y = JUMP_VEL;
                player.onGround = false;
                player.jumpHoldTimer = Math.max(player.jumpHoldTimer || 0, 7);
                player.jumpCutApplied = false;
                game.sound.play('jump');
                continue;
            }

            // Descending onto the bubble without holding jump now pops it.
            player.onGround = false;
            this.pop(game, true, player.id);
            return true;
        }
        return false;
    }

    _handlePlayerSideInteraction(game) {
        if (this.state === BS_POPPING) return false;
        const isLightning = this.kind === 'lightning';
        for (const player of game.players) {
            if (!player.active || player.dead) continue;
            if (!isLightning && player.id !== this.ownerId) continue;

            const px = player.pos.x;
            const py = player.pos.y + 1;
            const pw = player.size.w;
            const ph = player.size.h - 2;
            const sideW = Math.max(3, Math.floor(pw * SIDE_ZONE_RATIO));
            const bubbleX = this.pos.x;
            const bubbleY = this.pos.y;
            const bubbleW = this.size.w;
            const bubbleH = this.size.h;
            const playerCenterX = px + pw * 0.5;
            const bubbleCenterX = bubbleX + bubbleW * 0.5;

            if (isLightning) {
                // Make boss mechanic readable: if touching and facing matches symbol,
                // allow immediate burst (no strict front/back micro-hitbox requirement).
                if (player.facing !== this.lightningRequiredFacing) continue;
                if (aabbOverlap(px, py, pw, ph, bubbleX, bubbleY, bubbleW, bubbleH)) {
                    this.pop(game, true, player.id);
                    return true;
                }
                continue;
            }

            if (player.facing >= 0) {
                const inFront = bubbleCenterX >= playerCenterX;
                const tailHit = aabbOverlap(px, py, sideW, ph, bubbleX, bubbleY, bubbleW, bubbleH);
                const faceHit = aabbOverlap(px + pw - sideW, py, sideW, ph, bubbleX, bubbleY, bubbleW, bubbleH);
                // Tail (left/back) hits -> pop
                if (tailHit && !inFront) {
                    if (isLightning && player.facing !== this.lightningRequiredFacing) continue;
                    this.pop(game, true, player.id);
                    return true;
                }
                // Face (right/front) hits -> push
                if (!isLightning && faceHit && inFront) {
                    this._pushFromFace(1, player.id);
                    return false;
                }
            } else {
                const inFront = bubbleCenterX <= playerCenterX;
                const tailHit = aabbOverlap(px + pw - sideW, py, sideW, ph, bubbleX, bubbleY, bubbleW, bubbleH);
                const faceHit = aabbOverlap(px, py, sideW, ph, bubbleX, bubbleY, bubbleW, bubbleH);
                // Tail (right/back) hits -> pop
                if (tailHit && !inFront) {
                    if (isLightning && player.facing !== this.lightningRequiredFacing) continue;
                    this.pop(game, true, player.id);
                    return true;
                }
                // Face (left/front) hits -> push
                if (!isLightning && faceHit && inFront) {
                    this._pushFromFace(-1, player.id);
                    return false;
                }
            }
        }
        return false;
    }

    _pushFromFace(dir, playerId = 0) {
        const pushSpeed = this.state === BS_TRAVEL ? FACE_PUSH_SPEED_TRAVEL : FACE_PUSH_SPEED_FLOAT;
        this.vel.x = dir * Math.max(pushSpeed, Math.abs(this.vel.x));
        this.pos.x += dir * FACE_PUSH_NUDGE;
        this.pushCrashTimer = PUSH_CRASH_POP_TICKS;
        this.lastPushPlayerId = playerId;

        // Horizontal wrap consistency
        if (this.pos.x < -this.size.w) this.pos.x += PLAY_W + this.size.w;
        if (this.pos.x > PLAY_W) this.pos.x -= PLAY_W + this.size.w;
    }

    _checkPopByNearbyPoppingBubble(game) {
        if (this.state === BS_POPPING) return false;
        if (this.kind === 'lightning') return false;
        const cx = this.pos.x + this.size.w * 0.5;
        const cy = this.pos.y + this.size.h * 0.5;
        for (const other of game.bubbles) {
            if (!other || other === this || !other.active) continue;
            if (other.state !== BS_POPPING) continue;
            const ox = other.pos.x + other.size.w * 0.5;
            const oy = other.pos.y + other.size.h * 0.5;
            const dx = cx - ox;
            const dy = cy - oy;
            if ((dx * dx + dy * dy) <= POP_CHAIN_RADIUS_SQ) {
                // Chain pop should also kill trapped enemies (Bubble Bobble style).
                // Keep empty-bubble behavior unchanged (no forced candy spam).
                if (this.trappedEnemy) {
                    const chainKiller =
                        other.lastPushPlayerId ??
                        other.ownerId ??
                        this.lastPushPlayerId ??
                        this.ownerId ??
                        0;
                    this.pop(game, true, chainKiller);
                } else {
                    this.pop(game, false);
                }
                return true;
            }
        }
        return false;
    }

    _updatePopping(game) {
        this.popTimer++;
        if (this.popTimer >= 8) {
            this.active = false;
        }
    }

    _trapEnemy(enemy, game) {
        enemy.trapped    = true;
        enemy.active     = false; // hide from normal updates
        this.trappedEnemy = enemy;
        const stage = game?.levelIndex ?? 0;
        let escapeTicks = ESCAPE_BASE_TICKS - stage * ESCAPE_STAGE_REDUCE;

        // Keep a small enemy-type difference but still near requested ~10s early.
        const baseType = enemy.baseEscapeTimer ?? 220;
        const typeScale = Math.max(0.85, Math.min(1.0, baseType / 220));
        escapeTicks *= typeScale;

        if (enemy.angry) {
            escapeTicks *= 0.65;
        }

        const difficultyEscapeMul = typeof game?.getEnemyEscapeMultiplier === 'function'
            ? game.getEnemyEscapeMultiplier()
            : 1;
        escapeTicks *= Math.max(0.8, difficultyEscapeMul);

        enemy.escapeTimer = Math.max(ESCAPE_MIN_TICKS, Math.floor(escapeTicks));
        game.sound.play('trap');
    }

    _releaseEnemy(game) {
        const e = this.trappedEnemy;
        this.trappedEnemy = null;
        e.trapped  = false;
        e.active   = true;
        e.pos.x    = this.pos.x;
        e.pos.y    = this.pos.y;
        e.setAngry();
        this.active = false;
    }

    pop(game, byPlayer = false, playerId = 0) {
        if (this.state === BS_POPPING) return;
        this.state    = BS_POPPING;
        this.popTimer = 0;
        game.sound.play('pop');

        if (this.kind === 'lightning') {
            if (typeof game.onLightningBubbleBurst === 'function') {
                game.onLightningBubbleBurst(
                    byPlayer ? playerId : 0,
                    this.lightningRequiredFacing,
                    this.pos.x + this.size.w * 0.5,
                    this.pos.y + this.size.h * 0.5
                );
            }
            this.trappedEnemy = null;
            return;
        }

        if (byPlayer && this.trappedEnemy) {
            // Score + item drop
            game.onEnemyKilled(this.trappedEnemy, this.pos.x, this.pos.y, playerId);
            this.trappedEnemy = null;
        } else if (!byPlayer && this.trappedEnemy) {
            this._releaseEnemy(game);
            return;
        } else {
            // Empty bubble popped — small bonus or drop candy
            if (byPlayer) game.spawnItem(this.pos.x, this.pos.y, 'candy');
        }
    }
}

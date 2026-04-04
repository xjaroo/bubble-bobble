import { Entity } from './Entity.js';
import {
    ITEM_W, ITEM_H, ITEM_GRAVITY, ITEM_LIFETIME,
    SCORE_CANDY, SCORE_RING, SCORE_GEM, SCORE_SHOE, SCORE_UMBRELLA, SCORE_CAKE, SCORE_RAINBOW, SCORE_LIGHTNING, SCORE_WATER,
    ITEM_CANDY, ITEM_RING, ITEM_GEM, ITEM_SHOE, ITEM_EXTEND, ITEM_POTION, ITEM_UMBRELLA, ITEM_CAKE, ITEM_RAINBOW, ITEM_LIGHTNING, ITEM_WATER,
    PLAY_W, NO_FLICKER_MODE
} from '../constants.js';
import { aabbOverlap } from '../utils/MathUtil.js';

const FOOD_VARIANTS = ['strawberry', 'grape', 'apple', 'banana', 'cherry'];
const GEM_INVINCIBLE_TICKS = 480; // ~8s

export class Item extends Entity {
    constructor() {
        super(0, 0, ITEM_W, ITEM_H);
        this.active = false;
        this.foodKind = 'strawberry';
        this.settled = false;
    }

    init(x, y, type, extendIndex = 0, lifetimeLimit = ITEM_LIFETIME, foodKind = null) {
        if (type === ITEM_CAKE) {
            this.size.w = 16;
            this.size.h = 12;
        } else if (type === ITEM_RAINBOW) {
            this.size.w = 12;
            this.size.h = 12;
        } else if (type === ITEM_UMBRELLA) {
            this.size.w = 12;
            this.size.h = 12;
        } else if (type === ITEM_LIGHTNING || type === ITEM_WATER) {
            this.size.w = 12;
            this.size.h = 12;
        } else {
            this.size.w = ITEM_W;
            this.size.h = ITEM_H;
        }

        this.pos.x    = x - this.size.w * 0.5;
        this.pos.y    = y;
        this.prevPos.x = this.pos.x;
        this.prevPos.y = this.pos.y;
        this.vel.x    = 0;
        this.vel.y    = 0.5;
        this.type     = type;
        this.extendIndex = extendIndex;
        this.foodKind = type === ITEM_CANDY
            ? (foodKind || FOOD_VARIANTS[(Math.random() * FOOD_VARIANTS.length) | 0])
            : null;
        this.lifetime = 0;
        this.lifetimeLimit = Math.max(30, lifetimeLimit || ITEM_LIFETIME);
        this.active   = true;
        this.onGround = false;
        this.settled = false;
        // Blink when about to expire
        this.blinkStart = Math.max(20, this.lifetimeLimit - 90);
    }

    update(game) {
        this.savePrev();
        this.lifetime++;

        if (this.lifetime >= this.lifetimeLimit) {
            this.active = false;
            return;
        }

        if (!this.settled) {
            // Fall once, then lock in place to prevent vertical jitter.
            this.vel.y = Math.min(this.vel.y + ITEM_GRAVITY, 4);
            const { dy, onGround } = game.collisionMap.sweepY(this, this.vel.y);
            this.pos.y += dy;
            this.onGround = onGround;
            if (onGround) {
                this.vel.y = 0;
                this.pos.x = Math.round(this.pos.x);
                this.pos.y = Math.round(this.pos.y);
                this.prevPos.x = this.pos.x;
                this.prevPos.y = this.pos.y;
                this.settled = true;
            }
        } else {
            this.vel.y = 0;
            this.onGround = true;
            // Keep exactly fixed for stable rendering/collision.
            this.pos.x = Math.round(this.pos.x);
            this.pos.y = Math.round(this.pos.y);
            this.prevPos.x = this.pos.x;
            this.prevPos.y = this.pos.y;
        }

        // Wrap horizontally
        if (this.pos.x < 0) this.pos.x += PLAY_W;
        if (this.pos.x + this.size.w > PLAY_W) this.pos.x -= PLAY_W;

        // Check pickup by any player
        for (const player of game.players) {
            if (!player.active || player.dead) continue;
            if (aabbOverlap(
                this.pos.x, this.pos.y, this.size.w, this.size.h,
                player.pos.x, player.pos.y, player.size.w, player.size.h
            )) {
                this._collect(game, player);
                return;
            }
        }
    }

    _collect(game, player) {
        game.sound.play('item');
        switch (this.type) {
            case ITEM_CANDY:
                game.addScore(player.id, SCORE_CANDY);
                if (this.foodKind === 'rainbow' && typeof game.onRainbowFoodCollected === 'function') {
                    game.onRainbowFoodCollected(player.id);
                }
                break;
            case ITEM_RING:
                game.addScore(player.id, SCORE_RING);
                break;
            case ITEM_GEM:
                game.addScore(player.id, SCORE_GEM);
                player.invincible = Math.max(player.invincible || 0, GEM_INVINCIBLE_TICKS);
                player.smashInvincible = Math.max(player.smashInvincible || 0, GEM_INVINCIBLE_TICKS);
                break;
            case ITEM_SHOE:
                game.addScore(player.id, SCORE_SHOE);
                player.speedBoost = 300; // ticks of extra speed
                break;
            case ITEM_EXTEND:
                game.collectExtendLetter(this.extendIndex, player.id);
                break;
            case ITEM_POTION:
                game.addScore(player.id, 3000);
                player.bubbleBoost = 300; // blue potion: faster bubble shots
                break;
            case ITEM_UMBRELLA:
                game.addScore(player.id, SCORE_UMBRELLA);
                game.onUmbrellaCollected(player.id);
                break;
            case ITEM_CAKE:
                game.addScore(player.id, SCORE_CAKE);
                break;
            case ITEM_RAINBOW:
                game.addScore(player.id, SCORE_RAINBOW);
                if (typeof game.onRainbowIconCollected === 'function') {
                    game.onRainbowIconCollected(player.id);
                }
                break;
            case ITEM_LIGHTNING:
                game.addScore(player.id, SCORE_LIGHTNING);
                if (typeof game.onLightningIconCollected === 'function') {
                    game.onLightningIconCollected(player.id);
                }
                break;
            case ITEM_WATER:
                game.addScore(player.id, SCORE_WATER);
                if (typeof game.onWaterIconCollected === 'function') {
                    game.onWaterIconCollected(player.id);
                }
                break;
        }
        this.active = false;
    }

    get blinking() {
        if (NO_FLICKER_MODE) return false;
        return this.lifetime >= this.blinkStart && Math.floor(this.lifetime / 6) % 2 === 0;
    }
}

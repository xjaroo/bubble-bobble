import {
    TILE_SIZE, PLAY_W, PLAY_H,
    SCENE_TITLE, SCENE_PLAYING, SCENE_TRANSITION, SCENE_GAMEOVER,
    HURRY_FRAC, ANGRY_FRAC, BARON_FRAC,
    SCORE_COMBO, ITEM_CANDY, ITEM_EXTEND, ITEM_RING, ITEM_GEM, ITEM_SHOE, ITEM_POTION, ITEM_UMBRELLA, ITEM_CAKE,
    EXTRA_LIFE_SCORES,
} from '../constants.js';
import { CollisionMap } from './CollisionMap.js';
import { Level }        from './Level.js';
import { Player }       from '../entities/Player.js';
import { Bubble }       from '../entities/Bubble.js';
import { Item }         from '../entities/Item.js';
import { Projectile }   from '../entities/Projectile.js';
import { ZenChan }      from '../entities/enemies/ZenChan.js';
import { Mighta }       from '../entities/enemies/Mighta.js';
import { Monsta }       from '../entities/enemies/Monsta.js';
import { BaronVonBlubba } from '../entities/BaronVonBlubba.js';
import { Renderer }     from '../rendering/Renderer.js';
import { LEVELS }       from '../data/levels.js';
import { randInt }      from '../utils/MathUtil.js';

const TRANSITION_TICKS = 120; // 2 seconds
const UMBRELLA_TRAVEL_BASE_TICKS = 70;
const UMBRELLA_TRAVEL_STEP_TICKS = 85;
const GAMEOVER_TICKS   = 300;
const STARTING_LIVES   = 3;
const BUBBLE_FEAST_ITEM_TICKS = 240; // ~4 seconds
const UMBRELLA_SPAWN_MIN_TICKS = 420;  // 7s
const UMBRELLA_SPAWN_MAX_TICKS = 960;  // 16s
const UMBRELLA_ITEM_TICKS = 540;       // 9s to pick
const UMBRELLA_SKIP_MIN = 2;
const UMBRELLA_SKIP_MAX = 4;
const GIANT_CAKE_ITEM_TICKS = 420;     // 7s to pick
const RANDOM_CANDY_MIN_TICKS = 360;    // 6s
const RANDOM_CANDY_MAX_TICKS = 840;    // 14s
const RANDOM_CANDY_ITEM_TICKS = 300;   // 5s to pick
const RANDOM_GEM_CHANCE = 0.18;        // chance random drop is gem instead of candy
const RANDOM_GIANT_CAKE_MIN_TICKS = 900;   // 15s
const RANDOM_GIANT_CAKE_MAX_TICKS = 2100;  // 35s
const RANDOM_GIANT_CAKE_ITEM_TICKS = 480;  // 8s to pick
const ENEMY_BURST_WINDOW_TICKS = 48;   // kills within this window count as one burst
const DEFAULT_LEVEL_DIFFICULTY = Object.freeze({
    enemySpeedMul: 1.0,
    enemyAngrySpeedMul: 2.0,
    enemyThinkMul: 1.0,
    enemyEscapeMul: 1.0,
    timerMul: 1.0,
    hurryFrac: HURRY_FRAC,
    angryFrac: ANGRY_FRAC,
    baronFrac: BARON_FRAC,
    maxEnemies: 0, // 0 = no cap
});

/** Score floating popup */
class ScorePopup {
    constructor(x, y, score) {
        this.x     = x;
        this.y     = y;
        this.score = score;
        this.timer = 45;
    }
    get alpha() { return this.timer / 45; }
    get active() { return this.timer > 0; }
    update() { this.timer--; this.y -= 0.4; }
}

export class Game {
    constructor(ctx, input, sound, onPresent = null, getSettings = null) {
        this.ctx   = ctx;
        this.input = input;
        this.sound = sound;
        this.onPresent = onPresent;
        this.getSettings = getSettings;

        this.renderer     = new Renderer(ctx);
        this.collisionMap = new CollisionMap();

        // Persistent state
        this.highScore = parseInt(localStorage.getItem('bbHighScore') || '0');
        this.highScoreName = localStorage.getItem('bbHighScoreName') || '---';
        this.twoPlayer = false;
        this.startPlayerCount = 1;
        this.remoteMirror = false;
        this.networkStartLock = false;

        this._reset();
        this._titleBubbles = this._makeTitleBubbles();
        this.titleTimer    = 0;
        this.titleGamepads = 0;
    }

    // ── Init ─────────────────────────────────────────────────────────────────

    _reset() {
        this.scene       = SCENE_TITLE;
        this.levelIndex  = 0;
        this.scores      = [0, 0];
        this.lives       = [STARTING_LIVES, STARTING_LIVES];
        this._nextLifeIdx = [0, 0];
        this.extendCollected = new Set();
        this.extendNextIdx   = 0;

        this.players     = [];
        this.bubbles     = [];
        this.enemies     = [];
        this.items       = [];
        this.projectiles = [];
        this.scorePopups = [];
        this.baron       = null;
        this.level       = null;

        this.levelTimer       = 0;
        this.hurryUp          = false;
        this.hurryUpTimer     = 0;
        this.bubbleFoodRushTimer = 0;
        this.levelClearing    = false;
        this.transitionTimer  = 0;
        this.transitionDuration = TRANSITION_TICKS;
        this.transitionStyle = 'normal';
        this.transitionStartRound = 1;
        this.transitionRouteRounds = [];
        this.pendingLevelAdvance = 1;
        this.gameOverTimer    = 0;
        this.gameOverFinalScore = 0;
        this.gameOverNeedsNameEntry = false;
        this.gameOverEntryRequested = false;

        this.levelEnemyTotal = 0;
        this.levelKillCount  = 0;
        this.levelDifficulty = { ...DEFAULT_LEVEL_DIFFICULTY };
        this.giantCakeDropped = false;
        this.umbrellaSpawnTimer = 0;
        this.umbrellaSpawned = false;
        this.candySpawnTimer = 0;
        this.randomCakeSpawnTimer = 0;
        this.enemyBurstKills = 0;
        this.enemyBurstExpireAt = -1;
        this.enemyBurstOwner = 0;
    }

    setRemoteMirror(flag) {
        this.remoteMirror = !!flag;
        if (!this.remoteMirror) return;
        // Mirror clients should not carry stale local edge input.
        if (this.input && this.input.flush) this.input.flush();
    }

    startOnlineMatch() {
        this.twoPlayer = true;
        this.startPlayerCount = 2;
        this.networkStartLock = false;
        this._reset();
        this._loadLevel(0);
        this.scene = SCENE_PLAYING;
    }

    startLocalMatch(playerCount = 1) {
        this.twoPlayer = playerCount === 2;
        this.startPlayerCount = this.twoPlayer ? 2 : 1;
        this.networkStartLock = false;
        this._reset();
        this._loadLevel(0);
        this.scene = SCENE_PLAYING;
    }

    setNetworkStartLock(flag) {
        this.networkStartLock = !!flag;
    }

    _loadLevel(index) {
        const data = LEVELS[index % LEVELS.length];
        this.level = new Level(data);
        this.collisionMap.setLevel(this.level);

        this.enemies     = [];
        this.bubbles     = [];
        this.items       = [];
        this.projectiles = [];
        this.baron       = null;
        this.levelTimer  = 0;
        this.hurryUp     = false;
        this.hurryUpTimer = 0;
        this.bubbleFoodRushTimer = 0;
        this.levelClearing = false;
        this.pendingLevelAdvance = 1;
        this.transitionStyle = 'normal';
        this.transitionStartRound = 1;
        this.transitionRouteRounds = [];
        this.levelDifficulty = this._buildLevelDifficulty(index);

        const maxEnemies = this.levelDifficulty.maxEnemies || data.enemies.length;
        const spawns = data.enemies.slice(0, Math.max(1, maxEnemies));
        this.levelEnemyTotal = spawns.length;
        this.levelKillCount = 0;
        this.giantCakeDropped = false;
        this.umbrellaSpawned = false;
        this.umbrellaSpawnTimer = randInt(UMBRELLA_SPAWN_MIN_TICKS, UMBRELLA_SPAWN_MAX_TICKS);
        this.candySpawnTimer = randInt(RANDOM_CANDY_MIN_TICKS, RANDOM_CANDY_MAX_TICKS);
        this.randomCakeSpawnTimer = randInt(RANDOM_GIANT_CAKE_MIN_TICKS, RANDOM_GIANT_CAKE_MAX_TICKS);
        this.enemyBurstKills = 0;
        this.enemyBurstExpireAt = -1;
        this.enemyBurstOwner = 0;

        // Spawn enemies
        for (const spawnData of spawns) {
            this._spawnEnemy(spawnData, this.levelDifficulty);
        }

        // Place/respawn players
        const p1Data = data.p1Start;
        const p2Data = data.p2Start;
        if (this.players.length === 0) {
            this.players.push(new Player(0,
                p1Data.col * TILE_SIZE, (p1Data.row - 1) * TILE_SIZE));
            if (this.twoPlayer) {
                this.players.push(new Player(1,
                    p2Data.col * TILE_SIZE, (p2Data.row - 1) * TILE_SIZE));
            }
        } else {
            for (const p of this.players) {
                const pd = p.id === 0 ? p1Data : p2Data;
                p._spawnX   = pd.col * TILE_SIZE;
                p._spawnY   = (pd.row - 1) * TILE_SIZE;
                p.pos.x     = p._spawnX;
                p.pos.y     = p._spawnY;
                p.vel.x     = 0;
                p.vel.y     = 0;
                p.dead      = false;
                p.invincible = 120;
                p.onGround  = false;
            }
        }
    }

    _spawnEnemy(data, difficulty = DEFAULT_LEVEL_DIFFICULTY) {
        const x = data.col * TILE_SIZE;
        const y = (data.row - 1) * TILE_SIZE;
        let e;
        switch (data.type) {
            case 'ZenChan': e = new ZenChan(x, y); break;
            case 'Mighta':  e = new Mighta (x, y); break;
            case 'Monsta':  e = new Monsta (x, y); break;
            default:        e = new ZenChan(x, y);
        }
        this._applyEnemyDifficulty(e, difficulty);
        this.enemies.push(e);
    }

    _applyEnemyDifficulty(enemy, difficulty) {
        if (!enemy || !difficulty) return;
        const speedMul = difficulty.enemySpeedMul ?? 1;
        const angrySpeedMul = difficulty.enemyAngrySpeedMul ?? 2.0;
        const thinkMul = difficulty.enemyThinkMul ?? 1;
        enemy.speed *= speedMul;
        enemy.angrySpeedMul = Math.max(1.1, angrySpeedMul);

        // Slow decision loops (jump/shoot) on easier levels.
        if (typeof enemy.jumpTimer === 'number') {
            enemy.jumpTimer = Math.max(18, Math.floor(enemy.jumpTimer * thinkMul));
        }
        if (typeof enemy.shootTimer === 'number') {
            enemy.shootTimer = Math.max(24, Math.floor(enemy.shootTimer * thinkMul));
        }
    }

    _buildLevelDifficulty(levelIndex) {
        // Use absolute progression (1,2,3,...) so each next stage gets harder
        // even after the map list loops.
        const round = Math.max(1, levelIndex + 1);
        const d = { ...DEFAULT_LEVEL_DIFFICULTY };

        // Very easy early game, then smooth ramp up by stage.
        if (round <= 2) {
            d.enemySpeedMul = 0.38;
            d.enemyAngrySpeedMul = 1.18;
            d.enemyThinkMul = 1.95;
            d.enemyEscapeMul = 1.85;
            d.timerMul = 1.65;
            d.hurryFrac = 0.94;
            d.angryFrac = 0.995;
            d.baronFrac = 9.99; // effectively disabled
            d.maxEnemies = 1;
        } else if (round <= 4) {
            d.enemySpeedMul = 0.46;
            d.enemyAngrySpeedMul = 1.24;
            d.enemyThinkMul = 1.85;
            d.enemyEscapeMul = 1.75;
            d.timerMul = 1.55;
            d.hurryFrac = 0.92;
            d.angryFrac = 0.985;
            d.baronFrac = 1.8;
            d.maxEnemies = 2;
        } else if (round <= 6) {
            d.enemySpeedMul = 0.56;
            d.enemyAngrySpeedMul = 1.32;
            d.enemyThinkMul = 1.65;
            d.enemyEscapeMul = 1.55;
            d.timerMul = 1.42;
            d.hurryFrac = 0.88;
            d.angryFrac = 0.97;
            d.baronFrac = 1.55;
            d.maxEnemies = 2;
        } else if (round <= 8) {
            d.enemySpeedMul = 0.66;
            d.enemyAngrySpeedMul = 1.46;
            d.enemyThinkMul = 1.48;
            d.enemyEscapeMul = 1.36;
            d.timerMul = 1.30;
            d.hurryFrac = 0.84;
            d.angryFrac = 0.94;
            d.baronFrac = 1.35;
            d.maxEnemies = 3;
        } else if (round <= 10) {
            d.enemySpeedMul = 0.76;
            d.enemyAngrySpeedMul = 1.62;
            d.enemyThinkMul = 1.32;
            d.enemyEscapeMul = 1.22;
            d.timerMul = 1.18;
            d.hurryFrac = 0.80;
            d.angryFrac = 0.90;
            d.baronFrac = 1.20;
            d.maxEnemies = 3;
        } else if (round <= 12) {
            d.enemySpeedMul = 0.86;
            d.enemyAngrySpeedMul = 1.78;
            d.enemyThinkMul = 1.18;
            d.enemyEscapeMul = 1.10;
            d.timerMul = 1.08;
            d.hurryFrac = 0.75;
            d.angryFrac = 0.86;
            d.baronFrac = 1.10;
            d.maxEnemies = 4;
        } else if (round <= 15) {
            d.enemySpeedMul = 0.96;
            d.enemyAngrySpeedMul = 1.95;
            d.enemyThinkMul = 1.06;
            d.enemyEscapeMul = 1.00;
            d.timerMul = 1.00;
            d.hurryFrac = 0.70;
            d.angryFrac = 0.82;
            d.baronFrac = 1.02;
            d.maxEnemies = 0;
        } else if (round <= 20) {
            d.enemySpeedMul = 1.04;
            d.enemyAngrySpeedMul = 2.10;
            d.enemyThinkMul = 0.98;
            d.enemyEscapeMul = 0.94;
            d.timerMul = 0.95;
            d.hurryFrac = 0.66;
            d.angryFrac = 0.78;
            d.baronFrac = 0.96;
            d.maxEnemies = 0;
        } else {
            // Endless progression: continue ramping difficulty gradually.
            const extra = round - 20;
            d.enemySpeedMul = Math.min(1.22, 1.04 + extra * 0.012);
            d.enemyAngrySpeedMul = Math.min(2.35, 2.10 + extra * 0.015);
            d.enemyThinkMul = Math.max(0.85, 0.98 - extra * 0.005);
            d.enemyEscapeMul = Math.max(0.82, 0.94 - extra * 0.004);
            d.timerMul = Math.max(0.86, 0.95 - extra * 0.003);
            d.hurryFrac = Math.max(0.60, 0.66 - extra * 0.002);
            d.angryFrac = Math.max(0.72, 0.78 - extra * 0.002);
            d.baronFrac = Math.max(0.90, 0.96 - extra * 0.002);
            d.maxEnemies = 0;
        }
        return d;
    }

    // ── Public spawners (called by entities) ─────────────────────────────────

    spawnBubble(x, y, dir, ownerId, speedMul = 1) {
        // Reuse inactive bubble or create new one
        let b = this.bubbles.find(b => !b.active);
        if (!b) { b = new Bubble(); this.bubbles.push(b); }
        b.init(x, y, dir, ownerId, speedMul);
    }

    spawnProjectile(x, y, dir) {
        let p = this.projectiles.find(p => !p.active);
        if (!p) { p = new Projectile(); this.projectiles.push(p); }
        p.init(x, y, dir);
    }

    spawnItem(x, y, type, extendIndex = 0, lifetimeLimit = undefined, foodKind = undefined) {
        let item = this.items.find(i => !i.active);
        if (!item) { item = new Item(); this.items.push(item); }
        item.init(x, y, type, extendIndex, lifetimeLimit, foodKind);
    }

    // ── Scoring / EXTEND ─────────────────────────────────────────────────────

    _grantLife(playerId, amount = 1) {
        const pid = Math.max(0, Math.min(1, playerId | 0));
        const add = Math.max(0, amount | 0);
        if (add <= 0) return;
        this.lives[pid] = (this.lives[pid] || 0) + add;
        this.sound.play('extralife');
    }

    addScore(playerId, points) {
        this.scores[playerId] = (this.scores[playerId] || 0) + points;
        if (this.scores[playerId] > this.highScore) {
            this.highScore = this.scores[playerId];
            localStorage.setItem('bbHighScore', String(this.highScore));
        }
        // Extra life check
        const idx = this._nextLifeIdx[playerId] || 0;
        if (idx < EXTRA_LIFE_SCORES.length &&
            this.scores[playerId] >= EXTRA_LIFE_SCORES[idx]) {
            this._grantLife(playerId, 1);
            this._nextLifeIdx[playerId] = idx + 1;
        }
    }

    onEnemyKilled(enemy, x, y, playerId) {
        if (!enemy || enemy.dead) return;
        // Mark fully dead so filters + level-clear check exclude it
        enemy.active = false;
        enemy.trapped = false;
        enemy.dead   = true;
        this.levelKillCount++;
        this._trackEnemyBurst(playerId);

        // Count simultaneous pops this frame handled by combo tracking
        this._comboPops = (this._comboPops || 0) + 1;
        this._comboX    = x;
        this._comboY    = y;
        this._comboOwner = playerId;

        // Drop item
        const roll = Math.random();
        if (roll < 0.30)      this.spawnItem(x, y, ITEM_CANDY);
        else if (roll < 0.47) this.spawnItem(x, y, ITEM_RING);
        else if (roll < 0.59) this.spawnItem(x, y, ITEM_SHOE);
        else if (roll < 0.68) this.spawnItem(x, y, ITEM_POTION);
        else if (roll < 0.80) this.spawnItem(x, y, ITEM_GEM);

        // Bubble->food bonus should trigger only on the last enemy kill.
        const enemiesRemaining = this.enemies.some(e => !e.dead && (e.active || e.trapped));
        if (!enemiesRemaining) {
            // Last enemy is gone: remove Baron immediately and keep it off.
            if (this.baron) {
                this.baron.active = false;
                this.baron = null;
            }
            // Always reward final enemy clear with a center-top giant cake drop.
            // (Previously this was too strict and required "all-at-once" burst.)
            this._spawnGiantCake();
            this._triggerBubbleFoodRush(playerId);
            this.enemyBurstKills = 0;
            this.enemyBurstExpireAt = -1;
        }
    }

    _trackEnemyBurst(playerId) {
        if (this.levelTimer <= this.enemyBurstExpireAt) {
            this.enemyBurstKills++;
        } else {
            this.enemyBurstKills = 1;
        }
        this.enemyBurstExpireAt = this.levelTimer + ENEMY_BURST_WINDOW_TICKS;
        this.enemyBurstOwner = playerId;
    }

    _triggerBubbleFoodRush(playerId = 0) {
        let converted = 0;
        for (const b of this.bubbles) {
            if (!b.active || b.state === 'popping') continue;

            // If another enemy is trapped in a converted bubble, remove it cleanly.
            if (b.trappedEnemy) {
                const e = b.trappedEnemy;
                b.trappedEnemy = null;
                e.trapped = false;
                e.active = false;
                e.dead = true;
                this.addScore(playerId, 100);
            }

            const ix = b.pos.x + b.size.w * 0.5;
            const iy = b.pos.y;
            b.active = false;
            this.spawnItem(ix, iy, ITEM_CANDY, 0, BUBBLE_FEAST_ITEM_TICKS);
            converted++;
        }

        if (converted > 0) {
            this.bubbleFoodRushTimer = Math.max(this.bubbleFoodRushTimer, BUBBLE_FEAST_ITEM_TICKS);
            this.sound.play('item');
        }
    }

    _spawnRandomUmbrella() {
        if (this.umbrellaSpawned || this.scene !== SCENE_PLAYING) return;
        const x = randInt(20, PLAY_W - 20);
        const y = randInt(-20, 36);
        this.spawnItem(x, y, ITEM_UMBRELLA, 0, UMBRELLA_ITEM_TICKS);
        this.umbrellaSpawned = true;
    }

    onUmbrellaCollected(playerId = 0) {
        if (this.scene !== SCENE_PLAYING) return;
        const skip = randInt(UMBRELLA_SKIP_MIN, UMBRELLA_SKIP_MAX);
        this._startTransition(skip);
    }

    _spawnGiantCake() {
        if (this.giantCakeDropped) return;
        this.giantCakeDropped = true;
        this.spawnItem(PLAY_W * 0.5, -20, ITEM_CAKE, 0, GIANT_CAKE_ITEM_TICKS);
        this.sound.play('item');
    }

    _spawnRandomCandy() {
        const activeItems = this.items.filter(i => i.active).length;
        if (activeItems >= 8) return;
        const x = randInt(14, PLAY_W - 14);
        const y = randInt(-16, 52);
        const type = Math.random() < RANDOM_GEM_CHANCE ? ITEM_GEM : ITEM_CANDY;
        this.spawnItem(x, y, type, 0, RANDOM_CANDY_ITEM_TICKS);
    }

    _hasActiveCake() {
        return this.items.some(i => i.active && i.type === ITEM_CAKE);
    }

    _spawnRandomGiantCake() {
        if (this.scene !== SCENE_PLAYING) return;
        if (this.levelClearing) return;
        if (this._hasActiveCake()) return;
        // Center-top drop, then player can move to eat it.
        this.spawnItem(PLAY_W * 0.5, -22, ITEM_CAKE, 0, RANDOM_GIANT_CAKE_ITEM_TICKS);
        this.sound.play('item');
    }

    _resolveCombo() {
        if (!this._comboPops) return;
        const n     = Math.min(this._comboPops, SCORE_COMBO.length - 1);
        const score = SCORE_COMBO[n];
        this.addScore(this._comboOwner || 0, score);
        this.scorePopups.push(new ScorePopup(this._comboX, this._comboY, score));

        const allKilledAtOnce =
            this.levelEnemyTotal > 0 &&
            this.levelKillCount === this.levelEnemyTotal &&
            this._comboPops >= this.levelEnemyTotal;
        if (allKilledAtOnce) {
            this._spawnGiantCake();
        }

        // Spawn EXTEND letters on multi-pop
        if (this._comboPops >= 2) {
            const letters = this._comboPops - 1;
            for (let i = 0; i < Math.min(letters, 3); i++) {
                this.spawnItem(
                    this._comboX + (i - 1) * 14,
                    this._comboY,
                    ITEM_EXTEND,
                    this.extendNextIdx % 6
                );
                this.extendNextIdx++;
            }
        }

        this._comboPops  = 0;
        this._comboX     = 0;
        this._comboY     = 0;
        this._comboOwner = 0;
    }

    collectExtendLetter(idx, playerId) {
        this.extendCollected.add(idx);
        this.sound.play('extend');
        if (this.extendCollected.size >= 6) {
            this.extendCollected.clear();
            this.lives[playerId]++;
            this.sound.play('extralife');
        }
    }

    onPlayerDeath(playerId) {
        this.lives[playerId]--;
        if (this.lives[playerId] < 0) {
            // Check if all players are out
            const allOut = this.players.every(p => p.dead && this.lives[p.id] < 0);
            if (allOut || this.players.length === 1) {
                this.scene         = SCENE_GAMEOVER;
                this.gameOverTimer = GAMEOVER_TICKS;
                this.gameOverFinalScore = Math.max(...this.scores, 0);
                this.gameOverNeedsNameEntry = this.gameOverFinalScore > 0;
                this.gameOverEntryRequested = false;
            }
        }
    }

    consumeGameOverEntryRequest() {
        if (this.scene !== SCENE_GAMEOVER) return null;
        if (!this.gameOverNeedsNameEntry) return null;
        if (this.gameOverEntryRequested) return null;
        this.gameOverEntryRequested = true;
        return {
            score: this.gameOverFinalScore,
            highScore: this.highScore,
        };
    }

    completeGameOverEntry(topScore = null, topName = null) {
        this.gameOverNeedsNameEntry = false;
        this.gameOverEntryRequested = false;
        if (typeof topScore === 'number' && Number.isFinite(topScore) && topScore >= 0) {
            this.highScore = Math.max(this.highScore, Math.floor(topScore));
            localStorage.setItem('bbHighScore', String(this.highScore));
        }
        if (typeof topName === 'string' && topName.trim()) {
            this.highScoreName = topName.trim();
            localStorage.setItem('bbHighScoreName', this.highScoreName);
        }
        this._reset();
    }

    // ── Main update ──────────────────────────────────────────────────────────

    update() {
        if (this.remoteMirror) return;
        // Poll non-event inputs (gamepads) at frame start.
        if (this.input.beginFrame) this.input.beginFrame();

        // Flush input at the end of each tick
        switch (this.scene) {
            case SCENE_TITLE:      this._updateTitle();      break;
            case SCENE_PLAYING:    this._updatePlaying();    break;
            case SCENE_TRANSITION: this._updateTransition(); break;
            case SCENE_GAMEOVER:   this._updateGameOver();   break;
        }
        this.input.flush();
    }

    _updateTitle() {
        this.titleTimer++;
        const settings = this.getSettings ? this.getSettings() : null;
        const requestedPlayers = settings && settings.startPlayers === 2 ? 2 : 1;
        const padCount = this.input.assignedGamepadsCount
            ? this.input.assignedGamepadsCount()
            : (this.input.connectedGamepadsCount ? this.input.connectedGamepadsCount() : 0);
        this.titleGamepads = padCount;

        // If two pads are connected, default title start to 2P for seamless couch co-op.
        this.startPlayerCount = padCount >= 2 ? 2 : requestedPlayers;
        // Animate decorative bubbles
        for (const b of this._titleBubbles) {
            b.y -= 0.3;
            if (b.y < -14) b.y = PLAY_H + 10;
        }
        if (this.networkStartLock) return;
        if (this.input.anyStart()) {
            const padJoin = this.input.secondPadJoinPressed ? this.input.secondPadJoinPressed() : false;
            const twoPadAuto = padCount >= 2;
            this.twoPlayer = twoPadAuto || this.startPlayerCount === 2 || padJoin;
            this._reset();
            this._loadLevel(0);
            this.scene = SCENE_PLAYING;
        }
    }

    _updatePlaying() {
        if (this.input.cheatLife && this.input.cheatLife()) {
            this._grantLife(0, 1);
        }

        // Per-frame combo counter reset
        this._comboPops  = 0;

        // Timer
        const timerMul = this.levelDifficulty?.timerMul ?? 1;
        const limitTicks = (this.level.data.timerLimit * timerMul) / (1000 / 60);
        const hurryFrac = this.levelDifficulty?.hurryFrac ?? HURRY_FRAC;
        const angryFrac = this.levelDifficulty?.angryFrac ?? ANGRY_FRAC;
        const baronFrac = this.levelDifficulty?.baronFrac ?? BARON_FRAC;
        this.levelTimer++;

        if (this.levelTimer >= limitTicks * hurryFrac && !this.hurryUp) {
            this.hurryUp = true;
            this.sound.play('hurryup');
        }
        if (this.hurryUp) this.hurryUpTimer++;
        if (this.bubbleFoodRushTimer > 0) this.bubbleFoodRushTimer--;
        if (!this.umbrellaSpawned && !this.levelClearing) {
            this.umbrellaSpawnTimer--;
            if (this.umbrellaSpawnTimer <= 0) this._spawnRandomUmbrella();
        }
        if (!this.levelClearing && this.enemies.length > 0 && this.bubbleFoodRushTimer <= 0) {
            this.candySpawnTimer--;
            if (this.candySpawnTimer <= 0) {
                this._spawnRandomCandy();
                this.candySpawnTimer = randInt(RANDOM_CANDY_MIN_TICKS, RANDOM_CANDY_MAX_TICKS);
            }
        }
        if (!this.levelClearing && this.enemies.length > 0) {
            this.randomCakeSpawnTimer--;
            if (this.randomCakeSpawnTimer <= 0) {
                // "Sometimes" event: mostly spawn, but not every interval.
                if (Math.random() < 0.78) this._spawnRandomGiantCake();
                this.randomCakeSpawnTimer = randInt(RANDOM_GIANT_CAKE_MIN_TICKS, RANDOM_GIANT_CAKE_MAX_TICKS);
            }
        }

        if (this.levelTimer >= limitTicks * angryFrac) {
            for (const e of this.enemies) e.setAngry();
        }
        const hasLivingEnemies = this.enemies.some(e => !e.dead && (e.active || e.trapped));
        if (!hasLivingEnemies) {
            // Do not keep/spawn Baron after enemies are cleared.
            if (this.baron) {
                this.baron.active = false;
                this.baron = null;
            }
        } else if (this.levelTimer >= limitTicks * baronFrac && !this.baron) {
            this.baron = new BaronVonBlubba(
                Math.random() * PLAY_W,
                Math.random() * 30 + 10
            );
        }

        // Update players
        for (const p of this.players) p.update(this);

        // Update bubbles
        for (const b of this.bubbles) { if (b.active) b.update(this); }

        // Update enemies (only those not trapped — trapped ones live inside bubbles)
        for (const e of this.enemies) { if (e.active && !e.trapped) e.update(this); }

        // Update items
        for (const item of this.items) { if (item.active) item.update(this); }

        // Update projectiles
        for (const proj of this.projectiles) { if (proj.active) proj.update(this); }

        // Baron
        if (this.baron && this.baron.active) this.baron.update(this);

        // Score popups
        for (const sp of this.scorePopups) sp.update();
        this.scorePopups = this.scorePopups.filter(sp => sp.active);

        // Resolve combo scoring
        this._resolveCombo();

        // Clean up completely inactive entities
        // Keep bubbles that are still active OR have a trapped enemy inside them
        this.bubbles     = this.bubbles.filter(b => b.active || (b.trappedEnemy && !b.trappedEnemy.dead));
        // Keep enemies that are alive: either active on screen OR trapped inside a bubble (not yet killed)
        this.enemies     = this.enemies.filter(e => !e.dead && (e.active || e.trapped));
        this.items       = this.items.filter(i => i.active);
        this.projectiles = this.projectiles.filter(p => p.active);

        // Level clear — no enemies alive (trapped-but-alive count as still alive)
        // and no food/items left to collect.
        if (!this.levelClearing) {
            const enemiesLeft = this.enemies.length; // all remaining are alive (see filter above)
            if (enemiesLeft === 0 && this.bubbleFoodRushTimer <= 0 && this.items.length === 0) {
                this._startTransition(1);
            }
        }
    }

    _startTransition(levelAdvance = 1) {
        if (this.scene === SCENE_TRANSITION) return;
        this.levelClearing   = true;
        this.pendingLevelAdvance = Math.max(1, levelAdvance | 0);
        this.transitionStyle = this.pendingLevelAdvance > 1 ? 'umbrella-travel' : 'normal';
        this.transitionStartRound = this._roundNumber(this.levelIndex);
        this.transitionRouteRounds = [];
        for (let i = 1; i <= this.pendingLevelAdvance; i++) {
            this.transitionRouteRounds.push(this._roundNumber(this.levelIndex + i));
        }

        if (this.transitionStyle === 'umbrella-travel') {
            this.transitionDuration = UMBRELLA_TRAVEL_BASE_TICKS + this.pendingLevelAdvance * UMBRELLA_TRAVEL_STEP_TICKS;
        } else {
            this.transitionDuration = TRANSITION_TICKS;
        }
        this.transitionTimer = this.transitionDuration;
        this.scene           = SCENE_TRANSITION;
        this.sound.play('levelclear');
        // Transition starts only after items are gone; clear leftover bubbles.
        for (const b of this.bubbles) b.active = false;
    }

    _updateTransition() {
        this.transitionTimer--;
        // Allow item pickups during transition
        for (const item of this.items) { if (item.active) item.update(this); }
        for (const p of this.players) {
            if (!p.dead) {
                p.savePrev();
                // Keep physics ticking so player doesn't float
                const { dy, onGround } = this.collisionMap.sweepY(p, p.vel.y + 0.25);
                p.pos.y += dy;
                p.onGround = onGround;
                if (onGround) p.vel.y = 0;
            }
        }
        if (this.transitionTimer <= 0) {
            this.levelIndex += this.pendingLevelAdvance;
            this.pendingLevelAdvance = 1;
            this.transitionStyle = 'normal';
            this.transitionRouteRounds = [];
            this._loadLevel(this.levelIndex);
            this.scene = SCENE_PLAYING;
        }
    }

    _roundNumber(levelIndex) {
        const n = LEVELS.length || 1;
        return ((levelIndex % n) + n) % n + 1;
    }

    getEnemyEscapeMultiplier() {
        return this.levelDifficulty?.enemyEscapeMul ?? 1;
    }

    _updateGameOver() {
        if (this.gameOverNeedsNameEntry) return;
        this.gameOverTimer--;
        if (this.gameOverTimer <= 0 || this.input.anyStart()) {
            this._reset();
        }
    }

    // ── Draw ─────────────────────────────────────────────────────────────────

    draw(alpha) {
        this.renderer.draw(this, alpha);
        if (this.onPresent) this.onPresent();
    }

    // ── Title screen decorative bubbles ──────────────────────────────────────

    _makeTitleBubbles() {
        const arr = [];
        for (let i = 0; i < 12; i++) {
            arr.push({
                x: Math.random() * PLAY_W,
                y: Math.random() * PLAY_H,
                w: Math.random() * Math.PI * 2,
            });
        }
        return arr;
    }

    _serializeEntityBase(e) {
        return {
            pos: { x: e.pos.x, y: e.pos.y },
            prevPos: { x: e.prevPos.x, y: e.prevPos.y },
            vel: { x: e.vel.x, y: e.vel.y },
            size: { w: e.size.w, h: e.size.h },
            active: !!e.active,
            onGround: !!e.onGround,
        };
    }

    exportNetState() {
        return {
            version: 1,
            scene: this.scene,
            levelIndex: this.levelIndex,
            scores: [...this.scores],
            lives: [...this.lives],
            highScore: this.highScore,
            highScoreName: this.highScoreName,
            twoPlayer: !!this.twoPlayer,
            startPlayerCount: this.startPlayerCount,
            levelTimer: this.levelTimer,
            hurryUp: !!this.hurryUp,
            hurryUpTimer: this.hurryUpTimer,
            bubbleFoodRushTimer: this.bubbleFoodRushTimer,
            randomCakeSpawnTimer: this.randomCakeSpawnTimer,
            levelClearing: !!this.levelClearing,
            transitionTimer: this.transitionTimer,
            transitionDuration: this.transitionDuration,
            transitionStyle: this.transitionStyle,
            transitionStartRound: this.transitionStartRound,
            transitionRouteRounds: [...this.transitionRouteRounds],
            pendingLevelAdvance: this.pendingLevelAdvance,
            gameOverTimer: this.gameOverTimer,
            gameOverFinalScore: this.gameOverFinalScore,
            titleTimer: this.titleTimer,
            titleGamepads: this.titleGamepads,
            titleBubbles: (this._titleBubbles || []).map(b => ({ x: b.x, y: b.y, w: b.w })),
            extendCollected: [...this.extendCollected],
            players: this.players.map(p => ({
                ...this._serializeEntityBase(p),
                id: p.id,
                facing: p.facing,
                dead: !!p.dead,
                invincible: p.invincible || 0,
                smashInvincible: p.smashInvincible || 0,
                shootCooldown: p.shootCooldown || 0,
                animFrame: p.animFrame || 0,
                animTimer: p.animTimer || 0,
                animPhase: p.animPhase || 0,
                tailPhase: p.tailPhase || 0,
                jumpHoldTimer: p.jumpHoldTimer || 0,
                jumpCutApplied: !!p.jumpCutApplied,
                dropThroughTimer: p.dropThroughTimer || 0,
                speedBoost: p.speedBoost || 0,
                bubbleBoost: p.bubbleBoost || 0,
                visible: !!p.visible,
            })),
            enemies: this.enemies.map(e => ({
                ...this._serializeEntityBase(e),
                kind: e.constructor?.name || 'ZenChan',
                dir: e.dir || 1,
                speed: e.speed || 0,
                angry: !!e.angry,
                trapped: !!e.trapped,
                dead: !!e.dead,
                deadTimer: e.deadTimer || 0,
                animFrame: e.animFrame || 0,
                animTimer: e.animTimer || 0,
                animSpeed: e.animSpeed || 0,
            })),
            bubbles: this.bubbles.map(b => ({
                ...this._serializeEntityBase(b),
                state: b.state,
                dir: b.dir || 1,
                ownerId: b.ownerId || 0,
                lifetime: b.lifetime || 0,
                travelTicks: b.travelTicks || 0,
                wobbleT: b.wobbleT || 0,
                popTimer: b.popTimer || 0,
                trappedEnemy: b.trappedEnemy ? { active: true } : null,
            })),
            items: this.items.map(i => ({
                ...this._serializeEntityBase(i),
                type: i.type,
                extendIndex: i.extendIndex || 0,
                lifetime: i.lifetime || 0,
                lifetimeLimit: i.lifetimeLimit || 0,
                blinkStart: i.blinkStart || 0,
                blinking: !!i.blinking,
                foodKind: i.foodKind || null,
                settled: !!i.settled,
            })),
            projectiles: this.projectiles.map(p => ({
                ...this._serializeEntityBase(p),
                lifetime: p.lifetime || 0,
            })),
            scorePopups: this.scorePopups.map(sp => ({
                x: sp.x,
                y: sp.y,
                score: sp.score,
                alpha: sp.alpha,
            })),
            baron: this.baron && this.baron.active
                ? {
                    ...this._serializeEntityBase(this.baron),
                    animFrame: this.baron.animFrame || 0,
                    animTimer: this.baron.animTimer || 0,
                }
                : null,
        };
    }

    _toRenderableEntity(raw, fallback = {}) {
        const base = raw && typeof raw === 'object' ? raw : {};
        const posX = Number(base.pos?.x ?? fallback.posX ?? 0);
        const posY = Number(base.pos?.y ?? fallback.posY ?? 0);
        const prevX = Number(base.prevPos?.x ?? posX);
        const prevY = Number(base.prevPos?.y ?? posY);
        const velX = Number(base.vel?.x ?? 0);
        const velY = Number(base.vel?.y ?? 0);
        const sizeW = Number(base.size?.w ?? fallback.sizeW ?? 0);
        const sizeH = Number(base.size?.h ?? fallback.sizeH ?? 0);

        return {
            ...base,
            pos: { x: posX, y: posY },
            prevPos: { x: prevX, y: prevY },
            vel: { x: velX, y: velY },
            size: { w: sizeW, h: sizeH },
            active: !!base.active,
            onGround: !!base.onGround,
            renderX() { return Math.round(this.pos.x); },
            renderY() { return Math.round(this.pos.y); },
            cx() { return this.pos.x + this.size.w * 0.5; },
            cy() { return this.pos.y + this.size.h * 0.5; },
        };
    }

    applyNetState(snapshot) {
        if (!snapshot || typeof snapshot !== 'object') return;
        if (snapshot.version !== 1) return;

        const scene = typeof snapshot.scene === 'string' ? snapshot.scene : this.scene;
        const nextLevelIndex = Number.isFinite(snapshot.levelIndex) ? (snapshot.levelIndex | 0) : this.levelIndex;

        if ((scene === SCENE_PLAYING || scene === SCENE_TRANSITION) &&
            (!this.level || this.levelIndex !== nextLevelIndex)) {
            this.levelIndex = nextLevelIndex;
            this._loadLevel(this.levelIndex);
        }

        this.scene = scene;
        this.levelIndex = nextLevelIndex;
        this.scores = Array.isArray(snapshot.scores) ? [...snapshot.scores] : [...this.scores];
        this.lives = Array.isArray(snapshot.lives) ? [...snapshot.lives] : [...this.lives];
        this.highScore = Number.isFinite(snapshot.highScore) ? snapshot.highScore : this.highScore;
        this.highScoreName = typeof snapshot.highScoreName === 'string' ? snapshot.highScoreName : this.highScoreName;
        this.twoPlayer = !!snapshot.twoPlayer;
        this.startPlayerCount = snapshot.startPlayerCount === 2 ? 2 : 1;

        this.levelTimer = Number.isFinite(snapshot.levelTimer) ? snapshot.levelTimer : this.levelTimer;
        this.hurryUp = !!snapshot.hurryUp;
        this.hurryUpTimer = Number.isFinite(snapshot.hurryUpTimer) ? snapshot.hurryUpTimer : this.hurryUpTimer;
        this.bubbleFoodRushTimer = Number.isFinite(snapshot.bubbleFoodRushTimer)
            ? snapshot.bubbleFoodRushTimer
            : this.bubbleFoodRushTimer;
        this.randomCakeSpawnTimer = Number.isFinite(snapshot.randomCakeSpawnTimer)
            ? snapshot.randomCakeSpawnTimer
            : this.randomCakeSpawnTimer;
        this.levelClearing = !!snapshot.levelClearing;
        this.transitionTimer = Number.isFinite(snapshot.transitionTimer) ? snapshot.transitionTimer : this.transitionTimer;
        this.transitionDuration = Number.isFinite(snapshot.transitionDuration) ? snapshot.transitionDuration : this.transitionDuration;
        this.transitionStyle = typeof snapshot.transitionStyle === 'string' ? snapshot.transitionStyle : this.transitionStyle;
        this.transitionStartRound = Number.isFinite(snapshot.transitionStartRound)
            ? snapshot.transitionStartRound
            : this.transitionStartRound;
        this.transitionRouteRounds = Array.isArray(snapshot.transitionRouteRounds)
            ? [...snapshot.transitionRouteRounds]
            : [];
        this.pendingLevelAdvance = Number.isFinite(snapshot.pendingLevelAdvance)
            ? snapshot.pendingLevelAdvance
            : this.pendingLevelAdvance;
        this.gameOverTimer = Number.isFinite(snapshot.gameOverTimer) ? snapshot.gameOverTimer : this.gameOverTimer;
        this.gameOverFinalScore = Number.isFinite(snapshot.gameOverFinalScore)
            ? snapshot.gameOverFinalScore
            : this.gameOverFinalScore;

        this.titleTimer = Number.isFinite(snapshot.titleTimer) ? snapshot.titleTimer : this.titleTimer;
        this.titleGamepads = Number.isFinite(snapshot.titleGamepads) ? snapshot.titleGamepads : this.titleGamepads;
        this._titleBubbles = Array.isArray(snapshot.titleBubbles)
            ? snapshot.titleBubbles.map(b => ({ x: Number(b.x || 0), y: Number(b.y || 0), w: Number(b.w || 0) }))
            : this._titleBubbles;

        this.extendCollected = new Set(Array.isArray(snapshot.extendCollected) ? snapshot.extendCollected : []);

        this.players = (Array.isArray(snapshot.players) ? snapshot.players : []).map(p => {
            const rp = this._toRenderableEntity(p, { sizeW: 14, sizeH: 14 });
            rp.id = Number.isFinite(p.id) ? p.id : 0;
            rp.facing = p.facing >= 0 ? 1 : -1;
            rp.dead = !!p.dead;
            rp.invincible = Number.isFinite(p.invincible) ? p.invincible : 0;
            rp.smashInvincible = Number.isFinite(p.smashInvincible) ? p.smashInvincible : 0;
            rp.shootCooldown = Number.isFinite(p.shootCooldown) ? p.shootCooldown : 0;
            rp.animFrame = Number.isFinite(p.animFrame) ? p.animFrame : 0;
            rp.animTimer = Number.isFinite(p.animTimer) ? p.animTimer : 0;
            rp.animPhase = Number.isFinite(p.animPhase) ? p.animPhase : 0;
            rp.tailPhase = Number.isFinite(p.tailPhase) ? p.tailPhase : 0;
            rp.jumpHoldTimer = Number.isFinite(p.jumpHoldTimer) ? p.jumpHoldTimer : 0;
            rp.jumpCutApplied = !!p.jumpCutApplied;
            rp.dropThroughTimer = Number.isFinite(p.dropThroughTimer) ? p.dropThroughTimer : 0;
            rp.speedBoost = Number.isFinite(p.speedBoost) ? p.speedBoost : 0;
            rp.bubbleBoost = Number.isFinite(p.bubbleBoost) ? p.bubbleBoost : 0;
            rp.visible = !!p.visible;
            return rp;
        });

        this.enemies = (Array.isArray(snapshot.enemies) ? snapshot.enemies : []).map(e => {
            const re = this._toRenderableEntity(e, { sizeW: 14, sizeH: 14 });
            re.kind = typeof e.kind === 'string' ? e.kind : 'ZenChan';
            re.dir = Number.isFinite(e.dir) ? e.dir : 1;
            re.speed = Number.isFinite(e.speed) ? e.speed : 0;
            re.angry = !!e.angry;
            re.trapped = !!e.trapped;
            re.dead = !!e.dead;
            re.deadTimer = Number.isFinite(e.deadTimer) ? e.deadTimer : 0;
            re.animFrame = Number.isFinite(e.animFrame) ? e.animFrame : 0;
            re.animTimer = Number.isFinite(e.animTimer) ? e.animTimer : 0;
            re.animSpeed = Number.isFinite(e.animSpeed) ? e.animSpeed : 0;
            return re;
        });

        this.bubbles = (Array.isArray(snapshot.bubbles) ? snapshot.bubbles : []).map(b => {
            const rb = this._toRenderableEntity(b, { sizeW: 12, sizeH: 12 });
            rb.state = b.state || 'travel';
            rb.dir = Number.isFinite(b.dir) ? b.dir : 1;
            rb.ownerId = Number.isFinite(b.ownerId) ? b.ownerId : 0;
            rb.lifetime = Number.isFinite(b.lifetime) ? b.lifetime : 0;
            rb.travelTicks = Number.isFinite(b.travelTicks) ? b.travelTicks : 0;
            rb.wobbleT = Number.isFinite(b.wobbleT) ? b.wobbleT : 0;
            rb.popTimer = Number.isFinite(b.popTimer) ? b.popTimer : 0;
            rb.trappedEnemy = b.trappedEnemy ? { active: true } : null;
            return rb;
        });

        this.items = (Array.isArray(snapshot.items) ? snapshot.items : []).map(i => {
            const ri = this._toRenderableEntity(i, { sizeW: 10, sizeH: 10 });
            ri.type = i.type || ITEM_CANDY;
            ri.extendIndex = Number.isFinite(i.extendIndex) ? i.extendIndex : 0;
            ri.lifetime = Number.isFinite(i.lifetime) ? i.lifetime : 0;
            ri.lifetimeLimit = Number.isFinite(i.lifetimeLimit) ? i.lifetimeLimit : 0;
            ri.blinkStart = Number.isFinite(i.blinkStart) ? i.blinkStart : 0;
            ri.blinking = !!i.blinking;
            ri.foodKind = i.foodKind || null;
            ri.settled = !!i.settled;
            return ri;
        });

        this.projectiles = (Array.isArray(snapshot.projectiles) ? snapshot.projectiles : []).map(p => {
            const rp = this._toRenderableEntity(p, { sizeW: 6, sizeH: 6 });
            rp.lifetime = Number.isFinite(p.lifetime) ? p.lifetime : 0;
            return rp;
        });

        this.scorePopups = (Array.isArray(snapshot.scorePopups) ? snapshot.scorePopups : []).map(sp => ({
            x: Number(sp.x || 0),
            y: Number(sp.y || 0),
            score: Number(sp.score || 0),
            alpha: Number(sp.alpha || 0),
            active: true,
        }));

        if (snapshot.baron) {
            const b = this._toRenderableEntity(snapshot.baron, { sizeW: 16, sizeH: 16 });
            b.animFrame = Number.isFinite(snapshot.baron.animFrame) ? snapshot.baron.animFrame : 0;
            b.animTimer = Number.isFinite(snapshot.baron.animTimer) ? snapshot.baron.animTimer : 0;
            this.baron = b;
        } else {
            this.baron = null;
        }
    }
}

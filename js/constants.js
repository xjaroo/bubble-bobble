// ── Display ──────────────────────────────────────────────────────────────────
export const TILE_SIZE  = 8;
export const PLAY_COLS  = 32;
export const PLAY_ROWS  = 25;
export const HUD_HEIGHT = 32;
export const CANVAS_W   = TILE_SIZE * PLAY_COLS;          // 256
export const CANVAS_H   = HUD_HEIGHT + TILE_SIZE * PLAY_ROWS; // 232
export const PLAY_W     = CANVAS_W;                       // 256
export const PLAY_H     = TILE_SIZE * PLAY_ROWS;          // 200

// ── Tiles ─────────────────────────────────────────────────────────────────────
export const T_EMPTY    = 0;
export const T_SOLID    = 1;
export const T_PLATFORM = 2;  // one-way (pass through going up, solid going down)

// ── Physics ───────────────────────────────────────────────────────────────────
export const GRAVITY          = 0.25;
export const JUMP_VEL         = -5.5;
export const WALK_SPEED       = 1.10;
export const MAX_FALL_SPEED   = 6;

// ── Player ────────────────────────────────────────────────────────────────────
export const PLAYER_W         = 14;
export const PLAYER_H         = 14;
export const PLAYER_SPIKE_H   = 4;   // top strip = "spiky back" for popping bubbles
export const SHOOT_COOLDOWN   = 18;  // ticks between shots

// ── Bubble ────────────────────────────────────────────────────────────────────
export const BUBBLE_W             = 12;
export const BUBBLE_H             = 12;
export const BUBBLE_TRAVEL_SPEED  = 6.2;
export const BUBBLE_DECEL         = 0.982; // velocity multiplier per tick while travelling
export const BUBBLE_FLOAT_TRIGGER_SPEED = 0.03;
export const BUBBLE_MIN_TRAVEL_TICKS = 45;
export const BUBBLE_TRAVEL_LIFT_START = -0.38;
export const BUBBLE_TRAVEL_LIFT_DAMP  = 0.90;
export const BUBBLE_FLOAT_SPEED   = 0.28;
export const BUBBLE_WOBBLE_AMP    = 3;
export const BUBBLE_WOBBLE_SPEED  = 0.05;
export const BUBBLE_LIFETIME      = 480; // ticks before auto-pop

// ── Enemies ───────────────────────────────────────────────────────────────────
export const ENEMY_W   = 14;
export const ENEMY_H   = 14;
export const PROJ_W    = 6;
export const PROJ_H    = 6;
export const PROJ_SPEED = 2.2;

// ── Items ─────────────────────────────────────────────────────────────────────
export const ITEM_W           = 10;
export const ITEM_H           = 10;
export const ITEM_GRAVITY     = 0.3;
export const ITEM_LIFETIME    = 360; // ticks before disappearing

// ── Timer ─────────────────────────────────────────────────────────────────────
export const HURRY_FRAC  = 0.65;  // fraction of timerLimit → show Hurry Up
export const ANGRY_FRAC  = 0.80;  // fraction → enemies go angry
export const BARON_FRAC  = 1.00;  // fraction → baron spawns

// ── Scoring ───────────────────────────────────────────────────────────────────
export const SCORE_COMBO  = [0, 100, 2000, 4000, 8000, 16000, 32000, 64000];
export const SCORE_CANDY  = 100;
export const SCORE_RING   = 1000;
export const SCORE_GEM    = 2000;
export const SCORE_SHOE   = 500;
export const SCORE_UMBRELLA = 2500;
export const SCORE_CAKE   = 5000;
export const SCORE_RAINBOW = 1500;
export const SCORE_LIGHTNING = 2200;
export const SCORE_WATER = 2600;
export const EXTRA_LIFE_SCORES = [30000, 100000, 200000, 400000, 1000000];

// ── Scenes ────────────────────────────────────────────────────────────────────
export const SCENE_TITLE      = 'TITLE';
export const SCENE_PLAYING    = 'PLAYING';
export const SCENE_TRANSITION = 'TRANSITION';
export const SCENE_GAMEOVER   = 'GAMEOVER';

// ── Visual stability mode ───────────────────────────────────────────────────
// Keeps character sprites fully static to remove perceived shaking/flicker.
export const STATIC_CHARACTER_VISUALS = true;
// Hard-disable visual blinking/twinkle/glow pulsing for eye comfort.
export const NO_FLICKER_MODE = true;

// ── Item types ────────────────────────────────────────────────────────────────
export const ITEM_CANDY  = 'candy';
export const ITEM_RING   = 'ring';
export const ITEM_GEM    = 'gem';
export const ITEM_SHOE   = 'shoe';
export const ITEM_EXTEND = 'extend';  // carries a letter A-F (index 0-5)
export const ITEM_POTION = 'potion';
export const ITEM_UMBRELLA = 'umbrella';
export const ITEM_CAKE    = 'cake';
export const ITEM_RAINBOW = 'rainbow';
export const ITEM_LIGHTNING = 'lightning';
export const ITEM_WATER = 'water';

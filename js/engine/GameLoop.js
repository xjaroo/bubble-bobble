const FIXED_STEP = 1000 / 60; // ~16.67 ms per tick

/**
 * Fixed-timestep game loop with interpolated rendering.
 *
 * game.update()  — called at exactly 60 Hz (logically)
 * game.draw(α)   — called every animation frame; α ∈ [0,1] is the
 *                  fractional tick for smooth interpolation
 */
export class GameLoop {
    constructor(game) {
        this._game        = game;
        this._accumulator = 0;
        this._lastTime    = null;
        this._rafId       = null;
        this._running     = false;
    }

    start() {
        if (this._running) return;
        this._running  = true;
        this._lastTime = null;
        this._rafId    = requestAnimationFrame(ts => this._tick(ts));
    }

    stop() {
        this._running = false;
        if (this._rafId !== null) cancelAnimationFrame(this._rafId);
        this._rafId = null;
    }

    _tick(timestamp) {
        if (!this._running) return;

        if (this._lastTime === null) this._lastTime = timestamp;
        const raw = timestamp - this._lastTime;
        this._lastTime = timestamp;

        // Clamp delta to avoid spiral-of-death when tab is backgrounded
        const delta = Math.min(raw, 100);
        this._accumulator += delta;

        while (this._accumulator >= FIXED_STEP) {
            this._game.update();
            this._accumulator -= FIXED_STEP;
        }

        const alpha = this._accumulator / FIXED_STEP;
        this._game.draw(alpha);

        this._rafId = requestAnimationFrame(ts => this._tick(ts));
    }
}

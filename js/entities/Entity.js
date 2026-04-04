/**
 * Base class for all game entities.
 * All positions are in playfield coordinates (origin = top-left of play area,
 * just below the HUD).
 */
export class Entity {
    constructor(x, y, w, h) {
        this.pos     = { x, y };
        this.prevPos = { x, y };
        this.vel     = { x: 0, y: 0 };
        this.size    = { w, h };
        this.active  = true;
        this.onGround = false;
    }

    /** Save prevPos at start of each tick (for interpolated rendering). */
    savePrev() {
        this.prevPos.x = this.pos.x;
        this.prevPos.y = this.pos.y;
    }

    /** Interpolated render position (between prevPos and pos). */
    renderX(alpha) {
        // Hard pixel snap for absolute visual stability.
        return Math.round(this.pos.x);
    }

    renderY(alpha) {
        // Hard pixel snap for absolute visual stability.
        return Math.round(this.pos.y);
    }

    getBounds() {
        return { x: this.pos.x, y: this.pos.y, w: this.size.w, h: this.size.h };
    }

    /** Center X/Y */
    cx() { return this.pos.x + this.size.w * 0.5; }
    cy() { return this.pos.y + this.size.h * 0.5; }
}

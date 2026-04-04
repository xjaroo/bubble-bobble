import { TILE_SIZE, T_SOLID, T_PLATFORM, PLAY_W, PLAY_H } from '../constants.js';

/**
 * Tile-based collision.  Operates in playfield coordinates (origin = top-left
 * of the playfield, i.e. just below the HUD).
 *
 * Provides sweepX / sweepY for entity movement resolution, and helper queries.
 */
export class CollisionMap {
    constructor() {
        this._grid = null;
        this._cols = 0;
        this._rows = 0;
    }

    setLevel(level) {
        this._grid = level.grid;
        this._cols = level.cols;
        this._rows = level.rows;
    }

    getTile(col, row) {
        if (col < 0 || col >= this._cols || row < 0 || row >= this._rows) return T_SOLID;
        return this._grid[row * this._cols + col];
    }

    isSolid(col, row) {
        return this.getTile(col, row) === T_SOLID;
    }

    isPlatform(col, row) {
        return this.getTile(col, row) === T_PLATFORM;
    }

    /**
     * True when the entity is currently standing on at least one one-way platform tile.
     */
    isStandingOnPlatform(entity) {
        const { pos, size } = entity;
        const probeXs = [pos.x + 1, pos.x + size.w * 0.5, pos.x + size.w - 2];
        const feetY = pos.y + size.h + 1;
        for (const px of probeXs) {
            const clampedX = Math.max(0, Math.min(PLAY_W - 1, px));
            const col = Math.floor(clampedX / TILE_SIZE);
            const row = Math.floor(feetY / TILE_SIZE);
            if (this.isPlatform(col, row)) return true;
        }
        return false;
    }

    /**
     * Check if a point (px, py) in playfield pixels is inside a solid tile.
     */
    isSolidAt(px, py) {
        const col = Math.floor(px / TILE_SIZE);
        const row = Math.floor(py / TILE_SIZE);
        return this.isSolid(col, row);
    }

    /**
     * Move entity horizontally by dx.  Resolve against solid tiles.
     * Returns actual dx applied.
     * entity: { pos:{x,y}, size:{w,h} }
     */
    sweepX(entity, dx) {
        if (dx === 0) return 0;
        const { pos, size } = entity;
        const newX = pos.x + dx;
        // Test three vertical probe points: top edge, mid, bottom edge (−1px to stay inside)
        const probeYs = [pos.y + 1, pos.y + size.h * 0.5, pos.y + size.h - 2];

        if (dx > 0) {
            // Moving right — test right edge
            const edgeX = newX + size.w - 1;
            for (const py of probeYs) {
                const col = Math.floor(edgeX / TILE_SIZE);
                const row = Math.floor(py / TILE_SIZE);
                if (this.isSolid(col, row)) {
                    return col * TILE_SIZE - size.w - pos.x;
                }
            }
        } else {
            // Moving left — test left edge
            const edgeX = newX;
            for (const py of probeYs) {
                const col = Math.floor(edgeX / TILE_SIZE);
                const row = Math.floor(py / TILE_SIZE);
                if (this.isSolid(col, row)) {
                    return (col + 1) * TILE_SIZE - pos.x;
                }
            }
        }
        return dx;
    }

    /**
     * Move entity vertically by dy. Resolve against solid tiles AND one-way
     * platforms (only block when falling onto them from above).
     * opts.ignorePlatforms: when true, one-way platforms are ignored.
     * Returns { dy: actual dy, onGround: bool, hitCeiling: bool }
     */
    sweepY(entity, dy, opts = null) {
        const { pos, size } = entity;
        const ignorePlatforms = !!(opts && opts.ignorePlatforms);
        const allowTopEntry = !!(opts && opts.allowTopEntry);
        // Three horizontal probe points: left, mid, right
        const probeXs = [pos.x + 1, pos.x + size.w * 0.5, pos.x + size.w - 2];

        // Keep grounded state stable when there is no vertical motion this tick.
        if (dy === 0) {
            const feetProbeY = pos.y + size.h + 0.05;
            let onGround = false;
            for (const px of probeXs) {
                const col = Math.floor(Math.max(0, Math.min(PLAY_W - 1, px)) / TILE_SIZE);
                const row = Math.floor(feetProbeY / TILE_SIZE);
                if (this.isSolid(col, row) || (!ignorePlatforms && this.isPlatform(col, row))) {
                    onGround = true;
                    break;
                }
            }
            return { dy: 0, onGround, hitCeiling: false };
        }

        const newY = pos.y + dy;
        // Three horizontal probe points: left, mid, right
        let onGround = false, hitCeiling = false;

        if (dy > 0) {
            // Moving down — test bottom edge
            // Use exact bottom edge (not -1) so gravity does not accumulate into
            // periodic 1px sink/correct jitter while standing on floors.
            const edgeY = newY + size.h;
            for (const px of probeXs) {
                const col = Math.floor(Math.max(0, Math.min(PLAY_W - 1, px)) / TILE_SIZE);
                const row = Math.floor(edgeY / TILE_SIZE);
                // Allow entities spawned above the map (negative rows) to fall
                // into the playfield instead of getting stuck on the virtual top boundary.
                if (row < 0) continue;
                // Optional: allow entering from above through the top border row.
                if (allowTopEntry && row === 0) continue;
                if (this.isSolid(col, row)) {
                    const resolvedDy = row * TILE_SIZE - size.h - pos.y;
                    dy = Math.min(dy, resolvedDy);
                    onGround = true;
                    break;
                }
                // One-way platform: only block if entity was above it last tick
                if (!ignorePlatforms && this.isPlatform(col, row)) {
                    const platTop = row * TILE_SIZE;
                    const prevBottom = entity.prevPos.y + size.h;
                    if (prevBottom <= platTop + 2) {
                        const resolvedDy = platTop - size.h - pos.y;
                        if (resolvedDy < dy) {
                            dy = resolvedDy;
                            onGround = true;
                        }
                    }
                }
            }
        } else {
            // Moving up — test top edge
            const edgeY = newY;
            for (const px of probeXs) {
                const col = Math.floor(Math.max(0, Math.min(PLAY_W - 1, px)) / TILE_SIZE);
                const row = Math.floor(edgeY / TILE_SIZE);
                if (this.isSolid(col, row)) {
                    const resolvedDy = (row + 1) * TILE_SIZE - pos.y;
                    if (resolvedDy > dy) {
                        dy = resolvedDy;
                        hitCeiling = true;
                    }
                    break;
                }
            }
        }
        return { dy, onGround, hitCeiling };
    }
}

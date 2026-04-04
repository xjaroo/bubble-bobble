import { TILE_SIZE, T_EMPTY, T_SOLID, T_PLATFORM, PLAY_COLS, PLAY_ROWS } from '../constants.js';

/**
 * Parses a level data object from levels.js into a flat Uint8Array grid.
 * Provides the tile grid, enemy spawn list, and level metadata.
 *
 * Coordinate system: tile (col, row) maps to
 *   playfield pixel rect (col*8, row*8, 8, 8)
 *
 * Map characters:
 *   '#'  → T_SOLID
 *   '-'  → T_PLATFORM (one-way)
 *   '.'  → T_EMPTY
 */

// Per-level tile color palettes [base, highlight, shadow, accent]
const TILE_PALETTES = [
    ['#3355CC', '#6688FF', '#112266', '#4477EE'],   // L1  cobalt blue
    ['#226622', '#44AA44', '#0A2A0A', '#33AA55'],   // L2  forest green
    ['#882288', '#CC44CC', '#330033', '#BB33AA'],   // L3  purple
    ['#886600', '#DDAA00', '#332200', '#CCAA22'],   // L4  gold
    ['#CC3322', '#FF6655', '#441100', '#EE4433'],   // L5  crimson
    ['#226688', '#44AACC', '#0A2233', '#33BBCC'],   // L6  teal
    ['#553399', '#8855FF', '#1A0044', '#7744EE'],   // L7  violet
    ['#CC6600', '#FF9922', '#441500', '#FF8800'],   // L8  orange
    ['#228866', '#44CC99', '#0A3322', '#33CCAA'],   // L9  mint
    ['#AA2244', '#EE4466', '#440011', '#DD3355'],   // L10 rose
    ['#4455AA', '#7788EE', '#111244', '#5566CC'],   // L11 periwinkle
    ['#667700', '#AACC00', '#222200', '#99BB11'],   // L12 lime
    ['#AA5500', '#EE8833', '#331100', '#DD7722'],   // L13 amber
    ['#224488', '#4477CC', '#080F33', '#3366BB'],   // L14 navy
    ['#883300', '#CC6633', '#2A0A00', '#BB5522'],   // L15 rust
    ['#008877', '#00CCBB', '#002A25', '#00BBAA'],   // L16 cyan
    ['#550088', '#9922CC', '#1A0033', '#8811BB'],   // L17 indigo
    ['#888800', '#CCCC00', '#2A2A00', '#BBBB11'],   // L18 yellow
    ['#006688', '#0099CC', '#001F2A', '#0088BB'],   // L19 sky
    ['#AA0055', '#FF2288', '#330011', '#EE1166'],   // L20 magenta
];

// Make stages easier by reducing interior blockers:
// - keep border walls intact
// - remove most interior solid bricks
// - thin one-way bars so vertical routes are more open
const EASY_LAYOUT_MODE = true;

export class Level {
    constructor(data) {
        this.data    = data;
        this.cols    = PLAY_COLS;
        this.rows    = PLAY_ROWS;
        this.grid    = new Uint8Array(this.cols * this.rows);
        this._tileCanvas = null;
        const idx    = (data.id - 1) % TILE_PALETTES.length;
        this.palette = TILE_PALETTES[idx];
        this._parse(data.map);
        this._buildTileCache();
    }

    _parse(mapRows) {
        const centerCol = Math.floor(this.cols * 0.5);
        for (let r = 0; r < this.rows; r++) {
            const row = mapRows[r] || '';
            for (let c = 0; c < this.cols; c++) {
                const ch = row[c] || '.';
                let tile = T_EMPTY;
                if (ch === '#') tile = T_SOLID;
                else if (ch === '-') tile = T_PLATFORM;

                if (EASY_LAYOUT_MODE) {
                    const borderRow = (r === 0 || r === this.rows - 1);
                    const borderCol = (c === 0 || c === this.cols - 1);
                    const isBorder = borderRow || borderCol;

                    if (!isBorder && tile === T_SOLID) {
                        // Remove interior hard blockers to keep routes open.
                        tile = T_EMPTY;
                    } else if (!borderRow && tile === T_PLATFORM) {
                        // Keep only sparse stepping bars plus a tiny center lane.
                        const keepCenterLane = Math.abs(c - centerCol) <= 1 && (r % 4 === 2);
                        const keepPattern = ((c + r * 2) % 4 === 0);
                        if (!keepCenterLane && !keepPattern) tile = T_EMPTY;
                    }
                }

                this.grid[r * this.cols + c] = tile;
            }
        }
    }

    getTile(col, row) {
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return T_SOLID;
        return this.grid[row * this.cols + col];
    }

    /** Draw the entire tile layer to the canvas context.
     *  tileX/tileY offsets in canvas pixels (used to position the playfield). */
    draw(ctx, offsetY) {
        if (this._tileCanvas) {
            ctx.drawImage(this._tileCanvas, 0, offsetY);
            return;
        }
        this._drawTiles(ctx, offsetY);
    }

    _drawTiles(ctx, offsetY) {
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const tile = this.getTile(c, r);
                if (tile === T_EMPTY) continue;
                const px = c * TILE_SIZE;
                const py = r * TILE_SIZE + offsetY;
                if (tile === T_SOLID) {
                    this._drawSolidTile(ctx, px, py, c, r);
                } else if (tile === T_PLATFORM) {
                    this._drawPlatformTile(ctx, px, py, c, r);
                }
            }
        }
    }

    _buildTileCache() {
        const w = this.cols * TILE_SIZE;
        const h = this.rows * TILE_SIZE;
        const tileCanvas = typeof OffscreenCanvas !== 'undefined'
            ? new OffscreenCanvas(w, h)
            : document.createElement('canvas');
        tileCanvas.width = w;
        tileCanvas.height = h;

        const cacheCtx = tileCanvas.getContext('2d', { alpha: false });
        if (!cacheCtx) return;
        cacheCtx.imageSmoothingEnabled = false;

        this._drawTiles(cacheCtx, 0);
        this._tileCanvas = tileCanvas;
    }

    _tileNoise(col, row) {
        const n = Math.sin(col * 12.9898 + row * 78.233) * 43758.5453;
        return n - Math.floor(n);
    }

    /**
     * Modern "gel block" tile: solid fill + edge bevel only on EXPOSED faces.
     * Adjacent tiles share the same fill → groups look unified, not grid-like.
     */
    _drawSolidTile(ctx, px, py, col, row) {
        const [base, hi, shadow, accent] = this.palette;

        const solidAbove  = this.getTile(col, row - 1) === T_SOLID;
        const solidBelow  = this.getTile(col, row + 1) === T_SOLID;
        const solidLeft   = this.getTile(col - 1, row) === T_SOLID;
        const solidRight  = this.getTile(col + 1, row) === T_SOLID;

        // 1) Vertical material gradient
        const grad = ctx.createLinearGradient(px, py, px, py + TILE_SIZE);
        grad.addColorStop(0, hi);
        grad.addColorStop(0.52, base);
        grad.addColorStop(1, shadow);
        ctx.fillStyle = grad;
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

        // 2) Subtle per-tile grain so large areas read as material, not flat fill.
        const grain = this._tileNoise(col, row);
        ctx.fillStyle = `rgba(255,255,255,${0.03 + grain * 0.05})`;
        ctx.fillRect(px + 1, py + 1, TILE_SIZE - 2, 1);
        if (grain > 0.55) {
            ctx.fillStyle = 'rgba(255,255,255,0.05)';
            ctx.fillRect(px + 2, py + 3, 2, 1);
        }
        if (grain < 0.25) {
            ctx.fillStyle = 'rgba(0,0,0,0.08)';
            ctx.fillRect(px + 4, py + TILE_SIZE - 3, 2, 1);
        }

        // 3) Bright top edge (only when exposed)
        if (!solidAbove && row !== this.rows - 1) {
            ctx.fillStyle = hi;
            ctx.fillRect(px, py, TILE_SIZE, 1);
            ctx.fillStyle = `rgba(255,255,255,0.45)`;
            ctx.fillRect(px, py + 1, TILE_SIZE, 1);
            if (!solidLeft) {
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(px + 1, py, 1, 1);
            }
        }

        // 4) Left rim light for readable vertical separation.
        if (!solidLeft && col !== this.cols - 1) {
            ctx.fillStyle = accent;
            ctx.fillRect(px, py, 1, TILE_SIZE);
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.fillRect(px + 1, py + 1, 1, TILE_SIZE - 2);
        }

        // 5) Bottom and right AO shadows for depth.
        if (!solidBelow && row !== 0) {
            ctx.fillStyle = `rgba(0,0,0,0.32)`;
            ctx.fillRect(px, py + TILE_SIZE - 2, TILE_SIZE, 2);
        }

        if (!solidRight && col !== 0) {
            ctx.fillStyle = shadow;
            ctx.fillRect(px + TILE_SIZE - 1, py, 1, TILE_SIZE);
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.fillRect(px + TILE_SIZE - 2, py + 1, 1, TILE_SIZE - 2);
        }
    }

    /**
     * One-way platform: a classic gold/amber gel ledge — always vibrant,
     * independent of the wall palette so it stands out clearly.
     */
    _drawPlatformTile(ctx, px, py, col, row) {
        // Check horizontal neighbours for seamless ledge
        const adjLeft  = this.getTile(col - 1, row) === T_PLATFORM;
        const adjRight = this.getTile(col + 1, row) === T_PLATFORM;

        // Soft drop shadow under the ledge.
        ctx.fillStyle = 'rgba(0,0,0,0.32)';
        ctx.fillRect(px, py + 4, TILE_SIZE, 3);

        // Main ledge body with metallic amber ramp.
        const g = ctx.createLinearGradient(px, py, px, py + 4);
        g.addColorStop(0, '#FFE17A');
        g.addColorStop(0.5, '#F8BA2F');
        g.addColorStop(1, '#A66800');
        ctx.fillStyle = g;
        ctx.fillRect(px, py, TILE_SIZE, 4);

        // Inner glossy line
        ctx.fillStyle = 'rgba(255,255,255,0.62)';
        ctx.fillRect(px + 1, py + 1, TILE_SIZE - 2, 1);

        // Left cap highlight
        if (!adjLeft) {
            ctx.fillStyle = '#FFEE88';
            ctx.fillRect(px, py, 1, 3);
        }

        // Right cap shadow
        if (!adjRight) {
            ctx.fillStyle = '#7A5000';
            ctx.fillRect(px + TILE_SIZE - 1, py, 1, 4);
        }
    }
}

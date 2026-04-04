/**
 * Bubble Bobble style stage set.
 *
 * Map is always 32x25:
 * - '#' = solid wall/brick
 * - '-' = one-way platform
 * - '.' = empty
 */

const MAP_W = 32;
const MAP_H = 25;
const BORDER_ROW = '#'.repeat(MAP_W);

const P1_START = { col: 3, row: 22 };
const P2_START = { col: 25, row: 22 };

const s = (row, col, len) => ({ row, col, len });

function tower(col, len, rowStart, rowEnd) {
    const out = [];
    for (let r = rowStart; r <= rowEnd; r++) out.push(s(r, col, len));
    return out;
}

function buildMap(layout) {
    const grid = Array.from({ length: MAP_H }, (_, r) => {
        if (r === 0 || r === MAP_H - 1) return BORDER_ROW.split('');
        const row = Array(MAP_W).fill('.');
        row[0] = '#';
        row[MAP_W - 1] = '#';
        return row;
    });

    const paint = (mark, seg) => {
        if (!seg) return;
        const row = seg.row | 0;
        const start = seg.col | 0;
        const len = Math.max(0, seg.len | 0);
        if (row <= 0 || row >= MAP_H - 1 || len <= 0) return;
        const minCol = Math.max(1, start);
        const maxCol = Math.min(MAP_W - 2, start + len - 1);
        for (let c = minCol; c <= maxCol; c++) grid[row][c] = mark;
    };

    for (const seg of layout.platforms || []) paint('-', seg);
    for (const seg of layout.solids || []) paint('#', seg);

    return grid.map((row) => row.join(''));
}

const LAYOUTS = [
    // 1: Classic easy triple bars
    {
        bgColor: '#060830',
        timerLimit: 35000,
        platforms: [
            s(6, 3, 8), s(6, 13, 8), s(6, 23, 6),
            s(10, 8, 8), s(10, 18, 8),
            s(14, 3, 8), s(14, 13, 8), s(14, 23, 6),
            s(18, 8, 8), s(18, 18, 8),
        ],
        solids: [],
        enemies: [
            { type: 'ZenChan', col: 8, row: 19 },
            { type: 'ZenChan', col: 22, row: 19 },
        ],
    },

    // 2: Alternating islands
    {
        bgColor: '#030E03',
        timerLimit: 34000,
        platforms: [
            s(5, 5, 10), s(5, 18, 9),
            s(9, 2, 8), s(9, 12, 8), s(9, 22, 8),
            s(13, 5, 10), s(13, 18, 9),
            s(17, 2, 8), s(17, 12, 8), s(17, 22, 8),
        ],
        solids: [
            s(3, 9, 4), s(3, 20, 4),
            s(15, 9, 4), s(15, 20, 4),
        ],
        enemies: [
            { type: 'ZenChan', col: 6, row: 18 },
            { type: 'ZenChan', col: 24, row: 18 },
            { type: 'Mighta', col: 14, row: 11 },
        ],
    },

    // 3: Zig-zag route
    {
        bgColor: '#0E0015',
        timerLimit: 33000,
        platforms: [
            s(5, 3, 10),
            s(8, 19, 10),
            s(11, 5, 10),
            s(14, 17, 10),
            s(17, 7, 10),
            s(20, 19, 10),
        ],
        solids: [
            s(3, 14, 4),
            s(19, 10, 4),
        ],
        enemies: [
            { type: 'ZenChan', col: 6, row: 19 },
            { type: 'ZenChan', col: 24, row: 19 },
            { type: 'Mighta', col: 14, row: 8 },
        ],
    },

    // 4: Center tower and side lanes
    {
        bgColor: '#0F0E00',
        timerLimit: 32000,
        platforms: [
            s(6, 2, 10), s(6, 20, 10),
            s(10, 4, 8), s(10, 20, 8),
            s(14, 2, 10), s(14, 20, 10),
            s(18, 6, 6), s(18, 18, 6),
        ],
        solids: [
            ...tower(15, 2, 3, 17),
        ],
        enemies: [
            { type: 'ZenChan', col: 6, row: 19 },
            { type: 'ZenChan', col: 24, row: 19 },
            { type: 'Mighta', col: 10, row: 9 },
            { type: 'Mighta', col: 21, row: 9 },
        ],
    },

    // 5: Wide cave arches
    {
        bgColor: '#120200',
        timerLimit: 31000,
        platforms: [
            s(4, 2, 12), s(4, 18, 12),
            s(8, 5, 10), s(8, 17, 10),
            s(12, 2, 12), s(12, 18, 12),
            s(16, 5, 10), s(16, 17, 10),
            s(20, 8, 14),
        ],
        solids: [
            s(6, 2, 4), s(6, 26, 4),
            s(14, 2, 4), s(14, 26, 4),
        ],
        enemies: [
            { type: 'ZenChan', col: 6, row: 19 },
            { type: 'Monsta', col: 22, row: 19 },
            { type: 'Mighta', col: 14, row: 11 },
            { type: 'ZenChan', col: 10, row: 7 },
        ],
    },

    // 6: Triple islands with cave blocks
    {
        bgColor: '#001520',
        timerLimit: 30000,
        platforms: [
            s(6, 3, 7), s(6, 12, 7), s(6, 21, 7),
            s(10, 6, 7), s(10, 15, 7),
            s(14, 3, 7), s(14, 12, 7), s(14, 21, 7),
            s(18, 6, 7), s(18, 15, 7),
        ],
        solids: [
            s(4, 10, 4), s(4, 18, 4),
            s(12, 10, 4), s(12, 18, 4),
            s(16, 14, 4),
        ],
        enemies: [
            { type: 'ZenChan', col: 5, row: 19 },
            { type: 'Mighta', col: 14, row: 19 },
            { type: 'Monsta', col: 24, row: 19 },
            { type: 'ZenChan', col: 10, row: 13 },
        ],
    },

    // 7: Ladder islands
    {
        bgColor: '#0A0018',
        timerLimit: 29500,
        platforms: [
            s(4, 2, 6), s(4, 12, 6), s(4, 22, 6),
            s(7, 6, 6), s(7, 16, 6),
            s(10, 2, 6), s(10, 12, 6), s(10, 22, 6),
            s(13, 6, 6), s(13, 16, 6),
            s(16, 2, 6), s(16, 12, 6), s(16, 22, 6),
            s(19, 8, 14),
        ],
        solids: [],
        enemies: [
            { type: 'ZenChan', col: 4, row: 18 },
            { type: 'ZenChan', col: 16, row: 18 },
            { type: 'Mighta', col: 26, row: 18 },
            { type: 'Monsta', col: 10, row: 12 },
            { type: 'ZenChan', col: 22, row: 7 },
        ],
    },

    // 8: Ring chamber
    {
        bgColor: '#120800',
        timerLimit: 29000,
        platforms: [
            s(8, 9, 14),
            s(12, 9, 14),
            s(18, 4, 24),
        ],
        solids: [
            s(5, 6, 20),
            s(15, 6, 20),
            ...tower(6, 2, 6, 14),
            ...tower(24, 2, 6, 14),
        ],
        enemies: [
            { type: 'Monsta', col: 5, row: 20 },
            { type: 'Monsta', col: 26, row: 20 },
            { type: 'Mighta', col: 14, row: 11 },
            { type: 'ZenChan', col: 9, row: 7 },
            { type: 'ZenChan', col: 22, row: 7 },
        ],
    },

    // 9: Four pillar arena
    {
        bgColor: '#080015',
        timerLimit: 28500,
        platforms: [
            s(6, 2, 6), s(6, 10, 6), s(6, 18, 6), s(6, 26, 4),
            s(10, 2, 6), s(10, 10, 6), s(10, 18, 6), s(10, 26, 4),
            s(14, 2, 6), s(14, 10, 6), s(14, 18, 6), s(14, 26, 4),
            s(18, 6, 8), s(18, 18, 8),
        ],
        solids: [
            ...tower(8, 2, 3, 17),
            ...tower(14, 2, 3, 17),
            ...tower(20, 2, 3, 17),
            ...tower(26, 2, 3, 17),
        ],
        enemies: [
            { type: 'ZenChan', col: 5, row: 19 },
            { type: 'Mighta', col: 14, row: 19 },
            { type: 'Monsta', col: 24, row: 19 },
            { type: 'ZenChan', col: 11, row: 11 },
            { type: 'Mighta', col: 21, row: 7 },
        ],
    },

    // 10: Dense alternating bars
    {
        bgColor: '#0D000A',
        timerLimit: 28000,
        platforms: [
            s(4, 2, 8), s(4, 12, 8), s(4, 22, 8),
            s(7, 6, 8), s(7, 16, 8),
            s(10, 2, 8), s(10, 12, 8), s(10, 22, 8),
            s(13, 6, 8), s(13, 16, 8),
            s(16, 2, 8), s(16, 12, 8), s(16, 22, 8),
            s(19, 6, 8), s(19, 16, 8),
        ],
        solids: [
            s(2, 5, 4), s(2, 23, 4),
        ],
        enemies: [
            { type: 'Monsta', col: 5, row: 20 },
            { type: 'Monsta', col: 26, row: 20 },
            { type: 'Mighta', col: 12, row: 14 },
            { type: 'Mighta', col: 20, row: 14 },
            { type: 'ZenChan', col: 14, row: 6 },
        ],
    },

    // 11: Split chambers
    {
        bgColor: '#080D18',
        timerLimit: 27500,
        platforms: [
            s(6, 11, 10),
            s(10, 4, 24),
            s(14, 11, 10),
            s(18, 6, 20),
        ],
        solids: [
            s(4, 2, 8), s(4, 22, 8),
            s(5, 2, 8), s(5, 22, 8),
            s(6, 2, 8), s(6, 22, 8),
            s(7, 2, 8), s(7, 22, 8),
            s(8, 2, 8), s(8, 22, 8),
            s(12, 2, 8), s(12, 22, 8),
            s(13, 2, 8), s(13, 22, 8),
            s(14, 2, 8), s(14, 22, 8),
            s(15, 2, 8), s(15, 22, 8),
            s(16, 2, 8), s(16, 22, 8),
        ],
        enemies: [
            { type: 'Monsta', col: 5, row: 19 },
            { type: 'Monsta', col: 26, row: 19 },
            { type: 'Mighta', col: 14, row: 9 },
            { type: 'ZenChan', col: 8, row: 13 },
            { type: 'ZenChan', col: 22, row: 13 },
        ],
    },

    // 12: Grid maze light
    {
        bgColor: '#060A00',
        timerLimit: 27000,
        platforms: [
            s(11, 3, 5), s(11, 10, 5), s(11, 17, 5), s(11, 24, 5),
            s(15, 5, 5), s(15, 12, 5), s(15, 19, 5),
            s(19, 8, 14),
        ],
        solids: [
            s(3, 3, 3), s(3, 11, 3), s(3, 19, 3), s(3, 27, 3),
            s(5, 7, 3), s(5, 15, 3), s(5, 23, 3),
            s(7, 3, 3), s(7, 11, 3), s(7, 19, 3), s(7, 27, 3),
            s(9, 7, 3), s(9, 15, 3), s(9, 23, 3),
        ],
        enemies: [
            { type: 'Monsta', col: 5, row: 19 },
            { type: 'Monsta', col: 26, row: 19 },
            { type: 'Monsta', col: 14, row: 13 },
            { type: 'Mighta', col: 8, row: 9 },
            { type: 'Mighta', col: 22, row: 9 },
        ],
    },

    // 13: Vertical shaft battle
    {
        bgColor: '#100800',
        timerLimit: 26500,
        platforms: [
            s(5, 8, 16),
            s(11, 6, 20),
            s(17, 8, 16),
        ],
        solids: [
            ...tower(4, 2, 2, 20),
            ...tower(26, 2, 2, 20),
            s(8, 10, 12),
            s(14, 10, 12),
        ],
        enemies: [
            { type: 'Monsta', col: 6, row: 19 },
            { type: 'Monsta', col: 24, row: 19 },
            { type: 'Mighta', col: 14, row: 4 },
            { type: 'Mighta', col: 14, row: 12 },
            { type: 'ZenChan', col: 8, row: 7 },
            { type: 'ZenChan', col: 22, row: 7 },
        ],
    },

    // 14: Alternating gate lanes
    {
        bgColor: '#000A18',
        timerLimit: 26000,
        platforms: [
            s(4, 2, 12), s(4, 18, 12),
            s(8, 6, 20),
            s(12, 2, 12), s(12, 18, 12),
            s(16, 10, 12),
            s(20, 2, 12), s(20, 18, 12),
        ],
        solids: [
            s(6, 14, 4),
            s(18, 14, 4),
        ],
        enemies: [
            { type: 'Monsta', col: 5, row: 19 },
            { type: 'Monsta', col: 26, row: 19 },
            { type: 'Mighta', col: 14, row: 9 },
            { type: 'Monsta', col: 8, row: 15 },
            { type: 'Mighta', col: 22, row: 15 },
            { type: 'ZenChan', col: 14, row: 5 },
        ],
    },

    // 15: Honeycomb blocks
    {
        bgColor: '#0E0500',
        timerLimit: 25500,
        platforms: [
            s(5, 5, 22),
            s(11, 5, 22),
            s(17, 5, 22),
            s(20, 8, 16),
        ],
        solids: [
            s(3, 3, 4), s(3, 10, 4), s(3, 17, 4), s(3, 24, 4),
            s(6, 3, 4), s(6, 10, 4), s(6, 17, 4), s(6, 24, 4),
            s(9, 3, 4), s(9, 10, 4), s(9, 17, 4), s(9, 24, 4),
            s(12, 3, 4), s(12, 10, 4), s(12, 17, 4), s(12, 24, 4),
            s(15, 3, 4), s(15, 10, 4), s(15, 17, 4), s(15, 24, 4),
        ],
        enemies: [
            { type: 'Monsta', col: 5, row: 17 },
            { type: 'Monsta', col: 26, row: 17 },
            { type: 'Mighta', col: 14, row: 11 },
            { type: 'Monsta', col: 8, row: 7 },
            { type: 'Mighta', col: 22, row: 7 },
            { type: 'ZenChan', col: 14, row: 3 },
        ],
    },

    // 16: Fortress interior
    {
        bgColor: '#000F10',
        timerLimit: 25000,
        platforms: [
            s(7, 6, 20),
            s(11, 6, 20),
            s(15, 6, 20),
            s(19, 6, 20),
        ],
        solids: [
            s(3, 2, 28),
            s(21, 2, 28),
            ...tower(2, 2, 4, 20),
            ...tower(28, 2, 4, 20),
        ],
        enemies: [
            { type: 'Monsta', col: 5, row: 20 },
            { type: 'Monsta', col: 26, row: 20 },
            { type: 'Mighta', col: 14, row: 18 },
            { type: 'Monsta', col: 8, row: 13 },
            { type: 'Mighta', col: 22, row: 9 },
            { type: 'Monsta', col: 14, row: 5 },
        ],
    },

    // 17: Crisscross lanes
    {
        bgColor: '#0E0015',
        timerLimit: 24500,
        platforms: [
            s(4, 3, 10), s(4, 19, 10),
            s(7, 8, 16),
            s(10, 3, 10), s(10, 19, 10),
            s(13, 8, 16),
            s(16, 3, 10), s(16, 19, 10),
            s(19, 8, 16),
        ],
        solids: [
            s(6, 14, 4),
            s(12, 14, 4),
            s(18, 14, 4),
        ],
        enemies: [
            { type: 'Monsta', col: 5, row: 17 },
            { type: 'Monsta', col: 26, row: 17 },
            { type: 'Mighta', col: 14, row: 12 },
            { type: 'Monsta', col: 8, row: 7 },
            { type: 'Mighta', col: 22, row: 7 },
            { type: 'Monsta', col: 14, row: 3 },
        ],
    },

    // 18: High island storm
    {
        bgColor: '#0A0A00',
        timerLimit: 24000,
        platforms: [
            s(4, 2, 6), s(4, 12, 6), s(4, 22, 6),
            s(6, 6, 6), s(6, 16, 6),
            s(8, 2, 6), s(8, 12, 6), s(8, 22, 6),
            s(10, 6, 6), s(10, 16, 6),
            s(12, 2, 6), s(12, 12, 6), s(12, 22, 6),
            s(14, 6, 6), s(14, 16, 6),
            s(16, 2, 6), s(16, 12, 6), s(16, 22, 6),
            s(19, 8, 14),
        ],
        solids: [
            s(5, 10, 2), s(5, 20, 2),
            s(11, 10, 2), s(11, 20, 2),
            s(17, 10, 2), s(17, 20, 2),
        ],
        enemies: [
            { type: 'Monsta', col: 5, row: 19 },
            { type: 'Monsta', col: 26, row: 19 },
            { type: 'Mighta', col: 14, row: 19 },
            { type: 'Mighta', col: 8, row: 11 },
            { type: 'Monsta', col: 22, row: 11 },
            { type: 'Mighta', col: 14, row: 3 },
        ],
    },

    // 19: Twin walls and lanes
    {
        bgColor: '#001218',
        timerLimit: 23500,
        platforms: [
            s(18, 4, 24),
            s(21, 8, 16),
        ],
        solids: [
            s(2, 2, 12), s(2, 18, 12),
            s(6, 2, 12), s(6, 18, 12),
            s(10, 2, 12), s(10, 18, 12),
            s(14, 2, 12), s(14, 18, 12),
        ],
        enemies: [
            { type: 'Monsta', col: 5, row: 19 },
            { type: 'Monsta', col: 26, row: 19 },
            { type: 'Monsta', col: 14, row: 19 },
            { type: 'Mighta', col: 8, row: 13 },
            { type: 'Mighta', col: 22, row: 13 },
            { type: 'Monsta', col: 14, row: 7 },
        ],
    },

    // 20: Final regular stage (before boss level 100 override)
    {
        bgColor: '#120008',
        timerLimit: 23000,
        platforms: [
            s(4, 11, 10),
            s(8, 3, 8), s(8, 21, 8),
            s(12, 11, 10),
            s(16, 3, 8), s(16, 21, 8),
            s(20, 8, 16),
        ],
        solids: [
            ...tower(8, 2, 3, 19),
            ...tower(22, 2, 3, 19),
            s(5, 2, 8),
            s(5, 22, 8),
            s(14, 12, 8),
        ],
        enemies: [
            { type: 'Monsta', col: 5, row: 19 },
            { type: 'Monsta', col: 26, row: 19 },
            { type: 'Monsta', col: 14, row: 17 },
            { type: 'Mighta', col: 8, row: 13 },
            { type: 'Mighta', col: 22, row: 13 },
            { type: 'Monsta', col: 14, row: 7 },
            { type: 'Mighta', col: 5, row: 7 },
        ],
    },
];

export const LEVELS = LAYOUTS.map((layout, idx) => ({
    id: idx + 1,
    bgColor: layout.bgColor,
    timerLimit: layout.timerLimit,
    map: buildMap(layout),
    enemies: (layout.enemies || []).map((e) => ({ ...e })),
    p1Start: { ...P1_START },
    p2Start: { ...P2_START },
}));

for (const level of LEVELS) {
    if (level.map.length !== MAP_H) {
        throw new Error(`[levels] Level ${level.id} must have ${MAP_H} rows.`);
    }
    for (let r = 0; r < MAP_H; r++) {
        if (level.map[r].length !== MAP_W) {
            throw new Error(`[levels] Level ${level.id} row ${r} must have ${MAP_W} columns.`);
        }
    }
}

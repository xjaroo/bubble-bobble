const SCORE_FORMATTER = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
});

export function formatScore(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0';
    return SCORE_FORMATTER.format(Math.max(0, Math.floor(n)));
}

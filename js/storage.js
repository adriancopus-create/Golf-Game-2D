/* Save / load via localStorage. */
const Storage = (() => {
    const KEY = 'chipshot_v1';

    const defaults = () => ({
        birdies: 0,
        bestScores: {},          // { holeIndex: strokes }
        unlocked: { 1: true },   // hole 1 unlocked by default; others require finishing prior
        owned: {
            clubs: ['classic'],
            trails: ['none'],
            caddies: ['none'],
            upgrades: { power: 0, accuracy: 0, spin: 0 },
        },
        equipped: {
            club: 'classic',
            trail: 'none',
            caddy: 'none',
        },
    });

    let data = defaults();

    function load() {
        try {
            const raw = localStorage.getItem(KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                // shallow merge so newly added fields don't break old saves
                data = Object.assign(defaults(), parsed);
                data.owned = Object.assign(defaults().owned, parsed.owned || {});
                data.equipped = Object.assign(defaults().equipped, parsed.equipped || {});
            }
        } catch (e) {
            console.warn('Save read failed', e);
        }
        return data;
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(data)); }
        catch (e) { console.warn('Save write failed', e); }
    }
    function reset() {
        data = defaults();
        save();
    }
    function get() { return data; }

    function unlockHole(idx) {
        data.unlocked[idx] = true;
        save();
    }
    function recordBest(idx, strokes) {
        const prev = data.bestScores[idx];
        if (prev === undefined || strokes < prev) data.bestScores[idx] = strokes;
        save();
    }
    function addBirdies(n) {
        data.birdies = Math.max(0, data.birdies + n);
        save();
    }

    return { load, save, reset, get, unlockHole, recordBest, addBirdies };
})();
Storage.load();

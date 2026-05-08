/* Procedurally-generated themed music — one profile per hole.
   Schedules notes via Web Audio with 100 ms lookahead for tight timing. */
const Music = (() => {
    const SCALES = {
        major:        [0, 2, 4, 5, 7, 9, 11],
        minor:        [0, 2, 3, 5, 7, 8, 10],
        majorPent:    [0, 2, 4, 7, 9],
        minorPent:    [0, 3, 5, 7, 10],
        dorian:       [0, 2, 3, 5, 7, 9, 10],
        phrygian:     [0, 1, 3, 5, 7, 8, 10],
        lydian:       [0, 2, 4, 6, 7, 9, 11],
        harmonicMinor:[0, 2, 3, 5, 7, 8, 11],
        wholeTone:    [0, 2, 4, 6, 8, 10],
        hirajoshi:    [0, 2, 3, 7, 8],
    };
    const NOTE = { C:261.63, D:293.66, E:329.63, F:349.23, G:392.0, A:440.0, B:493.88 };

    let scheduler = null;
    let nextNoteTime = 0;
    let step = 0;
    let profile = null;
    let musicGain = null;
    let muted = false;

    function ensureGain() {
        const ctx = Audio.getContext();
        if (!ctx) return null;
        if (!musicGain) {
            musicGain = ctx.createGain();
            musicGain.gain.value = 0.18;
            musicGain.connect(ctx.destination);
        }
        return ctx;
    }

    function start(p) {
        stop();
        if (!p) return;
        const ctx = ensureGain();
        if (!ctx) return;
        profile = Object.assign({
            tempo: 110, scale: SCALES.major, root: NOTE.C,
            melody: [0,2,4,2], bass: [0,0,5,5],
            mInst: 'sine', bInst: 'square',
            mVol: 0.045, bVol: 0.045,
            mOctave: 1, bOctave: -1, bassDiv: 2,
            swing: 0,
        }, p);
        if (typeof profile.scale === 'string') profile.scale = SCALES[profile.scale] || SCALES.major;
        step = 0;
        nextNoteTime = ctx.currentTime + 0.05;
        scheduler = setInterval(scheduleAhead, 25);
    }

    function stop() {
        if (scheduler) { clearInterval(scheduler); scheduler = null; }
        profile = null;
    }

    function setMuted(m) {
        muted = m;
        if (musicGain) musicGain.gain.value = m ? 0 : 0.18;
    }

    function setVolume(v) { if (musicGain) musicGain.gain.value = v; }

    function scheduleAhead() {
        if (!profile || muted) return;
        const ctx = Audio.getContext();
        if (!ctx) return;
        // schedule notes 0.15 s ahead
        const eighth = 60 / (profile.tempo * 2);
        while (nextNoteTime < ctx.currentTime + 0.15) {
            playStep(ctx, nextNoteTime);
            const swing = (step % 2 === 0 && profile.swing) ? eighth * profile.swing : 0;
            nextNoteTime += eighth + (step % 2 === 0 ? swing : -swing);
            step++;
        }
    }

    function playStep(ctx, when) {
        const m = profile.melody, b = profile.bass;
        const eighth = 60 / (profile.tempo * 2);
        const noteDur = eighth * 0.85;
        const mDeg = m[step % m.length];
        if (mDeg !== null && mDeg !== undefined) {
            playNote(ctx, when, scaleFreq(profile, mDeg, profile.mOctave),
                profile.mInst, profile.mVol, noteDur, profile.mFilter);
        }
        if (step % (profile.bassDiv || 2) === 0) {
            const bDeg = b[(Math.floor(step / (profile.bassDiv || 2))) % b.length];
            if (bDeg !== null && bDeg !== undefined) {
                playNote(ctx, when, scaleFreq(profile, bDeg, profile.bOctave),
                    profile.bInst, profile.bVol, noteDur * (profile.bassDiv || 2), profile.bFilter);
            }
        }
        // optional pad / drone
        if (profile.pad && step % (profile.pad.div || 16) === 0) {
            const pDeg = profile.pad.notes[(Math.floor(step/(profile.pad.div||16))) % profile.pad.notes.length];
            if (pDeg !== null && pDeg !== undefined) {
                playNote(ctx, when, scaleFreq(profile, pDeg, profile.pad.oct || 0),
                    profile.pad.inst || 'sine', profile.pad.vol || 0.025,
                    eighth * (profile.pad.div || 16) * 0.95, profile.pad.filter);
            }
        }
    }

    function scaleFreq(p, deg, octaveOffset) {
        const scale = p.scale;
        const n = scale.length;
        let octave = octaveOffset || 0;
        let idx = deg;
        while (idx < 0)  { idx += n; octave--; }
        while (idx >= n) { idx -= n; octave++; }
        const semis = scale[idx] + octave * 12;
        return p.root * Math.pow(2, semis/12);
    }

    function playNote(ctx, when, freq, type, vol, dur, filterFreq) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, when);
        g.gain.setValueAtTime(0, when);
        g.gain.linearRampToValueAtTime(vol, when + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0008, when + dur);
        let dest = g;
        if (filterFreq) {
            const f = ctx.createBiquadFilter();
            f.type = 'lowpass';
            f.frequency.value = filterFreq;
            g.connect(f); dest = f;
        }
        osc.connect(g);
        dest.connect(musicGain);
        osc.start(when);
        osc.stop(when + dur + 0.08);
    }

    /* ============ 18 themed profiles ============ */
    const profiles = [
        // 1. Opening Tee — sunny meadow waltz
        { tempo:130, scale:SCALES.major, root:NOTE.D,
          melody:[0,2,4,7,4,2,0,4, 5,4,2,0,2,4,2,null],
          bass:[0,4, 5,2],
          mInst:'sine', bInst:'triangle', mVol:0.05, bVol:0.06, mOctave:1, bOctave:-1,
          pad:{ notes:[0,4], oct:0, inst:'sine', vol:0.018, div:8 } },
        // 2. Windmill Alley — folksy jig
        { tempo:118, scale:SCALES.major, root:NOTE.G,
          melody:[0,2,4,2,0,4,5,7, 5,4,2,0,2,0,null,null],
          bass:[0,4, 5,4],
          mInst:'square', bInst:'triangle', mVol:0.04, bVol:0.05, mOctave:1, bOctave:-1, swing:0.18 },
        // 3. Volcano Rim — ominous low brass
        { tempo:88, scale:SCALES.minor, root:NOTE.A * 0.5,
          melody:[0,3,7,5, 0,3,7,10, 7,5,3,0, null,null,null,null],
          bass:[0,0, 5,5, 0,0, 3,3],
          mInst:'sawtooth', bInst:'square', mVol:0.04, bVol:0.06, mOctave:2, bOctave:0,
          mFilter:1400, bFilter:600,
          pad:{ notes:[0,0,3,3], oct:1, inst:'sawtooth', vol:0.02, div:16, filter:300 } },
        // 4. The Glacier — ethereal pentatonic chimes
        { tempo:78, scale:SCALES.minorPent, root:NOTE.D,
          melody:[0,2,3,4, 3,2,0,2, 4,3,2,0, null,2,3,null],
          bass:[0,3, 0,4],
          mInst:'sine', bInst:'sine', mVol:0.05, bVol:0.04, mOctave:2, bOctave:0,
          pad:{ notes:[0,3,0,4], oct:1, inst:'sine', vol:0.02, div:16 } },
        // 5. Pirate Cove — sea shanty
        { tempo:104, scale:SCALES.minor, root:NOTE.D,
          melody:[0,4,7,4, 0,4,7,10, 7,5,4,2, 0,null,null,null],
          bass:[0,0, 5,5, 3,3, 4,4],
          mInst:'square', bInst:'triangle', mVol:0.045, bVol:0.06, mOctave:1, bOctave:-1, swing:0.12 },
        // 6. Mushroom Forest — dreamy minor pent
        { tempo:74, scale:SCALES.minorPent, root:NOTE.A,
          melody:[0,2,3,4, 3,2,3,2, 0,2,3,2, null,null,3,2],
          bass:[0,3, 4,2],
          mInst:'triangle', bInst:'sine', mVol:0.04, bVol:0.045, mOctave:1, bOctave:-1,
          pad:{ notes:[0,3], oct:0, inst:'sine', vol:0.025, div:16, filter:1200 } },
        // 7. Clockwork Castle — mechanical pulse
        { tempo:138, scale:SCALES.minor, root:NOTE.F,
          melody:[0,3,5,3, 0,3,5,3, 7,5,3,0, 5,3,2,0],
          bass:[0,0, 5,5, 0,0, 7,7],
          mInst:'square', bInst:'square', mVol:0.04, bVol:0.05, mOctave:1, bOctave:-1, mFilter:1800 },
        // 8. Cactus Canyon — spaghetti western
        { tempo:96, scale:SCALES.harmonicMinor, root:NOTE.D,
          melody:[0,4,7,4, 5,4,3,2, 0,2,3,4, 3,2,0,null],
          bass:[0,0, 0,0, 5,5, 7,7],
          mInst:'square', bInst:'triangle', mVol:0.045, bVol:0.06, mOctave:1, bOctave:-1, swing:0.15 },
        // 9. Sky Island — airy lydian
        { tempo:92, scale:SCALES.lydian, root:NOTE.F,
          melody:[0,4,6,7, 11,7,6,4, 6,4,2,0, null,4,6,null],
          bass:[0,4, 5,2],
          mInst:'sine', bInst:'triangle', mVol:0.05, bVol:0.04, mOctave:2, bOctave:0,
          pad:{ notes:[0,4,5,2], oct:1, inst:'sine', vol:0.022, div:16 } },
        // 10. Coral Reef — bubbly underwater
        { tempo:80, scale:SCALES.minor, root:NOTE.G,
          melody:[0,3,5,7, 5,3,2,0, 3,5,7,5, 3,2,0,null],
          bass:[0,3, 5,2],
          mInst:'sine', bInst:'sine', mVol:0.05, bVol:0.05, mOctave:1, bOctave:-1, mFilter:900,
          pad:{ notes:[0,3,5,2], oct:0, inst:'sine', vol:0.03, div:16, filter:600 } },
        // 11. Haunted Hollow — spooky tritone
        { tempo:82, scale:SCALES.phrygian, root:NOTE.E,
          melody:[0,1,3,5, 6,5,3,1, 3,1,0,null, 7,5,3,1],
          bass:[0,0, 6,6, 0,0, 3,3],
          mInst:'sawtooth', bInst:'square', mVol:0.038, bVol:0.05, mOctave:1, bOctave:-1, mFilter:1500,
          pad:{ notes:[0,6], oct:0, inst:'sawtooth', vol:0.022, div:16, filter:400 } },
        // 12. Dragon's Back — epic descending
        { tempo:94, scale:SCALES.minor, root:NOTE.D,
          melody:[7,5,3,0, 5,3,2,0, 3,5,7,10, 12,10,7,5],
          bass:[0,0, 5,5, 3,3, 0,0],
          mInst:'sawtooth', bInst:'square', mVol:0.045, bVol:0.06, mOctave:1, bOctave:-1, mFilter:1800,
          pad:{ notes:[0,0,3,5], oct:0, inst:'sawtooth', vol:0.025, div:16, filter:500 } },
        // 13. Tiny Town — bouncy ragtime
        { tempo:128, scale:SCALES.major, root:NOTE.C,
          melody:[0,2,4,2, 0,4,7,4, 5,2,0,2, 4,2,0,null],
          bass:[0,4, 5,4],
          mInst:'square', bInst:'triangle', mVol:0.045, bVol:0.06, mOctave:1, bOctave:-1, swing:0.2 },
        // 14. Rainbow Road — arcade chiptune
        { tempo:160, scale:SCALES.major, root:NOTE.G,
          melody:[0,2,4,7, 4,2,0,5, 7,5,4,2, 0,4,7,12],
          bass:[0,0,4,4, 5,5,2,2],
          mInst:'square', bInst:'square', mVol:0.04, bVol:0.05, mOctave:2, bOctave:0, bassDiv:1 },
        // 15. The Labyrinth — tense chromatic
        { tempo:108, scale:SCALES.phrygian, root:NOTE.F,
          melody:[0,1,3,1, 5,3,1,0, 0,1,3,5, 7,5,3,0],
          bass:[0,0, 1,1, 5,5, 3,3],
          mInst:'sawtooth', bInst:'square', mVol:0.04, bVol:0.05, mOctave:1, bOctave:-1, mFilter:1600 },
        // 16. Meteor Crater — alien whole tone
        { tempo:84, scale:SCALES.wholeTone, root:NOTE.C,
          melody:[0,2,4,5, 4,2,0,null, 2,4,5,4, 2,0,null,null],
          bass:[0,3, 0,3],
          mInst:'sine', bInst:'triangle', mVol:0.045, bVol:0.04, mOctave:2, bOctave:0, mFilter:1200,
          pad:{ notes:[0,3], oct:1, inst:'sine', vol:0.025, div:16, filter:500 } },
        // 17. Neon City — synthwave
        { tempo:120, scale:SCALES.minor, root:NOTE.A,
          melody:[0,3,7,3, 7,10,7,3, 5,3,2,0, 3,5,7,10],
          bass:[0,0,3,3, 5,5,7,7],
          mInst:'square', bInst:'sawtooth', mVol:0.04, bVol:0.06, mOctave:1, bOctave:-1, bassDiv:1, bFilter:700,
          pad:{ notes:[0,0,3,5], oct:0, inst:'sawtooth', vol:0.025, div:16, filter:900 } },
        // 18. The Final Green — triumphant
        { tempo:108, scale:SCALES.major, root:NOTE.G,
          melody:[0,4,7,5, 4,2,0,4, 5,7,9,7, 5,4,2,0],
          bass:[0,4, 5,2],
          mInst:'square', bInst:'triangle', mVol:0.05, bVol:0.06, mOctave:1, bOctave:-1,
          pad:{ notes:[0,4,5,2], oct:0, inst:'sine', vol:0.03, div:16 } },
    ];

    /* Menu music — relaxed major arpeggio */
    const menuProfile = {
        tempo:96, scale:SCALES.majorPent, root:NOTE.G,
        melody:[0,2,4,2, 4,2,0,4, 2,4,2,0, null,null,null,null],
        bass:[0,3, 4,2],
        mInst:'sine', bInst:'triangle', mVol:0.04, bVol:0.045, mOctave:1, bOctave:-1,
        pad:{ notes:[0,3,4,2], oct:0, inst:'sine', vol:0.022, div:16 },
    };

    function profileForHole(idx) { return profiles[idx] || profiles[0]; }
    function menu() { return menuProfile; }

    return { start, stop, setMuted, setVolume, profileForHole, menu };
})();

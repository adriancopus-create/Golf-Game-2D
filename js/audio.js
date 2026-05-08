/* Synthesised SFX engine.  Web Audio only — no external assets. */
const Audio = (() => {
    let ctx = null;
    let masterGain = null;
    let muted = false;

    function ensureCtx() {
        if (!ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return null;
            ctx = new AC();
            masterGain = ctx.createGain();
            masterGain.gain.value = 0.6;
            masterGain.connect(ctx.destination);
        }
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
    }

    function tone({freq=440, dur=0.2, type='sine', vol=0.4, attack=0.005, decay=0.1, slideTo=null, detune=0, filterFreq=null}) {
        if (muted) return;
        const c = ensureCtx(); if (!c) return;
        const osc = c.createOscillator();
        const g = c.createGain();
        let dest = g;
        let filter = null;
        if (filterFreq) {
            filter = c.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = filterFreq;
            g.connect(filter);
            dest = filter;
        }
        osc.type = type;
        osc.frequency.setValueAtTime(freq, c.currentTime);
        if (slideTo !== null) {
            osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), c.currentTime + dur);
        }
        if (detune) osc.detune.value = detune;
        g.gain.setValueAtTime(0, c.currentTime);
        g.gain.linearRampToValueAtTime(vol, c.currentTime + attack);
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
        osc.connect(g);
        dest.connect(masterGain);
        osc.start();
        osc.stop(c.currentTime + dur + 0.05);
    }

    function noiseBurst({dur=0.2, vol=0.3, filter=2000, slideTo=null, attack=0.005}) {
        if (muted) return;
        const c = ensureCtx(); if (!c) return;
        const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random()*2-1) * (1 - i/data.length);
        const src = c.createBufferSource();
        src.buffer = buf;
        const f = c.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.setValueAtTime(filter, c.currentTime);
        if (slideTo !== null) f.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + dur);
        const g = c.createGain();
        g.gain.setValueAtTime(0, c.currentTime);
        g.gain.linearRampToValueAtTime(vol, c.currentTime + attack);
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
        src.connect(f); f.connect(g); g.connect(masterGain);
        src.start();
    }

    /* High-level cues */
    function thwack(power, club='iron') {
        // mix tonal hit with noise burst
        const baseFreq = { driver: 130, iron: 220, wedge: 320, putter: 90 }[club] || 220;
        const dur = club === 'putter' ? 0.08 : 0.15;
        tone({freq: baseFreq + power*40, dur, type: 'square', vol: 0.18, slideTo: baseFreq*0.4});
        noiseBurst({dur: 0.08, filter: 1500 + power*1500, vol: 0.18, slideTo: 200});
    }
    function bounce(intensity=1) {
        tone({freq: 380, dur: 0.06, type: 'triangle', vol: 0.15 * intensity, slideTo: 220});
    }
    function roll() {
        noiseBurst({dur: 0.15, filter: 600, vol: 0.04});
    }
    function splash() {
        noiseBurst({dur: 0.5, filter: 800, slideTo: 200, vol: 0.35});
        tone({freq: 220, dur: 0.4, type: 'sine', vol: 0.12, slideTo: 80});
    }
    function sand() {
        noiseBurst({dur: 0.3, filter: 1200, slideTo: 300, vol: 0.18});
    }
    function holeIn() {
        tone({freq: 700, dur: 0.07, type: 'sine', vol: 0.25, slideTo: 1100});
        setTimeout(()=>tone({freq: 1200, dur: 0.1, type: 'sine', vol: 0.2, slideTo: 1400}), 60);
    }
    function coin() {
        tone({freq: 880, dur: 0.06, type: 'square', vol: 0.18});
        setTimeout(()=>tone({freq: 1320, dur: 0.1, type: 'square', vol: 0.18}), 60);
    }
    function crowdCheer() {
        if (muted) return;
        const c = ensureCtx(); if (!c) return;
        const buf = c.createBuffer(1, c.sampleRate * 1.4, c.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) {
            const t = i / c.sampleRate;
            const env = Math.min(1, t*4) * Math.max(0, 1 - (t-0.4)/1.0);
            d[i] = (Math.random()*2-1) * env * 0.5;
        }
        const src = c.createBufferSource(); src.buffer = buf;
        const f = c.createBiquadFilter(); f.type='bandpass'; f.frequency.value=900; f.Q.value=0.6;
        const g = c.createGain(); g.gain.value = 0.4;
        src.connect(f); f.connect(g); g.connect(masterGain);
        src.start();
    }
    function fanfare(notes=[523, 659, 784, 1047]) {
        notes.forEach((n, i) => setTimeout(() => tone({freq: n, dur: 0.18, type: 'square', vol: 0.16}), i*120));
    }
    function whoosh() {
        noiseBurst({dur: 0.4, filter: 800, slideTo: 80, vol: 0.07});
    }
    function uiClick() {
        tone({freq: 580, dur: 0.04, type: 'square', vol: 0.1});
    }
    function uiPop() {
        tone({freq: 320, dur: 0.04, type: 'triangle', vol: 0.1, slideTo: 720});
    }
    function powerCharge() {
        tone({freq: 200, dur: 0.05, type: 'sawtooth', vol: 0.04, slideTo: 280});
    }
    function setMuted(m) { muted = m; }

    return {
        thwack, bounce, roll, splash, sand, holeIn, coin, crowdCheer,
        fanfare, whoosh, uiClick, uiPop, powerCharge, setMuted,
    };
})();

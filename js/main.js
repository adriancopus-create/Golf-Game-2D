/* Main loop, state machine, controls, camera. */
(() => {
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');

    /* === Logical resolution: scale to window === */
    const VW = 1280, VH = 720;
    let scale = 1;
    function resize() {
        const w = window.innerWidth, h = window.innerHeight;
        scale = Math.min(w/VW, h/VH);
        const cw = VW * scale, ch = VH * scale;
        canvas.style.width = cw + 'px';
        canvas.style.height = ch + 'px';
        canvas.width = VW; canvas.height = VH;
        const root = document.getElementById('game-root');
        root.style.fontSize = Math.max(14, 14 * scale) + 'px';
    }
    window.addEventListener('resize', resize); resize();

    /* === Game state === */
    const State = {
        screen: 'menu',     // menu | hole-intro | playing | hole-complete | scorecard | shop
        holeIdx: 0,         // index into Holes.all
        strokes: 0,
        round: { strokes: [] }, // strokes per hole during a round
        ball: makeBall(),
        cam: { x: 0, y: 0, w: VW, h: VH, target: 0 },
        aiming: false,
        aim: { dx: 0, dy: 0, maxVel: 1100 },
        power: 0,
        powerWobble: 0,
        powerCharging: false,
        club: 'iron',
        equipped: Storage.get().equipped,
        caddy: Storage.get().equipped.caddy,
        caddyX: 0, caddyY: 0, caddyMood: 'idle',
        playingFullRound: false, // true if we entered via "Tee Off"
        slowMo: 1,
        timers: {},
    };

    function makeBall() {
        return { x:0, y:0, vx:0, vy:0, r:7, state:'settled', spin:0, trailColor:'#fff' };
    }

    /* === Hole loading === */
    function loadHole(idx) {
        State.holeIdx = idx;
        State.strokes = 0;
        const h = Holes.all[idx];
        State.ball = makeBall();
        State.ball.x = h.tee.x;
        State.ball.y = h.groundHeight(h.tee.x) - State.ball.r;
        State.ball.state = 'settled';
        State.cam.x = clamp(State.ball.x - VW/2, 0, h.width - VW);
        State.cam.target = State.cam.x;
        State.cam.y = 0;
        // pick smart default club for the hole
        State.club = h.par >= 4 ? 'driver' : 'iron';
        State.equipped = Storage.get().equipped;
        State.caddy = Storage.get().equipped.caddy === 'none' ? null : Storage.get().equipped.caddy;
        State.caddyX = h.tee.x - 30;
        State.caddyY = h.groundHeight(h.tee.x);
        State.aiming = false;
        State.power = 0;
        Effects.clear();
        showHoleIntro(h, idx);
    }

    function showHoleIntro(h, idx) {
        document.getElementById('intro-num').textContent = idx + 1;
        document.getElementById('intro-name').textContent = h.name;
        document.getElementById('intro-par').textContent = h.par;
        document.getElementById('intro-flair').textContent = h.flair;
        const intro = document.getElementById('hole-intro');
        intro.classList.remove('hidden');
        State.screen = 'playing'; // start drawing the hole world behind the intro overlay
        updateHUD();
        Audio.uiPop();
        setTimeout(() => intro.classList.add('hidden'), 1700);
    }

    function updateHUD() {
        const h = Holes.all[State.holeIdx];
        document.getElementById('hud').classList.remove('hidden');
        document.getElementById('hud-hole-num').textContent = State.holeIdx + 1;
        document.getElementById('hud-hole-name').textContent = h.name;
        document.getElementById('hud-stroke-num').textContent = State.strokes;
        document.getElementById('hud-par').textContent = h.par;
        const w = h.wind || {speed:0, dir:1};
        document.getElementById('hud-wind-mph').textContent = `${w.speed} mph`;
        const arrow = document.getElementById('windsock-arrow');
        arrow.style.transform = `rotate(${w.dir > 0 ? 0 : 180}deg)`;
        arrow.style.opacity = (0.3 + Math.min(1, w.speed/20));
        document.getElementById('hud-birdie-count').textContent = Storage.get().birdies;
    }

    /* === Camera === */
    function updateCamera(dt) {
        const h = Holes.all[State.holeIdx];
        // target is ball.x (when shot) or ball.x with margin (when settled)
        let target;
        if (State.ball.state === 'flying' || State.ball.state === 'rolling') {
            target = State.ball.x - VW/2;
        } else {
            target = State.ball.x - VW/2;
        }
        target = clamp(target, 0, Math.max(0, h.width - VW));
        State.cam.target = target;
        // smooth follow
        const k = 0.06;
        State.cam.x += (State.cam.target - State.cam.x) * (1 - Math.pow(1-k, dt*60));

        // caddy follows ball (lags behind) when settled
        if (State.caddy) {
            const targetX = State.ball.x - 26;
            State.caddyX += (targetX - State.caddyX) * (1 - Math.pow(1-0.03, dt*60));
            State.caddyY = h.groundHeight(State.caddyX);
        }
    }

    function clamp(v,a,b){return v<a?a:v>b?b:v;}

    /* === Aiming + Power ===
       Slingshot model: click anchors the slingshot, dragging away from anchor pulls.
       Power is the drag delta (current - origin). Direction is from cursor → origin (release fires opposite).
    */
    let dragOrigin = null;

    canvas.addEventListener('mousedown', onPointerDown);
    canvas.addEventListener('mousemove', onPointerMove);
    canvas.addEventListener('mouseup', onPointerUp);
    canvas.addEventListener('mouseleave', onPointerUp);
    canvas.addEventListener('touchstart', e => { e.preventDefault(); onPointerDown(toPointer(e.touches[0])); });
    canvas.addEventListener('touchmove',  e => { e.preventDefault(); onPointerMove(toPointer(e.touches[0])); });
    canvas.addEventListener('touchend',   e => { e.preventDefault(); onPointerUp({}); });

    function toPointer(t) {
        const rect = canvas.getBoundingClientRect();
        return { clientX: t.clientX, clientY: t.clientY };
    }

    function pointerToWorld(e) {
        const rect = canvas.getBoundingClientRect();
        const px = (e.clientX - rect.left) * (VW/rect.width);
        const py = (e.clientY - rect.top)  * (VH/rect.height);
        return { x: px + State.cam.x, y: py + State.cam.y };
    }

    function onPointerDown(e) {
        if (State.screen !== 'playing') return;
        if (State.ball.state !== 'settled') return;
        dragOrigin = pointerToWorld(e);
        State.aiming = true;
        State.power = 0;
        State.aim.dx = 1; State.aim.dy = 0;
        Audio.uiPop();
    }
    function onPointerMove(e) {
        if (!State.aiming || !dragOrigin) return;
        const w = pointerToWorld(e);
        const dx = w.x - dragOrigin.x;
        const dy = w.y - dragOrigin.y;
        const len = Math.hypot(dx, dy);
        if (len < 4) { State.power = 0; document.getElementById('power-fill').style.width = '0%'; return; }
        // Drag direction: pull back. Aim normal = drag normalized.
        State.aim.dx = dx/len; State.aim.dy = dy/len;
        // Power: drag distance up to maxDist
        const maxDist = 280;
        State.power = clamp(len/maxDist, 0, 1);
        const accBonus = Shop.getUpgradeBonus('accuracy');
        State.powerWobble = (1 - accBonus) * 0.04 * Math.sin(performance.now()/100);
        document.getElementById('power-meter').classList.remove('hidden');
        document.getElementById('power-fill').style.width = (State.power*100) + '%';
        if (Math.random() < 0.18) Audio.powerCharge();
    }
    function onPointerUp(e) {
        if (!State.aiming) return;
        State.aiming = false;
        dragOrigin = null;
        document.getElementById('power-meter').classList.add('hidden');
        if (State.power < 0.08) return; // tiny tap → cancel
        swing();
    }

    function swing() {
        const h = Holes.all[State.holeIdx];
        const ball = State.ball;
        const power = clamp(State.power + State.powerWobble, 0, 1);
        const powerBonus = Shop.getUpgradeBonus('power');
        const maxV = State.aim.maxVel * (1 + powerBonus);
        // direction: from ball toward drag start (i.e. opposite of pull direction)
        let vx = -State.aim.dx * maxV * power;
        let vy = -State.aim.dy * maxV * power;
        // clubs influence vertical lift
        const clubMod = ({
            driver: { vyMul:1.05, vxMul:1.1 },
            iron:   { vyMul:1.0,  vxMul:1.0 },
            wedge:  { vyMul:1.4,  vxMul:0.7 },
            putter: { vyMul:0.0,  vxMul:0.6 },
        })[State.club] || {vyMul:1, vxMul:1};
        vx *= clubMod.vxMul;
        vy = vy < 0 ? vy * clubMod.vyMul : vy * 0.5;
        // putter: stay grounded
        if (State.club === 'putter') vy = 0;
        ball.vx = vx; ball.vy = vy;
        ball.state = 'flying';
        // backspin
        const spinBonus = Shop.getUpgradeBonus('spin');
        ball.spin = State.club === 'wedge' ? 6 + spinBonus : (State.club === 'iron' ? 3 + spinBonus*0.5 : 0);
        ball.trailColor = Shop.trailColor(Storage.get().equipped.trail);

        State.strokes++;
        document.getElementById('hud-stroke-num').textContent = State.strokes;
        Audio.thwack(power, State.club);
        Effects.addShake(2 + power*6);
        // floating text "+1"
        const screenX = (ball.x - State.cam.x) * (canvas.getBoundingClientRect().width/VW) + canvas.getBoundingClientRect().left;
        const screenY = (ball.y - State.cam.y) * (canvas.getBoundingClientRect().height/VH) + canvas.getBoundingClientRect().top;
        Effects.floatText('+1', screenX, screenY, '#ffeb3b', 22);
        // trail particles burst
        Effects.burst(ball.x, ball.y, 8, {
            color: ['#fff', ball.trailColor], speed: 200, life: 0.5, grav: 200
        });
    }

    /* === Tick === */
    let last = performance.now();
    function loop(t) {
        const rawDt = Math.min(0.05, (t - last)/1000);
        last = t;
        const ts = State.aiming ? 0.55 : 1.0;
        const dt = rawDt * ts;

        if (State.screen === 'playing') {
            const h = Holes.all[State.holeIdx];
            // physics
            for (let i = 0; i < 2; i++) Physics.step(State.ball, h, dt/2, Audio, Effects);
            // hole update
            if (h.update) h.update.call(h, dt);
            // effects
            Effects.update(rawDt);
            // camera
            updateCamera(rawDt);
            // post-shot resolution
            if (State.ball.state === 'water') {
                State.ball.state = 'wait_reset';
                setTimeout(() => resetBallAfterHazard(), 800);
            }
            if (State.ball.state === 'holed') {
                State.ball.state = 'done';
                onHoleComplete();
            }
        } else if (State.screen === 'menu' || State.screen === 'shop' || State.screen === 'hole-select' || State.screen === 'scorecard' || State.screen === 'hole-complete') {
            // background tick — animate menu canvas
            Effects.update(rawDt);
        }

        // === Draw ===
        ctx.clearRect(0, 0, VW, VH);
        if (State.screen === 'menu' || State.screen === 'shop' || State.screen === 'hole-select' || State.screen === 'scorecard') {
            drawMenuBg();
        } else {
            const h = Holes.all[State.holeIdx];
            Render.drawWorld(ctx, h, State.cam, State.ball, State);
        }

        requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);

    /* === Menu background animation === */
    let menuT = 0;
    const menuHole = Holes.all[0];
    function drawMenuBg() {
        menuT += 0.016;
        ctx.fillStyle = menuHole.palette.sky;
        ctx.fillRect(0, 0, VW, VH);
        // simple animated landscape
        ctx.fillStyle = '#76b97f';
        ctx.beginPath();
        ctx.moveTo(0, VH);
        for (let x = 0; x <= VW; x += 16) {
            const y = 460 + Math.sin(x*0.01 + menuT)*16;
            ctx.lineTo(x, y);
        }
        ctx.lineTo(VW, VH);
        ctx.closePath();
        ctx.fill();
        // hill shadow
        ctx.fillStyle = '#5fc479';
        ctx.beginPath();
        ctx.moveTo(0, VH);
        for (let x = 0; x <= VW; x += 16) {
            const y = 540 + Math.sin(x*0.012 - menuT*0.7)*12;
            ctx.lineTo(x, y);
        }
        ctx.lineTo(VW, VH);
        ctx.closePath();
        ctx.fill();
        // sun
        ctx.fillStyle = '#fff5b6';
        ctx.beginPath(); ctx.arc(VW*0.7, 140, 70, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#1c1428'; ctx.lineWidth = 3; ctx.stroke();
        // a flag in the distance
        const fx = VW*0.5 + Math.sin(menuT*0.5)*10;
        const fy = 470;
        ctx.strokeStyle = '#1c1428'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy-50); ctx.stroke();
        ctx.fillStyle = '#e74c3c';
        const sway = Math.sin(menuT*2)*4;
        ctx.beginPath();
        ctx.moveTo(fx, fy-50);
        ctx.lineTo(fx+24+sway, fy-46);
        ctx.lineTo(fx+22+sway, fy-36);
        ctx.lineTo(fx, fy-32);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#1c1428'; ctx.stroke();
        // a bouncing ball
        const bx = VW*0.3 + Math.sin(menuT*0.7)*60;
        const by = 480 - Math.abs(Math.sin(menuT*1.5)*40);
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(bx, by, 8, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#1c1428'; ctx.lineWidth = 2; ctx.stroke();
    }

    /* === Hole completion === */
    function onHoleComplete() {
        const h = Holes.all[State.holeIdx];
        const diff = State.strokes - h.par;
        const banner = document.getElementById('result-banner');
        banner.classList.remove('eagle','albatross','hio','bogey','bogey2');
        let label = 'PAR';
        let earned = 0;
        if (State.strokes === 1) { label = 'HOLE IN ONE!'; earned = 8; banner.classList.add('hio'); }
        else if (diff <= -3) { label = 'ALBATROSS!'; earned = 6; banner.classList.add('albatross'); }
        else if (diff === -2) { label = 'EAGLE!'; earned = 4; banner.classList.add('eagle'); }
        else if (diff === -1) { label = 'BIRDIE'; earned = 2; banner.classList.add('eagle'); }
        else if (diff === 0)  { label = 'PAR'; earned = 1; }
        else if (diff === 1)  { label = 'BOGEY'; earned = 0; banner.classList.add('bogey'); }
        else if (diff === 2)  { label = 'DOUBLE BOGEY'; earned = 0; banner.classList.add('bogey2'); }
        else                  { label = `+${diff}`; earned = 0; banner.classList.add('bogey2'); }

        Storage.recordBest(State.holeIdx, State.strokes);
        Storage.unlockHole(State.holeIdx + 2); // unlock next + 1 (idx is 0-based, holes are 1-based)
        State.round.strokes[State.holeIdx] = State.strokes;

        if (earned > 0) {
            Storage.addBirdies(earned);
            // celebrate
            if (earned >= 2) {
                Audio.crowdCheer();
                Audio.fanfare(earned >= 4 ? [523,659,784,1047,1318] : [523,659,784,1047]);
                Effects.confetti(2500, 80);
            } else {
                Audio.coin();
            }
        }

        document.getElementById('result-strokes').textContent = State.strokes;
        document.getElementById('result-par').textContent = h.par;
        document.getElementById('result-earned').textContent = earned;
        banner.textContent = label;
        document.getElementById('hole-complete').classList.remove('hidden');

        State.screen = 'hole-complete';
        document.getElementById('btn-next-hole').textContent = (State.holeIdx >= 17 || !State.playingFullRound) ? 'Continue' : 'Next Hole';
    }

    function nextHole() {
        document.getElementById('hole-complete').classList.add('hidden');
        if (State.playingFullRound && State.holeIdx < 17) {
            loadHole(State.holeIdx + 1);
        } else if (State.playingFullRound && State.holeIdx === 17) {
            showScorecard();
        } else {
            // single hole — return to menu
            backToMenu();
        }
    }

    function showScorecard() {
        const tableEl = document.getElementById('scorecard-table');
        tableEl.innerHTML = '';
        const totals = document.getElementById('scorecard-totals');
        // header row
        ['#'].concat(Holes.all.slice(0, 9).map((h,i)=>String(i+1))).forEach(t => addCell(tableEl, t, true));
        addCell(tableEl, 'Total', true);
        // strokes row
        addCell(tableEl, 'Strokes', true);
        for (let i = 0; i < 9; i++) {
            const s = State.round.strokes[i];
            const par = Holes.all[i].par;
            addCell(tableEl, s !== undefined ? s : '-', false, s !== undefined ? (s < par ? 'under' : s > par ? 'over' : '') : '');
        }
        // 9-hole total
        const front = State.round.strokes.slice(0,9).reduce((a,b)=>a+b,0);
        addCell(tableEl, front);
        // back nine row
        addCell(tableEl, '#', true);
        for (let i = 9; i < 18; i++) addCell(tableEl, String(i+1), true);
        addCell(tableEl, 'Total', true);
        addCell(tableEl, 'Strokes', true);
        for (let i = 9; i < 18; i++) {
            const s = State.round.strokes[i];
            const par = Holes.all[i].par;
            addCell(tableEl, s !== undefined ? s : '-', false, s !== undefined ? (s < par ? 'under' : s > par ? 'over' : '') : '');
        }
        const back = State.round.strokes.slice(9,18).reduce((a,b)=>a+b,0);
        addCell(tableEl, back);

        const totalStrokes = State.round.strokes.reduce((a,b)=>a+(b||0),0);
        const totalPar = Holes.all.reduce((a,h)=>a+h.par,0);
        const diff = totalStrokes - totalPar;
        totals.innerHTML = `Total Strokes: <strong>${totalStrokes}</strong> · Par: ${totalPar} · ${diff <= 0 ? '-' : '+'}${Math.abs(diff)}`;
        document.getElementById('scorecard').classList.remove('hidden');
        State.screen = 'scorecard';
        // animate count-up — already handled by CSS load
        Audio.fanfare([523, 659, 784, 1047]);
        if (diff <= 0) Effects.confetti(3000, 100);
    }

    function addCell(parent, t, head=false, mod='') {
        const d = document.createElement('div');
        d.className = 'sc-cell' + (head ? ' head' : '') + (mod ? ' '+mod : '');
        d.textContent = t;
        parent.appendChild(d);
    }

    function resetBallAfterHazard() {
        const h = Holes.all[State.holeIdx];
        State.ball = makeBall();
        // place near where it went in but on solid ground (back to last known fairway)
        let safeX = State.ball.x;
        // Just reset to a sensible position — closest fairway segment before water
        safeX = Math.max(h.tee.x, State.ball.x - 80);
        // ensure solid ground (groundHeight < 600)
        let tries = 0;
        while (tries < 50 && (h.groundHeight(safeX) > 650 || isInHazard(h, safeX))) {
            safeX -= 30;
            if (safeX < 0) { safeX = h.tee.x; break; }
            tries++;
        }
        State.ball.x = safeX;
        State.ball.y = h.groundHeight(safeX) - State.ball.r;
        State.ball.state = 'settled';
        State.strokes++; // penalty
        document.getElementById('hud-stroke-num').textContent = State.strokes;
        Effects.floatText('Penalty +1', 80, 80, '#ff4757', 24);
    }
    function isInHazard(h, x) {
        if (!h.hazards) return false;
        for (const hz of h.hazards) {
            if (x >= hz.x1 && x <= hz.x2 && (hz.type === 'water' || hz.type === 'lava')) return true;
        }
        return false;
    }

    /* === Menu wiring === */
    function showMenu() {
        State.screen = 'menu';
        document.getElementById('menu').classList.remove('hidden');
        document.getElementById('hud').classList.add('hidden');
        document.getElementById('hole-complete').classList.add('hidden');
        document.getElementById('hole-select').classList.add('hidden');
        document.getElementById('shop').classList.add('hidden');
        document.getElementById('scorecard').classList.add('hidden');
    }
    function backToMenu() {
        // close any overlay
        document.getElementById('hole-complete').classList.add('hidden');
        document.getElementById('hole-select').classList.add('hidden');
        document.getElementById('shop').classList.add('hidden');
        document.getElementById('scorecard').classList.add('hidden');
        showMenu();
    }
    function startFullRound() {
        State.playingFullRound = true;
        State.round = { strokes: [] };
        document.getElementById('menu').classList.add('hidden');
        loadHole(0);
    }
    function showHoleSelect() {
        const grid = document.getElementById('hole-grid');
        grid.innerHTML = '';
        const data = Storage.get();
        for (let i = 0; i < 18; i++) {
            const h = Holes.all[i];
            const card = document.createElement('div');
            card.className = 'hole-card';
            const unlocked = data.unlocked[i+1] || i === 0;
            if (!unlocked) card.classList.add('locked');
            card.innerHTML = `
                <div class="h-num">${i+1}</div>
                <div class="h-par">Par ${h.par}</div>
                <div class="h-best">${data.bestScores[i] !== undefined ? 'Best: '+data.bestScores[i] : '—'}</div>
            `;
            card.title = h.name;
            if (unlocked) card.onclick = () => {
                Audio.uiClick();
                document.getElementById('hole-select').classList.add('hidden');
                State.playingFullRound = false;
                State.round = { strokes: [] };
                loadHole(i);
            };
            grid.appendChild(card);
        }
        document.getElementById('hole-select').classList.remove('hidden');
        State.screen = 'hole-select';
    }
    function showShop() {
        Shop.open();
        State.screen = 'shop';
    }

    document.getElementById('btn-play').onclick = () => { Audio.uiClick(); document.getElementById('menu').classList.add('hidden'); startFullRound(); };
    document.getElementById('btn-shop').onclick = () => { Audio.uiClick(); document.getElementById('menu').classList.add('hidden'); showShop(); };
    document.getElementById('btn-holes').onclick = () => { Audio.uiClick(); document.getElementById('menu').classList.add('hidden'); showHoleSelect(); };
    document.getElementById('btn-reset').onclick = () => {
        if (confirm('Erase all save progress?')) {
            Storage.reset();
            Audio.uiPop();
            updateHUD();
        }
    };
    document.getElementById('btn-next-hole').onclick = () => { Audio.uiClick(); nextHole(); };
    document.getElementById('btn-scorecard-done').onclick = () => { Audio.uiClick(); document.getElementById('scorecard').classList.add('hidden'); showMenu(); };
    document.querySelectorAll('[data-back="menu"]').forEach(b => b.onclick = () => { Audio.uiClick(); backToMenu(); });

    /* Club-select HUD */
    document.querySelectorAll('#club-select button').forEach(btn => {
        btn.onclick = () => {
            Audio.uiClick();
            State.club = btn.dataset.club;
            document.querySelectorAll('#club-select button').forEach(b => b.classList.toggle('active', b === btn));
        };
    });
    function showClubSelect() {
        document.getElementById('club-select').classList.remove('hidden');
        document.querySelectorAll('#club-select button').forEach(b => b.classList.toggle('active', b.dataset.club === State.club));
    }

    /* Keyboard shortcuts */
    window.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            if (State.screen === 'playing') {
                document.getElementById('menu').classList.remove('hidden');
                State.screen = 'menu';
            }
        }
        if (State.screen !== 'playing') return;
        if (e.key === '1') State.club = 'driver';
        if (e.key === '2') State.club = 'iron';
        if (e.key === '3') State.club = 'wedge';
        if (e.key === '4') State.club = 'putter';
        document.querySelectorAll('#club-select button').forEach(b => b.classList.toggle('active', b.dataset.club === State.club));
    });

    /* Initialise */
    Shop.init();
    showMenu();
    updateHUD();

    /* When playing, also show club select */
    setInterval(() => {
        if (State.screen === 'playing') showClubSelect();
        else document.getElementById('club-select').classList.add('hidden');
    }, 200);
})();

/* High-level rendering — wraps hole drawing, ball, aim line, slow-mo arc, caddy. */
const Render = (() => {
    const PI = Math.PI, TAU = PI*2;

    function clearSky(ctx, hole, cam) {
        ctx.fillStyle = hole.palette.sky;
        ctx.fillRect(0, 0, cam.w, cam.h);
    }

    /* Draws an entire hole frame within camera. */
    function drawWorld(ctx, hole, cam, ball, state) {
        ctx.save();
        // shake offset
        const shake = Effects.shakeOffset();
        ctx.translate(shake.x, shake.y);
        // camera transform — world to screen
        ctx.translate(-cam.x, -cam.y);

        // background
        hole.drawBackground(ctx, hole, cam);

        // terrain
        hole.drawTerrain(ctx, hole, cam);

        // hazards (re-call in case terrain renderer is custom)
        if (hole.hazards) {
            for (const hz of hole.hazards) drawHazardSurface(ctx, hole, hz);
        }

        // foreground props (between terrain and ball)
        if (hole.drawForeground) hole.drawForeground(ctx, hole, cam);

        // cup + flag
        Holes.drawCup(ctx, hole);

        // tee marker
        drawTee(ctx, hole.tee.x, hole.groundHeight(hole.tee.x), hole.palette.ink);

        // particles behind ball
        Effects.draw(ctx);

        // caddy
        if (state && state.caddy) drawCaddy(ctx, state, hole);

        // ball + trail
        drawBall(ctx, ball, state);

        // aim guide
        if (state && state.aiming) drawAimGuide(ctx, ball, state, hole);

        ctx.restore();
    }

    function drawHazardSurface(ctx, hole, hz) {
        if (hz.type !== 'water' && hz.type !== 'lava') return;
        // already drawn in drawTerrain via standard renderer; skip duplicate.
    }

    function drawTee(ctx, x, gy, ink) {
        ctx.fillStyle = '#fff';
        ctx.fillRect(x-1, gy-6, 2, 6);
        ctx.fillStyle = ink;
        ctx.beginPath(); ctx.arc(x, gy-7, 3, 0, TAU); ctx.fill();
    }

    function drawBall(ctx, ball, state) {
        if (ball.state === 'water') return; // hidden until reset
        const skin = (state && state.equipped && state.equipped.club) || 'classic';
        // shadow
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        ctx.ellipse(ball.x, ball.y + ball.r + 2, ball.r*1.1, 3, 0, 0, TAU);
        ctx.fill();
        // ball body
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#1c1428'; ctx.lineWidth = 1.5; ctx.stroke();
        // dimples
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.beginPath(); ctx.arc(ball.x - 2, ball.y - 2, 1.5, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(ball.x + 1, ball.y + 1, 1, 0, TAU); ctx.fill();
    }

    function drawAimGuide(ctx, ball, state, hole) {
        const dx = state.aim.dx, dy = state.aim.dy;
        const power = state.power; // 0..1
        const maxV = state.aim.maxVel || 1100;
        const vx = -dx * maxV * power;
        const vy = -dy * maxV * power;
        // arc preview
        const points = Physics.previewArc(hole, ball.x, ball.y, vx, vy, 50);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        for (let i = 0; i < points.length; i += 2) {
            ctx.beginPath();
            ctx.arc(points[i][0], points[i][1], 2.5 - i*0.04, 0, TAU);
            ctx.fill();
        }
        // direction arrow at ball
        const ang = Math.atan2(vy, vx);
        ctx.save();
        ctx.translate(ball.x, ball.y);
        ctx.rotate(ang);
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#1c1428'; ctx.lineWidth = 2;
        const len = 30 + power * 50;
        ctx.beginPath();
        ctx.moveTo(0, -3);
        ctx.lineTo(len-10, -3);
        ctx.lineTo(len-10, -7);
        ctx.lineTo(len, 0);
        ctx.lineTo(len-10, 7);
        ctx.lineTo(len-10, 3);
        ctx.lineTo(0, 3);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    /* Caddy companion: little animated polygon character that walks behind player. */
    function drawCaddy(ctx, state, hole) {
        const c = state.caddy;
        if (!c) return;
        const tx = state.caddyX || (hole.tee.x - 30);
        const ty = state.caddyY || hole.groundHeight(tx);
        const t = performance.now()/200;
        const bob = Math.sin(t)*2;
        ctx.save();
        ctx.translate(tx, ty + bob);
        // body
        const skinDef = Shop.getCaddyDef(c) || {bodyColor:'#fff', hatColor:'#3a91d6'};
        ctx.fillStyle = skinDef.bodyColor;
        ctx.fillRect(-8, -28, 16, 24);
        ctx.strokeStyle = '#1c1428'; ctx.lineWidth = 2;
        ctx.strokeRect(-8, -28, 16, 24);
        // head
        ctx.fillStyle = '#f3d3a8';
        ctx.beginPath(); ctx.arc(0, -36, 8, 0, TAU); ctx.fill();
        ctx.stroke();
        // hat
        ctx.fillStyle = skinDef.hatColor;
        ctx.fillRect(-10, -46, 20, 8);
        ctx.strokeRect(-10, -46, 20, 8);
        ctx.fillRect(-12, -38, 24, 3);
        // eyes
        ctx.fillStyle = '#1c1428';
        ctx.fillRect(-3, -38, 1.5, 2);
        ctx.fillRect(2, -38, 1.5, 2);
        // mouth (changes by mood)
        const mood = state.caddyMood || 'idle';
        if (mood === 'cheer') {
            ctx.fillStyle = '#1c1428';
            ctx.fillRect(-3, -32, 6, 2);
        } else {
            ctx.fillStyle = '#1c1428';
            ctx.fillRect(-2, -32, 4, 1);
        }
        // golf bag on back
        ctx.fillStyle = skinDef.bagColor || '#5d3a1f';
        ctx.fillRect(8, -28, 8, 24);
        ctx.strokeRect(8, -28, 8, 24);
        // clubs poking out
        ctx.strokeStyle = '#1c1428'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(12, -28); ctx.lineTo(16, -42); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(14, -28); ctx.lineTo(18, -40); ctx.stroke();
        ctx.restore();
    }

    /* Draw HUD elements that exist on canvas (scaled-up score popup numbers, wind direction at ball, etc.) */
    function drawHUDOverlays(ctx, state, hole, cam) {
        if (state.aiming) {
            // power meter visual element (a wobble circle around ball would be too noisy; CSS bar handles power)
        }
    }

    /* Slow-motion factor when aiming */
    function getTimeScale(state) {
        return state.aiming ? 0.45 : 1.0;
    }

    return { drawWorld, drawHUDOverlays, getTimeScale };
})();

/* Visual juice — particles, screen shake, floating text, confetti. */
const Effects = (() => {
    let shake = { mag: 0, decay: 0 };
    let particles = [];

    function update(dt) {
        if (shake.mag > 0) {
            shake.mag = Math.max(0, shake.mag - shake.decay * dt);
        }
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.life -= dt;
            if (p.life <= 0) { particles.splice(i, 1); continue; }
            p.vx += (p.gravX || 0) * dt;
            p.vy += (p.grav || 0) * dt;
            p.vx *= (1 - (p.drag || 0) * dt);
            p.vy *= (1 - (p.drag || 0) * dt);
            p.x  += p.vx * dt;
            p.y  += p.vy * dt;
            if (p.rotSpeed) p.rot = (p.rot || 0) + p.rotSpeed * dt;
        }
    }

    function shakeOffset() {
        if (shake.mag <= 0) return { x: 0, y: 0 };
        return {
            x: (Math.random() * 2 - 1) * shake.mag,
            y: (Math.random() * 2 - 1) * shake.mag,
        };
    }
    function addShake(mag, decay = 240) {
        shake.mag = Math.max(shake.mag, mag);
        shake.decay = decay;
    }

    function emit(p) { particles.push(p); }

    function burst(x, y, count, opts = {}) {
        const {color = '#fff', speed = 200, spread = Math.PI*2, dir = 0,
               size = 4, life = 0.5, grav = 400, drag = 1, shape='circle'} = opts;
        for (let i = 0; i < count; i++) {
            const a = dir + (Math.random() - 0.5) * spread;
            const s = speed * (0.5 + Math.random() * 0.7);
            particles.push({
                x, y,
                vx: Math.cos(a) * s,
                vy: Math.sin(a) * s,
                size: size * (0.5 + Math.random()),
                color: Array.isArray(color) ? color[Math.floor(Math.random() * color.length)] : color,
                life: life * (0.6 + Math.random() * 0.7),
                maxLife: life,
                grav, drag,
                shape,
                rot: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random()-0.5) * 8,
            });
        }
    }

    function trail(x, y, color = '#fff', size = 3, life = 0.4) {
        particles.push({
            x, y,
            vx: (Math.random()-0.5)*20,
            vy: (Math.random()-0.5)*20,
            size,
            color,
            life,
            maxLife: life,
            grav: 0,
            drag: 2,
            shape: 'circle',
        });
    }

    function draw(ctx) {
        for (const p of particles) {
            const alpha = Math.max(0, p.life / p.maxLife);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            if (p.shape === 'rect') {
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot);
                ctx.fillRect(-p.size, -p.size*0.6, p.size*2, p.size*1.2);
                ctx.restore();
            } else if (p.shape === 'star') {
                drawStar(ctx, p.x, p.y, p.size, 5);
            } else {
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
                ctx.fill();
            }
        }
        ctx.globalAlpha = 1;
    }

    function drawStar(ctx, x, y, r, points) {
        ctx.beginPath();
        for (let i = 0; i < points*2; i++) {
            const ang = (i / (points*2)) * Math.PI*2 - Math.PI/2;
            const rad = i%2 ? r*0.45 : r;
            ctx.lineTo(x + Math.cos(ang)*rad, y + Math.sin(ang)*rad);
        }
        ctx.closePath();
        ctx.fill();
    }

    /* DOM helpers — floating text + confetti use HTML for simplicity */
    function floatText(text, screenX, screenY, color = '#ffeb3b', size = 28) {
        const layer = document.getElementById('floating-texts');
        if (!layer) return;
        const el = document.createElement('div');
        el.className = 'float-text';
        el.textContent = text;
        el.style.left = `${screenX}px`;
        el.style.top = `${screenY}px`;
        el.style.color = color;
        el.style.fontSize = `${size}px`;
        layer.appendChild(el);
        setTimeout(() => el.remove(), 1500);
    }

    function confetti(durationMs = 2500, count = 80) {
        const layer = document.getElementById('confetti-layer');
        if (!layer) return;
        const colors = ['#ff6b8a', '#f5c43c', '#4ec06b', '#6cc4f5', '#b888f3', '#ff8c42'];
        for (let i = 0; i < count; i++) {
            const el = document.createElement('div');
            el.className = 'confetti';
            el.style.left = `${Math.random()*100}vw`;
            el.style.top = `${-20 + Math.random()*-100}px`;
            el.style.background = colors[i % colors.length];
            el.style.transform = `rotate(${Math.random()*360}deg)`;
            el.style.animationDuration = `${1.6 + Math.random()*1.5}s`;
            el.style.animationDelay = `${Math.random()*0.4}s`;
            layer.appendChild(el);
            setTimeout(() => el.remove(), 3500);
        }
    }

    function clear() { particles = []; shake = {mag:0, decay:0}; }

    return { update, draw, addShake, shakeOffset, burst, trail, floatText, confetti, emit, clear };
})();

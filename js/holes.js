/* All 18 holes — biome palettes, terrain, obstacles, decoration. */
const Holes = (() => {

    /* ----- Helpers ----- */
    const sin = Math.sin, cos = Math.cos, PI = Math.PI;
    const TAU = PI * 2;
    function clamp(v,a,b){return v<a?a:v>b?b:v;}
    function lerp(a,b,t){return a+(b-a)*t;}
    function smoothBump(x, cx, w, h) {
        const d = (x - cx) / w;
        if (d < -1 || d > 1) return 0;
        return h * 0.5 * (1 + cos(d * PI));
    }
    function pseudoNoise(x, scale=80, amp=8, seed=0) {
        return sin((x + seed*53) / scale) * amp + sin((x + seed*113) / (scale*0.43)) * amp*0.4;
    }
    function mulberry(seed) {
        return function() {
            let t = seed += 0x6D2B79F5;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    /* ----- Polygon drawing helpers (low-poly look) ----- */
    function poly(ctx, points, fill, stroke, lw=2) {
        if (!points.length) return;
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
        ctx.closePath();
        if (fill) { ctx.fillStyle = fill; ctx.fill(); }
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
    }

    function tri(ctx, x1,y1,x2,y2,x3,y3, fill, stroke, lw=2) {
        poly(ctx, [[x1,y1],[x2,y2],[x3,y3]], fill, stroke, lw);
    }

    /* Standard ground renderer using hole.groundHeight. Most holes use this. */
    function drawTerrain(ctx, hole, cam, opts = {}) {
        const W = hole.width;
        const H = hole.skyHeight || 720;
        const groundCol = opts.fairway || hole.palette.fairway;
        const grassCol = opts.grass || hole.palette.grass;
        const dirtCol = opts.dirt || hole.palette.dirt;
        const ink = hole.palette.ink;
        const step = 14;

        // Collect surface points
        const pts = [];
        const x0 = Math.max(0, cam.x - 40);
        const x1 = Math.min(W, cam.x + cam.w + 40);
        for (let x = x0; x <= x1; x += step) pts.push([x, hole.groundHeight(x)]);

        // Top grass strip
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.lineTo(pts[pts.length-1][0], pts[pts.length-1][1] + 20);
        for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i][0], pts[i][1] + 20);
        ctx.closePath();
        ctx.fillStyle = grassCol;
        ctx.fill();

        // Underground dirt
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1] + 20);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1] + 20);
        ctx.lineTo(x1, H + 200);
        ctx.lineTo(x0, H + 200);
        ctx.closePath();
        ctx.fillStyle = dirtCol;
        ctx.fill();

        // Ink outline along the surface
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.strokeStyle = ink;
        ctx.lineWidth = 3;
        ctx.stroke();

        // Hazards (sand / water etc) overlay
        if (hole.hazards) {
            for (const hz of hole.hazards) drawHazard(ctx, hole, hz, cam);
        }
    }

    function drawHazard(ctx, hole, hz, cam) {
        const ink = hole.palette.ink;
        if (hz.type === 'sand') {
            const pts = [];
            for (let x = hz.x1; x <= hz.x2; x += 8) pts.push([x, hole.groundHeight(x) + 2]);
            ctx.beginPath();
            ctx.moveTo(pts[0][0], pts[0][1]);
            for (const p of pts) ctx.lineTo(p[0], p[1]);
            ctx.lineTo(hz.x2, pts[pts.length-1][1] + 14);
            ctx.lineTo(hz.x1, pts[0][1] + 14);
            ctx.closePath();
            ctx.fillStyle = hole.palette.sand || '#f0d488';
            ctx.fill();
            ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.stroke();
        } else if (hz.type === 'water' || hz.type === 'lava' || hz.type === 'ice') {
            const colors = {
                water: ['#3a8de3', '#2a6ec0'],
                lava:  ['#ff5a1f', '#c4360a'],
                ice:   ['#cdebf4', '#a4d2e2'],
            }[hz.type];
            const top = hz.y || hole.groundHeight((hz.x1+hz.x2)/2) - 4;
            ctx.fillStyle = colors[0];
            ctx.fillRect(hz.x1, top, hz.x2 - hz.x1, 200);
            ctx.fillStyle = colors[1];
            const t = performance.now() / 600;
            for (let x = hz.x1; x < hz.x2; x += 12) {
                const yy = top + 2 + Math.sin((x + t*40) * 0.05) * 2;
                ctx.fillRect(x, yy, 8, 3);
            }
            ctx.strokeStyle = ink; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(hz.x1, top); ctx.lineTo(hz.x2, top); ctx.stroke();
        } else if (hz.type === 'rough') {
            const ink = hole.palette.ink;
            for (let x = hz.x1; x < hz.x2; x += 6) {
                const y = hole.groundHeight(x) - 2;
                ctx.strokeStyle = hole.palette.roughGrass || '#3e7836';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x + (Math.sin(x*0.4)*2), y - 6 - (Math.cos(x*0.7)*2));
                ctx.stroke();
            }
        }
    }

    /* Standard background: sky band + distant hills */
    function skyBand(ctx, hole, cam, hills = []) {
        const H = hole.skyHeight || 720;
        ctx.fillStyle = hole.palette.sky;
        ctx.fillRect(cam.x - 50, -50, cam.w + 100, H + 200);
        // distant hills layers
        for (const layer of hills) {
            ctx.fillStyle = layer.color;
            ctx.beginPath();
            ctx.moveTo(cam.x - 40, layer.baseY);
            const steps = 32;
            for (let i = 0; i <= steps; i++) {
                const x = cam.x - 40 + (cam.w + 80) * (i/steps);
                const y = layer.baseY - smoothBump(x, x - cam.x*layer.parallax, layer.w, layer.h)
                                     - sin((x*0.012 + layer.phase) ) * layer.h*0.3;
                ctx.lineTo(x, y);
            }
            ctx.lineTo(cam.x + cam.w + 40, H + 100);
            ctx.lineTo(cam.x - 40, H + 100);
            ctx.closePath();
            ctx.fill();
        }
    }

    /* Cup + flag */
    function drawCup(ctx, hole) {
        const cx = hole.cup.x;
        const cy = hole.groundHeight(cx);
        const flagH = 90;
        // pole
        ctx.strokeStyle = hole.palette.ink;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - flagH); ctx.stroke();
        // flag (waving)
        const t = performance.now()/200;
        ctx.fillStyle = hole.palette.flag || '#e74c3c';
        const sway = sin(t)*4;
        poly(ctx, [
            [cx, cy-flagH],
            [cx + 36 + sway, cy-flagH+6],
            [cx + 30 + sway, cy-flagH+18],
            [cx, cy-flagH+22],
        ], hole.palette.flag || '#e74c3c', hole.palette.ink, 2);
        // cup hole
        ctx.fillStyle = hole.palette.ink;
        ctx.beginPath();
        ctx.ellipse(cx, cy + 2, hole.cup.r, 5, 0, 0, TAU);
        ctx.fill();
        // green ring
        ctx.strokeStyle = hole.palette.ink;
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    /* ============ HOLE 1: OPENING TEE (Par 3) — sunny meadow ============ */
    const hole1 = {
        name: 'Opening Tee', par: 3, biome: 'meadow', flair: 'Sunny meadow',
        width: 1800, skyHeight: 720,
        palette: { sky:'#7ec8f5', horizon:'#a4ddf6', grass:'#5fc479', fairway:'#73d18a',
            dirt:'#7a5238', sand:'#f5dd8a', sun:'#fff5b6', cloud:'#ffffff',
            roughGrass:'#3e7836', flag:'#e74c3c', ink:'#1e1428' },
        tee: { x: 180, y: 0 }, cup: { x: 1620, r: 16 },
        wind: { speed: 5, dir: 1 },
        hazards: [{ type:'sand', x1: 950, x2: 1080 }],
        groundHeight(x) {
            const baseY = 540;
            return baseY - smoothBump(x, 800, 600, 50)
                         - smoothBump(x, 1500, 350, 25)
                         + sin(x*0.012)*4;
        },
        drawBackground(ctx, hole, cam) {
            skyBand(ctx, hole, cam, [
                { color:'#9ed8a3', baseY:560, w:900, h:80, parallax:0.4, phase:0 },
                { color:'#76b97f', baseY:580, w:600, h:60, parallax:0.6, phase:1.5 },
            ]);
            // sun
            ctx.fillStyle = hole.palette.sun;
            ctx.beginPath(); ctx.arc(cam.x*0.2 + 200, 110, 50, 0, TAU); ctx.fill();
            ctx.strokeStyle = hole.palette.ink; ctx.lineWidth = 3; ctx.stroke();
            // clouds
            const t = performance.now()/8000;
            for (let i = 0; i < 4; i++) {
                const cx = ((i*450) + t*60 + cam.x*0.15) % 1800;
                drawCloud(ctx, cx + cam.x*0.05, 90 + i*30, hole.palette.cloud, hole.palette.ink);
            }
        },
        drawForeground(ctx, hole, cam) {
            // grass tufts
            for (let x = 0; x < hole.width; x += 35) {
                const gy = hole.groundHeight(x);
                ctx.strokeStyle = '#3a8a4d'; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x+1, gy-5); ctx.stroke();
            }
            // simple trees
            [350, 1380].forEach(tx => drawTree(ctx, tx, hole.groundHeight(tx), hole.palette));
        },
    };

    function drawCloud(ctx, x, y, fill, ink) {
        ctx.fillStyle = fill;
        ctx.strokeStyle = ink; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 18, 0, TAU); ctx.arc(x+18, y-4, 16, 0, TAU);
        ctx.arc(x+34, y, 14, 0, TAU); ctx.arc(x+18, y+8, 14, 0, TAU);
        ctx.fill();
        // outline
        ctx.beginPath();
        ctx.arc(x, y, 18, 0, TAU);
        ctx.arc(x+18, y-4, 16, 0, TAU);
        ctx.arc(x+34, y, 14, 0, TAU);
        ctx.arc(x+18, y+8, 14, 0, TAU);
        ctx.stroke();
    }
    function drawTree(ctx, x, gy, p) {
        ctx.fillStyle = '#7a5238'; ctx.fillRect(x-4, gy-30, 8, 30);
        ctx.strokeStyle = p.ink; ctx.lineWidth = 2; ctx.strokeRect(x-4, gy-30, 8, 30);
        const lg = '#3e9d4f';
        poly(ctx, [[x-26, gy-28],[x-2, gy-72],[x+22, gy-28]], lg, p.ink, 2);
        poly(ctx, [[x-22, gy-46],[x, gy-86],[x+24, gy-46]], lg, p.ink, 2);
    }

    /* ============ HOLE 2: WINDMILL ALLEY (Par 4) ============ */
    const hole2 = {
        name: 'Windmill Alley', par: 4, biome: 'dutch', flair: 'Breezy Dutch countryside',
        width: 2400, skyHeight: 720,
        palette: { sky:'#bce6f5', horizon:'#deeef6', grass:'#7ac774', fairway:'#92d684',
            dirt:'#7d4f2d', sand:'#f1d077', flower:'#f7df3a', flag:'#d44a3b', ink:'#1e1428' },
        tee:{x:180, y:0}, cup:{x:2200, r:16},
        wind:{speed:8, dir:1},
        hazards: [{ type:'sand', x1:1700, x2:1820 }],
        groundHeight(x) {
            return 540 - smoothBump(x, 700, 400, 30)
                       - smoothBump(x, 1600, 500, 40)
                       - smoothBump(x, 2200, 250, 30)
                       + sin(x*0.018)*4;
        },
        obstacles: [
            { type:'windmill', x:1200, y:430, bladeLen:80, speed:1.2, _angle:0 },
        ],
        drawBackground(ctx, hole, cam) {
            skyBand(ctx, hole, cam, [
                { color:'#bcd9b1', baseY:560, w:1200, h:60, parallax:0.4, phase:0 },
            ]);
            // distant windmill
            drawWindmillBody(ctx, 350 + cam.x*0.3, 530, 0.6, hole.palette.ink, '#e8d3a8');
            // tulips
            for (let x = 100; x < hole.width; x += 70) {
                const y = hole.groundHeight(x) - 8;
                if (Math.abs(x-1200)<200) continue;
                ctx.fillStyle = hole.palette.flower;
                ctx.beginPath(); ctx.arc(x, y-4, 4, 0, TAU); ctx.fill();
                ctx.strokeStyle = hole.palette.ink; ctx.stroke();
                ctx.strokeStyle = '#3e7836'; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y+6); ctx.stroke();
            }
        },
        drawForeground(ctx, hole, cam) {
            for (const o of hole.obstacles) {
                if (o.type === 'windmill') drawWindmill(ctx, o, hole.palette.ink, '#f4e2bb');
            }
        },
        update(dt) {
            for (const o of this.obstacles) if (o.type === 'windmill') o._angle += o.speed * dt;
        },
    };
    function drawWindmillBody(ctx, x, gy, scale, ink, fill) {
        ctx.save(); ctx.translate(x, gy); ctx.scale(scale, scale);
        // tower
        poly(ctx, [[-30, 0],[-22,-160],[22,-160],[30,0]], fill, ink, 3);
        // roof
        poly(ctx, [[-28,-160],[0,-200],[28,-160]], '#a44b3a', ink, 3);
        // door
        ctx.fillStyle = ink; ctx.fillRect(-8, -28, 16, 28);
        // window
        ctx.fillStyle = '#5d3922'; ctx.fillRect(-7, -110, 14, 14);
        ctx.strokeStyle = ink; ctx.strokeRect(-7, -110, 14, 14);
        ctx.restore();
    }
    function drawWindmill(ctx, o, ink, fill) {
        drawWindmillBody(ctx, o.x, o.y + 160, 1, ink, fill);
        // blades
        ctx.save();
        ctx.translate(o.x, o.y);
        ctx.rotate(o._angle);
        for (let i = 0; i < 4; i++) {
            ctx.save(); ctx.rotate(i*PI/2);
            poly(ctx, [[0,-4],[o.bladeLen, -10],[o.bladeLen, 10],[0,4]], '#fdfdfd', ink, 3);
            ctx.restore();
        }
        ctx.fillStyle = ink;
        ctx.beginPath(); ctx.arc(0,0,8,0,TAU); ctx.fill();
        ctx.restore();
    }

    /* ============ HOLE 3: VOLCANO RIM (Par 3) ============ */
    const hole3 = {
        name: "Volcano Rim", par: 3, biome:'volcano', flair:'Smoldering caldera',
        width: 2000, skyHeight: 720,
        palette: { sky:'#3e2230', horizon:'#7a3232', grass:'#4a2a26', fairway:'#5d3328',
            dirt:'#2c1818', sand:'#7a5235', flag:'#ffcc00', ink:'#0c0507' },
        tee:{x:200, y:0}, cup:{x:1750, r:16},
        wind:{speed:8, dir:1},
        hazards: [{type:'lava', x1:600, x2:1500, y:560}],
        // Tee is on a high ledge; green is on a small island over the lava river
        groundHeight(x) {
            if (x < 580) return 380 - smoothBump(x, 200, 360, 30);
            if (x > 1520 && x < 1900) return 480 - smoothBump(x, 1750, 240, 30);
            if (x >= 1900) return 460;
            return 700; // lava trench (unreachable as ground)
        },
        // ledges allow ball to be on tee plateau and green island even though groundHeight returns 700 for the lava section
        drawBackground(ctx, hole, cam) {
            // sky
            ctx.fillStyle = hole.palette.sky;
            ctx.fillRect(cam.x-50, -50, cam.w+100, hole.skyHeight+200);
            // distant cones
            for (let i = 0; i < 4; i++) {
                const cx = i*500 + cam.x*0.2;
                const baseY = 540;
                const h = 220 + (i%2)*40;
                poly(ctx, [[cx-160, baseY],[cx, baseY-h],[cx+160, baseY]],
                    `rgba(70,30,30,${0.7-i*0.1})`, '#1a0d0d', 2);
                // lava cap
                poly(ctx, [[cx-30, baseY-h+30],[cx, baseY-h-10],[cx+30, baseY-h+30]],
                    '#ff4d1c', '#1a0d0d', 2);
            }
            // smoke plumes from main volcano (drawn in foreground later)
        },
        drawForeground(ctx, hole, cam) {
            // ember particles (live)
            const t = performance.now()/300;
            for (let i = 0; i < 14; i++) {
                const px = 800 + (i*60 + t*20)%900;
                const py = 560 - ((t*30 + i*40)%200);
                const alpha = py / 560;
                ctx.fillStyle = `rgba(255, ${100+Math.random()*100|0}, 30, ${alpha})`;
                ctx.beginPath(); ctx.arc(px, py, 2.5, 0, TAU); ctx.fill();
            }
            // rocky outline on ledges already drawn by terrain
            // lava bubbles
            for (let x = 600; x < 1500; x += 60) {
                const yy = 560 + sin(performance.now()/300 + x*0.05)*4;
                ctx.fillStyle = '#ffcc4d';
                ctx.beginPath(); ctx.arc(x + (performance.now()/200%60), yy-4, 5, 0, TAU); ctx.fill();
            }
        },
    };

    /* ============ HOLE 4: THE GLACIER (Par 5) ============ */
    const hole4 = {
        name: 'The Glacier', par: 5, biome:'arctic', flair:'Frozen lake carry',
        width: 3000, skyHeight: 720,
        palette: { sky:'#e6f2f8', horizon:'#cfe7ef', grass:'#dde7eb', fairway:'#cae0e6',
            dirt:'#8d9faa', sand:'#cfd7d9', ice:'#bee3ec', flag:'#eb4267', ink:'#152935' },
        tee:{x:180, y:0}, cup:{x:2820, r:16},
        wind:{speed:10, dir:1},
        hazards: [],
        groundHeight(x) {
            if (x < 580) return 470 - smoothBump(x, 200, 350, 18);
            if (x >= 580 && x <= 2520) return 540; // ice surface (slides)
            return 470 - smoothBump(x, 2780, 220, 24);
        },
        surfaceAt(x) { return (x >= 580 && x <= 2520) ? 'ice' : 'fairway'; },
        drawBackground(ctx, hole, cam) {
            ctx.fillStyle = hole.palette.sky;
            ctx.fillRect(cam.x-50, -50, cam.w+100, hole.skyHeight+200);
            // mountains
            for (let i = 0; i < 6; i++) {
                const cx = i*420 + cam.x*0.25;
                const baseY = 540, h = 180 + (i%3)*40;
                poly(ctx, [[cx-180, baseY],[cx, baseY-h],[cx+180, baseY]], '#9ab8c6', '#3a4f5e', 2);
                // snow cap
                poly(ctx, [[cx-50, baseY-h+45],[cx, baseY-h-6],[cx+50, baseY-h+45]], '#ffffff', '#3a4f5e', 2);
            }
        },
        drawForeground(ctx, hole, cam) {
            // ice shards on surface
            for (let x = 600; x < 2500; x += 120) {
                const wob = sin(performance.now()/600 + x)*3;
                poly(ctx, [[x, 540],[x+10, 530+wob],[x+22, 540]], '#ecf5f8', hole.palette.ink, 1.5);
            }
            // snowflakes
            const t = performance.now()/1000;
            for (let i = 0; i < 18; i++) {
                const sx = (i*180 + t*20 + cam.x*0.6) % hole.width;
                const sy = (i*53 + t*40) % 500;
                ctx.fillStyle = '#ffffff';
                ctx.beginPath(); ctx.arc(sx, sy, 1.8, 0, TAU); ctx.fill();
            }
        },
    };

    /* ============ HOLE 5: PIRATE COVE (Par 4) ============ */
    const hole5 = {
        name: 'Pirate Cove', par: 4, biome:'cove', flair:'Sea cliffs',
        width: 2400, skyHeight: 720,
        palette: { sky:'#7fd2e4', horizon:'#bce8f0', grass:'#d6c089', fairway:'#dec793',
            dirt:'#7a5024', sand:'#f1dd9c', water:'#2b80c6', flag:'#000000', ink:'#1a0e08' },
        tee:{x:170, y:0}, cup:{x:2210, r:16},
        wind:{speed:14, dir:1},
        hazards: [{ type:'water', x1:560, x2:2080, y:560 }],
        groundHeight(x) {
            if (x < 540) return 420 - smoothBump(x, 180, 360, 24);
            if (x >= 540 && x <= 2100) return 700;  // ocean trench
            return 410 - smoothBump(x, 2250, 220, 24);
        },
        obstacles: [
            { type:'buoy', x: 880, y: 558 },
            { type:'buoy', x: 1380, y: 558 },
            { type:'buoy', x: 1780, y: 558 },
        ],
        drawBackground(ctx, hole, cam) {
            ctx.fillStyle = hole.palette.sky;
            ctx.fillRect(cam.x-50, -50, cam.w+100, hole.skyHeight+200);
            // distant pirate ship
            const sx = 800 + cam.x*0.3;
            ctx.fillStyle = '#3a261a'; ctx.fillRect(sx-50, 530, 100, 18);
            poly(ctx, [[sx-40, 532],[sx-50, 548],[sx+50, 548],[sx+40, 532]], '#3a261a', hole.palette.ink, 2);
            ctx.strokeStyle = hole.palette.ink; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(sx, 530); ctx.lineTo(sx, 470); ctx.stroke();
            poly(ctx, [[sx, 470],[sx+30, 480],[sx, 510]], '#fdfdfd', hole.palette.ink, 2);
        },
        drawForeground(ctx, hole, cam) {
            // cliff edges
            ctx.fillStyle = '#5d3a1f';
            ctx.fillRect(540, 420, 5, 300);
            ctx.fillRect(2095, 410, 5, 300);
            // palm tree on green
            const px = 2300, py = hole.groundHeight(px);
            ctx.fillStyle = '#5d3a1f'; ctx.fillRect(px-3, py-50, 6, 50);
            for (let i = 0; i < 5; i++) {
                const a = -PI*0.3 + i*PI*0.2;
                ctx.strokeStyle = '#2a8c4a'; ctx.lineWidth = 5;
                ctx.beginPath(); ctx.moveTo(px, py-50);
                ctx.quadraticCurveTo(px+cos(a)*20, py-58, px+cos(a)*42, py-50+sin(a)*22);
                ctx.stroke();
            }
            // buoys
            for (const o of hole.obstacles) if (o.type === 'buoy') drawBuoy(ctx, o, hole.palette.ink);
        },
        update(dt) {
            for (const o of this.obstacles) {
                if (o.type === 'buoy') o.y = 558 + sin(performance.now()/400 + o.x)*4;
            }
        },
    };
    function drawBuoy(ctx, o, ink) {
        ctx.fillStyle = '#e74c3c';
        ctx.beginPath(); ctx.ellipse(o.x, o.y, 10, 8, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.fillRect(o.x-9, o.y-2, 18, 3);
    }

    /* ============ HOLE 6: MUSHROOM FOREST (Par 3) ============ */
    const hole6 = {
        name: 'Mushroom Forest', par: 3, biome:'forest', flair:'Bouncy fungal canopy',
        width: 1900, skyHeight: 720,
        palette: { sky:'#2c1f3d', horizon:'#3d2e54', grass:'#3a743a', fairway:'#4d8c4d',
            dirt:'#3b1f2e', sand:'#a08766', flag:'#ffe066', ink:'#0c0712' },
        tee:{x:160, y:0}, cup:{x:1740, r:16},
        wind:{speed:0, dir:1},
        hazards: [],
        groundHeight(x) {
            return 540 - smoothBump(x, 1700, 200, 30) + sin(x*0.02)*4;
        },
        obstacles: [
            { type:'mushroom', x:480,  y:430, r:60, color:'#e74c3c' },
            { type:'mushroom', x:760,  y:380, r:50, color:'#a061d1' },
            { type:'mushroom', x:1080, y:340, r:70, color:'#e74c3c' },
            { type:'mushroom', x:1380, y:380, r:55, color:'#f1a23b' },
            { type:'ceiling', y: 240 }, // low ceiling
        ],
        drawBackground(ctx, hole, cam) {
            ctx.fillStyle = hole.palette.sky;
            ctx.fillRect(cam.x-50, -50, cam.w+100, hole.skyHeight+200);
            // glowing fireflies
            const t = performance.now()/600;
            for (let i = 0; i < 30; i++) {
                const fx = (i*123 + t*10) % hole.width;
                const fy = 100 + (i*53 % 200) + sin(t + i)*8;
                ctx.fillStyle = `rgba(255,230,120,${0.5+0.5*sin(t+i)})`;
                ctx.beginPath(); ctx.arc(fx, fy, 2, 0, TAU); ctx.fill();
            }
            // big background tree silhouettes
            for (let i = 0; i < 4; i++) {
                const tx = i*450 + cam.x*0.3;
                ctx.fillStyle = '#1d1430';
                ctx.fillRect(tx-12, 340, 24, 220);
                poly(ctx, [[tx-90, 360],[tx, 220],[tx+90, 360]], '#1d1430', '#0c0712', 2);
            }
        },
        drawForeground(ctx, hole, cam) {
            // ceiling cave roof
            const ceil = 240;
            for (let x = 0; x < hole.width; x += 60) {
                poly(ctx, [[x, 0],[x+30, ceil-10],[x+60, 0]], '#1f1326', hole.palette.ink, 2);
            }
            // mushrooms
            for (const o of hole.obstacles) if (o.type === 'mushroom') drawMushroom(ctx, o, hole.palette.ink);
        },
    };
    function drawMushroom(ctx, o, ink) {
        // stem
        ctx.fillStyle = '#f4e8d2';
        ctx.fillRect(o.x-12, o.y, 24, 50);
        ctx.strokeStyle = ink; ctx.lineWidth = 3;
        ctx.strokeRect(o.x-12, o.y, 24, 50);
        // cap
        ctx.fillStyle = o.color;
        ctx.beginPath();
        ctx.ellipse(o.x, o.y, o.r, o.r*0.6, 0, PI, TAU);
        ctx.fill();
        ctx.stroke();
        // spots
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(o.x-o.r*0.4, o.y-6, 5, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(o.x+o.r*0.3, o.y-12, 7, 0, TAU); ctx.fill();
    }

    /* ============ HOLE 7: CLOCKWORK CASTLE (Par 4) ============ */
    const hole7 = {
        name: 'Clockwork Castle', par: 4, biome:'mechanical', flair:'Brass and gears',
        width: 2400, skyHeight: 720,
        palette: { sky:'#5b6a82', horizon:'#7e8ea4', grass:'#665744', fairway:'#7a684e',
            dirt:'#3a2c20', sand:'#c4a774', flag:'#d3a32a', ink:'#15100b' },
        tee:{x:180, y:0}, cup:{x:2200, r:16},
        wind:{speed:0, dir:1},
        hazards: [{ type:'water', x1:1100, x2:1700, y:560 }],
        groundHeight(x) {
            if (x < 1080) return 540 - smoothBump(x, 600, 320, 22);
            if (x >= 1080 && x <= 1720) return 700;
            return 460 - smoothBump(x, 2200, 280, 28);
        },
        obstacles: [
            // big rotating gear in front of moat
            { type:'gear', x:1400, y:480, r:100, teeth:10, speed:0.8, _angle:0, color:'#c19a3e' },
            { type:'gear', x:1100, y:560, r:60,  teeth:8, speed:-1.4, _angle:0, color:'#a37b25' },
        ],
        drawBackground(ctx, hole, cam) {
            ctx.fillStyle = hole.palette.sky;
            ctx.fillRect(cam.x-50, -50, cam.w+100, hole.skyHeight+200);
            // castle silhouette
            const cx = 1400 + cam.x*0.1;
            ctx.fillStyle = '#3e3a44';
            ctx.fillRect(cx-180, 360, 360, 180);
            for (let i = 0; i < 6; i++) {
                ctx.fillRect(cx-200 + i*68, 340, 30, 30);
            }
            ctx.strokeStyle = hole.palette.ink; ctx.lineWidth = 2;
            ctx.strokeRect(cx-180, 360, 360, 180);
        },
        drawForeground(ctx, hole, cam) {
            for (const o of hole.obstacles) if (o.type === 'gear') drawGear(ctx, o, hole.palette.ink);
        },
        update(dt) { for (const o of this.obstacles) if (o.type==='gear') o._angle += o.speed*dt; },
    };
    function drawGear(ctx, o, ink) {
        ctx.save();
        ctx.translate(o.x, o.y);
        ctx.rotate(o._angle);
        const pts = [];
        for (let i = 0; i < o.teeth*2; i++) {
            const a = (i / (o.teeth*2)) * TAU;
            const r = i%2 ? o.r : o.r*1.18;
            pts.push([cos(a)*r, sin(a)*r]);
        }
        poly(ctx, pts, o.color, ink, 3);
        ctx.fillStyle = ink;
        ctx.beginPath(); ctx.arc(0,0,o.r*0.3,0,TAU); ctx.fill();
        ctx.fillStyle = o.color;
        ctx.beginPath(); ctx.arc(0,0,o.r*0.18,0,TAU); ctx.fill();
        ctx.restore();
    }

    /* ============ HOLE 8: CACTUS CANYON (Par 5) ============ */
    const hole8 = {
        name: 'Cactus Canyon', par: 5, biome:'desert', flair:'Bouncy ricochet alley',
        width: 3000, skyHeight: 720,
        palette: { sky:'#f3a05a', horizon:'#fdc97e', grass:'#d6884a', fairway:'#e09c5d',
            dirt:'#7a3a1d', sand:'#f3d293', flag:'#28a05a', ink:'#1d0d05' },
        tee:{x:180, y:0}, cup:{x:2820, r:16},
        wind:{speed:6, dir:1},
        hazards: [{ type:'sand', x1:1400, x2:1700 }],
        groundHeight(x) {
            return 540 - smoothBump(x, 600, 240, 18)
                       - smoothBump(x, 1800, 350, 28)
                       - smoothBump(x, 2700, 280, 24)
                       + sin(x*0.024)*5;
        },
        obstacles: [
            { type:'cactus', x:780,  y0:540, h:120 },
            { type:'cactus', x:1100, y0:540, h:90 },
            { type:'cactus', x:2100, y0:540, h:140 },
            { type:'cactus', x:2400, y0:540, h:100 },
        ],
        drawBackground(ctx, hole, cam) {
            ctx.fillStyle = hole.palette.sky;
            ctx.fillRect(cam.x-50, -50, cam.w+100, hole.skyHeight+200);
            // mesas
            for (let i = 0; i < 5; i++) {
                const cx = i*640 + cam.x*0.2;
                const baseY = 540, h = 130 + (i%2)*40;
                poly(ctx, [[cx-120, baseY],[cx-110, baseY-h],[cx+110, baseY-h],[cx+120, baseY]],
                    '#b86b3a', hole.palette.ink, 2);
            }
            // sun
            ctx.fillStyle = '#fff5b6';
            ctx.beginPath(); ctx.arc(cam.x*0.1+1500, 130, 36, 0, TAU); ctx.fill();
            ctx.strokeStyle = hole.palette.ink; ctx.stroke();
        },
        drawForeground(ctx, hole, cam) {
            for (const o of hole.obstacles) if (o.type === 'cactus') drawCactus(ctx, o, hole.palette.ink);
        },
    };
    function drawCactus(ctx, o, ink) {
        const x = o.x, gy = o.y0, h = o.h;
        ctx.fillStyle = '#3da55a';
        ctx.fillRect(x-12, gy-h, 24, h);
        ctx.fillRect(x-26, gy-h*0.6, 14, 14);
        ctx.fillRect(x-26, gy-h*0.6, 6, 30);
        ctx.fillRect(x+12, gy-h*0.7, 14, 14);
        ctx.fillRect(x+20, gy-h*0.7, 6, 26);
        ctx.strokeStyle = ink; ctx.lineWidth = 2;
        ctx.strokeRect(x-12, gy-h, 24, h);
        ctx.strokeRect(x-26, gy-h*0.6, 6, 30);
        ctx.strokeRect(x+20, gy-h*0.7, 6, 26);
        // flower
        ctx.fillStyle = '#ff77aa';
        ctx.beginPath(); ctx.arc(x, gy-h-3, 4, 0, TAU); ctx.fill();
    }

    /* ============ HOLE 9: SKY ISLAND (Par 3) ============ */
    const hole9 = {
        name: 'Sky Island', par: 3, biome:'sky', flair:'Floating geometry',
        width: 2200, skyHeight: 720,
        palette: { sky:'#a8d6ff', horizon:'#cbe8ff', grass:'#7ad48a', fairway:'#8cdf99',
            dirt:'#7f5a3a', sand:'#f1dd97', flag:'#ff6b8a', ink:'#1a1230' },
        tee:{x:200, y:0}, cup:{x:2000, r:16},
        wind:{speed:18, dir:1, gusty:true},
        hazards: [],
        // 3 floating islands separated by sky.  Void areas use y=900 (off-screen) so OOB triggers.
        groundHeight(x) {
            if (x < 480)    return 460 - smoothBump(x, 250, 230, 20);
            if (x >= 480 && x < 900)  return 900;  // void below island 1
            if (x >= 900 && x < 1280) return 900;
            if (x >= 1280 && x < 1620) return 900; // void below island 2
            if (x >= 1620 && x < 2000) return 900;
            return 460 - smoothBump(x, 2080, 200, 18);
        },
        islands: [
            { x1:480, x2:900, top:480 },
            { x1:1280, x2:1620, top:440 },
        ],
        // ball can land on the island's top edge — handled in physics by treating as platform
        obstacles: [
            // platforms at given y
            { type:'platform', x1:480, x2:900, y:480 },
            { type:'platform', x1:1280, x2:1620, y:440 },
        ],
        drawBackground(ctx, hole, cam) {
            ctx.fillStyle = hole.palette.sky;
            ctx.fillRect(cam.x-50, -50, cam.w+100, hole.skyHeight+200);
            // distant pastel clouds
            const t = performance.now()/8000;
            for (let i = 0; i < 8; i++) {
                const cx = ((i*350) + t*40 + cam.x*0.3) % 2400;
                drawCloud(ctx, cx, 80 + (i*22)%200, '#ffffff', hole.palette.ink);
            }
        },
        drawForeground(ctx, hole, cam) {
            // floating islands
            for (const isl of hole.islands) drawFloatingIsland(ctx, isl, hole.palette);
        },
    };
    function drawFloatingIsland(ctx, isl, p) {
        const cx = (isl.x1+isl.x2)/2, w = isl.x2-isl.x1;
        // top grass
        poly(ctx, [[isl.x1, isl.top],[isl.x2, isl.top],[isl.x2-30, isl.top+20],[isl.x1+30, isl.top+20]],
            p.fairway, p.ink, 3);
        // dirt under
        poly(ctx, [
            [isl.x1+30, isl.top+20],[isl.x2-30, isl.top+20],
            [isl.x2-60, isl.top+60],[cx, isl.top+100],[isl.x1+60, isl.top+60]
        ], '#7a5238', p.ink, 3);
    }

    /* ============ HOLE 10: CORAL REEF (Par 4) — underwater ============ */
    const hole10 = {
        name: 'Coral Reef', par: 4, biome:'reef', flair:'Slow-mo underwater',
        width: 2400, skyHeight: 720,
        palette: { sky:'#1c5f95', horizon:'#3f7eb3', grass:'#f1b27c', fairway:'#f6c898',
            dirt:'#a37b50', sand:'#f6e6b4', flag:'#ffeb3b', ink:'#0a1f33' },
        tee:{x:170, y:0}, cup:{x:2200, r:16},
        wind:{speed:0, dir:1},
        underwater: true,
        hazards: [],
        groundHeight(x) {
            return 540 - smoothBump(x, 700, 350, 30)
                       - smoothBump(x, 1700, 320, 35)
                       - smoothBump(x, 2300, 220, 22)
                       + sin(x*0.028)*5;
        },
        obstacles: [
            { type:'jellyfish', x:550, y:340, _t:0 },
            { type:'jellyfish', x:1200, y:280, _t:0.5 },
            { type:'jellyfish', x:1900, y:340, _t:1.0 },
        ],
        drawBackground(ctx, hole, cam) {
            // gradient-free flat blues with bands
            ctx.fillStyle = '#0e3e6c'; ctx.fillRect(cam.x-50, -50, cam.w+100, 200);
            ctx.fillStyle = '#1c5f95'; ctx.fillRect(cam.x-50, 150, cam.w+100, 250);
            ctx.fillStyle = '#3f7eb3'; ctx.fillRect(cam.x-50, 380, cam.w+100, 400);
            // bubbles
            const t = performance.now()/1000;
            for (let i = 0; i < 24; i++) {
                const bx = (i*200 + (i*53)%100 + cam.x*0.4) % hole.width;
                const by = (550 - (t*40 + i*30)%600);
                ctx.fillStyle = 'rgba(255,255,255,0.4)';
                ctx.beginPath(); ctx.arc(bx, by, 2 + (i%4), 0, TAU); ctx.fill();
            }
        },
        drawForeground(ctx, hole, cam) {
            // coral
            for (let x = 100; x < hole.width; x += 90) {
                if (Math.abs(x - hole.cup.x) < 40) continue;
                const gy = hole.groundHeight(x);
                drawCoral(ctx, x, gy, (x*7%3), hole.palette.ink);
            }
            // jellyfish
            for (const o of hole.obstacles) if (o.type === 'jellyfish') drawJellyfish(ctx, o, hole.palette.ink);
        },
        update(dt) {
            for (const o of this.obstacles) if (o.type === 'jellyfish') {
                o._t += dt;
                o._y = o.y + sin(o._t*1.8)*30;
            }
        },
    };
    function drawCoral(ctx, x, gy, kind, ink) {
        const cols = ['#ff77aa','#ff9844','#a061d1'];
        ctx.fillStyle = cols[kind];
        if (kind === 0) {
            poly(ctx, [[x-10,gy],[x-4,gy-30],[x+4,gy-30],[x+10,gy]], cols[0], ink, 2);
        } else if (kind === 1) {
            for (let i = 0; i < 4; i++) ctx.fillRect(x-10+i*5, gy-20-(i%2)*8, 4, 20+(i%2)*8);
            ctx.strokeStyle = ink; ctx.strokeRect(x-10, gy-30, 20, 30);
        } else {
            for (let i = 0; i < 4; i++) {
                ctx.beginPath(); ctx.arc(x + (i%2?-6:6), gy - i*6, 5, 0, TAU); ctx.fill();
                ctx.strokeStyle = ink; ctx.stroke();
            }
        }
    }
    function drawJellyfish(ctx, o, ink) {
        const yy = o._y || o.y;
        ctx.fillStyle = 'rgba(170,120,255,0.85)';
        ctx.beginPath(); ctx.ellipse(o.x, yy, 30, 22, 0, PI, TAU); ctx.fill();
        ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.stroke();
        for (let i = -2; i <= 2; i++) {
            ctx.strokeStyle = 'rgba(170,120,255,0.7)'; ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(o.x + i*8, yy);
            ctx.bezierCurveTo(
                o.x + i*8 + 5, yy + 20,
                o.x + i*8 - 5, yy + 40,
                o.x + i*8, yy + 60);
            ctx.stroke();
        }
        // glow
        ctx.fillStyle = 'rgba(220,180,255,0.3)';
        ctx.beginPath(); ctx.arc(o.x, yy, 50, 0, TAU); ctx.fill();
    }

    /* ============ HOLE 11: HAUNTED HOLLOW (Par 4) ============ */
    const hole11 = {
        name: 'Haunted Hollow', par: 4, biome:'haunted', flair:'Ghostly mists',
        width: 2400, skyHeight: 720,
        palette: { sky:'#102018', horizon:'#1d3326', grass:'#1f4329', fairway:'#2c5b3a',
            dirt:'#1c1a17', sand:'#7a8a4a', flag:'#5af0a1', ink:'#040805' },
        tee:{x:170, y:0}, cup:{x:2210, r:16},
        wind:{speed:4, dir:-1},
        hazards: [],
        groundHeight(x) {
            return 540 - smoothBump(x, 700, 320, 24)
                       - smoothBump(x, 1500, 260, 18)
                       - smoothBump(x, 2200, 240, 22)
                       + sin(x*0.024)*5;
        },
        obstacles: [
            { type:'ghost', x: 950, y: 380, _t: 0 },
            { type:'ghost', x: 1700, y: 360, _t: 1 },
        ],
        drawBackground(ctx, hole, cam) {
            ctx.fillStyle = hole.palette.sky;
            ctx.fillRect(cam.x-50, -50, cam.w+100, hole.skyHeight+200);
            // moon
            ctx.fillStyle = '#dcedc1';
            ctx.beginPath(); ctx.arc(cam.x*0.05+1700, 110, 40, 0, TAU); ctx.fill();
            ctx.strokeStyle = hole.palette.ink; ctx.stroke();
            // dead trees
            for (let i = 0; i < 8; i++) {
                const tx = i*320 + cam.x*0.3;
                drawDeadTree(ctx, tx, 540, hole.palette.ink);
            }
            // bats (random pattern)
            const t = performance.now()/600;
            for (let i = 0; i < 6; i++) {
                const bx = (i*330 + t*60) % hole.width;
                const by = 180 + sin(t + i)*20;
                ctx.fillStyle = '#000';
                drawBat(ctx, bx, by);
            }
        },
        drawForeground(ctx, hole, cam) {
            // glowing fog
            ctx.fillStyle = 'rgba(120,180,140,0.18)';
            ctx.fillRect(cam.x-20, 480, cam.w+40, 80);
            for (const o of hole.obstacles) if (o.type === 'ghost') drawGhost(ctx, o, hole.palette.ink);
        },
        update(dt) {
            for (const o of this.obstacles) if (o.type === 'ghost') {
                o._t += dt;
                o._x = o.x + sin(o._t)*40;
            }
        },
    };
    function drawDeadTree(ctx, x, gy, ink) {
        ctx.strokeStyle = ink; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x, gy-100); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, gy-50); ctx.lineTo(x-30, gy-90); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, gy-70); ctx.lineTo(x+30, gy-110); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x-15, gy-80); ctx.lineTo(x-30, gy-120); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x+10, gy-85); ctx.lineTo(x+25, gy-130); ctx.stroke();
    }
    function drawBat(ctx, x, y) {
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.moveTo(x-12, y);
        ctx.quadraticCurveTo(x-6, y-6, x, y);
        ctx.quadraticCurveTo(x+6, y-6, x+12, y);
        ctx.quadraticCurveTo(x+6, y+4, x, y+2);
        ctx.quadraticCurveTo(x-6, y+4, x-12, y);
        ctx.fill();
    }
    function drawGhost(ctx, o, ink) {
        const x = o._x || o.x, y = o.y;
        ctx.fillStyle = 'rgba(220,255,220,0.85)';
        ctx.beginPath();
        ctx.arc(x, y, 22, PI, TAU);
        ctx.lineTo(x+22, y+22);
        ctx.lineTo(x+12, y+18);
        ctx.lineTo(x+2,  y+22);
        ctx.lineTo(x-8,  y+18);
        ctx.lineTo(x-22, y+22);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = ink;
        ctx.beginPath(); ctx.arc(x-8, y-2, 3, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(x+8, y-2, 3, 0, TAU); ctx.fill();
    }

    /* ============ HOLE 12: DRAGON'S BACK (Par 5) ============ */
    const hole12 = {
        name: "Dragon's Back", par: 5, biome:'dragon', flair:'Atop the slumbering wyrm',
        width: 3000, skyHeight: 720,
        palette: { sky:'#3a2a4d', horizon:'#5d3d75', grass:'#3a8c4f', fairway:'#52a865',
            dirt:'#3d2030', sand:'#bb7a4a', flag:'#fff2a8', ink:'#0c0612' },
        tee:{x:200, y:0}, cup:{x:2820, r:16},
        wind:{speed:0, dir:1},
        hazards: [],
        groundHeight(x) {
            // bumpy spine
            return 540 - smoothBump(x, 600, 240, 60)
                       - smoothBump(x, 1100, 200, 70)
                       - smoothBump(x, 1600, 180, 50)
                       - smoothBump(x, 2100, 220, 65)
                       - smoothBump(x, 2600, 240, 30);
        },
        obstacles: [
            { type:'firevent', x:1500, y0:540, _t:0 },
        ],
        drawBackground(ctx, hole, cam) {
            ctx.fillStyle = hole.palette.sky;
            ctx.fillRect(cam.x-50, -50, cam.w+100, hole.skyHeight+200);
            // dragon head at start
            drawDragonHead(ctx, 50, 540, hole.palette.ink);
            // dragon tail at end
            drawDragonTail(ctx, 2900, 540, hole.palette.ink);
            // dusk silhouettes
            for (let i = 0; i < 4; i++) {
                const cx = i*700 + cam.x*0.2;
                poly(ctx, [[cx-200, 560],[cx, 380],[cx+200, 560]], '#1c0e1c', hole.palette.ink, 2);
            }
        },
        drawForeground(ctx, hole, cam) {
            // scales pattern across the spine
            for (let x = 100; x < hole.width-100; x += 30) {
                const gy = hole.groundHeight(x);
                ctx.fillStyle = '#2d6e3c';
                ctx.beginPath(); ctx.arc(x, gy+10, 8, PI, TAU); ctx.fill();
                ctx.strokeStyle = hole.palette.ink; ctx.stroke();
            }
            // fire vent
            for (const o of this.obstacles) if (o.type === 'firevent') drawFireVent(ctx, o);
        },
        update(dt) {
            for (const o of this.obstacles) if (o.type === 'firevent') o._t += dt;
        },
    };
    function drawDragonHead(ctx, x, gy, ink) {
        ctx.fillStyle = '#3a8c4f';
        poly(ctx, [[x-30,gy],[x-50,gy-90],[x+90,gy-110],[x+150,gy-50],[x+90,gy]], '#3a8c4f', ink, 3);
        // eye
        ctx.fillStyle = '#ffeb3b';
        ctx.beginPath(); ctx.arc(x+90, gy-70, 8, 0, TAU); ctx.fill();
        ctx.fillStyle = ink;
        ctx.beginPath(); ctx.arc(x+92, gy-70, 4, 0, TAU); ctx.fill();
        // horn
        poly(ctx, [[x-30, gy-70],[x-10, gy-130],[x+10, gy-90]], '#7a5238', ink, 2);
    }
    function drawDragonTail(ctx, x, gy, ink) {
        poly(ctx, [[x-90, gy],[x-30, gy-60],[x+50, gy-80],[x+30, gy]], '#3a8c4f', ink, 3);
        poly(ctx, [[x+30, gy-90],[x+60, gy-130],[x+30, gy-70]], '#3a8c4f', ink, 2);
    }
    function drawFireVent(ctx, o) {
        const t = o._t % 3;
        if (t < 0.6) {
            // active fire
            const h = 80 + sin(performance.now()/80)*10;
            poly(ctx, [[o.x-22, o.y0],[o.x-12, o.y0-h*0.6],[o.x, o.y0-h],[o.x+12, o.y0-h*0.6],[o.x+22, o.y0]],
                '#ff6b3b', '#1a0d0d', 2);
            poly(ctx, [[o.x-12, o.y0],[o.x, o.y0-h*0.7],[o.x+12, o.y0]],
                '#ffd93b', '#1a0d0d', 2);
        }
        // vent
        ctx.fillStyle = '#1c0e0e';
        ctx.fillRect(o.x-22, o.y0-4, 44, 8);
    }

    /* ============ HOLE 13: TINY TOWN (Par 3) ============ */
    const hole13 = {
        name: 'Tiny Town', par: 3, biome:'suburb', flair:'A shrunken neighborhood',
        width: 2000, skyHeight: 720,
        palette: { sky:'#c9e7f5', horizon:'#dff1f7', grass:'#74c378', fairway:'#90d491',
            dirt:'#7a5238', sand:'#ddc78a', flag:'#3a91d6', ink:'#1c0f1c' },
        tee:{x:200, y:0}, cup:{x:1800, r:16},
        wind:{speed:0, dir:1},
        hazards: [],
        groundHeight(x) {
            return 540 + sin(x*0.012)*4;
        },
        obstacles: [
            { type:'house', x:600,  y0:540, w:100, h:100, color:'#e74c3c' },
            { type:'house', x:780,  y0:540, w:80,  h:80,  color:'#f5c43c' },
            { type:'house', x:1000, y0:540, w:120, h:130, color:'#3a91d6' },
            { type:'pool',  x:1700, y0:540, w:160, h:24 },
            { type:'car',   x:900,  y0:540, color:'#ff6b8a' },
        ],
        drawBackground(ctx, hole, cam) {
            ctx.fillStyle = hole.palette.sky;
            ctx.fillRect(cam.x-50, -50, cam.w+100, hole.skyHeight+200);
            // road
            ctx.fillStyle = '#3a3a44';
            ctx.fillRect(0, 555, hole.width, 6);
            for (let x = 20; x < hole.width; x += 60) {
                ctx.fillStyle = '#fff';
                ctx.fillRect(x, 557, 20, 2);
            }
        },
        drawForeground(ctx, hole, cam) {
            for (const o of hole.obstacles) {
                if (o.type === 'house') drawHouse(ctx, o, hole.palette.ink);
                else if (o.type === 'car') drawCar(ctx, o, hole.palette.ink);
                else if (o.type === 'pool') drawPool(ctx, o, hole.palette.ink);
            }
        },
    };
    function drawHouse(ctx, o, ink) {
        const x = o.x, y = o.y0 - o.h;
        ctx.fillStyle = o.color;
        ctx.fillRect(x, y, o.w, o.h);
        ctx.strokeStyle = ink; ctx.lineWidth = 3;
        ctx.strokeRect(x, y, o.w, o.h);
        // roof
        poly(ctx, [[x-6, y],[x+o.w/2, y-o.h*0.5],[x+o.w+6, y]], '#5d3326', ink, 3);
        // door
        ctx.fillStyle = '#5d3326';
        ctx.fillRect(x+o.w/2-12, y+o.h-30, 24, 30);
        ctx.strokeRect(x+o.w/2-12, y+o.h-30, 24, 30);
        // windows
        ctx.fillStyle = '#bce6f5';
        ctx.fillRect(x+10, y+10, 20, 20);
        ctx.strokeRect(x+10, y+10, 20, 20);
        ctx.fillRect(x+o.w-30, y+10, 20, 20);
        ctx.strokeRect(x+o.w-30, y+10, 20, 20);
    }
    function drawCar(ctx, o, ink) {
        const x = o.x, y = o.y0 - 20;
        ctx.fillStyle = o.color;
        ctx.fillRect(x, y, 60, 14);
        poly(ctx, [[x+10, y],[x+18, y-12],[x+44, y-12],[x+52, y]], o.color, ink, 2);
        ctx.strokeStyle = ink; ctx.lineWidth = 2;
        ctx.strokeRect(x, y, 60, 14);
        ctx.fillStyle = '#1c0f1c';
        ctx.beginPath(); ctx.arc(x+12, y+16, 6, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(x+48, y+16, 6, 0, TAU); ctx.fill();
    }
    function drawPool(ctx, o, ink) {
        ctx.fillStyle = '#6cc4f5';
        ctx.fillRect(o.x, o.y0-2, o.w, o.h);
        ctx.strokeStyle = ink; ctx.lineWidth = 2;
        ctx.strokeRect(o.x, o.y0-2, o.w, o.h);
        // ripples
        const t = performance.now()/300;
        ctx.strokeStyle = '#fff';
        for (let i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.moveTo(o.x+10+i*30, o.y0+8 + sin(t+i)*1);
            ctx.lineTo(o.x+30+i*30, o.y0+8 + sin(t+i)*1);
            ctx.stroke();
        }
    }

    /* ============ HOLE 14: RAINBOW ROAD (Par 4) ============ */
    const hole14 = {
        name: 'Rainbow Road', par: 4, biome:'rainbow', flair:'Banked psychedelic loop',
        width: 2400, skyHeight: 720,
        palette: { sky:'#0a0820', horizon:'#1a0f3a', grass:'#ff77aa', fairway:'#ff77aa',
            dirt:'#1a0f3a', sand:'#ffe066', flag:'#ffffff', ink:'#0a0420' },
        tee:{x:200, y:0}, cup:{x:2200, r:16},
        wind:{speed:0, dir:1},
        hazards: [],
        groundHeight(x) {
            return 540 - smoothBump(x, 800, 300, 80)
                       - smoothBump(x, 1500, 300, 80)
                       + sin(x*0.012)*15;
        },
        // colored rainbow stripes painted on the surface
        drawBackground(ctx, hole, cam) {
            ctx.fillStyle = hole.palette.sky;
            ctx.fillRect(cam.x-50, -50, cam.w+100, hole.skyHeight+200);
            // stars
            const t = performance.now()/2000;
            for (let i = 0; i < 60; i++) {
                const sx = (i*171) % hole.width;
                const sy = (i*53) % 480;
                ctx.fillStyle = `rgba(255,255,255,${0.4 + 0.6*Math.abs(sin(t+i))})`;
                ctx.fillRect(sx, sy, 2, 2);
            }
        },
        drawForeground(ctx, hole, cam) {},
        // override default terrain renderer with rainbow stripes
        drawTerrain(ctx, hole, cam) {
            const colors = ['#ff4757','#ff7f50','#ffd93b','#7bd967','#3da9d4','#9858f1'];
            const step = 14;
            for (let band = 0; band < colors.length; band++) {
                ctx.fillStyle = colors[band];
                ctx.beginPath();
                let first = true;
                for (let x = cam.x - 40; x <= cam.x + cam.w + 40; x += step) {
                    const y = hole.groundHeight(x) + band*6;
                    if (first) { ctx.moveTo(x, y); first = false; }
                    else ctx.lineTo(x, y);
                }
                ctx.lineTo(cam.x+cam.w+40, hole.skyHeight+200);
                ctx.lineTo(cam.x-40, hole.skyHeight+200);
                ctx.closePath();
                ctx.fill();
            }
            // ink outline
            ctx.beginPath();
            for (let x = cam.x - 40; x <= cam.x + cam.w + 40; x += step) {
                const y = hole.groundHeight(x);
                if (x === cam.x - 40) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
            ctx.stroke();
        },
    };

    /* ============ HOLE 15: THE LABYRINTH (Par 5) ============ */
    const hole15 = {
        name: 'The Labyrinth', par: 5, biome:'maze', flair:'Hedge of doom',
        width: 3000, skyHeight: 720,
        palette: { sky:'#bce6f5', horizon:'#deeef6', grass:'#5fc479', fairway:'#73d18a',
            dirt:'#7a5238', sand:'#f0d488', flag:'#ff77aa', ink:'#0e0a18' },
        tee:{x:180, y:0}, cup:{x:2820, r:16},
        wind:{speed:2, dir:1},
        hazards: [],
        groundHeight(x) { return 540; },
        obstacles: [
            // hedge walls — vertical bumpers ball must navigate around
            { type:'hedge', x:600,  y1:380, y2:540, w:30 },
            { type:'hedge', x:900,  y1:430, y2:540, w:30 },
            { type:'hedge', x:1200, y1:380, y2:500, w:30 },
            { type:'hedge', x:1500, y1:420, y2:540, w:30 },
            { type:'hedge', x:1800, y1:380, y2:530, w:30 },
            { type:'hedge', x:2100, y1:430, y2:540, w:30 },
            { type:'hedge', x:2400, y1:380, y2:520, w:30 },
            { type:'hedge', x:2650, y1:420, y2:540, w:30 },
        ],
        drawBackground(ctx, hole, cam) {
            ctx.fillStyle = hole.palette.sky;
            ctx.fillRect(cam.x-50, -50, cam.w+100, hole.skyHeight+200);
            // stone walls border
            ctx.fillStyle = '#a8a89a';
            ctx.fillRect(0, 200, hole.width, 6);
        },
        drawForeground(ctx, hole, cam) {
            for (const o of hole.obstacles) if (o.type === 'hedge') drawHedge(ctx, o, hole.palette.ink);
        },
    };
    function drawHedge(ctx, o, ink) {
        ctx.fillStyle = '#2c5b3a';
        ctx.fillRect(o.x - o.w/2, o.y1, o.w, o.y2-o.y1);
        ctx.strokeStyle = ink; ctx.lineWidth = 3;
        ctx.strokeRect(o.x - o.w/2, o.y1, o.w, o.y2-o.y1);
        // foliage bumps
        for (let y = o.y1; y < o.y2; y += 14) {
            ctx.fillStyle = '#3a8a4a';
            ctx.beginPath(); ctx.arc(o.x - o.w/2 + 4, y+4, 6, 0, TAU); ctx.fill();
            ctx.beginPath(); ctx.arc(o.x + o.w/2 - 4, y+8, 6, 0, TAU); ctx.fill();
        }
    }

    /* ============ HOLE 16: METEOR CRATER (Par 3) ============ */
    const hole16 = {
        name: 'Meteor Crater', par: 3, biome:'mars', flair:'Gravity well bowl',
        width: 1900, skyHeight: 720,
        palette: { sky:'#5b1a18', horizon:'#7d2a25', grass:'#a04030', fairway:'#b85040',
            dirt:'#5a1f1a', sand:'#dec094', flag:'#ffeb3b', ink:'#160604' },
        tee:{x:180, y:0}, cup:{x:1000, r:18},
        wind:{speed:0, dir:1},
        gravityWell: { x: 1000, strength: 320 },
        hazards: [],
        groundHeight(x) {
            // smooth crater bowl: deepest at center, gentle rim
            const dist = Math.abs(x - 1000);
            const baseY = 480;
            if (dist < 700) return baseY + 90 * (1 + cos(dist/700*PI))/2;
            return baseY;
        },
        drawBackground(ctx, hole, cam) {
            ctx.fillStyle = hole.palette.sky;
            ctx.fillRect(cam.x-50, -50, cam.w+100, hole.skyHeight+200);
            // dust streaks
            for (let i = 0; i < 30; i++) {
                const dx = (i*100 + cam.x*0.4) % hole.width;
                const dy = 200 + (i*53) % 240;
                ctx.fillStyle = `rgba(160,80,60,${0.3 + (i%4)*0.1})`;
                ctx.fillRect(dx, dy, 30, 1);
            }
            // bigger meteor in sky
            ctx.fillStyle = '#a04030';
            ctx.beginPath(); ctx.arc(cam.x*0.1+1500, 130, 30, 0, TAU); ctx.fill();
            ctx.strokeStyle = hole.palette.ink; ctx.stroke();
            // fire trail
            ctx.fillStyle = '#ffaa3a';
            for (let i = 1; i < 8; i++) {
                ctx.beginPath();
                ctx.arc(cam.x*0.1+1500-i*20, 130 + i*4, 30 - i*3, 0, TAU);
                ctx.fill();
            }
        },
        drawForeground(ctx, hole, cam) {
            // small craters around
            for (let i = 0; i < 6; i++) {
                const cx = (i*250 + 200);
                if (Math.abs(cx-1000)<400) continue;
                const cy = hole.groundHeight(cx);
                ctx.fillStyle = '#5a1f1a';
                ctx.beginPath(); ctx.ellipse(cx, cy+2, 30, 6, 0, 0, TAU); ctx.fill();
            }
        },
    };

    /* ============ HOLE 17: NEON CITY (Par 4) ============ */
    const hole17 = {
        name: 'Neon City', par: 4, biome:'neon', flair:'Rooftop hop',
        width: 2400, skyHeight: 720,
        palette: { sky:'#0a0418', horizon:'#1a0a30', grass:'#33223a', fairway:'#42284a',
            dirt:'#1c0c20', sand:'#ff6b8a', flag:'#3afff0', ink:'#000000' },
        tee:{x:180, y:0}, cup:{x:2200, r:16},
        wind:{speed:0, dir:1},
        hazards: [],
        // rooftops
        groundHeight(x) {
            // each rooftop is at distinct height
            const rows = [
                {x1:0, x2:380, y:480},
                {x1:380, x2:760, y:430},
                {x1:760, x2:1140, y:500},
                {x1:1140, x2:1520, y:440},
                {x1:1520, x2:1900, y:470},
                {x1:1900, x2:2400, y:420},
            ];
            for (const r of rows) if (x >= r.x1 && x < r.x2) return r.y;
            return 480;
        },
        boostPads: [
            { x1:760, x2:870, y:500 },
            { x1:1700, x2:1800, y:470 },
        ],
        drawBackground(ctx, hole, cam) {
            ctx.fillStyle = hole.palette.sky;
            ctx.fillRect(cam.x-50, -50, cam.w+100, hole.skyHeight+200);
            // distant skyscrapers
            for (let i = 0; i < 20; i++) {
                const bx = i*150 + cam.x*0.4;
                const bh = 100 + (i*53)%180;
                const by = 540 - bh;
                const c = ['#1a0a30','#28133e','#371b50','#1d0e2a'][i%4];
                ctx.fillStyle = c;
                ctx.fillRect(bx, by, 100, bh);
                // windows
                for (let wy = by + 10; wy < by + bh - 10; wy += 16) {
                    for (let wx = bx + 10; wx < bx + 90; wx += 16) {
                        if ((i + wx + wy) % 5 === 0) {
                            ctx.fillStyle = ['#3afff0','#ff6b8a','#ffd93b'][(i+Math.floor(wx))%3];
                            ctx.fillRect(wx, wy, 6, 8);
                        }
                    }
                }
            }
            // moon
            ctx.fillStyle = '#dcedc1';
            ctx.beginPath(); ctx.arc(cam.x*0.05+800, 110, 40, 0, TAU); ctx.fill();
        },
        drawForeground(ctx, hole, cam) {
            // boost pads
            for (const b of hole.boostPads) {
                ctx.fillStyle = '#3afff0';
                ctx.fillRect(b.x1, b.y-4, b.x2-b.x1, 6);
                ctx.strokeStyle = hole.palette.ink; ctx.strokeRect(b.x1, b.y-4, b.x2-b.x1, 6);
                // arrows
                ctx.fillStyle = '#000';
                for (let x = b.x1+10; x < b.x2-10; x += 20) {
                    poly(ctx, [[x, b.y-2],[x+10, b.y-12],[x+10, b.y-6],[x+18, b.y-6],[x+18, b.y+2],[x+10, b.y+2],[x+10, b.y+8]],
                        '#000', null);
                }
            }
        },
        // override terrain to draw blocky rooftops
        drawTerrain(ctx, hole, cam) {
            const rows = [
                {x1:0, x2:380, y:480, c:'#42284a'},
                {x1:380, x2:760, y:430, c:'#553266'},
                {x1:760, x2:1140, y:500, c:'#42284a'},
                {x1:1140, x2:1520, y:440, c:'#553266'},
                {x1:1520, x2:1900, y:470, c:'#42284a'},
                {x1:1900, x2:2400, y:420, c:'#553266'},
            ];
            for (const r of rows) {
                ctx.fillStyle = r.c;
                ctx.fillRect(r.x1, r.y, r.x2-r.x1, hole.skyHeight - r.y + 200);
                ctx.strokeStyle = hole.palette.ink; ctx.lineWidth = 3;
                ctx.strokeRect(r.x1, r.y, r.x2-r.x1, hole.skyHeight - r.y + 200);
                // neon glow strip
                ctx.fillStyle = '#3afff0';
                ctx.fillRect(r.x1, r.y, r.x2-r.x1, 2);
            }
        },
    };

    /* ============ HOLE 18: THE FINAL GREEN (Par 5) ============ */
    const hole18 = {
        name: 'The Final Green', par: 5, biome:'finale', flair:'Multi-tiered showcase',
        width: 3200, skyHeight: 720,
        palette: { sky:'#84d4f5', horizon:'#bce6f5', grass:'#5fc479', fairway:'#73d18a',
            dirt:'#7a5238', sand:'#f0d488', water:'#3a8de3', flag:'#ffd93b', ink:'#1e1428' },
        tee:{x:200, y:0}, cup:{x:3050, r:18},
        wind:{speed:6, dir:1},
        hazards: [{ type:'water', x1:1600, x2:2000, y:580 }],
        // multi-tiered
        groundHeight(x) {
            if (x < 600) return 460;
            if (x < 1100) return 460 + (x-600)*0.05; // gentle slope down
            if (x < 1600) return 540 - smoothBump(x, 1300, 250, 24);
            if (x < 2000) return 700; // waterfall pool
            if (x < 2400) return 480 + (x-2000)*0.05; // climb up
            if (x < 2800) return 500 - smoothBump(x, 2600, 200, 20);
            return 460 - smoothBump(x, 3050, 150, 16);
        },
        drawBackground(ctx, hole, cam) {
            ctx.fillStyle = hole.palette.sky;
            ctx.fillRect(cam.x-50, -50, cam.w+100, hole.skyHeight+200);
            // distant mountains
            for (let i = 0; i < 5; i++) {
                const cx = i*700 + cam.x*0.2;
                poly(ctx, [[cx-200, 460],[cx, 280],[cx+200, 460]], '#9bb6c0', hole.palette.ink, 2);
                poly(ctx, [[cx-50, 320],[cx, 280],[cx+50, 320]], '#fff', hole.palette.ink, 2);
            }
            // grandstand at end
            const gx = 2800 + cam.x*0.05;
            ctx.fillStyle = '#7a5238';
            ctx.fillRect(gx, 370, 280, 90);
            ctx.strokeStyle = hole.palette.ink; ctx.strokeRect(gx, 370, 280, 90);
            for (let i = 0; i < 16; i++) {
                ctx.fillStyle = ['#ff6b8a','#f5c43c','#3a91d6','#5fc479','#a061d1'][i%5];
                ctx.beginPath();
                ctx.arc(gx + 10 + i*16, 380 + (i%2)*8, 6, 0, TAU);
                ctx.fill();
                ctx.strokeStyle = hole.palette.ink; ctx.stroke();
            }
        },
        drawForeground(ctx, hole, cam) {
            // waterfall
            const t = performance.now()/200;
            ctx.fillStyle = '#84d4f5';
            for (let y = 460; y < 580; y += 12) {
                ctx.fillRect(1600, y + (t*40)%24, 400, 6);
            }
            ctx.strokeStyle = hole.palette.ink; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(1600, 460); ctx.lineTo(1600, 580); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(2000, 460); ctx.lineTo(2000, 580); ctx.stroke();
            // mist
            for (let i = 0; i < 12; i++) {
                ctx.fillStyle = `rgba(255,255,255,${0.3 + Math.random()*0.3})`;
                ctx.beginPath(); ctx.arc(1600 + i*32 + (t*10)%30, 580 - (i%4)*4, 8, 0, TAU); ctx.fill();
            }
        },
    };

    const all = [hole1,hole2,hole3,hole4,hole5,hole6,hole7,hole8,hole9,hole10,hole11,hole12,hole13,hole14,hole15,hole16,hole17,hole18];
    // assign tee y from groundHeight, install defaults, carve sand bunkers as depressions
    for (const h of all) {
        if (!h.drawTerrain) h.drawTerrain = drawTerrain;
        if (!h.update) h.update = function(){};
        if (!h.obstacles) h.obstacles = [];

        if (h.hazards && h.hazards.some(hz => hz.type === 'sand')) {
            const original = h.groundHeight.bind(h);
            const sandBunkers = h.hazards.filter(hz => hz.type === 'sand');
            h.groundHeight = function(x) {
                let y = original(x);
                for (const hz of sandBunkers) {
                    if (x >= hz.x1 && x <= hz.x2) {
                        const cx = (hz.x1 + hz.x2) / 2;
                        const w  = (hz.x2 - hz.x1) / 2;
                        const t  = (x - cx) / w;
                        const dip = (hz.depth || 18) * (1 - t*t); // parabola
                        y += dip;
                    }
                }
                return y;
            };
        }

        h.tee.y = h.groundHeight(h.tee.x);
    }

    return { all, drawCup, drawTerrain, helpers: { smoothBump, poly, tri } };
})();

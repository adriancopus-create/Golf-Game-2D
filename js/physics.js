/* Physics: ball trajectory + collisions + per-hole modifiers. */
const Physics = (() => {
    const GRAVITY = 1500;
    const PI = Math.PI, TAU = PI*2;

    /* === Surface lookup === */
    function surfaceAt(hole, x) {
        if (hole.surfaceAt) return hole.surfaceAt(x);
        if (hole.hazards) {
            for (const hz of hole.hazards) {
                if (x >= hz.x1 && x <= hz.x2) {
                    if (hz.type === 'sand')  return 'sand';
                    if (hz.type === 'water') return 'water';
                    if (hz.type === 'lava')  return 'lava';
                    if (hz.type === 'ice')   return 'ice';
                    if (hz.type === 'rough') return 'rough';
                }
            }
        }
        // green ring
        if (Math.abs(x - hole.cup.x) < 90) return 'green';
        return 'fairway';
    }

    /* Hazard-only check — doesn't fall back to fairway/green */
    function hazardAt(hole, x) {
        if (hole.hazards) {
            for (const hz of hole.hazards) {
                if (x >= hz.x1 && x <= hz.x2) return hz.type;
            }
        }
        return null;
    }

    /* === Slope at x (radians) === */
    function slopeAt(hole, x) {
        const dx = 4;
        const y1 = hole.groundHeight(x - dx);
        const y2 = hole.groundHeight(x + dx);
        return Math.atan2(y2 - y1, dx*2);
    }

    /* === Step the ball === */
    function step(ball, hole, dt, audio, fx) {
        if (ball.state === 'flying' || ball.state === 'rolling') {
            const wind = hole.wind || { speed:0, dir:1 };
            // wind force (pixels/s²)
            let windForce = wind.speed * 8 * (wind.dir > 0 ? 1 : -1);
            if (wind.gusty) windForce *= (1 + Math.sin(performance.now()/1500)*0.6);

            // underwater drag for hole 10 — gentler so the hole is still completable
            const drag = hole.underwater ? 0.6 : 0.04;
            const grav = hole.underwater ? GRAVITY * 0.5 : GRAVITY;

            // gravity well (hole 16)
            if (hole.gravityWell) {
                const dx = hole.gravityWell.x - ball.x;
                const dist = Math.max(20, Math.abs(dx));
                ball.vx += (dx / dist) * hole.gravityWell.strength * dt;
            }

            ball.vx += windForce * dt;
            ball.vx *= 1 - drag * dt;
            ball.vy += grav * dt;
            if (hole.underwater) ball.vy *= 1 - drag * dt;

            // spin (Magnus-ish): backspin reduces vy
            ball.spin = (ball.spin || 0) * 0.985;
            ball.vy -= ball.spin * 80 * dt;

            ball.x += ball.vx * dt;
            ball.y += ball.vy * dt;

            // emit trail (uses equipped trail's color set if available)
            if (fx && ball.state === 'flying') {
                ball.trailTimer = (ball.trailTimer || 0) - dt;
                if (ball.trailTimer <= 0) {
                    let color = ball.trailColor || '#fff';
                    if (typeof Shop !== 'undefined') {
                        const tDef = Shop.getTrailDef(Storage.get().equipped.trail);
                        if (tDef && tDef.kind !== 'plain') {
                            const cs = Array.isArray(tDef.color) ? tDef.color : [tDef.color];
                            color = cs[Math.floor(Math.random()*cs.length)];
                        }
                    }
                    fx.trail(ball.x, ball.y, color, 3 + (Math.random()*2-1), 0.45);
                    ball.trailTimer = 0.018;
                }
            }

            // === Boundary clamp ===
            if (ball.x < 0) { ball.x = 0; ball.vx = -ball.vx * 0.4; }
            if (ball.x > hole.width) { ball.x = hole.width; ball.vx = -ball.vx * 0.4; }

            // === Out-of-bounds (fell off the world) ===
            if (ball.y > 760) {
                ball.state = 'water';
                ball.vx = 0; ball.vy = 0;
                if (audio) audio.splash();
                if (fx) {
                    fx.burst(ball.x, 720, 16, {color:['#fff','#bce6f5'], speed:300, life:0.6, grav:600});
                    fx.addShake(5);
                }
                return;
            }

            // === Hazard surface contact (water/lava with explicit y) ===
            if (hole.hazards) {
                for (const hz of hole.hazards) {
                    if ((hz.type === 'water' || hz.type === 'lava') && hz.y !== undefined &&
                        ball.x >= hz.x1 && ball.x <= hz.x2 && ball.y + ball.r > hz.y) {
                        ball.state = 'water';
                        ball.vx = 0; ball.vy = 0;
                        if (audio) audio.splash();
                        if (fx) {
                            fx.burst(ball.x, hz.y, 16, {
                                color: hz.type === 'lava' ? ['#ffaa3a','#ff6b3b','#ffd93b']
                                                          : ['#84d4f5','#fff','#3a8de3'],
                                speed:320, life:0.7, grav:600,
                            });
                            fx.addShake(hz.type === 'lava' ? 8 : 5);
                        }
                        return;
                    }
                }
            }

            // === Obstacle collisions ===
            obstacleCollide(ball, hole, audio, fx);

            // === Ground collision ===
            const gy = hole.groundHeight(ball.x);
            if (ball.y >= gy - ball.r) {
                const surface = surfaceAt(hole, ball.x);
                handleLanding(ball, hole, gy, surface, audio, fx);
            }

            // === Cup detection ===
            const cupDist = Math.abs(ball.x - hole.cup.x);
            if (ball.state !== 'holed' && cupDist < hole.cup.r + 4 && Math.abs(ball.y - (hole.groundHeight(hole.cup.x) - ball.r)) < 18) {
                if (Math.hypot(ball.vx, ball.vy) < 700) {
                    ball.state = 'holed';
                    ball.x = hole.cup.x;
                    ball.y = hole.groundHeight(hole.cup.x) + 4;
                    ball.vx = 0; ball.vy = 0;
                    if (audio) audio.holeIn();
                    if (fx) {
                        fx.burst(ball.x, ball.y, 30, {color:['#ffd93b','#fff','#3afff0'], speed:300, life:0.9, grav:200});
                        fx.addShake(8);
                    }
                }
            }
        }
    }

    function obstacleCollide(ball, hole, audio, fx) {
        for (const o of hole.obstacles || []) {
            if (o.type === 'mushroom') {
                const dx = ball.x - o.x, dy = ball.y - o.y;
                const dist = Math.hypot(dx, dy);
                if (dist < o.r + ball.r && dy < 6) {
                    const nx = dx/dist, ny = dy/dist;
                    const speed = Math.hypot(ball.vx, ball.vy) * 1.1 + 80;
                    ball.vx = nx * speed;
                    ball.vy = ny * speed - 100;
                    ball.x = o.x + nx*(o.r + ball.r + 1);
                    ball.y = o.y + ny*(o.r + ball.r + 1);
                    if (audio) audio.bounce(1.5);
                    if (fx) {
                        fx.burst(ball.x, ball.y, 8, {color:['#fff', o.color], speed:140, life:0.4});
                        fx.addShake(3);
                    }
                }
            } else if (o.type === 'ceiling') {
                if (ball.y < o.y + ball.r) {
                    ball.y = o.y + ball.r;
                    ball.vy = Math.abs(ball.vy)*0.6;
                    if (audio) audio.bounce(0.5);
                }
            } else if (o.type === 'cactus') {
                // bouncy cactus bumper — body box
                const bx = o.x - 12, by = o.y0 - o.h, bw = 24, bh = o.h;
                if (boxOverlap(ball, bx, by, bw, bh)) {
                    // reflect horizontally if approaching from side
                    const cx = bx + bw/2;
                    const dir = ball.x < cx ? -1 : 1;
                    ball.vx = dir * (Math.abs(ball.vx) * 1.4 + 100);
                    ball.x = dir > 0 ? bx + bw + ball.r + 1 : bx - ball.r - 1;
                    if (audio) audio.bounce(1.2);
                    if (fx) fx.burst(ball.x, ball.y, 6, {color:['#3da55a','#fff'], speed:180, life:0.4});
                }
            } else if (o.type === 'house') {
                const bx = o.x, by = o.y0 - o.h, bw = o.w, bh = o.h;
                if (boxOverlap(ball, bx, by, bw, bh)) {
                    bounceOffBox(ball, bx, by, bw, bh, 0.55, audio, fx);
                }
            } else if (o.type === 'car') {
                const bx = o.x, by = o.y0 - 32, bw = 60, bh = 32;
                if (boxOverlap(ball, bx, by, bw, bh)) bounceOffBox(ball, bx, by, bw, bh, 0.6, audio, fx);
            } else if (o.type === 'pool') {
                if (ball.x > o.x && ball.x < o.x + o.w && ball.y > o.y0 - 10) {
                    ball.state = 'water';
                    if (audio) audio.splash();
                    if (fx) fx.burst(ball.x, o.y0, 12, {color:['#bee3ec','#fff'], speed:260, life:0.6, grav:600});
                }
            } else if (o.type === 'hedge') {
                const bx = o.x - o.w/2, by = o.y1, bw = o.w, bh = o.y2 - o.y1;
                if (boxOverlap(ball, bx, by, bw, bh)) bounceOffBox(ball, bx, by, bw, bh, 0.4, audio, fx);
            } else if (o.type === 'platform') {
                // floating platform — collide with top edge only when falling
                if (ball.x >= o.x1 && ball.x <= o.x2 && ball.vy >= 0 && ball.y >= o.y - ball.r && ball.y <= o.y + 14) {
                    ball.y = o.y - ball.r;
                    handleLanding(ball, hole, o.y, 'fairway', audio, fx, true);
                }
            } else if (o.type === 'gear') {
                const cx = o.x, cy = o.y, R = o.r * 1.18;
                const dist = Math.hypot(ball.x - cx, ball.y - cy);
                if (dist < R + ball.r) {
                    const nx = (ball.x - cx)/dist, ny = (ball.y - cy)/dist;
                    const speed = Math.hypot(ball.vx, ball.vy);
                    // tangential velocity contribution from gear rotation
                    const tx = -ny, ty = nx;
                    const rot = o.speed * o.r;
                    ball.vx = nx * speed * 0.7 + tx * rot * 0.4;
                    ball.vy = ny * speed * 0.7 + ty * rot * 0.4;
                    ball.x = cx + nx * (R + ball.r + 1);
                    ball.y = cy + ny * (R + ball.r + 1);
                    if (audio) audio.bounce(1);
                    if (fx) fx.burst(ball.x, ball.y, 5, {color:['#c19a3e','#fff'], speed:120, life:0.3});
                }
            } else if (o.type === 'windmill') {
                // 4 blades; each is a thin rectangle from center to bladeLen
                for (let i = 0; i < 4; i++) {
                    const a = o._angle + i*PI/2;
                    const bx = o.x + Math.cos(a)*o.bladeLen*0.5;
                    const by = o.y + Math.sin(a)*o.bladeLen*0.5;
                    if (Math.hypot(ball.x - bx, ball.y - by) < 30) {
                        // blade smacks ball outward
                        const sp = 600 + o.speed * o.bladeLen;
                        ball.vx = Math.cos(a + PI/2) * sp;
                        ball.vy = Math.sin(a + PI/2) * sp - 120;
                        if (audio) audio.bounce(1.2);
                        if (fx) {
                            fx.burst(ball.x, ball.y, 8, {color:'#fff', speed:200, life:0.5});
                            fx.addShake(4);
                        }
                        break;
                    }
                }
            } else if (o.type === 'jellyfish') {
                const yy = o._y || o.y;
                if (Math.hypot(ball.x - o.x, ball.y - yy) < 30) {
                    // gentle deflect with electric jolt
                    ball.vx *= -0.6; ball.vy *= -0.4;
                    if (audio) audio.bounce(0.8);
                    if (fx) fx.burst(ball.x, ball.y, 10, {color:['#bb88ff','#fff'], speed:260, life:0.5});
                }
            } else if (o.type === 'ghost') {
                const gx = o._x || o.x;
                if (Math.hypot(ball.x - gx, ball.y - o.y) < 28) {
                    // unpredictable deflect
                    const ang = Math.random()*PI*2;
                    const sp = Math.hypot(ball.vx, ball.vy) * 0.9;
                    ball.vx = Math.cos(ang)*sp;
                    ball.vy = Math.sin(ang)*sp;
                    if (audio) audio.whoosh();
                    if (fx) fx.burst(ball.x, ball.y, 12, {color:['#5af0a1','#fff'], speed:200, life:0.5});
                }
            } else if (o.type === 'firevent') {
                const t = o._t % 3;
                if (t < 0.6 && Math.abs(ball.x - o.x) < 24 && ball.y > o.y0 - 90 && ball.y < o.y0 + 10) {
                    // launch ball up and to the right
                    ball.vy = -700; ball.vx += 200;
                    if (audio) audio.whoosh();
                    if (fx) fx.burst(ball.x, ball.y, 14, {color:['#ff6b3b','#ffd93b'], speed:240, life:0.5});
                }
            }
        }

        // Boost pads (hole 17)
        if (hole.boostPads) {
            for (const b of hole.boostPads) {
                if (ball.x > b.x1 && ball.x < b.x2 && Math.abs(ball.y + ball.r - b.y) < 8 && ball.vy >= 0) {
                    ball.vx += 350; ball.vy = -500;
                    if (audio) audio.whoosh();
                    if (fx) fx.burst(ball.x, ball.y, 12, {color:'#3afff0', speed:300, life:0.5});
                }
            }
        }
    }

    function boxOverlap(ball, bx, by, bw, bh) {
        return ball.x + ball.r > bx && ball.x - ball.r < bx + bw &&
               ball.y + ball.r > by && ball.y - ball.r < by + bh;
    }
    function bounceOffBox(ball, bx, by, bw, bh, restitution, audio, fx) {
        const cx = bx + bw/2, cy = by + bh/2;
        const dx = ball.x - cx, dy = ball.y - cy;
        const ax = bw/2 + ball.r - Math.abs(dx);
        const ay = bh/2 + ball.r - Math.abs(dy);
        if (ax < ay) {
            // horizontal push
            ball.x = cx + (dx > 0 ? bw/2 + ball.r + 1 : -bw/2 - ball.r - 1);
            ball.vx = -ball.vx * restitution;
        } else {
            ball.y = cy + (dy > 0 ? bh/2 + ball.r + 1 : -bh/2 - ball.r - 1);
            ball.vy = -ball.vy * restitution;
        }
        if (audio) audio.bounce(0.7);
        if (fx) fx.burst(ball.x, ball.y, 4, {color:'#fff', speed:140, life:0.3});
    }

    function handleLanding(ball, hole, gy, surface, audio, fx, fromPlatform=false) {
        const slope = slopeAt(hole, ball.x);
        // surface restitution
        const props = {
            green:    { rest: 0.3,  friction: 4.0 },
            fairway:  { rest: 0.4,  friction: 1.6 },
            rough:    { rest: 0.2,  friction: 5.0 },
            sand:     { rest: 0.18, friction: 4.5 },
            ice:      { rest: 0.3,  friction: 0.45 },
            water:    { rest: 0.0,  friction: 0 },
            lava:     { rest: 0.0,  friction: 0 },
        }[surface] || { rest: 0.4, friction: 1.6 };

        // hazard check first
        const hz = hazardAt(hole, ball.x);
        if (hz === 'water' || hz === 'lava') {
            if (ball.y >= (hole.hazards.find(h=>h.x1<=ball.x&&h.x2>=ball.x).y || gy)) {
                ball.state = 'water';  // generic 'in hazard' state
                ball.vx = 0; ball.vy = 0;
                if (audio) audio.splash();
                if (fx) {
                    const surfY = (hole.hazards.find(h=>h.x1<=ball.x&&h.x2>=ball.x).y || gy);
                    fx.burst(ball.x, surfY, 16, {
                        color: hz==='lava' ? ['#ffaa3a','#ff6b3b','#ffd93b'] : ['#84d4f5','#fff','#3a8de3'],
                        speed:320, life:0.7, grav:600,
                    });
                    fx.addShake(hz==='lava' ? 8 : 5);
                }
                return;
            }
        }

        // if on platform, bounce off
        if (fromPlatform) {
            ball.vy *= -props.rest;
            if (Math.abs(ball.vy) < 80) ball.vy = 0;
            return;
        }

        // contact with terrain
        ball.y = gy - ball.r;

        // velocity in slope frame
        const sn = Math.sin(slope), cs = Math.cos(slope);
        const vt = ball.vx*cs + ball.vy*sn;     // tangential
        const vn = ball.vx*sn - ball.vy*cs;     // normal (positive into ground after sign convention used)

        // impact
        const impactSpeed = Math.abs(vn);
        const newVn = vn * -props.rest;
        const newVt = vt * (1 - 0.0); // keep tangential

        ball.vx = newVt*cs + newVn*sn;
        ball.vy = newVt*sn - newVn*cs;

        // sand drains some energy but keeps carry
        if (surface === 'sand') {
            ball.vx *= 0.65; ball.vy *= 0.65;
            if (audio && impactSpeed > 80) audio.sand();
            if (fx && impactSpeed > 80)
                fx.burst(ball.x, gy, 10, {color:['#f0d488','#fff'], speed:180, life:0.4, grav:600});
        } else if (surface === 'ice') {
            // glide along the surface; conserve most tangential velocity
            ball.vx *= 0.98;
        } else {
            if (audio && impactSpeed > 120) audio.bounce(impactSpeed/600);
            if (fx && impactSpeed > 200) {
                fx.burst(ball.x, gy, 4, {color:'#fff', speed:120, life:0.3});
                if (impactSpeed > 400) fx.addShake(2);
            }
        }

        const speed = Math.hypot(ball.vx, ball.vy);
        if (speed < 30) {
            // start rolling
            ball.state = 'rolling';
            ball.vy = 0;
            // rolling friction
            const frictionForce = props.friction * 60;
            const slopeForce = Math.sin(slope) * GRAVITY;
            ball.vx += slopeForce * 0.016;  // gentle slope influence
            ball.vx *= 1 - frictionForce/Math.max(60, Math.abs(ball.vx))*0.001;
            // settle threshold
            if (Math.abs(ball.vx) < 12 && Math.abs(slope) < 0.04) {
                ball.state = 'settled';
                ball.vx = 0; ball.vy = 0;
            }
        }
    }

    /* === Compute predicted trajectory for arc preview === */
    function previewArc(hole, x0, y0, vx, vy, steps = 40) {
        const dt = 0.04;
        const points = [];
        let px = x0, py = y0, pvx = vx, pvy = vy;
        for (let i = 0; i < steps; i++) {
            const wind = hole.wind || {speed:0,dir:1};
            const drag = hole.underwater ? 0.6 : 0.04;
            const grav = hole.underwater ? GRAVITY*0.5 : GRAVITY;
            pvx += wind.speed*8*(wind.dir>0?1:-1)*dt;
            pvx *= 1 - drag*dt;
            pvy += grav*dt;
            px += pvx*dt; py += pvy*dt;
            points.push([px, py]);
            const gy = hole.groundHeight(px);
            if (py >= gy) break;
        }
        return points;
    }

    return { step, surfaceAt, slopeAt, previewArc };
})();

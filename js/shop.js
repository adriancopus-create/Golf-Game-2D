/* Pro Shop: skins, trails, caddies, upgrades. */
const Shop = (() => {

    const clubs = [
        { id:'classic',  name:'Classic',       desc:'Wooden grain, traditional swing.',     cost:0,   color:'#8a5a2b', accent:'#fff' },
        { id:'rainbow',  name:'Rainbow Wedge', desc:'Spectrum-colored shots leave color.',  cost:30,  color:'rainbow', accent:'#fff' },
        { id:'lava',     name:'Lava Driver',   desc:'Glowing magma core. Fiery thwack.',    cost:50,  color:'#ff4a1f', accent:'#ffd93b' },
        { id:'8bit',     name:'8-bit Putter',  desc:'Pixelated retro vibes.',               cost:25,  color:'#3afff0', accent:'#ff6b8a' },
        { id:'bamboo',   name:'Bamboo Iron',   desc:'Earthy zen swing.',                    cost:20,  color:'#7ac774', accent:'#5d3a1f' },
        { id:'platinum', name:'Platinum Edge', desc:'Premium chrome finish.',               cost:80,  color:'#cad6dc', accent:'#fff' },
    ];

    const trails = [
        { id:'none',     name:'No Trail',  desc:'Clean and classic.',         cost:0,   color:'#fff', kind:'plain' },
        { id:'fire',     name:'Fire',      desc:'Leaves a smoky orange trail.', cost:25, color:['#ff4a1f','#ffd93b'], kind:'fire' },
        { id:'stars',    name:'Stars',     desc:'Twinkling stardust.',         cost:35,  color:['#fff','#ffd93b'], kind:'stars' },
        { id:'bubbles',  name:'Bubbles',   desc:'Underwater champagne.',       cost:20,  color:['#bce6f5','#fff'], kind:'bubbles' },
        { id:'lightning',name:'Lightning', desc:'Electric crackle.',           cost:40,  color:['#3afff0','#fff'], kind:'lightning' },
        { id:'rainbow',  name:'Rainbow',   desc:'Pure joy.',                   cost:50,  color:['#ff4757','#f5c43c','#5fc479','#3afff0','#a061d1'], kind:'rainbow' },
    ];

    const caddies = [
        { id:'none',     name:'Going Solo', desc:'No caddy.',                 cost:0,  bodyColor:'#fff',     hatColor:'#aaa',    bagColor:'#777' },
        { id:'rookie',   name:'Rookie',     desc:'Bright-eyed newcomer.',     cost:15, bodyColor:'#3a91d6',  hatColor:'#f5c43c', bagColor:'#5d3a1f' },
        { id:'pro',      name:'Old Pro',    desc:'Knows every break.',        cost:40, bodyColor:'#5d3a1f',  hatColor:'#7a5238', bagColor:'#3a3a44' },
        { id:'robot',    name:'CADDY-9000', desc:'Optimized for accuracy.',   cost:60, bodyColor:'#cad6dc',  hatColor:'#3afff0', bagColor:'#42284a' },
        { id:'fairy',    name:'Fairway Fairy', desc:'Sparkle reactions.',     cost:50, bodyColor:'#ff77aa',  hatColor:'#a061d1', bagColor:'#fff'    },
    ];

    const upgrades = [
        { id:'power',    name:'Power+',    desc:'Increase max swing power.',   levels: [
            {cost:10,  bonus:0.05}, {cost:25, bonus:0.1}, {cost:60, bonus:0.15}
        ]},
        { id:'accuracy', name:'Accuracy+', desc:'Smaller wobble in power meter.', levels: [
            {cost:10, bonus:0.2}, {cost:25, bonus:0.4}, {cost:60, bonus:0.7}
        ]},
        { id:'spin',     name:'Spin+',     desc:'More backspin control.',      levels: [
            {cost:10, bonus:0.5}, {cost:25, bonus:1}, {cost:60, bonus:2}
        ]},
    ];

    function getClubDef(id)   { return clubs.find(c => c.id === id); }
    function getTrailDef(id)  { return trails.find(t => t.id === id); }
    function getCaddyDef(id)  { return caddies.find(c => c.id === id); }
    function getUpgradeDef(id){ return upgrades.find(u => u.id === id); }

    function trailColor(id) {
        const t = getTrailDef(id);
        if (!t || t.kind === 'plain') return '#ffffff';
        if (Array.isArray(t.color)) return t.color[Math.floor(Math.random()*t.color.length)];
        return t.color;
    }

    /* Buy/equip API */
    function own(category, id) {
        const data = Storage.get();
        if (!data.owned[category]) data.owned[category] = [];
        if (!data.owned[category].includes(id)) data.owned[category].push(id);
        Storage.save();
    }
    function equip(category, id) {
        const data = Storage.get();
        if (!data.owned[category].includes(id)) return false;
        const key = ({clubs:'club', trails:'trail', caddies:'caddy'})[category];
        if (!key) return false;
        data.equipped[key] = id;
        Storage.save();
        return true;
    }
    function buy(category, id, cost) {
        const data = Storage.get();
        if (data.birdies < cost) return false;
        Storage.addBirdies(-cost);
        own(category, id);
        return true;
    }
    function buyUpgrade(id) {
        const def = getUpgradeDef(id);
        if (!def) return false;
        const data = Storage.get();
        const lvl = data.owned.upgrades[id] || 0;
        if (lvl >= def.levels.length) return false;
        const cost = def.levels[lvl].cost;
        if (data.birdies < cost) return false;
        Storage.addBirdies(-cost);
        data.owned.upgrades[id] = lvl + 1;
        Storage.save();
        return true;
    }

    function getUpgradeBonus(id) {
        const def = getUpgradeDef(id);
        if (!def) return 0;
        const lvl = Storage.get().owned.upgrades[id] || 0;
        if (lvl <= 0) return 0;
        return def.levels[lvl-1].bonus;
    }

    /* === UI rendering === */
    let activeTab = 'clubs';

    function open() {
        document.getElementById('shop').classList.remove('hidden');
        document.getElementById('shop-birdies').textContent = Storage.get().birdies;
        renderTab(activeTab);
    }
    function close() {
        document.getElementById('shop').classList.add('hidden');
    }
    function setTab(tab) {
        activeTab = tab;
        document.querySelectorAll('.shop-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        renderTab(tab);
    }

    function renderTab(tab) {
        const grid = document.getElementById('shop-grid');
        grid.innerHTML = '';
        const data = Storage.get();
        if (tab === 'clubs') {
            for (const c of clubs) {
                grid.appendChild(makeItemCard(
                    'clubs', c, data.owned.clubs.includes(c.id), data.equipped.club === c.id,
                    (canvas) => drawClubPreview(canvas, c)));
            }
        } else if (tab === 'trails') {
            for (const t of trails) {
                grid.appendChild(makeItemCard(
                    'trails', t, data.owned.trails.includes(t.id), data.equipped.trail === t.id,
                    (canvas) => drawTrailPreview(canvas, t)));
            }
        } else if (tab === 'caddies') {
            for (const c of caddies) {
                grid.appendChild(makeItemCard(
                    'caddies', c, data.owned.caddies.includes(c.id), data.equipped.caddy === c.id,
                    (canvas) => drawCaddyPreview(canvas, c)));
            }
        } else if (tab === 'upgrades') {
            for (const u of upgrades) grid.appendChild(makeUpgradeCard(u));
        }
    }

    function makeItemCard(category, item, owned, equipped, drawPreview) {
        const div = document.createElement('div');
        div.className = 'shop-item';
        if (owned) div.classList.add('owned');
        if (equipped) div.classList.add('equipped');
        const canvas = document.createElement('canvas');
        canvas.width = 140; canvas.height = 80;
        div.appendChild(canvas);
        drawPreview(canvas);

        const name = document.createElement('div'); name.className = 'item-name'; name.textContent = item.name;
        const desc = document.createElement('div'); desc.className = 'item-desc'; desc.textContent = item.desc;
        div.appendChild(name); div.appendChild(desc);

        const cost = document.createElement('div'); cost.className = 'item-cost';
        cost.textContent = item.cost > 0 ? `${item.cost} 🐦` : 'Free';
        div.appendChild(cost);

        const btn = document.createElement('button');
        if (equipped) btn.textContent = 'Equipped';
        else if (owned) btn.textContent = 'Equip';
        else btn.textContent = `Buy (${item.cost})`;
        if (Storage.get().birdies < item.cost && !owned) btn.disabled = true;
        btn.onclick = () => {
            Audio.uiClick();
            if (equipped) return;
            if (owned) {
                equip(category, item.id);
                Audio.uiPop();
                renderTab(activeTab);
                return;
            }
            if (buy(category, item.id, item.cost)) {
                equip(category, item.id);
                Audio.coin();
                Audio.fanfare([523, 784, 1047]);
                document.getElementById('shop-birdies').textContent = Storage.get().birdies;
                renderTab(activeTab);
                // animate reveal on the new card position
                setTimeout(() => {
                    const cards = document.querySelectorAll('.shop-item');
                    cards.forEach(c => { if (c.querySelector('.item-name').textContent === item.name) c.classList.add('reveal'); });
                }, 30);
            }
        };
        div.appendChild(btn);
        return div;
    }

    function makeUpgradeCard(upgrade) {
        const div = document.createElement('div');
        div.className = 'shop-item';
        const canvas = document.createElement('canvas');
        canvas.width = 140; canvas.height = 80;
        div.appendChild(canvas);
        drawUpgradePreview(canvas, upgrade);

        const lvl = Storage.get().owned.upgrades[upgrade.id] || 0;
        const maxed = lvl >= upgrade.levels.length;
        const nextCost = maxed ? null : upgrade.levels[lvl].cost;

        const name = document.createElement('div'); name.className = 'item-name'; name.textContent = `${upgrade.name}  Lv.${lvl}/${upgrade.levels.length}`;
        const desc = document.createElement('div'); desc.className = 'item-desc'; desc.textContent = upgrade.desc;
        const cost = document.createElement('div'); cost.className = 'item-cost'; cost.textContent = maxed ? 'MAX' : `${nextCost} 🐦`;
        div.appendChild(name); div.appendChild(desc); div.appendChild(cost);

        const btn = document.createElement('button');
        btn.textContent = maxed ? 'Maxed' : `Upgrade (${nextCost})`;
        if (maxed || Storage.get().birdies < nextCost) btn.disabled = true;
        btn.onclick = () => {
            Audio.uiClick();
            if (buyUpgrade(upgrade.id)) {
                Audio.coin();
                Audio.fanfare([523, 659, 784, 988]);
                document.getElementById('shop-birdies').textContent = Storage.get().birdies;
                renderTab(activeTab);
                setTimeout(() => {
                    const cards = document.querySelectorAll('.shop-item');
                    cards.forEach(c => { if (c.querySelector('.item-name').textContent.startsWith(upgrade.name)) c.classList.add('reveal'); });
                }, 30);
            }
        };
        div.appendChild(btn);
        return div;
    }

    /* === Item previews drawn on small canvases === */
    function drawClubPreview(canvas, club) {
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#dbeaf7';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const cx = 80, cy = 40;
        // shaft
        ctx.strokeStyle = '#1c1428'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(cx, cy-30); ctx.lineTo(cx-30, cy+25); ctx.stroke();
        // head
        ctx.save();
        ctx.translate(cx-30, cy+25); ctx.rotate(-0.3);
        if (club.color === 'rainbow') {
            const stripes = ['#ff4757','#f5c43c','#5fc479','#3afff0','#a061d1'];
            stripes.forEach((c,i)=>{ctx.fillStyle=c; ctx.fillRect(-30+i*6, -10, 6, 20);});
        } else {
            ctx.fillStyle = club.color;
            ctx.fillRect(-30, -10, 36, 20);
            if (club.id === 'lava') {
                ctx.fillStyle = club.accent;
                ctx.fillRect(-26, -4, 28, 4);
            }
        }
        ctx.strokeStyle = '#1c1428'; ctx.lineWidth = 2;
        ctx.strokeRect(-30, -10, 36, 20);
        ctx.restore();
        // grip
        ctx.fillStyle = '#1c1428';
        ctx.fillRect(cx-3, cy-32, 6, 14);
    }

    function drawTrailPreview(canvas, trail) {
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#dbeaf7';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        // ball + trail to right
        const ball = {x:110, y:40};
        const cs = Array.isArray(trail.color) ? trail.color : [trail.color];
        for (let i = 0; i < 14; i++) {
            const t = i/14;
            const tx = ball.x - i*7;
            const ty = ball.y + Math.sin(i*0.6)*4;
            ctx.fillStyle = cs[i % cs.length];
            ctx.globalAlpha = 1 - t;
            ctx.beginPath(); ctx.arc(tx, ty, 4 - t*3, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(ball.x, ball.y, 7, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#1c1428'; ctx.lineWidth = 1.5; ctx.stroke();
    }

    function drawCaddyPreview(canvas, caddy) {
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#dbeaf7';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const cx = 70, cy = 70;
        // body
        ctx.fillStyle = caddy.bodyColor;
        ctx.fillRect(cx-10, cy-30, 20, 26);
        ctx.strokeStyle = '#1c1428'; ctx.lineWidth = 2;
        ctx.strokeRect(cx-10, cy-30, 20, 26);
        // head
        ctx.fillStyle = '#f3d3a8';
        ctx.beginPath(); ctx.arc(cx, cy-40, 9, 0, TAU); ctx.fill();
        ctx.stroke();
        // hat
        ctx.fillStyle = caddy.hatColor;
        ctx.fillRect(cx-12, cy-50, 24, 8);
        ctx.strokeRect(cx-12, cy-50, 24, 8);
        ctx.fillRect(cx-14, cy-44, 28, 3);
        // eyes
        ctx.fillStyle = '#1c1428';
        ctx.fillRect(cx-3, cy-42, 1.5, 2);
        ctx.fillRect(cx+2, cy-42, 1.5, 2);
        // bag
        ctx.fillStyle = caddy.bagColor;
        ctx.fillRect(cx+10, cy-30, 10, 26);
        ctx.strokeRect(cx+10, cy-30, 10, 26);
    }

    function drawUpgradePreview(canvas, upgrade) {
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#dbeaf7';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const cx = 70, cy = 40;
        const lvl = Storage.get().owned.upgrades[upgrade.id] || 0;
        // icon
        if (upgrade.id === 'power') {
            for (let i = 0; i < lvl; i++) {
                ctx.fillStyle = '#ff4a1f';
                ctx.fillRect(cx-30 + i*22, cy, 18, 30 + i*4);
            }
            for (let i = lvl; i < upgrade.levels.length; i++) {
                ctx.fillStyle = '#ccc';
                ctx.fillRect(cx-30 + i*22, cy, 18, 30 + i*4);
            }
        } else if (upgrade.id === 'accuracy') {
            ctx.strokeStyle = '#1c1428'; ctx.lineWidth = 2;
            for (let i = 1; i <= 3; i++) {
                ctx.beginPath(); ctx.arc(cx, cy, i*10, 0, TAU); ctx.stroke();
            }
            ctx.fillStyle = '#5fc479';
            ctx.beginPath(); ctx.arc(cx, cy, 5, 0, TAU); ctx.fill();
        } else if (upgrade.id === 'spin') {
            ctx.strokeStyle = '#3afff0'; ctx.lineWidth = 3;
            for (let i = 0; i < 5; i++) {
                ctx.beginPath();
                ctx.arc(cx, cy, 18, i/5*TAU, i/5*TAU + 0.3);
                ctx.stroke();
            }
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(cx, cy, 8, 0, TAU); ctx.fill();
            ctx.strokeStyle = '#1c1428'; ctx.lineWidth = 1.5; ctx.stroke();
        }
    }

    /* Setup tab buttons + back button (called once on init) */
    function init() {
        document.querySelectorAll('.shop-tab').forEach(b => {
            b.addEventListener('click', () => { Audio.uiClick(); setTab(b.dataset.tab); });
        });
    }

    return {
        clubs, trails, caddies, upgrades,
        getClubDef, getTrailDef, getCaddyDef, getUpgradeDef, getUpgradeBonus,
        own, equip, buy, buyUpgrade,
        open, close, setTab, init, trailColor,
    };
})();

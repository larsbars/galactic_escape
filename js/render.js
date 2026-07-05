// Draws the game state to a canvas. All game coordinates are world units;
// this module owns the world→pixel transform, so the game renders identically
// at any resolution or devicePixelRatio. Sprites are pre-rendered offscreen
// (see sprites.js) and blitted here.

import { WORLD_W, State, SHIELD_MAX, POWER_DURATION, POWER_INFO } from './game.js';
import {
  makeShipSprite,
  makeAsteroidTexture,
  makeBulletSprite,
  makeNebula,
  glowDot,
  ASTEROID_PAD,
} from './sprites.js';
import { loadAssets, ready } from './assets.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scale = 1;
    this.assets = loadAssets();       // Kenney sprite images (async)
    this.shipSprite = makeShipSprite();      // procedural fallbacks
    this.bulletSprite = makeBulletSprite();
    this.nebula = makeNebula();
    this.nebulaHue = 0;
    this.asteroidTex = new WeakMap(); // asteroid -> offscreen texture
    this.resize();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.cssW = cssW;
    this.cssH = cssH;
    this.scale = (cssW * dpr) / WORLD_W;
  }

  aspect() {
    return this.cssW / this.cssH;
  }

  cssXToWorld(x) {
    return (x / this.cssW) * WORLD_W;
  }

  draw(game, t, paused = false) {
    const { ctx } = this;

    // Screen shake: jitter the whole world transform while game.shake runs out
    let ox = 0, oy = 0;
    if (game.shake > 0) {
      const mag = game.shake * 2.2;
      ox = (Math.random() * 2 - 1) * mag;
      oy = (Math.random() * 2 - 1) * mag;
    }
    ctx.setTransform(this.scale, 0, 0, this.scale, ox * this.scale, oy * this.scale);

    // Each level tints the nebula differently
    const hue = ((game.level - 1) * 47) % 360;
    if (hue !== this.nebulaHue) {
      this.nebulaHue = hue;
      this.nebula = makeNebula(hue);
    }

    ctx.fillStyle = '#05060f';
    ctx.fillRect(-3, -3, WORLD_W + 6, game.worldH + 6);
    ctx.drawImage(this.nebula, 0, 0, WORLD_W, game.worldH);

    this._drawStars(game, t);
    this._drawParticles(game);

    if (game.state === State.PLAYING || game.state === State.GAME_OVER) {
      this._drawBullets(game);
      this._drawMissiles(game);
      this._drawBoss(game, t);
      this._drawBossBullets(game);
      this._drawAsteroids(game);
      this._drawPickups(game, t);
    }
    if (game.state === State.PLAYING) {
      this._drawShip(game, t);
      this._drawHud(game);
      this._drawMessage(game);
    }
    if (game.state === State.MENU) this._drawMenu(game);
    if (game.state === State.GAME_OVER) this._drawGameOver(game);

    if (paused) {
      ctx.fillStyle = 'rgba(5, 6, 15, 0.65)';
      ctx.fillRect(-3, -3, WORLD_W + 6, game.worldH + 6);
      this._text('PAUSED', WORLD_W / 2, game.worldH / 2, 7, '#e8ecff');
      this._text('press P or tap the button to resume', WORLD_W / 2, game.worldH / 2 + 7, 3, '#8a92b8');
    }
  }

  _drawStars(game, t) {
    const { ctx } = this;
    const sizes = [0.22, 0.35, 0.5];
    const colors = ['#4a5378', '#7d87ad', '#dfe6ff'];
    const white = glowDot('#c9d8ff');
    for (const s of game.stars) {
      const phase = s.x * 7.3 + s.layer * 11;
      const twinkle = 0.65 + 0.35 * Math.sin(t * (1.5 + s.layer) + phase);
      const y = s.y * game.worldH;
      ctx.globalAlpha = twinkle;
      if (s.layer === 2) {
        // Near stars get a soft glow
        ctx.drawImage(white, s.x - 0.8, y - 0.8, 1.6, 1.6);
      } else {
        ctx.fillStyle = colors[s.layer];
        const size = sizes[s.layer];
        ctx.fillRect(s.x, y, size, size * 1.8);
      }
    }
    ctx.globalAlpha = 1;
  }

  _drawShip(game, t) {
    const { ctx } = this;
    const ship = game.ship;
    const y = game.shipY();

    // Blink while invulnerable
    if (ship.invuln > 0 && Math.floor(ship.invuln * 10) % 2 === 0) return;

    const w = ship.w, h = ship.h;

    // Kenney's ship has one central engine; the procedural one has two.
    const useImage = ready(this.assets.ship);
    const flameOffsets = useImage ? [0] : [-0.16, 0.16];

    // Engine flames (additive), flickering
    ctx.globalCompositeOperation = 'lighter';
    for (const off of flameOffsets) {
      const fx = ship.x + off * w;
      const fy = y + h * 0.42;
      const len = 2.2 + Math.sin(t * 40 + off) * 0.5 + Math.random() * 0.5;
      const flame = ctx.createLinearGradient(0, fy, 0, fy + len);
      flame.addColorStop(0, 'rgba(255, 244, 200, 0.95)');
      flame.addColorStop(0.4, 'rgba(255, 160, 60, 0.7)');
      flame.addColorStop(1, 'rgba(255, 70, 20, 0)');
      ctx.fillStyle = flame;
      ctx.beginPath();
      ctx.moveTo(fx - w * 0.11, fy);
      ctx.lineTo(fx, fy + len);
      ctx.lineTo(fx + w * 0.11, fy);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    if (useImage) {
      // Kenney ship is wider than tall (wings)
      const img = this.assets.ship;
      const sw = w * 1.5;
      const sh = sw * (img.naturalHeight / img.naturalWidth);
      ctx.drawImage(img, ship.x - sw / 2, y - sh / 2, sw, sh);
    } else {
      // Procedural sprite is 128x144, slightly taller than wide
      const sw = w * 1.15;
      const sh = sw * (144 / 128);
      ctx.drawImage(this.shipSprite, ship.x - sw / 2, y - sh * 0.52, sw, sh);
    }

    this._drawArmor(game, y);
    this._drawShield(game, y, t);
  }

  // Gold aura + thick plating chevron; dimmed and cracked once it has taken a hit.
  _drawArmor(game, y) {
    if (game.armorHp <= 0) return;
    const { ctx } = this;
    const ship = game.ship;
    const w = ship.w, h = ship.h;
    const intact = game.armorHp >= 2;

    // Gold aura around the whole ship — clearly distinct from the blue shield
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = intact ? 0.4 : 0.2;
    const aura = w * 2.3;
    ctx.drawImage(glowDot('#ffd75e'), ship.x - aura / 2, y - aura / 2, aura, aura);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // Plating band on the nose
    ctx.strokeStyle = intact ? '#ffd75e' : 'rgba(255, 215, 94, 0.7)';
    ctx.lineWidth = 1.2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (!intact) ctx.setLineDash([1.4, 0.9]);
    ctx.beginPath();
    ctx.moveTo(ship.x - w * 0.45, y + h * 0.05);
    ctx.lineTo(ship.x, y - h * 0.45);
    ctx.lineTo(ship.x + w * 0.45, y + h * 0.05);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Frontal energy shield; grows brighter and wider with charge.
  _drawShield(game, y, t) {
    if (game.shield <= 0) return;
    const { ctx } = this;
    const ship = game.ship;
    const w = ship.w;
    const frac = game.shield / SHIELD_MAX;
    const pulse = 0.9 + 0.1 * Math.sin(t * 6);
    const tier = frac > 0.66 ? 2 : frac > 0.33 ? 1 : 0;
    const img = this.assets.shields[tier];

    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (0.3 + 0.55 * frac) * pulse;
    if (ready(img)) {
      const sw = w * 2.1;
      const sh = sw * (img.naturalHeight / img.naturalWidth);
      ctx.drawImage(img, ship.x - sw / 2, y - sh * 0.6, sw, sh);
    } else {
      ctx.strokeStyle = '#6fd3ff';
      ctx.lineWidth = 0.5 + frac * 0.5;
      ctx.beginPath();
      ctx.arc(ship.x, y, w * 1.05, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  _drawBullets(game) {
    const { ctx } = this;
    const img = ready(this.assets.laser) ? this.assets.laser : this.bulletSprite;
    const ratio = ready(this.assets.laser)
      ? this.assets.laser.naturalHeight / this.assets.laser.naturalWidth
      : 2.5;
    ctx.globalCompositeOperation = 'lighter';
    for (const b of game.bullets) {
      // Power beams are visibly beefier
      const bw = (b.dmg ?? 1) >= 2 ? 1.25 : 0.8;
      const bh = bw * ratio;
      if (b.vx) {
        // Fan/seeker bullets travel at an angle; sprite art points up
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(Math.atan2(b.vy, b.vx) + Math.PI / 2);
        ctx.drawImage(img, -bw / 2, -bh / 2, bw, bh);
        ctx.restore();
      } else {
        ctx.drawImage(img, b.x - bw / 2, b.y - bh / 2, bw, bh);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  _drawBoss(game, t) {
    const boss = game.boss;
    if (!boss) return;
    const { ctx } = this;

    // Menace glow — flares up while a charger telegraphs its dive
    const telegraphing = boss.mode === 'telegraph';
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = telegraphing
      ? 0.55 + 0.3 * Math.sin(t * 25)
      : 0.3 + 0.1 * Math.sin(t * 4);
    const g = boss.r * (telegraphing ? 4 : 3.2);
    ctx.drawImage(glowDot('#ff6b6b'), boss.x - g / 2, boss.y - g / 2, g, g);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    const img = this.assets.bosses[boss.type] ?? this.assets.bosses.strafer;
    const s = boss.r * 2.3;
    if (ready(img)) {
      ctx.drawImage(img, boss.x - s / 2, boss.y - s / 2, s, s);
    } else {
      // Procedural saucer fallback
      ctx.fillStyle = '#a13d3d';
      ctx.beginPath();
      ctx.ellipse(boss.x, boss.y, boss.r, boss.r * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d98282';
      ctx.beginPath();
      ctx.arc(boss.x, boss.y - boss.r * 0.25, boss.r * 0.45, Math.PI, 0);
      ctx.fill();
    }

    // White flash on every hit so damage feedback is at the boss, not the bar
    if (boss.hurt > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (boss.hurt / 0.12) * 0.8;
      const f = boss.r * 2.6;
      ctx.drawImage(glowDot('#ffffff'), boss.x - f / 2, boss.y - f / 2, f, f);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    // Boss HP bar, top center
    const bw = 34, bh = 1.2;
    const bx = (WORLD_W - bw) / 2, by = 4.2;
    ctx.fillStyle = 'rgba(255, 107, 107, 0.2)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = '#ff6b6b';
    ctx.fillRect(bx, by, bw * Math.max(0, boss.hp / boss.maxHp), bh);
    ctx.strokeStyle = 'rgba(255, 107, 107, 0.6)';
    ctx.lineWidth = 0.2;
    ctx.strokeRect(bx, by, bw, bh);
  }

  _drawBossBullets(game) {
    const { ctx } = this;
    const img = ready(this.assets.bossLaser) ? this.assets.bossLaser : null;
    ctx.globalCompositeOperation = 'lighter';
    for (const bb of game.bossBullets) {
      if (img) {
        const bw = 0.9;
        const bh = bw * (img.naturalHeight / img.naturalWidth);
        ctx.save();
        ctx.translate(bb.x, bb.y);
        ctx.rotate(Math.atan2(bb.vy, bb.vx) + Math.PI / 2);
        ctx.drawImage(img, -bw / 2, -bh / 2, bw, bh);
        ctx.restore();
      } else {
        ctx.drawImage(glowDot('#ff6b6b'), bb.x - 1.2, bb.y - 1.2, 2.4, 2.4);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // Pickups bob gently and glow in their effect color so they read as "good".
  _drawPickups(game, t) {
    const { ctx } = this;
    for (const p of game.pickups) {
      const bob = Math.sin(t * 3 + p.seed * 20) * 0.6;
      const x = p.x + bob;
      const color = POWER_INFO[p.type].color;

      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.45 + 0.15 * Math.sin(t * 5 + p.seed * 20);
      ctx.drawImage(glowDot(color), x - 3.6, p.y - 3.6, 7.2, 7.2);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      const img = this.assets.pickups[p.type];
      if (ready(img)) {
        ctx.drawImage(img, x - 2.2, p.y - 2.2, 4.4, 4.4);
      } else {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, p.y, 2, 0, Math.PI * 2);
        ctx.fill();
        this._text(p.type[0].toUpperCase(), x, p.y + 0.2, 2.6, '#05060f');
      }
    }
  }

  _drawMissiles(game) {
    const { ctx } = this;
    for (const m of game.missiles) {
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(Math.atan2(m.vy, m.vx) + Math.PI / 2);
      // Body
      ctx.fillStyle = '#c7ccd4';
      ctx.beginPath();
      ctx.moveTo(0, -1.4);
      ctx.lineTo(0.5, -0.4);
      ctx.lineTo(0.5, 1.0);
      ctx.lineTo(-0.5, 1.0);
      ctx.lineTo(-0.5, -0.4);
      ctx.closePath();
      ctx.fill();
      // Fins
      ctx.fillStyle = '#8a919c';
      ctx.fillRect(-0.9, 0.5, 1.8, 0.5);
      // Exhaust
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = '#ffb347';
      ctx.beginPath();
      ctx.moveTo(-0.35, 1.0);
      ctx.lineTo(0, 2.2 + Math.random() * 0.7);
      ctx.lineTo(0.35, 1.0);
      ctx.closePath();
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
    }
  }

  _asteroidTexture(a) {
    let tex = this.asteroidTex.get(a);
    if (!tex) {
      tex = makeAsteroidTexture(a.r, a.seed ?? a.r);
      this.asteroidTex.set(a, tex);
    }
    return tex;
  }

  _drawAsteroids(game) {
    const { ctx } = this;
    const meteors = this.assets.meteors;
    for (const a of game.asteroids) {
      // Seed picks a stable meteor variant per asteroid
      const img = meteors[Math.floor((a.seed ?? 0) * meteors.length) % meteors.length];
      let tex, size;
      if (ready(img)) {
        tex = img;
        size = 2 * a.r * 1.1;
      } else {
        tex = this._asteroidTexture(a);
        size = 2 * a.r * ASTEROID_PAD;
      }
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(a.angle);
      ctx.drawImage(tex, -size / 2, -size / 2, size, size);
      ctx.restore();
    }
  }

  _drawParticles(game) {
    const { ctx } = this;
    ctx.globalCompositeOperation = 'lighter';
    for (const p of game.particles) {
      const fade = p.life / p.maxLife;
      ctx.globalAlpha = fade;
      const s = 0.5 + fade * 0.9;
      ctx.drawImage(glowDot(p.color), p.x - s, p.y - s, s * 2, s * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  _text(str, x, y, size, color = '#e8ecff', align = 'center') {
    const { ctx } = this;
    ctx.fillStyle = color;
    ctx.font = `bold ${size}px "Courier New", monospace`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(str, x, y);
  }

  _drawHud(game) {
    const { ctx } = this;
    this._text(`SCORE ${game.score}`, 3, 5, 4, '#e8ecff', 'left');
    this._text(`LEVEL ${game.level}`, WORLD_W / 2, 2.6, 2.6, '#8a92b8');

    // Lives as mini ships, matching the game art
    const shipImg = this.assets.ship;
    if (ready(shipImg)) {
      const lw = 3.4;
      const lhh = lw * (shipImg.naturalHeight / shipImg.naturalWidth);
      for (let i = 0; i < game.lives; i++) {
        ctx.drawImage(shipImg, WORLD_W - 3 - (i + 1) * (lw + 0.8), 2.8, lw, lhh);
      }
    } else {
      let hearts = '';
      for (let i = 0; i < game.lives; i++) hearts += '▲ ';
      this._text(hearts.trim(), WORLD_W - 3, 5, 4, '#ff6b6b', 'right');
    }

    // Shield charge bar
    const bx = 3, by = 8.2, barW = 22, barH = 1.6;
    ctx.fillStyle = 'rgba(111, 211, 255, 0.18)';
    ctx.fillRect(bx, by, barW, barH);
    ctx.fillStyle = '#6fd3ff';
    ctx.fillRect(bx, by, barW * (game.shield / SHIELD_MAX), barH);
    ctx.strokeStyle = 'rgba(111, 211, 255, 0.5)';
    ctx.lineWidth = 0.25;
    ctx.strokeRect(bx, by, barW, barH);

    // Armor pips next to the bar
    for (let i = 0; i < game.armorHp; i++) {
      ctx.fillStyle = '#ffd75e';
      ctx.fillRect(bx + barW + 1.5 + i * 2.6, by, 1.8, barH);
    }

    // Active power-up timers: one draining chip per effect
    let px = bx;
    const py = by + barH + 0.8;
    for (const key of ['beam', 'fan', 'seeker']) {
      const remaining = game.power[key];
      if (remaining <= 0) continue;
      const color = POWER_INFO[key].color;
      const chipW = 7;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      ctx.fillRect(px, py, chipW, barH);
      ctx.fillStyle = color;
      ctx.fillRect(px, py, chipW * (remaining / POWER_DURATION), barH);
      this._text(key[0].toUpperCase(), px + chipW / 2, py + barH / 2 + 0.1, 2, '#05060f');
      px += chipW + 1.2;
    }
  }

  // Transient announcements: ARMOR FORGED, SHIELD DOWN, ...
  _drawMessage(game) {
    if (game.messageTimer <= 0 || !game.message) return;
    const { ctx } = this;
    ctx.globalAlpha = Math.min(1, game.messageTimer / 0.5);
    this._text(game.message, WORLD_W / 2, game.worldH * 0.62, 5, game.messageColor);
    ctx.globalAlpha = 1;
  }

  _drawMenu(game) {
    const cx = WORLD_W / 2;
    const cy = game.worldH / 2;
    // Scale line spacing to the viewport so the menu fits landscape screens too
    const lh = Math.min(5.5, game.worldH * 0.055);
    this._text('GALACTIC ESCAPE', cx, cy - 3 * lh, 8, '#9ad8ff');
    this._text('drag or use arrow keys to move', cx, cy - lh, 3.4, '#8a92b8');
    this._text('tap or hold space to shoot', cx, cy, 3.4, '#8a92b8');
    this._text('destroy rocks to charge your shield', cx, cy + lh, 3.4, '#6fd3ff');
    this._text('overcharge it to forge armor', cx, cy + 2 * lh, 3.4, '#ffd75e');
    this._text('big rocks drop power-ups — fly into them', cx, cy + 3 * lh, 3.4, '#ff9d5c');
    this._text('TAP OR PRESS SPACE TO START', cx, cy + 4.6 * lh, 4, '#7dff9b');
    if (game.highScore > 0) {
      this._text(`HIGH SCORE ${game.highScore}`, cx, cy + 6 * lh, 3.4, '#ffb347');
    }
  }

  _drawGameOver(game) {
    const cy = game.worldH / 2;
    this._text('GAME OVER', WORLD_W / 2, cy - 10, 9, '#ff6b6b');
    this._text(`SCORE ${game.score}`, WORLD_W / 2, cy + 2, 5);
    this._text(`REACHED LEVEL ${game.level}`, WORLD_W / 2, cy + 6.5, 3, '#8a92b8');
    if (game.score >= game.highScore && game.score > 0) {
      this._text('NEW HIGH SCORE!', WORLD_W / 2, cy + 10, 4, '#ffb347');
    } else {
      this._text(`HIGH SCORE ${game.highScore}`, WORLD_W / 2, cy + 10, 3.4, '#8a92b8');
    }
    this._text('TAP OR PRESS SPACE TO RETRY', WORLD_W / 2, cy + 20, 4, '#7dff9b');
  }
}

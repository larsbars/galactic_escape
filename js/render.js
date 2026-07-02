// Draws the game state to a canvas. All game coordinates are world units;
// this module owns the world→pixel transform, so the game renders identically
// at any resolution or devicePixelRatio. Sprites are pre-rendered offscreen
// (see sprites.js) and blitted here.

import { WORLD_W, State, SHIELD_MAX } from './game.js';
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

  draw(game, t) {
    const { ctx } = this;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);

    ctx.fillStyle = '#05060f';
    ctx.fillRect(0, 0, WORLD_W, game.worldH);
    ctx.drawImage(this.nebula, 0, 0, WORLD_W, game.worldH);

    this._drawStars(game, t);
    this._drawParticles(game);

    if (game.state === State.PLAYING || game.state === State.GAME_OVER) {
      this._drawBullets(game);
      this._drawAsteroids(game);
    }
    if (game.state === State.PLAYING) {
      this._drawShip(game, t);
      this._drawHud(game);
      this._drawMessage(game);
    }
    if (game.state === State.MENU) this._drawMenu(game);
    if (game.state === State.GAME_OVER) this._drawGameOver(game);
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
    let hearts = '';
    for (let i = 0; i < game.lives; i++) hearts += '▲ ';
    this._text(hearts.trim(), WORLD_W - 3, 5, 4, '#ff6b6b', 'right');

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

    // Cannon upgrade bar below the shield bar
    const cy = by + barH + 0.8;
    ctx.fillStyle = 'rgba(255, 157, 92, 0.18)';
    ctx.fillRect(bx, cy, barW, barH);
    ctx.fillStyle = '#ff9d5c';
    ctx.fillRect(bx, cy, barW * game.cannonProgress(), barH);
    ctx.strokeStyle = 'rgba(255, 157, 92, 0.5)';
    ctx.lineWidth = 0.25;
    ctx.strokeRect(bx, cy, barW, barH);

    // Cannon level pips
    for (let i = 0; i < game.cannonLevel; i++) {
      ctx.fillStyle = '#ff9d5c';
      ctx.fillRect(bx + barW + 1.5 + i * 2.6, cy, 1.8, barH);
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
    this._text('big rocks power up your cannon', cx, cy + 3 * lh, 3.4, '#ff9d5c');
    this._text('TAP OR PRESS SPACE TO START', cx, cy + 4.6 * lh, 4, '#7dff9b');
    if (game.highScore > 0) {
      this._text(`HIGH SCORE ${game.highScore}`, cx, cy + 6 * lh, 3.4, '#ffb347');
    }
  }

  _drawGameOver(game) {
    const cy = game.worldH / 2;
    this._text('GAME OVER', WORLD_W / 2, cy - 10, 9, '#ff6b6b');
    this._text(`SCORE ${game.score}`, WORLD_W / 2, cy + 2, 5);
    if (game.score >= game.highScore && game.score > 0) {
      this._text('NEW HIGH SCORE!', WORLD_W / 2, cy + 10, 4, '#ffb347');
    } else {
      this._text(`HIGH SCORE ${game.highScore}`, WORLD_W / 2, cy + 10, 3.4, '#8a92b8');
    }
    this._text('TAP OR PRESS SPACE TO RETRY', WORLD_W / 2, cy + 20, 4, '#7dff9b');
  }
}

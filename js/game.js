// Core game state and rules. Operates in abstract "world units" — the world
// is WORLD_W wide and worldH tall (set from the viewport aspect ratio), and
// knows nothing about canvas, pixels, or input devices.

export const WORLD_W = 100;

const SHIP_SPEED = 90;          // world units / sec (keyboard)
const POINTER_LERP = 14;        // how snappily the ship tracks a touch/drag
const BULLET_SPEED = 140;
const FIRE_COOLDOWN = 0.18;     // min seconds between shots
const INVULN_TIME = 2.0;        // after being hit
const START_LIVES = 3;
export const SHIELD_MAX = 100;  // charge needed to overflow into armor
const SHIELD_PER_RADIUS = 4;    // charge gained per world-unit of asteroid radius
const ARMOR_HITS = 2;           // protection per armor plate

export const State = {
  MENU: 'menu',
  PLAYING: 'playing',
  GAME_OVER: 'gameover',
};

export class Game {
  constructor() {
    this.worldH = 150; // updated by setAspect before first update
    this.state = State.MENU;
    this.highScore = Number(localStorage.getItem('galactic-escape-high') || 0);
    this.stars = [];
    this._initStars();
    this.reset();
  }

  setAspect(widthOverHeight) {
    this.worldH = WORLD_W / widthOverHeight;
  }

  reset() {
    this.score = 0;
    this.lives = START_LIVES;
    this.shield = 0;   // 0..SHIELD_MAX, charged by destroying asteroids
    this.armorHp = 0;  // hits the current armor plate can still absorb
    this.elapsed = 0;
    this.ship = { x: WORLD_W / 2, w: 7, h: 8, invuln: 0 };
    this.bullets = [];   // {x, y}
    this.asteroids = []; // {x, y, r, vy, vx, hp, spin, angle}
    this.particles = []; // {x, y, vx, vy, life, maxLife, color}
    this.fireTimer = 0;
    this.spawnTimer = 0;
  }

  _initStars() {
    // Three parallax layers of scrolling stars, positions in world units.
    for (let i = 0; i < 90; i++) {
      this.stars.push({
        x: Math.random() * WORLD_W,
        y: Math.random(), // stored as 0..1 fraction of worldH
        layer: i % 3,     // 0 = far/slow, 2 = near/fast
      });
    }
  }

  start() {
    this.reset();
    this.state = State.PLAYING;
  }

  // input: { moveAxis, pointerWorldX (world units or null), primary (bool) }
  // events emitted this frame are returned for main.js to play sounds on.
  update(dt, input) {
    const events = [];
    this._updateStars(dt);

    if (this.state !== State.PLAYING) {
      if (input.primary) {
        this.start();
        events.push('start');
      }
      return events;
    }

    this.elapsed += dt;
    this._updateShip(dt, input);
    this._updateFiring(dt, input, events);
    this._updateBullets(dt);
    this._updateAsteroids(dt, events);
    this._updateParticles(dt);
    this._spawnAsteroids(dt);
    return events;
  }

  // Difficulty ramps with elapsed time.
  _difficulty() {
    return Math.min(1 + this.elapsed / 30, 4);
  }

  _updateStars(dt) {
    const speeds = [0.04, 0.09, 0.18]; // fraction of worldH per second
    for (const s of this.stars) {
      s.y += speeds[s.layer] * dt;
      if (s.y > 1) { s.y -= 1; s.x = Math.random() * WORLD_W; }
    }
  }

  _updateShip(dt, input) {
    const ship = this.ship;
    if (input.pointerWorldX !== null) {
      // Smoothly track the finger — feels better than teleporting.
      ship.x += (input.pointerWorldX - ship.x) * Math.min(POINTER_LERP * dt, 1);
    } else {
      ship.x += input.moveAxis * SHIP_SPEED * dt;
    }
    const half = ship.w / 2;
    ship.x = Math.max(half, Math.min(WORLD_W - half, ship.x));
    ship.invuln = Math.max(0, ship.invuln - dt);
  }

  _updateFiring(dt, input, events) {
    this.fireTimer -= dt;
    if (input.fire && this.fireTimer <= 0) {
      this.fireTimer = FIRE_COOLDOWN;
      this.bullets.push({ x: this.ship.x, y: this.shipY() - this.ship.h / 2 });
      events.push('laser');
    }
  }

  shipY() {
    return this.worldH - 12;
  }

  _updateBullets(dt) {
    for (const b of this.bullets) b.y -= BULLET_SPEED * dt;
    this.bullets = this.bullets.filter((b) => b.y > -5);
  }

  _spawnAsteroids(dt) {
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    const diff = this._difficulty();
    this.spawnTimer = (1.1 + Math.random() * 0.6) / diff;

    const r = 3 + Math.random() * 5;
    this.asteroids.push({
      x: r + Math.random() * (WORLD_W - 2 * r),
      y: -r,
      r,
      vy: (14 + Math.random() * 12) * (0.7 + diff * 0.3),
      vx: (Math.random() - 0.5) * 8,
      hp: r > 6 ? 3 : r > 4.5 ? 2 : 1,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 2,
      seed: Math.random(), // stable per-asteroid visual identity
    });
  }

  _updateAsteroids(dt, events) {
    const ship = this.ship;
    const shipY = this.shipY();

    for (const a of this.asteroids) {
      a.y += a.vy * dt;
      a.x += a.vx * dt;
      a.angle += a.spin * dt;
      if (a.x < a.r || a.x > WORLD_W - a.r) a.vx *= -1;
    }

    // Bullet vs asteroid
    for (const b of this.bullets) {
      for (const a of this.asteroids) {
        const dx = b.x - a.x, dy = b.y - a.y;
        if (dx * dx + dy * dy < a.r * a.r) {
          b.dead = true;
          a.hp -= 1;
          if (a.hp <= 0) {
            a.dead = true;
            this.score += Math.round(a.r) * 10;
            this._addShield(Math.round(a.r) * SHIELD_PER_RADIUS, events);
            this._explode(a.x, a.y, a.r, '#ffb347');
            events.push('explosion');
          } else {
            this._explode(b.x, b.y, 1, '#9ad8ff');
          }
          break;
        }
      }
    }

    // Asteroid vs ship
    if (ship.invuln <= 0) {
      for (const a of this.asteroids) {
        if (a.dead) continue;
        const dx = a.x - ship.x, dy = a.y - shipY;
        const hitR = a.r + ship.w * 0.4;
        if (dx * dx + dy * dy < hitR * hitR) {
          a.dead = true;
          ship.invuln = INVULN_TIME;
          // Damage order: shield shatters first, then armor, then a life.
          if (this.shield > 0) {
            this.shield = 0;
            this._explode(ship.x, shipY - 4, 3, '#6fd3ff');
            events.push('shieldbreak');
          } else if (this.armorHp > 0) {
            this.armorHp -= 1;
            this._explode(ship.x, shipY, 3, '#ffd75e');
            events.push('armorhit');
          } else {
            this._explode(ship.x, shipY, 4, '#ff6b6b');
            this.lives -= 1;
            events.push('hit');
            if (this.lives <= 0) {
              this.state = State.GAME_OVER;
              if (this.score > this.highScore) {
                this.highScore = this.score;
                localStorage.setItem('galactic-escape-high', String(this.highScore));
              }
              events.push('gameover');
            }
          }
          break;
        }
      }
    }

    this.bullets = this.bullets.filter((b) => !b.dead);
    this.asteroids = this.asteroids.filter((a) => !a.dead && a.y < this.worldH + a.r);
  }

  // Overflowing a full shield forges an armor plate (one at a time);
  // while a plate is intact the shield just stays capped at full.
  _addShield(amount, events) {
    this.shield += amount;
    if (this.shield >= SHIELD_MAX) {
      if (this.armorHp === 0) {
        this.shield -= SHIELD_MAX;
        this.armorHp = ARMOR_HITS;
        events.push('armorup');
      } else {
        this.shield = SHIELD_MAX;
      }
    }
  }

  _explode(x, y, size, color) {
    const count = Math.round(6 + size * 3);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 10 + Math.random() * 25;
      const life = 0.3 + Math.random() * 0.4;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life, maxLife: life,
        color,
      });
    }
  }

  _updateParticles(dt) {
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }
}

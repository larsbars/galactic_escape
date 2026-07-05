// Core game state and rules. Operates in abstract "world units" — the world
// is WORLD_W wide and worldH tall (set from the viewport aspect ratio), and
// knows nothing about canvas, pixels, or input devices.

export const WORLD_W = 100;

const SHIP_SPEED = 115;         // world units / sec (keyboard; near pointer-drag speed)
const POINTER_LERP = 14;        // how snappily the ship tracks a touch/drag
const BULLET_SPEED = 140;
const FIRE_COOLDOWN = 0.18;     // min seconds between shots
const INVULN_TIME = 2.0;        // after being hit
const START_LIVES = 3;
export const SHIELD_MAX = 100;  // charge needed to overflow into armor
const SHIELD_PER_RADIUS = 4;    // charge gained per world-unit of asteroid radius
const ARMOR_HITS = 2;           // protection per armor plate

// Weapon upgrades are timed power-ups collected by flying into pickups.
// Hard rocks have a chance to drop one; others drift in on a timer.
export const POWER_DURATION = 10;   // seconds per weapon power-up
const SEEKER_TURN_RATE = 3.2;       // rad/sec a seeking bullet can curve
const PICKUP_RADIUS = 2.8;
const PICKUP_FALL_SPEED = 11;
const DROP_CHANCE_BIG = 0.35;       // 3-hit rocks
const DROP_CHANCE_MED = 0.18;       // 2-hit rocks
const AMBIENT_PICKUP_INTERVAL = 16; // avg seconds between drifting pickups
const PICKUP_WEIGHTS = [
  ['beam', 0.22], ['fan', 0.18], ['seeker', 0.14], ['shield', 0.24], ['missiles', 0.14], ['life', 0.08],
];
export const POWER_INFO = {
  beam:     { label: 'POWER BEAM',  color: '#ffe066' },
  fan:      { label: 'FAN SHOT',    color: '#7dff9b' },
  seeker:   { label: 'SEEKER LASERS', color: '#ff6b6b' },
  shield:   { label: '+SHIELD',     color: '#6fd3ff' },
  missiles: { label: 'MISSILES AWAY', color: '#ff9d5c' },
  life:     { label: '+1 LIFE',     color: '#ff8095' },
};
const MAX_LIVES = 5;
const SHIELD_PITY_TIME = 25;    // seconds without protection before a shield is guaranteed
const MISSILE_SPEED = 75;
const MISSILE_TURN_RATE = 5;
const MISSILE_DMG = 4;
const MISSILE_SALVO = 4;

// Levels: an asteroid wave, a warning lull, a boss, a victory lull.
const WAVE_DURATION = 35;       // seconds of asteroids before the boss shows
const WARN_DURATION = 1.8;      // quiet beat before the boss descends
const CLEAR_DURATION = 2.2;     // breather after LEVEL CLEAR
const BOSS_BASE_HP = 24;
const BOSS_HP_PER_LEVEL = 14;
const BOSS_RADIUS = 7;
const BOSS_Y = 18;              // hover line once fully entered
const BOSS_SCORE = 500;         // times level
// Archetypes cycle by level: predictable strafer, dive-bombing charger,
// rock-spitting spawner with radial bursts.
const BOSS_TYPES = ['strafer', 'charger', 'spawner'];

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
    this.power = { beam: 0, fan: 0, seeker: 0 }; // seconds remaining per effect
    this.pickups = [];  // {x, y, vy, type, seed}
    this.missiles = []; // {x, y, vx, vy}
    this.pickupTimer = 8; // first ambient pickup arrives early to teach the mechanic
    this.level = 1;
    this.phase = 'wave'; // 'wave' | 'warn' | 'boss' | 'clear'
    this.phaseTimer = WAVE_DURATION;
    this.boss = null;
    this.bossBullets = [];
    this.shake = 0;           // screen-shake seconds remaining
    this.shieldlessTime = 0;  // how long without shield or armor (pity timer)
    this.elapsed = 0;
    this.ship = { x: WORLD_W / 2, w: 8.2, h: 9.4, invuln: 0 };
    this.bullets = [];   // {x, y}
    this.asteroids = []; // {x, y, r, vy, vx, hp, spin, angle}
    this.particles = []; // {x, y, vx, vy, life, maxLife, color}
    this.fireTimer = 0;
    this.spawnTimer = 0;
    this.message = null;      // transient on-screen announcement
    this.messageColor = '#fff';
    this.messageTimer = 0;
  }

  _setMessage(text, color) {
    this.message = text;
    this.messageColor = color;
    this.messageTimer = 1.6;
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
    this._setMessage('LEVEL 1', '#9ad8ff');
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
    this.messageTimer = Math.max(0, this.messageTimer - dt);
    this.shake = Math.max(0, this.shake - dt);
    if (this.shield <= 0 && this.armorHp <= 0) this.shieldlessTime += dt;
    else this.shieldlessTime = 0;
    for (const k in this.power) this.power[k] = Math.max(0, this.power[k] - dt);
    this._updatePhase(dt, events);
    this._updateShip(dt, input);
    this._updateFiring(dt, input, events);
    this._updateBullets(dt);
    this._updateMissiles(dt, events);
    this._updateBoss(dt, events);
    this._updateBossBullets(dt, events);
    this._updateAsteroids(dt, events);
    this._updatePickups(dt, events);
    this._updateParticles(dt);
    this._spawnAsteroids(dt);
    return events;
  }

  // Difficulty ramps within each wave and with the level; the cap creeps up
  // slowly so late levels keep differentiating without becoming pure RNG.
  _difficulty() {
    const waveElapsed = this.phase === 'wave' ? WAVE_DURATION - this.phaseTimer : WAVE_DURATION;
    return Math.min(0.7 + this.level * 0.4 + waveElapsed / 45, 5 + this.level * 0.08);
  }

  _updatePhase(dt, events) {
    this.phaseTimer -= dt;
    if (this.phaseTimer > 0) return;
    if (this.phase === 'wave') {
      // Quiet beat: spawns stop so the warning can land
      this.phase = 'warn';
      this.phaseTimer = WARN_DURATION;
      this._setMessage('BOSS INCOMING', '#ff6b6b');
      events.push('bosswarn');
    } else if (this.phase === 'warn') {
      this.phase = 'boss';
      this.phaseTimer = Infinity; // boss phase ends when the boss dies
      this._spawnBoss();
    } else if (this.phase === 'clear') {
      this.phase = 'wave';
      this.phaseTimer = WAVE_DURATION;
    }
  }

  _spawnBoss() {
    const hp = BOSS_BASE_HP + (this.level - 1) * BOSS_HP_PER_LEVEL;
    this.boss = {
      type: BOSS_TYPES[(this.level - 1) % BOSS_TYPES.length],
      x: WORLD_W / 2, y: -BOSS_RADIUS, r: BOSS_RADIUS,
      hp, maxHp: hp,
      t: 0, fireTimer: 2, entered: false, hurt: 0,
      // charger state
      mode: 'hover', modeT: 0, targetX: WORLD_W / 2,
      // spawner state
      spitTimer: 2.5, burstTimer: 4,
    };
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
      const x = this.ship.x;
      const y = this.shipY() - this.ship.h / 2;
      const dmg = this.power.beam > 0 ? 2 : 1;
      const angles = this.power.fan > 0 ? [-0.26, 0, 0.26] : [0];
      for (const ang of angles) {
        this.bullets.push({
          x, y, dmg,
          vx: Math.sin(ang) * BULLET_SPEED,
          vy: -Math.cos(ang) * BULLET_SPEED,
        });
      }
      events.push('laser');
    }
  }

  shipY() {
    return this.worldH - 12;
  }

  // Nearest homing target. Seeker bullets only track asteroids — hitting the
  // boss stays the player's job — while missiles will chase him too.
  _nearestTarget(x, y, includeBoss = true) {
    let best = null, bestD = Infinity;
    for (const a of this.asteroids) {
      const dx = a.x - x, dy = a.y - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = a; }
    }
    if (includeBoss && this.boss && this.boss.entered) {
      const dx = this.boss.x - x, dy = this.boss.y - y;
      if (dx * dx + dy * dy < bestD) best = this.boss;
    }
    return best;
  }

  _updateBullets(dt) {
    const homing = this.power.seeker > 0;
    for (const b of this.bullets) {
      const best = homing ? this._nearestTarget(b.x, b.y, false) : null;
      if (best) {
        // Curve toward the target, turn rate limited
        const cur = Math.atan2(b.vy, b.vx);
        const want = Math.atan2(best.y - b.y, best.x - b.x);
        let diff = want - cur;
        if (diff > Math.PI) diff -= 2 * Math.PI;
        if (diff < -Math.PI) diff += 2 * Math.PI;
        const turn = Math.max(-SEEKER_TURN_RATE * dt, Math.min(SEEKER_TURN_RATE * dt, diff));
        b.vx = Math.cos(cur + turn) * BULLET_SPEED;
        b.vy = Math.sin(cur + turn) * BULLET_SPEED;
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }
    this.bullets = this.bullets.filter(
      (b) => b.y > -5 && b.y < this.worldH + 5 && b.x > -5 && b.x < WORLD_W + 5
    );
  }

  _spawnAsteroids(dt) {
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    // No spawns during the pre-boss warning or post-boss breather
    if (this.phase === 'warn' || this.phase === 'clear') return;
    const diff = this._difficulty();
    // Thin the rocks out during boss fights so dodging his shots is the focus.
    // Spawn interval is floored so high levels never become a solid wall.
    this.spawnTimer = Math.max(0.32, (1.1 + Math.random() * 0.6) / diff) *
      (this.phase === 'boss' ? 2.2 : 1);

    const r = 3 + Math.random() * 5;
    const hp = r > 6 ? 3 : r > 4.5 ? 2 : 1;
    this.asteroids.push({
      x: r + Math.random() * (WORLD_W - 2 * r),
      y: -r,
      // Speed scaling is capped separately from spawn rate: late-game density
      // rises, but rocks stay humanly dodgeable.
      vy: (14 + Math.random() * 12) * (0.7 + Math.min(diff, 3.5) * 0.3),
      r,
      vx: (Math.random() - 0.5) * 8,
      hp,
      maxHp: hp,
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
          a.hp -= b.dmg ?? 1;
          if (a.hp <= 0) {
            this._killAsteroid(a, events);
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
          this._damageShip(events);
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
        this._setMessage('ARMOR FORGED', '#ffd75e');
        this._explode(this.ship.x, this.shipY(), 4, '#ffd75e');
        events.push('armorup');
      } else {
        this.shield = SHIELD_MAX;
      }
    }
  }

  // Damage order: shield shatters first, then armor, then a life.
  _damageShip(events) {
    const ship = this.ship;
    const shipY = this.shipY();
    ship.invuln = INVULN_TIME;
    this.shake = Math.max(this.shake, 0.35);
    if (this.shield > 0) {
      this.shield = 0;
      this._setMessage('SHIELD DOWN', '#6fd3ff');
      this._explode(ship.x, shipY - 4, 3, '#6fd3ff');
      events.push('shieldbreak');
    } else if (this.armorHp > 0) {
      this.armorHp -= 1;
      this._setMessage(this.armorHp > 0 ? 'ARMOR CRACKED' : 'ARMOR DESTROYED', '#ffd75e');
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
  }

  _killAsteroid(a, events) {
    a.dead = true;
    this.score += Math.round(a.r) * 10;
    this._addShield(Math.round(a.r) * SHIELD_PER_RADIUS, events);
    // Hard rocks are the pickup source — more risk, more reward
    const dropChance = a.maxHp >= 3 ? DROP_CHANCE_BIG : a.maxHp >= 2 ? DROP_CHANCE_MED : 0;
    if (Math.random() < dropChance) this._spawnPickup(a.x, a.y);
    this._explode(a.x, a.y, a.r, '#ffb347');
    events.push('explosion');
  }

  _spawnPickup(x, y, forcedType = null) {
    let type = forcedType;
    if (!type) {
      let roll = Math.random();
      type = PICKUP_WEIGHTS[0][0];
      for (const [t, w] of PICKUP_WEIGHTS) {
        type = t;
        roll -= w;
        if (roll <= 0) break;
      }
    }
    this.pickups.push({
      x: Math.max(4, Math.min(WORLD_W - 4, x)),
      y,
      vy: PICKUP_FALL_SPEED * (0.8 + Math.random() * 0.4),
      type,
      seed: Math.random(),
    });
  }

  _updatePickups(dt, events) {
    this.pickupTimer -= dt;
    if (this.pickupTimer <= 0) {
      this.pickupTimer = AMBIENT_PICKUP_INTERVAL * (0.7 + Math.random() * 0.6);
      // Pity rule: after a long unprotected stretch, the next drifter is a shield
      const forced = this.shieldlessTime > SHIELD_PITY_TIME ? 'shield' : null;
      this._spawnPickup(4 + Math.random() * (WORLD_W - 8), -3, forced);
    }

    const ship = this.ship;
    const shipY = this.shipY();
    for (const p of this.pickups) {
      p.y += p.vy * dt;
      const dx = p.x - ship.x, dy = p.y - shipY;
      const hitR = PICKUP_RADIUS + ship.w * 0.45;
      if (dx * dx + dy * dy < hitR * hitR) {
        p.dead = true;
        this._collectPickup(p, events);
      }
    }
    this.pickups = this.pickups.filter((p) => !p.dead && p.y < this.worldH + 4);
  }

  _collectPickup(p, events) {
    const info = POWER_INFO[p.type];
    this._setMessage(info.label, info.color);
    if (p.type === 'shield') {
      this._addShield(40, events); // may itself announce ARMOR FORGED
    } else if (p.type === 'missiles') {
      this._launchMissiles(events);
    } else if (p.type === 'life') {
      if (this.lives < MAX_LIVES) this.lives += 1;
      else this._addShield(40, events); // full health: convert to shield
      events.push('life');
    } else {
      this.power[p.type] = POWER_DURATION;
    }
    this._explode(p.x, p.y, 2, info.color);
    events.push('pickup');
  }

  _launchMissiles(events) {
    const x = this.ship.x;
    const y = this.shipY() - 2;
    for (let i = 0; i < MISSILE_SALVO; i++) {
      const ang = -Math.PI / 2 + (i - (MISSILE_SALVO - 1) / 2) * 0.6;
      this.missiles.push({
        x, y,
        vx: Math.cos(ang) * MISSILE_SPEED,
        vy: Math.sin(ang) * MISSILE_SPEED,
      });
    }
    events.push('missile');
  }

  _updateMissiles(dt, events) {
    for (const m of this.missiles) {
      const best = this._nearestTarget(m.x, m.y);
      if (best) {
        const cur = Math.atan2(m.vy, m.vx);
        const want = Math.atan2(best.y - m.y, best.x - m.x);
        let diff = want - cur;
        if (diff > Math.PI) diff -= 2 * Math.PI;
        if (diff < -Math.PI) diff += 2 * Math.PI;
        const turn = Math.max(-MISSILE_TURN_RATE * dt, Math.min(MISSILE_TURN_RATE * dt, diff));
        m.vx = Math.cos(cur + turn) * MISSILE_SPEED;
        m.vy = Math.sin(cur + turn) * MISSILE_SPEED;
      }
      m.x += m.vx * dt;
      m.y += m.vy * dt;

      // Exhaust trail
      this.particles.push({
        x: m.x, y: m.y,
        vx: -m.vx * 0.15, vy: -m.vy * 0.15,
        life: 0.25, maxLife: 0.25,
        color: '#ff9d5c',
      });

      for (const a of this.asteroids) {
        if (a.dead) continue;
        const dx = a.x - m.x, dy = a.y - m.y;
        const hitR = a.r + 1;
        if (dx * dx + dy * dy < hitR * hitR) {
          m.dead = true;
          a.hp -= MISSILE_DMG;
          if (a.hp <= 0) this._killAsteroid(a, events);
          else this._explode(m.x, m.y, 2, '#ff9d5c');
          break;
        }
      }
    }
    this.missiles = this.missiles.filter(
      (m) => !m.dead && m.y > -5 && m.y < this.worldH + 5 && m.x > -8 && m.x < WORLD_W + 8
    );
    this.asteroids = this.asteroids.filter((a) => !a.dead);
  }

  _updateBoss(dt, events) {
    const boss = this.boss;
    if (!boss) return;
    boss.t += dt;
    boss.hurt = Math.max(0, boss.hurt - dt);

    if (!boss.entered) {
      boss.y += 10 * dt;
      if (boss.y >= BOSS_Y) { boss.y = BOSS_Y; boss.entered = true; }
    } else if (boss.type === 'charger') {
      this._bossCharger(boss, dt, events);
    } else if (boss.type === 'spawner') {
      this._bossSpawner(boss, dt, events);
    } else {
      this._bossStrafer(boss, dt, events);
    }

    // Ramming the boss (or being dive-bombed) hurts
    if (this.ship.invuln <= 0) {
      const dx = boss.x - this.ship.x, dy = boss.y - this.shipY();
      const hitR = boss.r + this.ship.w * 0.4;
      if (dx * dx + dy * dy < hitR * hitR) this._damageShip(events);
    }

    // Player fire vs boss
    for (const b of this.bullets) {
      const dx = b.x - boss.x, dy = b.y - boss.y;
      if (dx * dx + dy * dy < boss.r * boss.r) {
        b.dead = true;
        boss.hp -= b.dmg ?? 1;
        boss.hurt = 0.12;
        this._explode(b.x, b.y, 1, '#ff6b6b');
      }
    }
    this.bullets = this.bullets.filter((b) => !b.dead);
    for (const m of this.missiles) {
      const dx = m.x - boss.x, dy = m.y - boss.y;
      const hitR = boss.r + 1;
      if (dx * dx + dy * dy < hitR * hitR) {
        m.dead = true;
        boss.hp -= MISSILE_DMG;
        boss.hurt = 0.12;
        this._explode(m.x, m.y, 2, '#ff9d5c');
      }
    }
    this.missiles = this.missiles.filter((m) => !m.dead);

    if (boss.hp <= 0) this._killBoss(events);
  }

  _bossShoot(boss, shots, events, spread = 0.25) {
    const aim = Math.atan2(this.shipY() - boss.y, this.ship.x - boss.x);
    const speed = 38 + this.level * 3;
    for (let i = 0; i < shots; i++) {
      const ang = aim + (i - (shots - 1) / 2) * spread;
      this.bossBullets.push({
        x: boss.x, y: boss.y + 3,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
      });
    }
    events.push('enemylaser');
  }

  // Predictable side-to-side sweeper with aimed shots (spread at higher levels).
  _bossStrafer(boss, dt, events) {
    const strafe = 0.5 + this.level * 0.06;
    boss.x = WORLD_W / 2 + Math.sin(boss.t * strafe) * 32;
    boss.y = BOSS_Y + Math.sin(boss.t * 1.3) * 2;
    boss.fireTimer -= dt;
    if (boss.fireTimer <= 0) {
      boss.fireTimer = Math.max(0.7, 1.7 - this.level * 0.1);
      this._bossShoot(boss, this.level >= 4 ? 3 : 1, events);
    }
  }

  // Hovers, shudders as a telegraph, then dive-bombs the player's position.
  _bossCharger(boss, dt, events) {
    boss.modeT += dt;
    if (boss.mode === 'hover') {
      boss.x += (WORLD_W / 2 + Math.sin(boss.t * 0.7) * 20 - boss.x) * Math.min(2 * dt, 1);
      boss.y += (BOSS_Y - boss.y) * Math.min(2 * dt, 1);
      boss.fireTimer -= dt;
      if (boss.fireTimer <= 0) {
        boss.fireTimer = 2.5;
        this._bossShoot(boss, 1, events);
      }
      if (boss.modeT > 3.2) {
        boss.mode = 'telegraph';
        boss.modeT = 0;
        boss.targetX = this.ship.x;
      }
    } else if (boss.mode === 'telegraph') {
      boss.x += Math.sin(boss.modeT * 40) * 0.4; // shudder
      if (boss.modeT > 0.7) { boss.mode = 'dive'; boss.modeT = 0; }
    } else if (boss.mode === 'dive') {
      boss.y += (55 + this.level * 3) * dt;
      boss.x += (boss.targetX - boss.x) * Math.min(3 * dt, 1);
      if (boss.y > this.worldH - 22) { boss.mode = 'return'; boss.modeT = 0; }
    } else { // return
      boss.y -= 30 * dt;
      if (boss.y <= BOSS_Y) { boss.y = BOSS_Y; boss.mode = 'hover'; boss.modeT = 0; }
    }
  }

  // Drifts slowly, spits rocks at the player and fires radial bolt bursts.
  _bossSpawner(boss, dt, events) {
    boss.x = WORLD_W / 2 + Math.sin(boss.t * 0.35) * 24;
    boss.y = BOSS_Y + Math.sin(boss.t * 1.1) * 1.5;

    boss.spitTimer -= dt;
    if (boss.spitTimer <= 0) {
      boss.spitTimer = Math.max(1.6, 3 - this.level * 0.1);
      for (const off of [-3, 3]) {
        const r = 3.5 + Math.random() * 2;
        const hp = r > 4.5 ? 2 : 1;
        this.asteroids.push({
          x: boss.x + off, y: boss.y + 3, r,
          vy: 22 + Math.random() * 8,
          vx: off * 1.2 + (Math.random() - 0.5) * 4,
          hp, maxHp: hp,
          angle: Math.random() * Math.PI * 2,
          spin: (Math.random() - 0.5) * 2,
          seed: Math.random(),
        });
      }
      events.push('enemylaser');
    }

    boss.burstTimer -= dt;
    if (boss.burstTimer <= 0) {
      boss.burstTimer = Math.max(2.6, 4.5 - this.level * 0.12);
      const n = 5 + Math.min(4, Math.floor(this.level / 3));
      const speed = 34 + this.level * 2;
      for (let i = 0; i < n; i++) {
        const ang = Math.PI * (0.15 + (0.7 * i) / (n - 1)); // downward fan
        this.bossBullets.push({
          x: boss.x, y: boss.y + 2,
          vx: Math.cos(ang) * speed,
          vy: Math.sin(ang) * speed,
        });
      }
      events.push('enemylaser');
    }
  }

  _killBoss(events) {
    const boss = this.boss;
    this.score += BOSS_SCORE * this.level;
    this._explode(boss.x, boss.y, 10, '#ff6b6b');
    this._explode(boss.x, boss.y, 8, '#ffb347');
    // Victory spoils
    this._spawnPickup(boss.x - 6, boss.y);
    this._spawnPickup(boss.x + 6, boss.y);
    this.boss = null;
    this.bossBullets = [];
    this.level += 1;
    this.phase = 'clear'; // breather before the next wave
    this.phaseTimer = CLEAR_DURATION;
    this.shake = Math.max(this.shake, 0.5);
    this._setMessage('LEVEL CLEAR!', '#7dff9b');
    events.push('bossdown');
  }

  _updateBossBullets(dt, events) {
    const ship = this.ship;
    const shipY = this.shipY();
    for (const bb of this.bossBullets) {
      bb.x += bb.vx * dt;
      bb.y += bb.vy * dt;
      if (ship.invuln <= 0) {
        const dx = bb.x - ship.x, dy = bb.y - shipY;
        const hitR = 1 + ship.w * 0.4;
        if (dx * dx + dy * dy < hitR * hitR) {
          bb.dead = true;
          this._damageShip(events);
        }
      }
    }
    this.bossBullets = this.bossBullets.filter(
      (bb) => !bb.dead && bb.y > -5 && bb.y < this.worldH + 5 && bb.x > -5 && bb.x < WORLD_W + 5
    );
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

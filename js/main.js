import { Game, State } from './game.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { Sound } from './audio.js';

const canvas = document.getElementById('game');
const renderer = new Renderer(canvas);
const input = new Input(canvas);
const sound = new Sound();
const game = new Game();
game.setAspect(renderer.aspect());
window.game = game; // console/debug access

// iOS requires a user gesture before audio can play.
const unlockAudio = () => sound.unlock();
window.addEventListener('touchstart', unlockAudio, { once: true });
window.addEventListener('mousedown', unlockAudio, { once: true });
window.addEventListener('keydown', unlockAudio, { once: true });

window.addEventListener('resize', () => {
  renderer.resize();
  game.setAspect(renderer.aspect());
});

// ---- pause & mute -----------------------------------------------------

let paused = false;

function setPaused(next) {
  if (game.state !== State.PLAYING) next = false;
  if (next === paused) return;
  paused = next;
  sound.setPaused(paused);
  document.getElementById('btn-pause').innerHTML = paused ? '&#9654;' : '&#10074;&#10074;';
}

function syncMuteButton() {
  document.getElementById('btn-mute').innerHTML = sound.muted ? '&#128263;' : '&#128266;';
}

document.getElementById('btn-pause').addEventListener('click', () => setPaused(!paused));
document.getElementById('btn-mute').addEventListener('click', () => {
  sound.unlock();
  sound.setMuted(!sound.muted);
  syncMuteButton();
});
syncMuteButton();

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyP') setPaused(!paused);
  if (e.code === 'KeyM') { sound.setMuted(!sound.muted); syncMuteButton(); }
});

// Auto-pause when the tab/app goes to the background (matters for iOS wrap)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) setPaused(true);
});

// ---- game loop ---------------------------------------------------------

const SOUNDS = {
  laser: () => sound.laser(),
  explosion: () => sound.explosion(),
  hit: () => sound.hit(),
  gameover: () => sound.gameOver(),
  shieldbreak: () => sound.shieldBreak(),
  armorup: () => sound.armorUp(),
  armorhit: () => sound.armorHit(),
  pickup: () => sound.pickup(),
  life: () => sound.life(),
  missile: () => sound.missile(),
  bosswarn: () => sound.bossWarn(),
  bossdown: () => sound.bossDown(),
  enemylaser: () => sound.enemyLaser(),
};

let last = performance.now();

function frame(now) {
  // Clamp dt so a backgrounded tab doesn't cause a huge simulation jump.
  const dt = Math.min((now - last) / 1000, 1 / 20);
  last = now;

  if (!paused) {
    input.update();
    const events = game.update(dt, {
      moveAxis: input.moveAxis,
      pointerWorldX: input.pointerX !== null ? renderer.cssXToWorld(input.pointerX) : null,
      primary: input.consumePrimary(),
      fire: input.fireHeld || input.consumeFireTap(),
    });
    for (const e of events) SOUNDS[e]?.();

    // Music follows the action: tense during boss encounters
    sound.musicMode =
      game.state === State.PLAYING && (game.boss || game.phase === 'warn') ? 'boss' : 'wave';
  }

  renderer.draw(game, now / 1000, paused);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

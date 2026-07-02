import { Game } from './game.js';
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

const SOUNDS = {
  laser: () => sound.laser(),
  explosion: () => sound.explosion(),
  hit: () => sound.hit(),
  gameover: () => sound.gameOver(),
  shieldbreak: () => sound.shieldBreak(),
  armorup: () => sound.armorUp(),
  armorhit: () => sound.armorHit(),
  pickup: () => sound.pickup(),
  missile: () => sound.missile(),
};

let last = performance.now();

function frame(now) {
  // Clamp dt so a backgrounded tab doesn't cause a huge simulation jump.
  const dt = Math.min((now - last) / 1000, 1 / 20);
  last = now;

  input.update();
  const events = game.update(dt, {
    moveAxis: input.moveAxis,
    pointerWorldX: input.pointerX !== null ? renderer.cssXToWorld(input.pointerX) : null,
    primary: input.consumePrimary(),
    fire: input.fireHeld || input.consumeFireTap(),
  });
  for (const e of events) SOUNDS[e]?.();

  renderer.draw(game, now / 1000);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

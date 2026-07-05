// Sprite images from Kenney's "Space Shooter Redux" pack (kenney.nl, CC0).
// Images populate asynchronously; the renderer falls back to the procedural
// sprites in sprites.js until each image is ready (or if one fails to load),
// so a missing asset degrades gracefully instead of breaking the game.

function img(src) {
  const i = new Image();
  i.src = src;
  return i;
}

export function loadAssets() {
  return {
    ship: img('assets/playerShip2_blue.png'),
    laser: img('assets/laserGreen11.png'),
    boss: img('assets/ufoRed.png'),
    bossLaser: img('assets/laserRed07.png'),
    pickups: {
      beam: img('assets/powerupYellow_bolt.png'),
      fan: img('assets/powerupGreen_star.png'),
      seeker: img('assets/powerupRed_star.png'),
      shield: img('assets/powerupBlue_shield.png'),
      missiles: img('assets/things_gold.png'),
    },
    shields: [
      img('assets/shield1.png'),
      img('assets/shield2.png'),
      img('assets/shield3.png'),
    ],
    meteors: [
      img('assets/meteorBrown_big1.png'),
      img('assets/meteorBrown_big2.png'),
      img('assets/meteorBrown_big3.png'),
      img('assets/meteorBrown_big4.png'),
      img('assets/meteorGrey_big1.png'),
      img('assets/meteorGrey_big3.png'),
    ],
  };
}

export function ready(image) {
  return !!image && image.complete && image.naturalWidth > 0;
}

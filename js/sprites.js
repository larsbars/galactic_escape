// Procedurally pre-rendered sprite textures. Everything is drawn once to an
// offscreen canvas with gradients/shading, then blitted each frame — far
// cheaper than re-drawing gradients per frame, and no image assets to load.

function mulberry32(seed) {
  let a = Math.floor(seed * 0xffffffff) >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// A sleek fighter, lit from the top-left: gunmetal hull, glass cockpit,
// swept wings with red accents, twin engine nozzles.
export function makeShipSprite() {
  const W = 128, H = 144;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');

  // Wings (behind fuselage)
  const wingGrad = ctx.createLinearGradient(0, 50, 0, 120);
  wingGrad.addColorStop(0, '#a8b8c6');
  wingGrad.addColorStop(0.5, '#5f7182');
  wingGrad.addColorStop(1, '#37424e');
  ctx.fillStyle = wingGrad;
  ctx.strokeStyle = '#1c232b';
  ctx.lineWidth = 2;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(W / 2, 0);
    ctx.scale(side, 1);
    ctx.beginPath();
    ctx.moveTo(8, 62);
    ctx.lineTo(58, 100);
    ctx.lineTo(60, 116);
    ctx.lineTo(34, 114);
    ctx.lineTo(6, 118);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Red wingtip stripe
    ctx.fillStyle = '#c23b3b';
    ctx.beginPath();
    ctx.moveTo(50, 94);
    ctx.lineTo(58, 100);
    ctx.lineTo(60, 116);
    ctx.lineTo(50, 115);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = wingGrad;
    ctx.restore();
  }

  // Engine nozzles
  for (const side of [-1, 1]) {
    const nx = W / 2 + side * 14;
    const nozzle = ctx.createLinearGradient(nx - 8, 0, nx + 8, 0);
    nozzle.addColorStop(0, '#2a3138');
    nozzle.addColorStop(0.5, '#59636d');
    nozzle.addColorStop(1, '#1e242a');
    ctx.fillStyle = nozzle;
    ctx.beginPath();
    ctx.roundRect(nx - 8, 114, 16, 20, 4);
    ctx.fill();
    // Inner heat glow
    const heat = ctx.createRadialGradient(nx, 132, 0, nx, 132, 7);
    heat.addColorStop(0, '#ffd9a0');
    heat.addColorStop(1, 'rgba(255, 120, 40, 0)');
    ctx.fillStyle = heat;
    ctx.beginPath();
    ctx.ellipse(nx, 130, 6, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Fuselage
  const hull = ctx.createLinearGradient(30, 0, 98, 0);
  hull.addColorStop(0, '#3f4e5c');
  hull.addColorStop(0.35, '#c5d6e4');
  hull.addColorStop(0.55, '#8ba0b2');
  hull.addColorStop(1, '#2e3a45');
  ctx.fillStyle = hull;
  ctx.strokeStyle = '#161c22';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W / 2, 4);
  ctx.quadraticCurveTo(W / 2 + 17, 52, W / 2 + 19, 106);
  ctx.quadraticCurveTo(W / 2 + 18, 122, W / 2 + 10, 126);
  ctx.lineTo(W / 2 - 10, 126);
  ctx.quadraticCurveTo(W / 2 - 18, 122, W / 2 - 19, 106);
  ctx.quadraticCurveTo(W / 2 - 17, 52, W / 2, 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Nose highlight ridge
  const ridge = ctx.createLinearGradient(0, 4, 0, 90);
  ridge.addColorStop(0, 'rgba(255,255,255,0.85)');
  ridge.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = ridge;
  ctx.beginPath();
  ctx.moveTo(W / 2, 6);
  ctx.quadraticCurveTo(W / 2 + 6, 40, W / 2 + 5, 88);
  ctx.lineTo(W / 2 - 5, 88);
  ctx.quadraticCurveTo(W / 2 - 6, 40, W / 2, 6);
  ctx.closePath();
  ctx.fill();

  // Panel lines
  ctx.strokeStyle = 'rgba(10, 16, 22, 0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 14, 92); ctx.lineTo(W / 2 + 14, 92);
  ctx.moveTo(W / 2 - 15, 104); ctx.lineTo(W / 2 + 15, 104);
  ctx.stroke();

  // Cockpit canopy
  const glass = ctx.createRadialGradient(W / 2 - 4, 48, 2, W / 2, 56, 22);
  glass.addColorStop(0, '#eaf9ff');
  glass.addColorStop(0.35, '#7fc4ec');
  glass.addColorStop(1, '#0e3355');
  ctx.fillStyle = glass;
  ctx.strokeStyle = '#0b1d2e';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(W / 2, 56, 9, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Specular glint
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath();
  ctx.ellipse(W / 2 - 3, 46, 2.5, 5, -0.3, 0, Math.PI * 2);
  ctx.fill();

  return c;
}

// Pixels per world unit for asteroid textures.
const ASTEROID_RES = 20;
// Texture is padded beyond the collision radius so the lumpy silhouette fits.
export const ASTEROID_PAD = 1.3;

// A cratered rock lit from the top-left. Shape wobble, crater layout and
// speckling are all derived from the seed, so each asteroid looks unique
// but stable frame to frame.
export function makeAsteroidTexture(r, seed) {
  const rand = mulberry32(seed);
  const R = r * ASTEROID_RES;
  const size = Math.ceil(2 * R * ASTEROID_PAD);
  const cx = size / 2, cy = size / 2;
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');

  // Lumpy silhouette
  const verts = 11;
  const path = new Path2D();
  for (let i = 0; i < verts; i++) {
    const ang = (i / verts) * Math.PI * 2;
    const wob = 0.78 + rand() * 0.28;
    const px = cx + Math.cos(ang) * R * wob;
    const py = cy + Math.sin(ang) * R * wob;
    i === 0 ? path.moveTo(px, py) : path.lineTo(px, py);
  }
  path.closePath();

  ctx.save();
  ctx.clip(path);

  // Base rock, lit top-left
  const base = ctx.createRadialGradient(cx - R * 0.5, cy - R * 0.55, R * 0.1, cx, cy, R * 1.6);
  base.addColorStop(0, '#cfc2ae');
  base.addColorStop(0.35, '#94887a');
  base.addColorStop(0.7, '#5c5245');
  base.addColorStop(1, '#282320');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);

  // Mineral speckles
  for (let i = 0; i < 50; i++) {
    const sx = rand() * size, sy = rand() * size;
    const s = 1 + rand() * 2.5;
    ctx.fillStyle = rand() > 0.5 ? 'rgba(255,240,220,0.07)' : 'rgba(0,0,0,0.1)';
    ctx.fillRect(sx, sy, s, s);
  }

  // Craters: dark floor, lit inner rim on the side facing away from the light
  const craters = 4 + Math.floor(rand() * 4);
  for (let i = 0; i < craters; i++) {
    const ang = rand() * Math.PI * 2;
    const dist = rand() * R * 0.7;
    const px = cx + Math.cos(ang) * dist;
    const py = cy + Math.sin(ang) * dist;
    const cr = R * (0.1 + rand() * 0.16);

    const floor = ctx.createRadialGradient(px - cr * 0.25, py - cr * 0.25, 0, px, py, cr);
    floor.addColorStop(0, 'rgba(15, 12, 10, 0.55)');
    floor.addColorStop(0.75, 'rgba(25, 20, 16, 0.35)');
    floor.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = floor;
    ctx.beginPath();
    ctx.arc(px, py, cr, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(230, 215, 190, 0.3)';
    ctx.lineWidth = Math.max(1, cr * 0.15);
    ctx.beginPath();
    ctx.arc(px, py, cr * 0.8, Math.PI * 0.1, Math.PI * 0.9);
    ctx.stroke();
  }

  // Terminator shadow creeping in from the bottom-right
  const shadow = ctx.createRadialGradient(cx + R * 0.7, cy + R * 0.75, R * 0.2, cx + R * 0.4, cy + R * 0.4, R * 1.7);
  shadow.addColorStop(0, 'rgba(5, 4, 8, 0.55)');
  shadow.addColorStop(0.5, 'rgba(5, 4, 8, 0.2)');
  shadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = shadow;
  ctx.fillRect(0, 0, size, size);

  ctx.restore();

  ctx.strokeStyle = 'rgba(12, 10, 8, 0.8)';
  ctx.lineWidth = 2;
  ctx.stroke(path);

  return c;
}

// Elongated plasma bolt: white-hot core inside a green glow.
export function makeBulletSprite() {
  const W = 24, H = 60;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');

  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(1, 2.4);
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, W / 2);
  glow.addColorStop(0, 'rgba(160, 255, 190, 0.9)');
  glow.addColorStop(0.4, 'rgba(90, 240, 140, 0.45)');
  glow.addColorStop(1, 'rgba(40, 200, 100, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, W / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const core = ctx.createLinearGradient(0, 8, 0, H - 8);
  core.addColorStop(0, '#ffffff');
  core.addColorStop(0.6, '#c8ffdc');
  core.addColorStop(1, 'rgba(125, 255, 155, 0.1)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.roundRect(W / 2 - 2.5, 8, 5, H - 16, 2.5);
  ctx.fill();

  return c;
}

// Soft round glow used for particles and bright stars, keyed by color.
const glowCache = new Map();
export function glowDot(color) {
  let dot = glowCache.get(color);
  if (dot) return dot;
  const S = 32;
  dot = makeCanvas(S, S);
  const ctx = dot.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.25, color);
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  glowCache.set(color, dot);
  return dot;
}

// Dim nebula clouds for the far background, generated once.
export function makeNebula() {
  const W = 512, H = 910;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const blobs = [
    ['rgba(48, 28, 96, 0.55)', 0.25, 0.2, 0.5],
    ['rgba(20, 60, 110, 0.5)', 0.75, 0.45, 0.45],
    ['rgba(80, 24, 70, 0.4)', 0.5, 0.8, 0.55],
    ['rgba(16, 44, 90, 0.45)', 0.15, 0.65, 0.4],
    ['rgba(60, 34, 100, 0.35)', 0.85, 0.9, 0.4],
  ];
  for (const [color, fx, fy, fr] of blobs) {
    const g = ctx.createRadialGradient(W * fx, H * fy, 0, W * fx, H * fy, W * fr);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  return c;
}

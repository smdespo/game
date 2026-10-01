// =====================================================================
// SHADOW FIGHTER - Version 3 (cinematic silhouette look)
// Mechanics unchanged from V2: same combat timeline, hitboxes, AI, physics.
// New: procedural silhouette fighters, layered golden background, HUD,
//      timer, round intro, ambient embers, restyled effects.
// =====================================================================

// ---------------------------------------------------------------------
// 1. SETTINGS
// ---------------------------------------------------------------------
const GAME_WIDTH = 960;
const GAME_HEIGHT = 540;
const GROUND_TOP = 480;

const FIGHTER_WIDTH = 50;     // physics/hitbox size (unchanged, visuals are drawn on top)
const FIGHTER_HEIGHT = 100;

const PLAYER_SPEED = 220;
const ENEMY_SPEED = 120;
const JUMP_SPEED = -520;

const MAX_HP = 100;
const HIT_STUN_TIME = 300;
const BLOCK_DAMAGE_MULTIPLIER = 0.2;
const ATTACK_COOLDOWN = 120;
const ENEMY_ATTACK_RANGE = 85;
const JOY_DEADZONE = 0.2;
const ROUND_TIME = 99;

// Palette
const C = { BLACK: 0x080604, BROWN: 0x1a0f08, DEEP: 0xa63d0d, ORANGE: 0xd96b16,
            GOLD: 0xe5a83b, LGOLD: 0xffd76a, CREAM: 0xfff0b0 };
const SERIF = 'Georgia, "Times New Roman", serif';
const NAMES = { player: 'KAAL', enemy: 'RAAVAN' };

// times in ms. total = startup + active + recovery
const ATTACKS = {
  punch: { damage: 10, startup: 100, active: 120, total: 350, reach: 55, height: 24, yOffset: -20, color: C.LGOLD, knock: 220 },
  kick:  { damage: 15, startup: 180, active: 140, total: 550, reach: 75, height: 24, yOffset: 25,  color: C.ORANGE, knock: 320 }
};

const S = { IDLE: 'IDLE', RUN: 'RUN', JUMP: 'JUMP', ATTACK: 'ATTACK', BLOCK: 'BLOCK',
            HIT: 'HIT', DEAD: 'DEAD', CHASE: 'CHASE' };

// Sprite sheet names for later: assets/player/player_idle.png ...
const SPRITE_KEYS = ['idle', 'run', 'jump', 'punch', 'kick', 'block', 'hit', 'death'];

// Body proportions for the procedural fighters (swap for sprites later)
const CFG = {
  player: { kind: 'player', scale: 1,    hip: 46, torso: 30, head: 9,    hw: 12, sw: 16, legW: 11, armW: 8,  arm: 18, lean: 4,  phase: 0 },
  enemy:  { kind: 'enemy',  scale: 1.12, hip: 44, torso: 34, head: 10.5, hw: 18, sw: 27, legW: 14, armW: 11, arm: 19, lean: 10, phase: 2 }
};

// ---------------------------------------------------------------------
// 2. GLOBALS
// ---------------------------------------------------------------------
let scene, player, enemy, fightState, hudBars, timerText, timeLeft, ambient, embers;

// ---------------------------------------------------------------------
// 3. UNIFIED INPUT (unchanged)
// ---------------------------------------------------------------------
const input = { moveX: 0, jump: false, punch: false, kick: false, block: false };
const kbHeld = { left: false, right: false, block: false };
const joyState = { x: 0 };
const btnHeld = { block: false };

function refreshInput() {
  const kb = (kbHeld.right ? 1 : 0) - (kbHeld.left ? 1 : 0);
  input.moveX = Math.max(-1, Math.min(1, kb + joyState.x));
  input.block = kbHeld.block || btnHeld.block;
}

function resetInput() {
  input.jump = input.punch = input.kick = false;
  kbHeld.left = kbHeld.right = kbHeld.block = false;
  btnHeld.block = false;
  joyState.x = 0;
  resetJoystickVisual();
  document.querySelectorAll('.act').forEach(function (b) { b.classList.remove('active'); });
  refreshInput();
}

const KEY_HOLD = { KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', KeyL: 'block' };
const KEY_TRIGGER = { Space: 'jump', ArrowUp: 'jump', KeyJ: 'punch', KeyK: 'kick' };

window.addEventListener('keydown', function (e) {
  if (KEY_HOLD[e.code] || KEY_TRIGGER[e.code]) e.preventDefault();
  if (KEY_HOLD[e.code]) kbHeld[KEY_HOLD[e.code]] = true;
  if (KEY_TRIGGER[e.code] && !e.repeat) input[KEY_TRIGGER[e.code]] = true;
  refreshInput();
});
window.addEventListener('keyup', function (e) {
  if (KEY_HOLD[e.code]) kbHeld[KEY_HOLD[e.code]] = false;
  refreshInput();
});
window.addEventListener('blur', function () {
  kbHeld.left = kbHeld.right = kbHeld.block = false; refreshInput();
});

const joyBase = document.getElementById('joystick');
const joyKnob = document.getElementById('joy-knob');
let joyPointer = null;

function resetJoystickVisual() {
  joyPointer = null;
  joyKnob.style.transform = 'translate(0px, 0px)';
}

function moveJoystick(e) {
  const r = joyBase.getBoundingClientRect();
  const radius = r.width / 2;
  const dx = e.clientX - (r.left + radius);
  const dy = e.clientY - (r.top + radius);
  const dist = Math.hypot(dx, dy) || 1;
  const k = Math.min(1, (radius * 0.6) / dist);
  joyKnob.style.transform = 'translate(' + dx * k + 'px,' + dy * k + 'px)';
  const nx = Math.max(-1, Math.min(1, dx / (radius * 0.6)));
  joyState.x = Math.abs(nx) < JOY_DEADZONE ? 0 : nx;
  refreshInput();
}

joyBase.addEventListener('pointerdown', function (e) {
  e.preventDefault();
  joyPointer = e.pointerId;
  joyBase.setPointerCapture(e.pointerId);
  moveJoystick(e);
});
joyBase.addEventListener('pointermove', function (e) {
  if (e.pointerId === joyPointer) moveJoystick(e);
});
['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) {
  joyBase.addEventListener(ev, function (e) {
    if (joyPointer !== null && e.pointerId !== joyPointer) return;
    joyState.x = 0; resetJoystickVisual(); refreshInput();
  });
});

document.querySelectorAll('.act').forEach(function (btn) {
  const act = btn.dataset.act;
  btn.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    btn.setPointerCapture(e.pointerId);
    btn.classList.add('active');
    if (act === 'block') btnHeld.block = true; else input[act] = true;
    refreshInput();
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) {
    btn.addEventListener(ev, function () {
      btn.classList.remove('active');
      if (act === 'block') { btnHeld.block = false; refreshInput(); }
    });
  });
});
document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

// ---------------------------------------------------------------------
// 4. SOUND HOOKS (no audio files yet)
// ---------------------------------------------------------------------
const Sound = {
  play: function (name) { /* if (scene.cache.audio.exists(name)) scene.sound.play(name); */ }
};

// ---------------------------------------------------------------------
// 5. PHASER CONFIG
// ---------------------------------------------------------------------
new Phaser.Game({
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: 'game-container',
  backgroundColor: '#080604',
  input: { touch: { capture: false } },
  physics: { default: 'arcade', arcade: { gravity: { y: 900 }, debug: false } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: { create: create, update: update }
});

// ---------------------------------------------------------------------
// 6. SMALL DRAWING HELPERS
// ---------------------------------------------------------------------
function lerpC(a, b, t) {
  const ar = a >> 16 & 255, ag = a >> 8 & 255, ab = a & 255;
  const br = b >> 16 & 255, bg = b >> 8 & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}
// Vertical gradient built from bands (works in both WebGL and Canvas)
function vgrad(g, x, y, w, h, c1, c2, n, a0, a1) {
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0;
    g.fillStyle(lerpC(c1, c2, t), a0 + ((a1 === undefined ? a0 : a1) - a0) * t);
    g.fillRect(x, y + h * i / n, w, Math.ceil(h / n) + 1);
  }
}
function mkRnd(seed) { let s = seed; return function () { s = (s * 16807) % 2147483647; return s / 2147483647; }; }

// Thick rounded limb segment
function seg(g, a, b, w) {
  g.fillCircle(a.x, a.y, w / 2); g.fillCircle(b.x, b.y, w / 2);
  const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l * w / 2, ny = dx / l * w / 2;
  g.fillPoints([{ x: a.x + nx, y: a.y + ny }, { x: b.x + nx, y: b.y + ny },
                { x: b.x - nx, y: b.y - ny }, { x: a.x - nx, y: a.y - ny }], true);
}

// Head shapes: player = hooded, enemy = horned. Shared by fighters and portraits.
function drawHead(g, kind, x, y, r, d) {
  if (kind === 'player') {
    g.fillTriangle(x + d * r * 0.2, y - r * 1.15, x - d * r * 2.0, y + r * 1.0, x - d * r * 0.3, y + r * 1.15);
    g.fillCircle(x, y, r);
  } else {
    g.fillCircle(x, y, r * 1.1);
    g.fillTriangle(x + d * r * 0.1, y - r * 0.9, x + d * r * 0.55, y - r * 2.0, x + d * r * 0.95, y - r * 0.6);
    g.fillTriangle(x - d * r * 0.5, y - r * 0.8, x - d * r * 1.15, y - r * 1.9, x - d * r * 0.05, y - r * 1.0);
  }
}

// ---------------------------------------------------------------------
// 7. CREATE
// ---------------------------------------------------------------------
function create() {
  scene = this;
  resetInput();

  drawBackground();
  drawGround();

  const ground = scene.add.rectangle(GAME_WIDTH / 2, GROUND_TOP + 30, GAME_WIDTH, 60, 0x000000, 0);
  scene.physics.add.existing(ground, true);

  player = createFighter(250, 400, C.GOLD, 'player');
  enemy = createFighter(710, 400, C.ORANGE, 'enemy');

  scene.physics.add.collider(player.sprite, ground);
  scene.physics.add.collider(enemy.sprite, ground);
  scene.physics.add.collider(player.sprite, enemy.sprite);

  buildAmbient();
  buildHUD();

  scene.add.text(GAME_WIDTH / 2, GROUND_TOP + 34,
    'A/D or ←/→ move   SPACE/↑ jump   J punch   K kick   L block',
    { fontSize: '13px', fontFamily: SERIF, color: '#a67a2e' }).setOrigin(0.5).setAlpha(0.55);

  const cam = scene.cameras.main;
  cam.setZoom(1.06);   // small zoom gives room for a gentle follow-pan

  enemy.nextAttackTime = scene.time.now + 2500;

  fightState = 'intro';
  timeLeft = ROUND_TIME;
  scene.time.addEvent({ delay: 1000, loop: true, callback: tickTimer });
  showRoundIntro();
}

function showRoundIntro() {
  const style = { fontFamily: SERIF, fontStyle: 'bold', color: '#ffd76a' };
  function title(txt, size, spacing) {
    return scene.add.text(GAME_WIDTH / 2, 230, txt, Object.assign({ fontSize: size + 'px' }, style))
      .setOrigin(0.5).setDepth(40).setScrollFactor(0).setAlpha(0)
      .setLetterSpacing(spacing).setShadow(0, 4, '#080604', 10, true, true);
  }
  const r = title('ROUND 1', 52, 14);
  scene.tweens.add({ targets: r, alpha: 1, duration: 400, hold: 500, yoyo: true, onComplete: function () { r.destroy(); } });
  scene.time.delayedCall(1400, function () {
    const f = title('FIGHT', 84, 10);
    fightState = 'fighting';
    scene.tweens.add({ targets: f, alpha: 1, scale: { from: 1.25, to: 1 }, duration: 250, hold: 350, yoyo: true,
      onComplete: function () { f.destroy(); } });
  });
}

// ---------------------------------------------------------------------
// 8. UPDATE
// ---------------------------------------------------------------------
function update(time, delta) {
  const now = scene.time.now;

  if (fightState === 'fighting') {
    updateFacing(player, enemy, now);
    updateFacing(enemy, player, now);
    updatePlayerController(now);
    updateEnemyAI(now);
    updateAttack(player, enemy);
    if (fightState === 'fighting') updateAttack(enemy, player);
  } else {
    input.jump = input.punch = input.kick = false;
    updateFacing(player, enemy, now);
    updateFacing(enemy, player, now);
  }

  updateState(player, now, false);
  updateState(enemy, now, true);
  updateFighterVisuals(player, now);
  updateFighterVisuals(enemy, now);
  updateCamera();
  updateAmbient(now, delta);
  drawHealthBars();
}

// Gentle horizontal pan toward the midpoint of the fighters (both stay in view)
function updateCamera() {
  const cam = scene.cameras.main;
  const mid = (player.sprite.x + enemy.sprite.x) / 2;
  const target = Phaser.Math.Clamp((mid - GAME_WIDTH / 2) * 0.1, -26, 26);
  cam.scrollX += (target - cam.scrollX) * 0.06;
}

// ---------------------------------------------------------------------
// 9. BACKGROUND (layered) + GROUND
// ---------------------------------------------------------------------
function ridge(g, top, amp, step, color, alpha, seed) {
  const rnd = mkRnd(seed);
  const pts = [{ x: -20, y: GROUND_TOP + 2 }];
  for (let x = -20; x <= GAME_WIDTH + 40; x += step) {
    pts.push({ x: x, y: top - rnd() * amp - Math.sin(x * 0.007 + seed) * amp * 0.4 });
  }
  pts.push({ x: GAME_WIDTH + 40, y: GROUND_TOP + 2 });
  g.fillStyle(color, alpha); g.fillPoints(pts, true);
}

function pagoda(g, cx, baseY, w, tiers, color) {
  let y = baseY, cw = w;
  g.fillStyle(color, 1);
  g.fillRect(cx - cw * 0.45, y - 16, cw * 0.9, 16); y -= 16;
  for (let i = 0; i < tiers; i++) {
    const bw = cw * 0.6;
    g.fillStyle(color, 1); g.fillRect(cx - bw / 2, y - 16, bw, 16);
    g.fillStyle(C.GOLD, 0.5); g.fillRect(cx - 2, y - 12, 4, 7);      // lit window
    g.fillStyle(color, 1); y -= 16;
    g.fillPoints([{ x: cx - cw / 2 - 12, y: y + 4 }, { x: cx - cw / 2 + 4, y: y - 3 }, { x: cx - cw * 0.18, y: y - 12 },
                  { x: cx + cw * 0.18, y: y - 12 }, { x: cx + cw / 2 - 4, y: y - 3 }, { x: cx + cw / 2 + 12, y: y + 4 },
                  { x: cx + cw / 2 - 6, y: y + 6 }, { x: cx - cw / 2 + 6, y: y + 6 }], true);
    y -= 12; cw *= 0.8;
  }
  g.fillTriangle(cx - 3, y, cx + 3, y, cx, y - 26);
}

function drawBackground() {
  const g = scene.add.graphics().setDepth(-10);
  const SX = 480, SY = 320;

  // 1. Sky
  vgrad(g, 0, 0, GAME_WIDTH, 300, C.BLACK, C.BROWN, 30, 1);
  vgrad(g, 0, 300, GAME_WIDTH, GROUND_TOP - 300, C.BROWN, 0x7a3110, 24, 1);

  // 3. Atmospheric glow + 2. sun halo (soft concentric circles)
  for (let i = 0; i < 16; i++) {
    g.fillStyle(lerpC(C.DEEP, C.GOLD, i / 15), 0.035 + i * 0.002);
    g.fillCircle(SX, SY, 400 - i * 17);
  }
  // light rays
  for (let k = 0; k < 9; k++) {
    const a = -Math.PI / 2 + (k - 4) * 0.22, a2 = a + 0.06;
    g.fillStyle(C.GOLD, 0.045);
    g.fillTriangle(SX, SY, SX + Math.cos(a) * 760, SY + Math.sin(a) * 760, SX + Math.cos(a2) * 760, SY + Math.sin(a2) * 760);
  }
  // sun core
  g.fillStyle(C.ORANGE, 0.35); g.fillCircle(SX, SY, 150);
  g.fillStyle(C.GOLD, 0.95);   g.fillCircle(SX, SY, 132);
  g.fillStyle(C.LGOLD, 1);     g.fillCircle(SX, SY, 116);
  g.fillStyle(C.CREAM, 0.85);  g.fillCircle(SX, SY, 78);

  // horizon haze
  vgrad(g, 0, 330, GAME_WIDTH, 150, C.ORANGE, C.DEEP, 20, 0.0, 0.35);

  // 4. Distant mountains (hazy), then 5. temples, then nearer ridges
  ridge(g, 400, 70, 40, 0x4a220c, 0.85, 7);
  pagoda(g, 300, 430, 52, 2, 0x2a140a);
  pagoda(g, 655, 432, 48, 2, 0x2a140a);
  ridge(g, 440, 45, 30, 0x24120a, 1, 13);
  pagoda(g, 135, 462, 112, 4, 0x0e0805);
  pagoda(g, 830, 462, 92, 3, 0x0e0805);
  ridge(g, 462, 24, 24, 0x0a0604, 1, 29);
}

function drawGround() {
  const g = scene.add.graphics().setDepth(-9);
  const W = GAME_WIDTH;
  // 7. arena floor, almost black
  vgrad(g, 0, GROUND_TOP, W, GAME_HEIGHT - GROUND_TOP + 20, 0x160c06, 0x050302, 12, 1);
  // sun reflection on the floor
  for (let i = 0; i < 4; i++) { g.fillStyle(C.GOLD, 0.05); g.fillEllipse(480, GROUND_TOP + 16, 560 - i * 110, 30 - i * 5); }
  // rim of the platform
  g.fillStyle(C.GOLD, 0.12); g.fillRect(0, GROUND_TOP - 2, W, 8);
  g.fillStyle(C.GOLD, 0.55); g.fillRect(0, GROUND_TOP, W, 2);
  // subtle floor lines + golden cracks
  g.fillStyle(C.DEEP, 0.18); g.fillRect(0, GROUND_TOP + 22, W, 1); g.fillRect(0, GROUND_TOP + 44, W, 1);
  const rnd = mkRnd(91);
  g.lineStyle(1, C.GOLD, 0.3);
  for (let i = 0; i < 9; i++) {
    let x = rnd() * W, y = GROUND_TOP + 6 + rnd() * 40;
    g.beginPath(); g.moveTo(x, y);
    for (let j = 0; j < 3; j++) { x += (rnd() - 0.5) * 60; y += (rnd() - 0.4) * 12; g.lineTo(x, Math.min(GAME_HEIGHT, y)); }
    g.strokePath();
  }
  // 6. foreground rocks in the bottom corners
  const f = scene.add.graphics().setDepth(6);
  f.fillStyle(0x050302, 1);
  f.fillPoints([{ x: -10, y: 550 }, { x: -10, y: 505 }, { x: 40, y: 492 }, { x: 95, y: 512 }, { x: 150, y: 550 }], true);
  f.fillPoints([{ x: W + 10, y: 550 }, { x: W + 10, y: 500 }, { x: W - 50, y: 490 }, { x: W - 110, y: 515 }, { x: W - 170, y: 550 }], true);
}

// ---------------------------------------------------------------------
// 10. AMBIENT PARTICLES (embers + dust, drawn in one Graphics)
// ---------------------------------------------------------------------
function buildAmbient() {
  ambient = scene.add.graphics().setDepth(5);
  embers = [];
  const cols = [C.LGOLD, C.GOLD, C.ORANGE, C.CREAM];
  for (let i = 0; i < 46; i++) {
    embers.push({ x: Math.random() * GAME_WIDTH, y: 80 + Math.random() * 420, vx: (Math.random() - 0.5) * 10,
      vy: -(3 + Math.random() * 14), r: 0.8 + Math.random() * 1.8, ph: Math.random() * 6.28,
      c: cols[i % 4], a: 0.3 + Math.random() * 0.5, glow: i % 3 === 0 });
  }
}

function updateAmbient(now, delta) {
  const dt = Math.min(delta, 50) / 1000;
  ambient.clear();
  embers.forEach(function (e) {
    e.x += (e.vx + Math.sin(now * 0.001 + e.ph) * 8) * dt;
    e.y += e.vy * dt;
    if (e.y < -10 || e.x < -20 || e.x > GAME_WIDTH + 20) { e.y = GROUND_TOP + 30; e.x = Math.random() * GAME_WIDTH; }
    const a = e.a * (0.6 + 0.4 * Math.sin(now * 0.003 + e.ph));
    if (e.glow) { ambient.fillStyle(e.c, a * 0.15); ambient.fillCircle(e.x, e.y, e.r * 3.5); }
    ambient.fillStyle(e.c, a); ambient.fillCircle(e.x, e.y, e.r);
  });
}

// ---------------------------------------------------------------------
// 11. FIGHTERS (physics body = invisible rectangle; visuals = procedural silhouette)
// ---------------------------------------------------------------------
const NOOP = { setVisible: function () { return this; }, setPosition: function () { return this; },
               setDisplaySize: function () { return this; }, setFillStyle: function () { return this; } };

function createFighter(x, y, color, name) {
  const cfg = CFG[name];
  const shadow = scene.add.ellipse(x, GROUND_TOP + 4, (FIGHTER_WIDTH + 24) * cfg.scale, 12, 0x000000, 0.6).setDepth(0);
  const sprite = scene.add.rectangle(x, y, FIGHTER_WIDTH, FIGHTER_HEIGHT, color).setVisible(false);
  scene.physics.add.existing(sprite);
  sprite.body.setCollideWorldBounds(true);
  const g = scene.add.graphics().setDepth(2);   // Future: replace with a Phaser sprite

  return {
    name: name, cfg: cfg, g: g,
    sprite: sprite, shadow: shadow, faceMarker: NOOP, limb: NOOP,
    baseColor: color,
    hp: MAX_HP, showHp: MAX_HP, ghostHp: MAX_HP,
    state: S.IDLE,
    facing: name === 'player' ? 1 : -1,
    isAttacking: false,
    currentAttack: null,
    attackStartTime: 0,
    attackReadyAt: 0,
    hasHitThisAttack: false,
    isBlocking: false,
    stunUntil: 0,
    isDead: false,
    deathTime: 0,
    nextAttackTime: 0
  };
}

function updateFacing(fighter, opponent, now) {
  if (fighter.isDead || fighter.isAttacking || now < fighter.stunUntil) return;
  fighter.facing = opponent.sprite.x >= fighter.sprite.x ? 1 : -1;
}

function isOnGround(fighter) {
  const b = fighter.sprite.body;
  return b.touching.down || b.blocked.down;
}

function updateState(f, now, isEnemy) {
  let s;
  if (f.isDead) s = S.DEAD;
  else if (now < f.stunUntil) s = S.HIT;
  else if (f.isAttacking) s = S.ATTACK;
  else if (f.isBlocking) s = S.BLOCK;
  else if (!isOnGround(f)) s = S.JUMP;
  else if (Math.abs(f.sprite.body.velocity.x) > 10) s = isEnemy ? S.CHASE : S.RUN;
  else s = S.IDLE;
  if (s !== f.state) { f.state = s; onStateChange(f, s); }
}

function onStateChange(fighter, state) { /* hook for sprite sheets */ }

// ---- Procedural pose. Local space: x forward, y up, origin at the feet. ----
const DEG = Math.PI / 180;
function polar(o, a, l) { return { x: o.x + Math.sin(a * DEG) * l, y: o.y - Math.cos(a * DEG) * l }; }
function chain(o, a1, a2, l1, l2) { const m = polar(o, a1, l1); return [m, polar(m, a2, l2)]; }
const lerp = Phaser.Math.Linear;

function buildPose(f, now) {
  const c = f.cfg, st = f.state, s = c.scale, t = now / 1000;
  const br = Math.sin(t * 3 + c.phase);
  let lean = c.lean, tilt = 0, hipX = 0, bob = 0;
  let fl = [28, 4], bl = [-24, -8], fa = [35, 125], ba = [15, 105];

  if (st === S.RUN || st === S.CHASE) {
    const ph = now * (f.name === 'enemy' ? 0.010 : 0.014), sp = Math.sin(ph);
    fl = [sp * 46, sp * 46 - 32 * Math.max(0, Math.cos(ph))];
    bl = [-sp * 46, -sp * 46 - 32 * Math.max(0, -Math.cos(ph))];
    fa = [25 - sp * 38, 110 - sp * 30]; ba = [25 + sp * 38, 110 + sp * 30];
    lean += 9; bob = Math.abs(Math.cos(ph)) * 2.5;
  } else if (st === S.JUMP) {
    fl = [78, -18]; bl = [32, -58]; fa = [55, 150]; ba = [35, 140]; lean += 4;
  } else if (st === S.BLOCK) {
    fl = [38, -4]; bl = [-32, -6]; fa = [42, 168]; ba = [28, 155]; lean += 8;
  } else if (st === S.HIT) {
    lean = -16; tilt = -12; fa = [-25, 15]; ba = [-45, -5]; fl = [20, 8]; bl = [-30, -14];
  } else {
    bob = br * 1.2; lean += br * 1.5; fa[1] += br * 4;      // idle breathing (also base for DEAD/ATTACK)
  }

  if (st === S.ATTACK && f.currentAttack) {
    const a = f.currentAttack, el = now - f.attackStartTime;
    const e = el < a.startup ? el / a.startup
            : el < a.startup + a.active ? 1
            : Math.max(0, 1 - (el - a.startup - a.active) / (a.total - a.startup - a.active));
    if (f.currentAttackName === 'kick') {
      fl = [lerp(28, 85, e), lerp(4, 88, e)]; bl = [-8, -2];
      lean -= 10 * e; hipX = -2 * e; fa = [lerp(35, 15, e), lerp(125, 105, e)]; ba = [lerp(15, -35, e), lerp(105, 70, e)];
    } else {
      fa = [lerp(35, 88, e), lerp(125, 90, e)]; ba = [lerp(15, -10, e), lerp(105, 120, e)];
      lean += 12 * e; hipX = 6 * e;
    }
  }

  const L = 24, A = c.arm;
  const O = { x: 0, y: 0 };
  const fLeg = chain(O, fl[0], fl[1], L, L), bLeg = chain(O, bl[0], bl[1], L, L);
  const H = { x: hipX, y: -Math.min(fLeg[1].y, bLeg[1].y) + bob };
  const sh = function (p) { return { x: p.x + H.x, y: p.y + H.y }; };
  const lr = lean * DEG;
  const S_ = { x: H.x + Math.sin(lr) * c.torso, y: H.y + Math.cos(lr) * c.torso };
  const hd = (lean + tilt) * DEG;
  const Hd = { x: S_.x + Math.sin(hd) * (c.head + 3), y: S_.y + Math.cos(hd) * (c.head + 3) };
  const fArm = chain({ x: S_.x + 2, y: S_.y - 3 }, fa[0], fa[1], A, A);
  const bArm = chain({ x: S_.x - 2, y: S_.y - 3 }, ba[0], ba[1], A, A);
  const n = { x: Math.cos(lr), y: -Math.sin(lr) };
  const quad = [{ x: H.x + n.x * c.hw / 2, y: H.y + n.y * c.hw / 2 }, { x: S_.x + n.x * c.sw / 2, y: S_.y + n.y * c.sw / 2 },
                { x: S_.x - n.x * c.sw / 2, y: S_.y - n.y * c.sw / 2 }, { x: H.x - n.x * c.hw / 2, y: H.y - n.y * c.hw / 2 }];

  // Map local -> screen (death rotates the whole body backward around the feet)
  const rot = f.isDead ? Math.min(84, (now - f.deathTime) * 0.22) * DEG : 0;
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const fx = f.sprite.x, feetY = f.isDead ? GROUND_TOP : f.sprite.y + FIGHTER_HEIGHT / 2, d = f.facing;
  const T = function (p) {
    const x = p.x * cs - p.y * sn, y = p.x * sn + p.y * cs;
    return { x: fx + d * s * x, y: feetY - s * Math.max(1, y) };
  };
  const m2 = function (arr) { return [T(sh(arr[0])), T(sh(arr[1]))]; };
  return { H: T(H), S: T(S_), C: T(Hd), fLeg: m2(fLeg), bLeg: m2(bLeg), fArm: [T(fArm[0]), T(fArm[1])], bArm: [T(bArm[0]), T(bArm[1])],
           quad: quad.map(T), sway: Math.sin(now / 170) * 3 + (f.sprite.body ? f.sprite.body.velocity.x * -0.01 * d : 0) };
}

// One silhouette pass. `add` widens every part (used for the golden rim pass).
function paint(g, P, f, add, color, alpha) {
  const c = f.cfg, s = c.scale, d = f.facing, w = function (v) { return v * s + add; };
  g.fillStyle(color, alpha);
  seg(g, P.H, P.bLeg[0], w(c.legW)); seg(g, P.bLeg[0], P.bLeg[1], w(c.legW * 0.82));
  seg(g, P.S, P.bArm[0], w(c.armW)); seg(g, P.bArm[0], P.bArm[1], w(c.armW * 0.85));
  // torso (slightly grown for the rim pass)
  const q = P.quad, cx = (q[0].x + q[1].x + q[2].x + q[3].x) / 4, cy = (q[0].y + q[1].y + q[2].y + q[3].y) / 4;
  const k = add ? 1.18 : 1;
  g.fillPoints(q.map(function (p) { return { x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k }; }), true);
  if (c.kind === 'enemy') {
    g.fillCircle(P.S.x + d * 2, P.S.y + 2 * s, w(c.sw * 0.42));                       // pauldron
    g.fillPoints([{ x: P.H.x - d * 11 * s - add, y: P.H.y }, { x: P.H.x + d * 11 * s + add, y: P.H.y },
                  { x: P.H.x + d * 16 * s + add, y: P.H.y + 20 * s + add }, { x: P.H.x - d * 16 * s - add, y: P.H.y + 20 * s + add }], true); // armored skirt
  } else {
    g.fillTriangle(P.S.x, P.S.y - 2 - add, P.S.x - d * (22 + P.sway) - add, P.S.y + 6 + P.sway, P.S.x - d * 2, P.S.y + 8 + add); // scarf tail
  }
  seg(g, P.H, P.fLeg[0], w(c.legW)); seg(g, P.fLeg[0], P.fLeg[1], w(c.legW * 0.82));
  drawHead(g, c.kind, P.C.x, P.C.y, c.head * s + add / 2, d);
  seg(g, P.S, P.fArm[0], w(c.armW)); seg(g, P.fArm[0], P.fArm[1], w(c.armW * 0.85));
}

// Very dark brown highlight so the black body isn't completely flat
function highlight(g, P, f) {
  const c = f.cfg, s = c.scale, d = f.facing, q = P.quad;
  const cx = (q[0].x + q[1].x + q[2].x + q[3].x) / 4, cy = (q[0].y + q[1].y + q[2].y + q[3].y) / 4;
  g.fillStyle(C.BROWN, 0.9);
  g.fillPoints(q.map(function (p) { return { x: cx + (p.x - cx) * 0.5 + d * 2, y: cy + (p.y - cy) * 0.9 }; }), true);
  seg(g, P.H, P.fLeg[0], c.legW * s * 0.4); seg(g, P.S, P.fArm[0], c.armW * s * 0.4);
}

function updateFighterVisuals(f, now) {
  const P = buildPose(f, now);
  const g = f.g;
  g.clear();
  const rimAlpha = f.state === S.HIT ? 0.95 : f.state === S.BLOCK ? 0.6 : f.state === S.DEAD ? 0.15 : 0.38;
  paint(g, P, f, 3.5, f.state === S.HIT ? C.CREAM : C.GOLD, rimAlpha);   // golden rim (behind)
  paint(g, P, f, 0, C.BLACK, 1);                                           // black silhouette (on top)
  highlight(g, P, f);

  // Shadow: shrinks + fades in the air, larger on the ground
  const h = Math.max(0, GROUND_TOP - (f.sprite.y + FIGHTER_HEIGHT / 2));
  const sc = f.isDead ? 1.3 : Math.max(0.45, 1.1 - h / 260);
  f.shadow.setPosition(f.sprite.x + (f.isDead ? -f.facing * 30 : 0), GROUND_TOP + 4).setScale(sc, 1).setAlpha(f.isDead ? 0.5 : Math.max(0.2, 0.6 - h / 500));
}

// ---------------------------------------------------------------------
// 12. PLAYER CONTROLLER (unchanged)
// ---------------------------------------------------------------------
function updatePlayerController(now) {
  const p = player;
  const body = p.sprite.body;
  const onGround = isOnGround(p);

  const wantJump = input.jump, wantPunch = input.punch, wantKick = input.kick;
  input.jump = input.punch = input.kick = false;

  if (now < p.stunUntil) {
    p.isBlocking = false;
    body.setVelocityX(body.velocity.x * 0.9);
    return;
  }
  if (p.isAttacking) {
    if (onGround) body.setVelocityX(0);
    return;
  }

  p.isBlocking = input.block && onGround;
  if (p.isBlocking) { body.setVelocityX(0); return; }

  body.setVelocityX(input.moveX * PLAYER_SPEED);

  if (wantJump && onGround) body.setVelocityY(JUMP_SPEED);

  if (now >= p.attackReadyAt) {
    if (wantPunch) startAttack(p, 'punch');
    else if (wantKick) startAttack(p, 'kick');
  }
}

// ---------------------------------------------------------------------
// 13. ENEMY AI (unchanged)
// ---------------------------------------------------------------------
function updateEnemyAI(now) {
  const body = enemy.sprite.body;

  if (now < enemy.stunUntil) { body.setVelocityX(body.velocity.x * 0.9); return; }
  if (enemy.isAttacking) { body.setVelocityX(0); return; }

  const distance = Math.abs(player.sprite.x - enemy.sprite.x);
  if (player.isDead) { body.setVelocityX(0); return; }

  if (distance > ENEMY_ATTACK_RANGE) {
    body.setVelocityX(enemy.facing * ENEMY_SPEED);
  } else {
    body.setVelocityX(0);
    if (now >= enemy.nextAttackTime && now >= enemy.attackReadyAt) {
      startAttack(enemy, Phaser.Math.Between(0, 1) === 0 ? 'punch' : 'kick');
      enemy.nextAttackTime = now + Phaser.Math.Between(900, 1600);
    }
  }
}

// ---------------------------------------------------------------------
// 14. ATTACK SYSTEM (unchanged)
// ---------------------------------------------------------------------
function startAttack(fighter, name) {
  fighter.isAttacking = true;
  fighter.currentAttack = ATTACKS[name];
  fighter.currentAttackName = name;
  fighter.attackStartTime = scene.time.now;
  fighter.attackReadyAt = scene.time.now + ATTACKS[name].total + ATTACK_COOLDOWN;
  fighter.hasHitThisAttack = false;
  fighter.swingFx = false;
  Sound.play(name);
}

function getAttackHitbox(attacker, attack) {
  const half = FIGHTER_WIDTH / 2;
  const left = attacker.facing === 1
    ? attacker.sprite.x + half
    : attacker.sprite.x - half - attack.reach;
  const top = attacker.sprite.y + attack.yOffset - attack.height / 2;
  return new Phaser.Geom.Rectangle(left, top, attack.reach, attack.height);
}

function getFighterRect(f) {
  return new Phaser.Geom.Rectangle(f.sprite.x - FIGHTER_WIDTH / 2, f.sprite.y - FIGHTER_HEIGHT / 2,
    FIGHTER_WIDTH, FIGHTER_HEIGHT);
}

function updateAttack(attacker, defender) {
  if (!attacker.isAttacking) return;

  const attack = attacker.currentAttack;
  const elapsed = scene.time.now - attacker.attackStartTime;

  if (elapsed >= attack.total) { attacker.isAttacking = false; return; }

  const active = elapsed >= attack.startup && elapsed < attack.startup + attack.active;
  if (!active) return;

  const hitbox = getAttackHitbox(attacker, attack);

  if (!attacker.swingFx) { attacker.swingFx = true; spawnSwingFx(attacker, attack); }

  if (!attacker.hasHitThisAttack &&
      Phaser.Geom.Intersects.RectangleToRectangle(hitbox, getFighterRect(defender))) {
    attacker.hasHitThisAttack = true;
    applyHit(attacker, defender, attack);
  }
}

// ---------------------------------------------------------------------
// 15. DAMAGE, HIT REACTION, DEATH
// ---------------------------------------------------------------------
function applyHit(attacker, defender, attack) {
  const now = scene.time.now;
  let damage = attack.damage;
  const blocked = defender.isBlocking;
  const dir = attacker.facing;
  const strong = attack.damage >= 15;

  if (blocked) {
    damage = Math.round(damage * BLOCK_DAMAGE_MULTIPLIER);
    defender.sprite.body.setVelocityX(dir * 80);
    Sound.play('block');
  } else {
    defender.stunUntil = now + HIT_STUN_TIME;
    defender.isAttacking = false;
    defender.sprite.body.setVelocityX(dir * attack.knock);
    spawnKnockbackDust(defender, dir);
    Sound.play('hit');
  }

  defender.hp = Math.max(0, defender.hp - damage);

  spawnHitSpark(defender.sprite.x - dir * 10, defender.sprite.y + attack.yOffset, blocked, strong);
  scene.cameras.main.shake(blocked ? 50 : strong ? 140 : 90, blocked ? 0.0015 : strong ? 0.008 : 0.004);

  if (defender.hp <= 0) {
    defeatFighter(defender);
    endFight(attacker === player ? NAMES.player + ' WINS' : NAMES.enemy + ' WINS');
  }
}

// ---------------------------------------------------------------------
// 16. EFFECTS (Phaser shapes, gold/orange only)
// ---------------------------------------------------------------------
function fadeOut(obj, opts) {
  scene.tweens.add(Object.assign({ targets: obj, alpha: 0, duration: 250,
    onComplete: function () { obj.destroy(); } }, opts));
}

// Motion streak: small for punch, longer/thicker for kick
function spawnSwingFx(attacker, attack) {
  const hb = getAttackHitbox(attacker, attack);
  const isKick = attacker.currentAttackName === 'kick';
  const e = scene.add.ellipse(hb.centerX - attacker.facing * 15, hb.centerY,
    attack.reach + (isKick ? 45 : 20), isKick ? 26 : 12, attack.color, 0.55).setDepth(4);
  fadeOut(e, { scaleX: 1.4, scaleY: 0.3, duration: isKick ? 240 : 170 });
}

function spawnHitSpark(x, y, blocked, strong) {
  const color = blocked ? C.GOLD : C.LGOLD;
  const core = scene.add.circle(x, y, blocked ? 8 : strong ? 20 : 15, color, 0.9).setDepth(5);
  fadeOut(core, { scale: 2.2, duration: 220 });
  if (blocked) {
    const ring = scene.add.circle(x, y, 20).setStrokeStyle(3, C.GOLD).setDepth(5);
    fadeOut(ring, { scale: 1.7, duration: 240 });
  }
  const n = blocked ? 4 : strong ? 10 : 7;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const line = scene.add.rectangle(x, y, blocked ? 10 : 16, 2, i % 2 ? C.ORANGE : C.LGOLD).setRotation(a).setDepth(5);
    fadeOut(line, { x: x + Math.cos(a) * 50, y: y + Math.sin(a) * 50, duration: 240 });
  }
  if (!blocked) {   // ember burst
    for (let i = 0; i < (strong ? 9 : 6); i++) {
      const c = scene.add.circle(x, y, Phaser.Math.Between(2, 4), i % 2 ? C.ORANGE : C.GOLD).setDepth(5);
      fadeOut(c, { x: x + Phaser.Math.Between(-60, 60), y: y - Phaser.Math.Between(10, 70), duration: 500 });
    }
  }
}

function spawnKnockbackDust(defender, dir) {
  for (let i = 0; i < 4; i++) {
    const d = scene.add.circle(defender.sprite.x, GROUND_TOP - 4, Phaser.Math.Between(5, 9), 0x8a5a30, 0.5).setDepth(1);
    fadeOut(d, { x: d.x + dir * Phaser.Math.Between(20, 60), y: d.y - Phaser.Math.Between(5, 25), duration: 350 });
  }
}

function spawnDeathEffect(f) {
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2;
    const c = scene.add.circle(f.sprite.x, f.sprite.y, Phaser.Math.Between(3, 7), i % 2 ? C.GOLD : C.ORANGE).setDepth(6);
    fadeOut(c, { x: f.sprite.x + Math.cos(a) * Phaser.Math.Between(40, 110),
                 y: f.sprite.y + Math.sin(a) * Phaser.Math.Between(40, 110), duration: 600 });
  }
  scene.cameras.main.shake(250, 0.01);
}

function defeatFighter(f) {
  f.isDead = true;
  f.deathTime = scene.time.now;
  f.isAttacking = false;
  f.isBlocking = false;
  f.sprite.body.setVelocity(0, 0);
  f.sprite.body.enable = false;
  f.sprite.angle = 90;
  f.sprite.y = GROUND_TOP - FIGHTER_WIDTH / 2;
  spawnDeathEffect(f);
  Sound.play('death');
}

// ---------------------------------------------------------------------
// 17. TIMER, END OF FIGHT + RESTART
// ---------------------------------------------------------------------
function tickTimer() {
  if (fightState !== 'fighting') return;
  timeLeft = Math.max(0, timeLeft - 1);
  if (timeLeft === 0) {
    const msg = player.hp === enemy.hp ? 'DRAW' : (player.hp > enemy.hp ? NAMES.player : NAMES.enemy) + ' WINS';
    endFight(msg);
  }
}

function endFight(message) {
  fightState = 'over';
  resetInput();

  [player, enemy].forEach(function (f) {
    if (!f.isDead) {
      f.sprite.body.setVelocityX(0);
      f.isAttacking = false;
      f.isBlocking = false;
    }
  });

  const veil = scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH + 80, GAME_HEIGHT + 80, C.BLACK, 0.5)
    .setDepth(38).setScrollFactor(0).setAlpha(0);
  scene.tweens.add({ targets: veil, alpha: 1, duration: 600 });

  const title = scene.add.text(GAME_WIDTH / 2, 205, message, {
    fontSize: '64px', fontFamily: SERIF, fontStyle: 'bold', color: '#ffd76a'
  }).setOrigin(0.5).setDepth(40).setScrollFactor(0).setAlpha(0).setLetterSpacing(8).setShadow(0, 5, '#080604', 12, true, true);
  scene.tweens.add({ targets: title, alpha: 1, duration: 600 });

  const btn = scene.add.text(GAME_WIDTH / 2, 305, 'RESTART', {
    fontSize: '28px', fontFamily: SERIF, fontStyle: 'bold', color: '#ffd76a',
    backgroundColor: '#1a0f08', padding: { x: 30, y: 12 }
  }).setOrigin(0.5).setDepth(40).setScrollFactor(0).setLetterSpacing(6).setInteractive({ useHandCursor: true });

  btn.on('pointerover', function () { btn.setBackgroundColor('#a63d0d'); });
  btn.on('pointerout', function () { btn.setBackgroundColor('#1a0f08'); });
  btn.on('pointerdown', function () { scene.scene.restart(); });

  scene.input.keyboard.once('keydown-ENTER', function () { scene.scene.restart(); });
}

// ---------------------------------------------------------------------
// 18. HUD: portraits, ornate health bars, round timer
// ---------------------------------------------------------------------
function portrait(g, cx, cy, kind, d) {
  g.fillStyle(C.BLACK, 0.9); g.fillCircle(cx, cy, 34);
  g.fillStyle(C.BROWN, 1);   g.fillCircle(cx, cy, 31);
  g.fillStyle(C.DEEP, 0.55); g.fillCircle(cx, cy - 4, 24);
  g.fillStyle(C.GOLD, 0.45); g.fillCircle(cx, cy - 4, 15);
  g.fillStyle(C.BLACK, 1);
  const wd = kind === 'enemy' ? 1.1 : 1;
  g.fillPoints([{ x: cx - 20 * wd, y: cy + 24 }, { x: cx - 23 * wd, y: cy + 13 }, { x: cx - 11, y: cy + 7 },
                { x: cx + 11, y: cy + 7 }, { x: cx + 23 * wd, y: cy + 13 }, { x: cx + 20 * wd, y: cy + 24 }], true);
  drawHead(g, kind, cx, cy - 4, kind === 'enemy' ? 10.5 : 9.5, d);
  g.lineStyle(3, C.GOLD, 1); g.strokeCircle(cx, cy, 32);
  g.lineStyle(1, C.GOLD, 0.45); g.strokeCircle(cx, cy, 37);
}

function buildHUD() {
  const g = scene.add.graphics().setDepth(30).setScrollFactor(0);
  portrait(g, 60, 56, 'player', 1);
  portrait(g, GAME_WIDTH - 60, 56, 'enemy', -1);

  // decorative lines under the names / bars
  g.lineStyle(1, C.GOLD, 0.7);
  [[104, 434, 1], [GAME_WIDTH - 104, GAME_WIDTH - 434, -1]].forEach(function (l) {
    g.lineBetween(l[0], 72, l[1], 72);
    g.fillStyle(C.GOLD, 1); g.fillTriangle(l[1], 68, l[1] + l[2] * 8, 72, l[1], 76);
  });
  // timer medallion
  g.fillStyle(C.BLACK, 0.9); g.fillCircle(GAME_WIDTH / 2, 48, 27);
  g.lineStyle(2, C.GOLD, 1); g.strokeCircle(GAME_WIDTH / 2, 48, 27);
  g.lineStyle(1, C.GOLD, 0.5); g.strokeCircle(GAME_WIDTH / 2, 48, 32);
  g.lineBetween(GAME_WIDTH / 2 - 62, 48, GAME_WIDTH / 2 - 36, 48); g.lineBetween(GAME_WIDTH / 2 + 36, 48, GAME_WIDTH / 2 + 62, 48);

  hudBars = scene.add.graphics().setDepth(31).setScrollFactor(0);
  const nameStyle = { fontSize: '17px', fontFamily: SERIF, fontStyle: 'bold', color: '#ffd76a' };
  scene.add.text(108, 22, NAMES.player, nameStyle).setDepth(32).setScrollFactor(0).setLetterSpacing(5);
  scene.add.text(GAME_WIDTH - 108, 22, NAMES.enemy, nameStyle).setOrigin(1, 0).setDepth(32).setScrollFactor(0).setLetterSpacing(5);
  timerText = scene.add.text(GAME_WIDTH / 2, 48, String(ROUND_TIME), { fontSize: '24px', fontFamily: SERIF, fontStyle: 'bold', color: '#fff0b0' })
    .setOrigin(0.5).setDepth(32).setScrollFactor(0);
  scene.add.text(GAME_WIDTH / 2, 84, 'ROUND 1', { fontSize: '11px', fontFamily: SERIF, color: '#e5a83b' })
    .setOrigin(0.5).setDepth(32).setScrollFactor(0).setLetterSpacing(4).setAlpha(0.8);
}

function drawBar(g, x, y, w, h, f, flip, c1, c2) {
  g.fillStyle(C.BLACK, 0.9); g.fillRect(x - 3, y - 3, w + 6, h + 6);
  const gw = w * f.ghostHp / MAX_HP, fw = w * f.showHp / MAX_HP;
  g.fillStyle(C.DEEP, 0.9); g.fillRect(flip ? x + w - gw : x, y, gw, h);      // draining trail
  vgrad(g, flip ? x + w - fw : x, y, fw, h, c1, c2, 6, 1);
  g.fillStyle(C.BLACK, 0.45);
  for (let i = 1; i < 5; i++) g.fillRect(x + w * i / 5 - 1, y, 2, h);           // segment ticks
  g.lineStyle(2, C.GOLD, 1); g.strokeRect(x - 3, y - 3, w + 6, h + 6);
  const ex = flip ? x - 3 : x + w + 3, dx = flip ? -9 : 9;                      // diamond end cap
  g.fillStyle(C.GOLD, 1); g.fillTriangle(ex, y + h / 2 - 7, ex + dx, y + h / 2, ex, y + h / 2 + 7);
}

function drawHealthBars() {
  [player, enemy].forEach(function (f) {
    f.showHp += (f.hp - f.showHp) * 0.15;
    if (f.ghostHp > f.hp) f.ghostHp = Math.max(f.hp, f.ghostHp - 0.35); else f.ghostHp = f.hp;
  });
  const g = hudBars, w = 320, h = 16, y = 40;
  g.clear();
  drawBar(g, 108, y, w, h, player, false, C.GOLD, C.LGOLD);
  drawBar(g, GAME_WIDTH - 108 - w, y, w, h, enemy, true, C.DEEP, C.ORANGE);

  timerText.setText(String(timeLeft));
  timerText.setColor(timeLeft <= 10 ? '#d96b16' : '#fff0b0');
}
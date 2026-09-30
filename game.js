// =====================================================================
// SHADOW FIGHTER - Version 2 (mobile-ready prototype)
// Built on Version 1: same combat timeline, hitboxes, AI and physics.
// New: unified input, joystick + buttons, fighter states, effects,
//      responsive UI, sound/sprite hooks.
// =====================================================================

// ---------------------------------------------------------------------
// 1. SETTINGS
// ---------------------------------------------------------------------
const GAME_WIDTH = 960;
const GAME_HEIGHT = 540;
const GROUND_TOP = 480;

const FIGHTER_WIDTH = 50;
const FIGHTER_HEIGHT = 100;

const PLAYER_SPEED = 220;
const ENEMY_SPEED = 120;
const JUMP_SPEED = -520;

const MAX_HP = 100;
const HIT_STUN_TIME = 300;
const BLOCK_DAMAGE_MULTIPLIER = 0.2;
const ATTACK_COOLDOWN = 120;      // extra pause after recovery before the next attack
const ENEMY_ATTACK_RANGE = 85;
const JOY_DEADZONE = 0.2;
const ROUND_LENGTH = 99;
const COLORS = {
  black: 0x080604,
  brown: 0x1a0f08,
  deepOrange: 0xa63d0d,
  orange: 0xd96b16,
  gold: 0xe5a83b,
  lightGold: 0xffd76a,
  cream: 0xfff0b0
};

// times in ms. total = startup + active + recovery
const ATTACKS = {
  punch:   { damage: 10, startup: 100, active: 120, total: 350, reach: 55, height: 24, yOffset: -20, color: 0xffd76a, knock: 220 },
  kick:  { damage: 15, startup: 180, active: 140, total: 550, reach: 75, height: 24, yOffset: 25,  color: 0xd96b16, knock: 320 }
};

// Fighter states (used for future sprite animations)
const S = { IDLE: 'IDLE', RUN: 'RUN', JUMP: 'JUMP', ATTACK: 'ATTACK', BLOCK: 'BLOCK',
            HIT: 'HIT', DEAD: 'DEAD', CHASE: 'CHASE' };

// Sprite sheet names for later. Placeholders are used until these are loaded.
// Files: assets/player/player_idle.png ... assets/enemy/enemy_death.png
const SPRITE_KEYS = ['idle', 'run', 'jump', 'punch', 'kick', 'block', 'hit', 'death'];

// ---------------------------------------------------------------------
// 2. GLOBALS
// ---------------------------------------------------------------------
let scene, player, enemy, fightState, healthBarGraphics, hpTexts, timerText, roundTimer = ROUND_LENGTH;
let atmosphericParticles = [];
let cameraFocusX = GAME_WIDTH / 2;

// ---------------------------------------------------------------------
// 3. UNIFIED INPUT
// Keyboard, joystick and buttons ALL write here. The player controller
// only reads `input`. (jump/punch/kick are one-shot triggers; the
// controller clears them once read. moveX and block are held values.)
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

// --- Keyboard (registered once) ---
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

// --- Virtual joystick (horizontal only) ---
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
  // Knob stays inside the base (circular clamp), but only dx drives movement.
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

// --- Action buttons ---
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
// Later: scene.load.audio('punch', 'assets/audio/punch.mp3') and play below.
// Names: punch, kick, hit, block, death, music
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
  backgroundColor: '#0d0d1a',
  input: { touch: { capture: false } },
  physics: { default: 'arcade', arcade: { gravity: { y: 900 }, debug: false } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },  // keeps 16:9
  scene: { create: create, update: update }
});

// ---------------------------------------------------------------------
// 6. CREATE
// ---------------------------------------------------------------------
function create() {
  scene = this;
  resetInput();
  updateRoundTimer.startedAt = null;
  cameraFocusX = GAME_WIDTH / 2;

  drawBackground();

  drawArenaFloor();
  const ground = scene.add.rectangle(GAME_WIDTH / 2, GROUND_TOP + 30, GAME_WIDTH, 60, 0x000000, 0);
  scene.physics.add.existing(ground, true);

  player = createFighter(250, 400, 0x2ecc71, 'player');
  enemy = createFighter(710, 400, 0xe74c3c, 'enemy');

  scene.physics.add.collider(player.sprite, ground);
  scene.physics.add.collider(enemy.sprite, ground);
  scene.physics.add.collider(player.sprite, enemy.sprite);

  // Cinematic HUD
  healthBarGraphics = scene.add.graphics().setDepth(10).setScrollFactor(0);
  const label = { fontSize: '16px', fontFamily: 'Arial', color: '#fff0b0', letterSpacing: 3 };
  scene.add.text(108, 24, 'KAAL', label).setDepth(10).setScrollFactor(0);
  scene.add.text(GAME_WIDTH - 108, 24, 'RAAVAN', label).setOrigin(1, 0).setDepth(10).setScrollFactor(0);
  const hpStyle = { fontSize: '13px', fontFamily: 'Arial', color: '#fff0b0', stroke: '#080604', strokeThickness: 3 };
  hpTexts = {
    player: scene.add.text(420, 58, '100', hpStyle).setOrigin(1, 0.5).setDepth(11).setScrollFactor(0),
    enemy: scene.add.text(540, 58, '100', hpStyle).setOrigin(0, 0.5).setDepth(11).setScrollFactor(0)
  };

  drawPortrait(52, 48, false);
  drawPortrait(GAME_WIDTH - 52, 48, true);
  timerText = scene.add.text(GAME_WIDTH / 2, 22, String(ROUND_LENGTH), {
    fontSize: '29px', fontFamily: 'Arial', color: '#fff0b0',
    stroke: '#080604', strokeThickness: 5
  }).setOrigin(0.5, 0).setDepth(12).setScrollFactor(0);

  enemy.nextAttackTime = scene.time.now + 1500;

  fightState = 'intro';
  roundTimer = ROUND_LENGTH;
  const roundText = scene.add.text(GAME_WIDTH / 2, 220, 'ROUND  01', {
    fontSize: '30px', fontFamily: 'Arial', color: '#fff0b0',
    letterSpacing: 7, stroke: '#080604', strokeThickness: 6
  }).setOrigin(0.5).setDepth(20).setScrollFactor(0).setAlpha(0);
  scene.tweens.add({ targets: roundText, alpha: 1, duration: 400, yoyo: true, hold: 450 });
  scene.time.delayedCall(1250, function () {
    roundText.setText('FIGHT').setFontSize(52).setLetterSpacing(10).setAlpha(0);
    scene.tweens.add({ targets: roundText, alpha: 1, duration: 180, yoyo: true, hold: 300,
      onComplete: function () {
        roundText.destroy();
        fightState = 'fighting';
        enemy.nextAttackTime = scene.time.now + 1200;
      }
    });
  });
}

// ---------------------------------------------------------------------
// 7. UPDATE
// ---------------------------------------------------------------------
function update() {
  const now = scene.time.now;

  if (fightState === 'fighting') {
    updateFacing(player, enemy, now);
    updateFacing(enemy, player, now);
    updatePlayerController(now);
    updateEnemyAI(now);
    updateAttack(player, enemy);
    if (fightState === 'fighting') updateAttack(enemy, player);
  } else {
    // Intro / over: keep facing but ignore input
    input.jump = input.punch = input.kick = false;
    updateFacing(player, enemy, now);
    updateFacing(enemy, player, now);
  }

  updateState(player, now, false);
  updateState(enemy, now, true);
  updateFighterVisuals(player, now);
  updateFighterVisuals(enemy, now);
  updateAtmosphere(now);
  updateCamera();
  if (fightState === 'fighting') updateRoundTimer(now);
  drawHealthBars();
}

// ---------------------------------------------------------------------
// 8. BACKGROUND
// ---------------------------------------------------------------------
function drawBackground() {
  const g = scene.add.graphics().setDepth(-10);
  g.fillGradientStyle(0x1a0f08, 0x080604, 0x241106, 0x080604, 1);
  g.fillRect(-80, 0, GAME_WIDTH + 160, GAME_HEIGHT);

  // Layered amber haze and the sun create a backlight behind the fighters.
  g.fillStyle(COLORS.deepOrange, 0.12); g.fillCircle(480, 290, 330);
  g.fillStyle(COLORS.orange, 0.12); g.fillCircle(480, 280, 250);
  g.fillStyle(COLORS.gold, 0.1); g.fillCircle(480, 265, 190);
  g.fillStyle(COLORS.deepOrange, 0.14); g.fillCircle(480, 270, 170);
  g.fillStyle(COLORS.orange, 0.2); g.fillCircle(480, 270, 145);
  g.fillStyle(COLORS.gold, 0.35); g.fillCircle(480, 270, 119);
  g.fillStyle(COLORS.lightGold, 0.92); g.fillCircle(480, 270, 96);
  g.fillStyle(COLORS.cream, 0.32); g.fillCircle(480, 270, 82);

  // Distant mountain ridges.
  g.fillStyle(0x39200d, 0.82);
  fillPolygon(g, [[-80, 414], [100, 300], [210, 365], [330, 283], [500, 400], [650, 310], [830, 392], [1000, 290], [1040, 440]], 0x39200d, 0.82);
  g.fillStyle(0x211208, 0.95);
  fillPolygon(g, [[-60, 435], [120, 355], [260, 402], [420, 340], [590, 418], [780, 350], [990, 420], [1020, 460]], 0x211208);

  // Ancient gate and temple roofs, kept low-contrast against the sun.
  drawTempleSilhouette(g, 175, 300, 0.9);
  drawTempleSilhouette(g, 790, 315, 1.1);
  g.fillStyle(0x130b06, 0.92);
  fillPolygon(g, [[-40, 455], [25, 416], [80, 434], [130, 405], [210, 456], [300, 423], [350, 455], [430, 425], [510, 458], [600, 420], [680, 454], [760, 415], [850, 455], [920, 426], [1000, 458], [1010, 485], [-40, 485]], 0x130b06, 0.92);
  drawAtmosphericParticles();
}

function fillPolygon(g, points, color, alpha) {
  g.fillStyle(color, alpha === undefined ? 1 : alpha);
  g.beginPath();
  g.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) g.lineTo(points[i][0], points[i][1]);
  g.closePath();
  g.fillPath();
}

function drawTempleSilhouette(g, x, baseY, scale) {
  const width = 118 * scale;
  const topY = baseY - 120 * scale;
  g.fillStyle(0x140b05, 0.93);
  g.fillRect(x - width * 0.38, topY + 24 * scale, width * 0.76, 96 * scale);
  fillPolygon(g, [[x - width * 0.55, topY + 28 * scale], [x, topY], [x + width * 0.55, topY + 28 * scale]], 0x140b05, 0.95);
  fillPolygon(g, [[x - width * 0.68, topY + 35 * scale], [x, topY + 10 * scale], [x + width * 0.68, topY + 35 * scale], [x + width * 0.53, topY + 42 * scale], [x - width * 0.53, topY + 42 * scale]], 0x241106);
  for (let i = -1; i <= 1; i++) {
    g.fillStyle(0x080604, 1);
    g.fillRect(x + i * 27 * scale - 5 * scale, topY + 48 * scale, 10 * scale, 72 * scale);
  }
  g.fillStyle(COLORS.orange, 0.18);
  g.fillRect(x - width * 0.34, baseY - 3 * scale, width * 0.68, 2 * scale);
}

function drawArenaFloor() {
  const g = scene.add.graphics().setDepth(-1);
  g.fillGradientStyle(0x100a06, 0x080604, 0x080604, 0x030302, 1);
  g.fillRect(-40, GROUND_TOP - 4, GAME_WIDTH + 80, GAME_HEIGHT - GROUND_TOP + 80);
  g.fillStyle(COLORS.deepOrange, 0.22);
  g.fillRect(-20, GROUND_TOP - 4, GAME_WIDTH + 40, 2);
  g.lineStyle(1, COLORS.orange, 0.22);
  for (let i = 0; i < 10; i++) {
    const y = GROUND_TOP + 15 + i * 9;
    g.lineBetween(0, y, GAME_WIDTH, y + (i % 2 ? 1 : 0));
  }
  g.lineStyle(2, COLORS.gold, 0.18);
  [[110, 482, 148, 506], [148, 506, 183, 510], [350, 484, 326, 509],
    [608, 483, 639, 507], [639, 507, 680, 512], [832, 483, 808, 507]].forEach(function (line) {
    g.lineBetween(line[0], line[1], line[2], line[3]);
  });
  g.lineStyle(1, COLORS.orange, 0.14);
  g.lineBetween(300, 495, 660, 495);
  g.lineBetween(390, 510, 570, 510);
}

function drawAtmosphericParticles() {
  atmosphericParticles = [];
  for (let i = 0; i < 24; i++) {
    const radius = Phaser.Math.FloatBetween(1, 2.6);
    const particle = scene.add.circle(
      Phaser.Math.Between(0, GAME_WIDTH),
      Phaser.Math.Between(100, GROUND_TOP - 8),
      radius,
      i % 4 === 0 ? COLORS.lightGold : COLORS.orange,
      Phaser.Math.FloatBetween(0.2, 0.65)
    ).setDepth(i % 3 === 0 ? 0 : -2);
    atmosphericParticles.push({
      object: particle,
      drift: Phaser.Math.FloatBetween(-5, 5),
      speed: Phaser.Math.FloatBetween(5, 15),
      phase: Phaser.Math.FloatBetween(0, Math.PI * 2)
    });
  }
}

function updateAtmosphere(now) {
  const delta = Math.min(scene.game.loop.delta, 50) / 1000;
  atmosphericParticles.forEach(function (particle) {
    const obj = particle.object;
    obj.x += particle.drift * delta;
    obj.y -= particle.speed * delta;
    obj.alpha = 0.2 + (Math.sin(now / 700 + particle.phase) + 1) * 0.2;
    if (obj.y < 110) {
      obj.y = GROUND_TOP - 10;
      obj.x = Phaser.Math.Between(0, GAME_WIDTH);
    }
    if (obj.x < -5) obj.x = GAME_WIDTH + 5;
    if (obj.x > GAME_WIDTH + 5) obj.x = -5;
  });
}

function drawPortrait(x, y, enemyPortrait) {
  const g = scene.add.graphics().setDepth(11).setScrollFactor(0);
  g.fillStyle(COLORS.black, 0.96); g.fillCircle(x, y, 27);
  g.lineStyle(2, enemyPortrait ? COLORS.orange : COLORS.lightGold, 0.9); g.strokeCircle(x, y, 29);
  g.lineStyle(1, COLORS.gold, 0.45); g.strokeCircle(x, y, 33);
  g.fillStyle(0x211208, 1); g.fillEllipse(x, y + 13, 27, 21);
  g.fillStyle(COLORS.black, 1);
  if (enemyPortrait) {
    fillPolygon(g, [[x - 12, y - 7], [x - 11, y - 19], [x, y - 27], [x + 12, y - 17], [x + 11, y - 7], [x + 8, y + 1], [x - 9, y + 1]], COLORS.black);
    g.fillTriangle(x - 11, y - 16, x - 19, y - 25, x - 9, y - 21);
    g.fillTriangle(x + 11, y - 16, x + 19, y - 25, x + 9, y - 21);
  } else {
    g.fillEllipse(x, y - 10, 20, 25);
    fillPolygon(g, [[x - 13, y - 11], [x, y - 30], [x + 13, y - 11], [x + 8, y - 5], [x - 8, y - 5]], COLORS.black);
  }
  g.fillStyle(COLORS.gold, 0.75);
  g.fillRect(x - 8, y + 4, 16, 2);
}

function drawFighterSilhouette(f, now) {
  const g = f.visual;
  g.clear();

  const enemyStyle = f.name === 'enemy';
  const shoulder = enemyStyle ? 23 : 19;
  const hip = enemyStyle ? 15 : 12;
  const legWidth = enemyStyle ? 13 : 10;
  const armWidth = enemyStyle ? 12 : 9;
  const run = (f.state === S.RUN || f.state === S.CHASE) ? Math.sin(now / 90) : 0;
  const bob = f.state === S.IDLE ? Math.sin(now / 290) * 1.5 : 0;
  const airborne = f.state === S.JUMP;
  const attacking = f.state === S.ATTACK;
  const blocked = f.state === S.BLOCK;
  const attackName = f.currentAttackName;
  const attackProgress = attacking ? Math.min(1, (now - f.attackStartTime) / (f.currentAttack ? f.currentAttack.total : 1)) : 0;
  const punchReach = attacking && attackName === 'punch' ? 26 + Math.sin(attackProgress * Math.PI) * 19 : 0;
  const kickReach = attacking && attackName === 'kick' ? Math.sin(attackProgress * Math.PI) * 30 : 0;
  const tuck = airborne ? 9 : 0;
  const legFront = blocked ? 5 : run * 10;
  const legBack = blocked ? -5 : -run * 10;
  const shoulderY = -21 + bob;
  const hipY = 13 + bob;
  const shoulderX = enemyStyle ? 1 : 0;
  const torsoTop = enemyStyle ? -24 : -22;
  const torsoBottom = enemyStyle ? 22 : 18;
  const headY = -38 + bob;

  function limb(x1, y1, x2, y2, width) {
    g.lineStyle(width + 3, COLORS.gold, 0.18);
    g.lineBetween(x1, y1, x2, y2);
    g.lineStyle(width, COLORS.black, 1);
    g.lineBetween(x1, y1, x2, y2);
  }
  function joint(x, y, radius) {
    g.fillStyle(COLORS.gold, 0.15); g.fillCircle(x, y, radius + 2);
    g.fillStyle(COLORS.black, 1); g.fillCircle(x, y, radius);
  }

  // Rear arm and legs sit behind the torso.
  limb(shoulderX - shoulder * 0.55, shoulderY, -17, -2 + legBack * 0.25, armWidth);
  limb(-17, -2 + legBack * 0.25, -20 + legBack * 0.4, 10, armWidth - 1);
  limb(-hip, hipY, -hip - legBack * 0.55, 31 - tuck, legWidth);
  limb(-hip - legBack * 0.55, 31 - tuck, -hip - legBack, 48 - tuck, legWidth - 2);

  // Golden rim, dark torso, and a restrained warm sash define the silhouette.
  fillPolygon(g, [[-shoulder, torsoTop + 5], [-shoulder * 0.65, torsoTop], [shoulder * 0.65, torsoTop],
    [shoulder, torsoTop + 5], [hip, torsoBottom - 3], [hip * 0.7, torsoBottom + 4],
    [-hip * 0.7, torsoBottom + 4], [-hip, torsoBottom - 3]], COLORS.gold, 0.25);
  fillPolygon(g, [[-shoulder + 2, torsoTop + 6], [-shoulder * 0.58, torsoTop + 2], [shoulder * 0.58, torsoTop + 2],
    [shoulder - 2, torsoTop + 6], [hip - 2, torsoBottom - 4], [hip * 0.58, torsoBottom + 2],
    [-hip * 0.58, torsoBottom + 2], [-hip + 2, torsoBottom - 4]], COLORS.black);
  g.fillStyle(0x44200b, 0.9);
  g.fillRect(-hip * 0.85, 4 + bob, hip * 1.7, 4);

  // Front arm changes pose with block/punch and the legs extend into a kick.
  let frontElbowX = shoulderX + shoulder + (blocked ? -4 : punchReach * 0.55);
  let frontElbowY = blocked ? -23 : -6 + bob;
  let frontHandX = shoulderX + shoulder * 1.55 + punchReach;
  let frontHandY = blocked ? -35 : 9 + bob;
  if (blocked) { frontElbowX = shoulderX + shoulder + 2; frontHandX = shoulderX + shoulder * 0.4; }
  limb(shoulderX + shoulder * 0.55, shoulderY, frontElbowX, frontElbowY, armWidth);
  limb(frontElbowX, frontElbowY, frontHandX, frontHandY, armWidth - 1);
  joint(frontElbowX, frontElbowY, armWidth * 0.52);
  joint(frontHandX, frontHandY, armWidth * 0.48);

  limb(hip, hipY, hip + legFront * 0.5 + kickReach * 0.2, 31 - tuck, legWidth);
  limb(hip + legFront * 0.5 + kickReach * 0.2, 31 - tuck, hip + legFront + kickReach, 48 - tuck, legWidth - 2);
  joint(hip + legFront * 0.5 + kickReach * 0.2, 31 - tuck, legWidth * 0.52);

  // Hooded head for KAAL; RAAVAN's broader helm and crown keep the two silhouettes distinct.
  g.fillStyle(COLORS.gold, 0.23); g.fillEllipse(0, headY, enemyStyle ? 29 : 25, enemyStyle ? 32 : 30);
  g.fillStyle(COLORS.black, 1); g.fillEllipse(0, headY, enemyStyle ? 26 : 22, enemyStyle ? 29 : 27);
  if (enemyStyle) {
    fillPolygon(g, [[-13, headY - 6], [-18, headY - 17], [-8, headY - 13], [0, headY - 22],
      [8, headY - 13], [18, headY - 17], [13, headY - 5]], COLORS.black);
  } else {
    fillPolygon(g, [[-12, headY - 6], [-9, headY - 23], [0, headY - 29], [10, headY - 22], [13, headY - 5], [7, headY - 1], [-8, headY - 1]], COLORS.black);
    g.lineStyle(2, COLORS.gold, 0.35); g.lineBetween(-9, headY - 12, 9, headY - 12);
  }
  g.fillStyle(COLORS.lightGold, f.state === S.HIT ? 0.9 : 0.48);
  g.fillRect(4, headY - 1, 6, 2);
}

function updateCamera() {
  const midpoint = (player.sprite.x + enemy.sprite.x) / 2;
  const targetX = Phaser.Math.Clamp(midpoint, GAME_WIDTH / 2 - 25, GAME_WIDTH / 2 + 25);
  cameraFocusX += (targetX - cameraFocusX) * 0.025;
  scene.cameras.main.scrollX = cameraFocusX - GAME_WIDTH / 2;
}

function updateRoundTimer(now) {
  if (updateRoundTimer.startedAt === null) updateRoundTimer.startedAt = now;
  const next = Math.max(0, ROUND_LENGTH - Math.floor((now - updateRoundTimer.startedAt) / 1000));
  if (next !== roundTimer) {
    roundTimer = next;
    timerText.setText(String(roundTimer).padStart(2, '0'));
  }
  if (roundTimer <= 0) {
    const result = player.hp === enemy.hp ? 'DRAW' :
      (player.hp > enemy.hp ? 'KAAL WINS!' : 'RAAVAN WINS!');
    endFight(result);
  }
}

// ---------------------------------------------------------------------
// 9. FIGHTERS
// ---------------------------------------------------------------------
function createFighter(x, y, color, name) {
  const shadow = scene.add.ellipse(x, GROUND_TOP + 4, FIGHTER_WIDTH + 38, 15, COLORS.black, 0.72).setDepth(1);
  const sprite = scene.add.rectangle(x, y, FIGHTER_WIDTH, FIGHTER_HEIGHT, color).setAlpha(0).setDepth(2);
  scene.physics.add.existing(sprite);
  sprite.body.setCollideWorldBounds(true);
  const faceMarker = scene.add.rectangle(x, y, 1, 1, COLORS.black).setVisible(false).setDepth(3);
  const limb = scene.add.rectangle(0, 0, 1, 1, COLORS.black).setVisible(false).setDepth(3);
  const visual = scene.add.graphics().setDepth(3);

  return {
    name: name, displayName: name === 'player' ? 'KAAL' : 'RAAVAN',
    sprite: sprite, shadow: shadow, faceMarker: faceMarker, limb: limb, visual: visual,
    // Future: replace `sprite` with a Phaser sprite and play `${name}_${state}` animations.
    baseColor: color,
    hp: MAX_HP,
    displayHp: MAX_HP,
    state: S.IDLE,
    facing: name === 'player' ? 1 : -1,
    isAttacking: false,
    currentAttack: null,
    attackStartTime: 0,
    attackReadyAt: 0,          // cooldown: can't start a new attack before this
    hasHitThisAttack: false,
    isBlocking: false,
    stunUntil: 0,
    isDead: false,
    nextAttackTime: 0
  };
}

// Fighters turn toward the opponent, except while attacking or stunned
function updateFacing(fighter, opponent, now) {
  if (fighter.isDead || fighter.isAttacking || now < fighter.stunUntil) return;
  fighter.facing = opponent.sprite.x >= fighter.sprite.x ? 1 : -1;
}

function isOnGround(fighter) {
  const b = fighter.sprite.body;
  return b.touching.down || b.blocked.down;
}

// Derives the state name. Animations can hook into onStateChange later.
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

// Hook for sprite sheets, e.g. f.sprite.play(f.name + '_' + s.toLowerCase())
function onStateChange(fighter, state) { /* placeholder */ }

function updateFighterVisuals(f, now) {
  const height = Math.max(0, (GROUND_TOP - FIGHTER_HEIGHT / 2) - f.sprite.y);
  const shadowScale = Math.max(0.4, 1 - height / 300);
  f.shadow.setPosition(f.sprite.x, GROUND_TOP + 3).setScale(shadowScale, shadowScale);
  f.visual.setPosition(f.sprite.x, f.sprite.y).setScale(f.facing, 1)
    .setRotation(f.isDead ? Math.PI / 2 : (f.state === S.HIT ? -f.facing * 0.1 : 0));
  drawFighterSilhouette(f, now);

  // The floor shadow contracts while airborne to make jumps read clearly.
}

// ---------------------------------------------------------------------
// 10. PLAYER CONTROLLER (reads only `input`)
// ---------------------------------------------------------------------
function updatePlayerController(now) {
  const p = player;
  const body = p.sprite.body;
  const onGround = isOnGround(p);

  // Read and clear one-shot triggers so old presses never get "stored"
  const wantJump = input.jump, wantPunch = input.punch, wantKick = input.kick;
  input.jump = input.punch = input.kick = false;

  if (now < p.stunUntil) {                 // stunned
    p.isBlocking = false;
    body.setVelocityX(body.velocity.x * 0.9);
    return;
  }
  if (p.isAttacking) {                     // mid-attack
    if (onGround) body.setVelocityX(0);
    return;
  }

  p.isBlocking = input.block && onGround;  // blocking: no moving
  if (p.isBlocking) { body.setVelocityX(0); return; }

  body.setVelocityX(input.moveX * PLAYER_SPEED);

  if (wantJump && onGround) body.setVelocityY(JUMP_SPEED);

  if (now >= p.attackReadyAt) {
    if (wantPunch) startAttack(p, 'punch');
    else if (wantKick) startAttack(p, 'kick');
  }
}

// ---------------------------------------------------------------------
// 11. ENEMY AI (IDLE -> CHASE -> ATTACK -> HIT -> DEAD)
// ---------------------------------------------------------------------
function updateEnemyAI(now) {
  const body = enemy.sprite.body;

  if (now < enemy.stunUntil) { body.setVelocityX(body.velocity.x * 0.9); return; }   // HIT
  if (enemy.isAttacking) { body.setVelocityX(0); return; }                            // ATTACK

  const distance = Math.abs(player.sprite.x - enemy.sprite.x);
  if (player.isDead) { body.setVelocityX(0); return; }                                // IDLE

  if (distance > ENEMY_ATTACK_RANGE) {
    body.setVelocityX(enemy.facing * ENEMY_SPEED);                                    // CHASE
  } else {
    body.setVelocityX(0);
    if (now >= enemy.nextAttackTime && now >= enemy.attackReadyAt) {
      startAttack(enemy, Phaser.Math.Between(0, 1) === 0 ? 'punch' : 'kick');
      enemy.nextAttackTime = now + Phaser.Math.Between(900, 1600);
    }
  }
}

// ---------------------------------------------------------------------
// 12. ATTACK SYSTEM
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
  if (!attacker.isAttacking) { attacker.limb.setVisible(false); return; }

  const attack = attacker.currentAttack;
  const elapsed = scene.time.now - attacker.attackStartTime;

  if (elapsed >= attack.total) {
    attacker.isAttacking = false;
    attacker.limb.setVisible(false);
    return;
  }

  const active = elapsed >= attack.startup && elapsed < attack.startup + attack.active;
  if (!active) { attacker.limb.setVisible(false); return; }

  const hitbox = getAttackHitbox(attacker, attack);
  attacker.limb.setVisible(false);

  if (!attacker.swingFx) { attacker.swingFx = true; spawnSwingFx(attacker, attack); }

  if (!attacker.hasHitThisAttack &&
      Phaser.Geom.Intersects.RectangleToRectangle(hitbox, getFighterRect(defender))) {
    attacker.hasHitThisAttack = true;
    applyHit(attacker, defender, attack);
  }
}

// ---------------------------------------------------------------------
// 13. DAMAGE, HIT REACTION, DEATH
// ---------------------------------------------------------------------
function applyHit(attacker, defender, attack) {
  const now = scene.time.now;
  let damage = attack.damage;
  const blocked = defender.isBlocking;
  const dir = attacker.facing;

  if (blocked) {
    damage = Math.round(damage * BLOCK_DAMAGE_MULTIPLIER);
    defender.sprite.body.setVelocityX(dir * 80);          // small push, no stun
    Sound.play('block');
  } else {
    defender.stunUntil = now + HIT_STUN_TIME;
    defender.isAttacking = false;                          // hit interrupts attacks
    defender.limb.setVisible(false);
    defender.sprite.body.setVelocityX(dir * attack.knock);
    spawnKnockbackDust(defender, dir);
    Sound.play('hit');
  }

  defender.hp = Math.max(0, defender.hp - damage);

  spawnHitSpark(defender.sprite.x - dir * 10, defender.sprite.y + attack.yOffset, blocked);
  const isKick = attack === ATTACKS.kick;
  scene.cameras.main.shake(blocked ? 45 : (isKick ? 110 : 75), blocked ? 0.0015 : (isKick ? 0.006 : 0.0035));

  if (defender.hp <= 0) {
    defeatFighter(defender);
    endFight(attacker === player ? 'PLAYER WINS!' : 'ENEMY WINS!');
  }
}

// ---------------------------------------------------------------------
// 14. EFFECTS (all generated with Phaser shapes)
// ---------------------------------------------------------------------
function fadeOut(obj, opts) {
  scene.tweens.add(Object.assign({ targets: obj, alpha: 0, duration: 250,
    onComplete: function () { obj.destroy(); } }, opts));
}

// Punch / kick swoosh: a stretched ellipse behind the swing
function spawnSwingFx(attacker, attack) {
  const hb = getAttackHitbox(attacker, attack);
  const isKick = attacker.currentAttackName === 'kick';
  const e = scene.add.ellipse(hb.centerX - attacker.facing * 15, hb.centerY,
    attack.reach + 25, isKick ? 22 : 14, attack.color, 0.5).setDepth(4);
  fadeOut(e, { scaleX: 1.4, scaleY: 0.4, duration: 180 });
}

// Warm impact flare; blocks use a restrained gold ring.
function spawnHitSpark(x, y, blocked) {
  const color = blocked ? COLORS.gold : COLORS.cream;
  const core = scene.add.circle(x, y, blocked ? 10 : 16, color).setDepth(5);
  fadeOut(core, { scale: 2.2, duration: 250 });
  if (blocked) {
    const ring = scene.add.circle(x, y, 22).setStrokeStyle(3, COLORS.orange, 0.8).setDepth(5);
    fadeOut(ring, { scale: 1.8, duration: 250 });
  }
  for (let i = 0; i < (blocked ? 4 : 7); i++) {
    const a = Math.random() * Math.PI * 2;
    const line = scene.add.rectangle(x, y, blocked ? 10 : 18, 2, i % 2 ? COLORS.orange : color).setRotation(a).setDepth(5);
    fadeOut(line, { x: x + Math.cos(a) * (blocked ? 28 : 45), y: y + Math.sin(a) * (blocked ? 28 : 45), duration: 220 });
  }
}

// Dust puffs at the feet in the knockback direction
function spawnKnockbackDust(defender, dir) {
  for (let i = 0; i < 4; i++) {
    const d = scene.add.circle(defender.sprite.x, GROUND_TOP - 4, Phaser.Math.Between(5, 9), COLORS.orange, 0.45).setDepth(1);
    fadeOut(d, { x: d.x + dir * Phaser.Math.Between(20, 60), y: d.y - Phaser.Math.Between(5, 25), duration: 350 });
  }
}

function spawnDeathEffect(f) {
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2;
    const c = scene.add.circle(f.sprite.x, f.sprite.y, Phaser.Math.Between(4, 8), COLORS.gold).setDepth(6);
    fadeOut(c, { x: f.sprite.x + Math.cos(a) * Phaser.Math.Between(40, 110),
                 y: f.sprite.y + Math.sin(a) * Phaser.Math.Between(40, 110), duration: 600 });
  }
  scene.cameras.main.shake(250, 0.01);
}

function defeatFighter(f) {
  f.isDead = true;
  f.isAttacking = false;
  f.isBlocking = false;
  f.limb.setVisible(false);
  f.faceMarker.setVisible(false);
  f.sprite.body.setVelocity(0, 0);
  f.sprite.body.enable = false;
  f.sprite.angle = 90;
  f.sprite.y = GROUND_TOP - FIGHTER_WIDTH / 2;
  spawnDeathEffect(f);
  Sound.play('death');
}

// ---------------------------------------------------------------------
// 15. END OF FIGHT + RESTART
// ---------------------------------------------------------------------
function endFight(message) {
  fightState = 'over';
  resetInput();

  [player, enemy].forEach(function (f) {
    if (!f.isDead) {
      f.sprite.body.setVelocityX(0);
      f.isAttacking = false;
      f.isBlocking = false;
      f.limb.setVisible(false);
    }
  });

  scene.add.text(GAME_WIDTH / 2, 200, message, {
    fontSize: '54px', fontFamily: 'Arial', color: '#fff0b0',
    stroke: '#080604', strokeThickness: 8, letterSpacing: 4
  }).setOrigin(0.5).setDepth(20).setScrollFactor(0);

  const btn = scene.add.text(GAME_WIDTH / 2, 300, 'RESTART', {
    fontSize: '23px', fontFamily: 'Arial', color: '#fff0b0',
    backgroundColor: '#1a0f08', padding: { x: 28, y: 14 },
    stroke: '#e5a83b', strokeThickness: 1, letterSpacing: 4
  }).setOrigin(0.5).setDepth(20).setScrollFactor(0).setInteractive({ useHandCursor: true });

  btn.on('pointerover', function () { btn.setBackgroundColor('#44200b'); });
  btn.on('pointerout', function () { btn.setBackgroundColor('#1a0f08'); });
  btn.on('pointerdown', function () { scene.scene.restart(); });   // create() resets everything

  // Keyboard restart too (Enter)
  scene.input.keyboard.once('keydown-ENTER', function () { scene.scene.restart(); });
}

// ---------------------------------------------------------------------
// 16. HEALTH BARS (player drains left-to-right, enemy right-to-left)
// ---------------------------------------------------------------------
function drawHealthBars() {
  const w = 310, h = 16, y = 48;
  const px = 108, ex = GAME_WIDTH - 108 - w;
  const g = healthBarGraphics;
  g.clear();

  player.displayHp += (player.hp - player.displayHp) * 0.16;
  enemy.displayHp += (enemy.hp - enemy.displayHp) * 0.16;
  if (Math.abs(player.hp - player.displayHp) < 0.08) player.displayHp = player.hp;
  if (Math.abs(enemy.hp - enemy.displayHp) < 0.08) enemy.displayHp = enemy.hp;
  const pf = w * (player.displayHp / MAX_HP), ef = w * (enemy.displayHp / MAX_HP);

  g.fillStyle(COLORS.black, 0.96);
  g.fillRect(px, y, w, h); g.fillRect(ex, y, w, h);
  g.fillStyle(COLORS.gold, 1); g.fillRect(px, y, pf, h);
  g.fillStyle(COLORS.orange, 1); g.fillRect(ex + w - ef, y, ef, h);
  g.fillStyle(COLORS.cream, 0.5);
  g.fillRect(px, y, pf, 2);
  g.fillRect(ex + w - ef, y, ef, 2);
  g.lineStyle(2, COLORS.gold, 0.82);
  g.strokeRect(px, y, w, h); g.strokeRect(ex, y, w, h);
  g.lineStyle(1, COLORS.orange, 0.55);
  g.lineBetween(px - 8, y - 4, px, y);
  g.lineBetween(px + w, y + h, px + w + 8, y + h + 4);
  g.lineBetween(ex - 8, y + h, ex, y + h - 4);
  g.lineBetween(ex + w, y, ex + w + 8, y - 4);

  hpTexts.player.setText(String(player.hp).padStart(3, '0'));
  hpTexts.enemy.setText(String(enemy.hp).padStart(3, '0'));
}

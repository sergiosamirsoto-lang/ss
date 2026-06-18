const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const W = 900, H = 500;

const p1HealthEl = document.getElementById('p1-health');
const p2HealthEl = document.getElementById('p2-health');
const timerEl = document.getElementById('timer');
const roundTextEl = document.getElementById('round-text');
const scoreEl = document.getElementById('score');
const overlay = document.getElementById('message-overlay');
const msgTitle = document.getElementById('message-title');
const msgSub = document.getElementById('message-sub');
const restartBtn = document.getElementById('restart-btn');

const GROUND = 420;
const GRAVITY = 0.6;
const ARENA_LEFT = 40;
const ARENA_RIGHT = 860;

class Fighter {
  constructor(x, dir, name, cs) {
    this.x = x; this.y = GROUND;
    this.w = 50; this.h = 90;
    this.dir = dir; this.name = name; this.cs = cs;
    this.vx = 0; this.vy = 0;
    this.health = 100; this.maxHealth = 100;
    this.speed = 4; this.jumpPower = -11;
    this.onGround = true;
    this.attacking = false; this.attackType = null;
    this.attackTimer = 0; this.attackCooldown = 0;
    this.blocking = false; this.hitTimer = 0;
    this.wins = 0; this.facingRight = dir === 1;
    this.idleTimer = 0;
  }

  reset(x, dir) {
    this.x = x; this.y = GROUND;
    this.vx = 0; this.vy = 0;
    this.health = 100; this.onGround = true;
    this.attacking = false; this.attackType = null;
    this.attackTimer = 0; this.attackCooldown = 0;
    this.blocking = false; this.hitTimer = 0;
    this.facingRight = dir === 1; this.idleTimer = 0;
  }

  get left() { return this.x - this.w / 2; }
  get right() { return this.x + this.w / 2; }
  get top() { return this.y - this.h; }
  get bottom() { return this.y; }

  move(left, right, jump) {
    if (this.hitTimer > 0) return;
    if (jump && this.onGround) { this.vy = this.jumpPower; this.onGround = false; }
    if (left) { this.vx = -this.speed; this.facingRight = false; }
    else if (right) { this.vx = this.speed; this.facingRight = true; }
    else { this.vx *= 0.7; if (Math.abs(this.vx) < 0.3) this.vx = 0; }
  }

  startBlock(b) { this.blocking = b; }

  attack(type) {
    if (this.attackCooldown > 0 || this.attacking || this.hitTimer > 0) return;
    this.attacking = true;
    this.attackType = type;
    this.attackTimer = type.duration;
    this.attackCooldown = type.cooldown;
  }

  update() {
    if (this.hitTimer > 0) this.hitTimer--;
    if (this.attackCooldown > 0) this.attackCooldown--;
    if (this.attacking) {
      this.attackTimer--;
      if (this.attackTimer <= 0) { this.attacking = false; this.attackType = null; }
    }
    this.vy += GRAVITY;
    this.x += this.vx;
    this.y += this.vy;
    if (this.y > GROUND) { this.y = GROUND; this.vy = 0; this.onGround = true; }
    if (this.x - this.w / 2 < ARENA_LEFT) this.x = ARENA_LEFT + this.w / 2;
    if (this.x + this.w / 2 > ARENA_RIGHT) this.x = ARENA_RIGHT - this.w / 2;
    this.idleTimer += 0.02;
  }

  takeDamage(amount) {
    if (this.blocking) amount = Math.floor(amount * 0.2);
    this.health = Math.max(0, this.health - amount);
    this.hitTimer = 12;
  }

  getAttackBox() {
    if (!this.attacking || !this.attackType) return null;
    const fx = this.facingRight ? 1 : -1;
    return { x: this.x + fx * 20, y: this.y - this.h * 0.7, w: this.attackType.reach, h: this.h * 0.6 };
  }

  draw(ctx) {
    const f = this.facingRight ? 1 : -1;
    const flash = this.hitTimer > 0 && this.hitTimer % 4 < 2;
    ctx.save();
    ctx.translate(this.x, this.y);

    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 4, 30, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    const bodyY = -this.h;

    // Legs
    ctx.strokeStyle = flash ? '#fff' : this.cs.pants;
    ctx.lineWidth = 10; ctx.lineCap = 'round';
    if (this.attacking && this.attackType && this.attackType.name === 'kick') {
      ctx.beginPath(); ctx.moveTo(-8 * f, -20); ctx.lineTo(35 * f, -10); ctx.stroke();
      ctx.strokeStyle = flash ? '#fff' : '#3a1a0a'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(35 * f, -10); ctx.lineTo(50 * f, -8); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(-8, -20); ctx.lineTo(-5, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(8, -20); ctx.lineTo(5, 0); ctx.stroke();
    }

    // Torso
    const lean = this.attacking ? f * 10 : 0;
    ctx.fillStyle = flash ? '#fff' : this.cs.torso;
    ctx.beginPath();
    ctx.moveTo(-18 + lean, bodyY + 15);
    ctx.lineTo(18 + lean, bodyY + 15);
    ctx.lineTo(18 + lean, bodyY + 55);
    ctx.lineTo(-18 + lean, bodyY + 55);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 2;
    ctx.stroke();

    // Arms
    ctx.strokeStyle = flash ? '#fff' : this.cs.skin;
    ctx.lineWidth = 8; ctx.lineCap = 'round';
    if (this.blocking) {
      ctx.beginPath(); ctx.moveTo(-16, bodyY + 25); ctx.lineTo(-22, bodyY + 15); ctx.lineTo(-14, bodyY + 20); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(16, bodyY + 25); ctx.lineTo(22, bodyY + 15); ctx.lineTo(14, bodyY + 20); ctx.stroke();
    } else if (this.attacking && this.attackType) {
      const at = this.attackType; const a = f;
      if (at.name === 'punch') {
        ctx.beginPath(); ctx.moveTo(a * 14, bodyY + 25); ctx.lineTo(a * 45, bodyY + 18); ctx.lineTo(a * 55, bodyY + 15); ctx.stroke();
      } else if (at.name === 'special') {
        ctx.beginPath(); ctx.moveTo(a * 14, bodyY + 25); ctx.lineTo(a * 40, bodyY + 5); ctx.lineTo(a * 55, bodyY - 10); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.moveTo(a * 14, bodyY + 25); ctx.lineTo(a * 30, bodyY + 18); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(-a * 14, bodyY + 25); ctx.lineTo(-a * 24, bodyY + 22); ctx.stroke();
    } else {
      const sway = Math.sin(this.idleTimer * 2) * 3;
      ctx.beginPath(); ctx.moveTo(-16 + sway, bodyY + 25); ctx.lineTo(-24 + sway, bodyY + 10); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(16 - sway, bodyY + 25); ctx.lineTo(24 - sway, bodyY + 10); ctx.stroke();
    }

    // Head
    ctx.fillStyle = flash ? '#fff' : this.cs.skin;
    ctx.beginPath(); ctx.arc(0 + lean * 0.3, bodyY + 5, 16, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 2; ctx.stroke();

    // Eyes
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-5 + lean * 0.3, bodyY + 2, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(5 + lean * 0.3, bodyY + 2, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(-5 + lean * 0.3 + f * 1.5, bodyY + 2, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(5 + lean * 0.3 + f * 1.5, bodyY + 2, 2, 0, Math.PI * 2); ctx.fill();

    // Mouth
    ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
    ctx.beginPath();
    if (this.hitTimer > 0) ctx.arc(0 + lean * 0.3, bodyY + 12, 5, 0, Math.PI, true);
    else ctx.arc(0 + lean * 0.3, bodyY + 11, 4, 0.1, Math.PI - 0.1);
    ctx.stroke();

    ctx.restore();
  }
}

const atk = {
  punch: { name: 'punch', damage: 7, reach: 40, duration: 10, cooldown: 14, knockback: 4 },
  kick: { name: 'kick', damage: 10, reach: 50, duration: 14, cooldown: 20, knockback: 7 },
  special: { name: 'special', damage: 18, reach: 60, duration: 18, cooldown: 35, knockback: 12 }
};

const p1 = new Fighter(200, 1, 'SCORPION', { torso: '#8b0000', pants: '#4a0000', skin: '#d4a574' });
const p2 = new Fighter(700, -1, 'SUB-ZERO', { torso: '#0044aa', pants: '#002266', skin: '#e8c090' });

const keys = {};
let timer = 99, round = 1, p1Score = 0, p2Score = 0;
let state = 'intro', stateTimer = 0;
let particles = [], shakeX = 0, shakeY = 0, hitStop = 0;

function spawnParticles(x, y, color, count = 12) {
  for (let i = 0; i < count; i++) {
    particles.push({ x, y, vx: (Math.random() - 0.5) * 10, vy: -Math.random() * 8 - 2, life: 30 + Math.random() * 20, maxLife: 50, color, size: 3 + Math.random() * 5 });
  }
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.3; p.life--;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function drawParticles() {
  for (const p of particles) {
    const a = p.life / p.maxLife;
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function rectCollide(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function checkHit(attacker, defender) {
  const box = attacker.getAttackBox();
  if (!box) return null;
  const db = { x: defender.x - defender.w / 2, y: defender.y - defender.h, w: defender.w, h: defender.h };
  return rectCollide(box, db) ? attacker.attackType : null;
}

function pushApart() {
  const o = 10;
  if (p1.right + o > p2.left && p1.left < p2.right + o) {
    const mid = (p1.x + p2.x) / 2;
    const dist = p1.w + o;
    p1.x = mid - dist / 2; p2.x = mid + dist / 2;
    p1.x = Math.max(ARENA_LEFT + p1.w / 2, Math.min(ARENA_RIGHT - p1.w / 2, p1.x));
    p2.x = Math.max(ARENA_LEFT + p2.w / 2, Math.min(ARENA_RIGHT - p2.w / 2, p2.x));
  }
}

function showMessage(title, sub) {
  msgTitle.textContent = title; msgSub.textContent = sub || '';
  overlay.classList.remove('hidden');
}

function hideMessage() { overlay.classList.add('hidden'); }

function updateUI() {
  p1HealthEl.style.width = (p1.health / p1.maxHealth * 100) + '%';
  p2HealthEl.style.width = (p2.health / p2.maxHealth * 100) + '%';
  timerEl.textContent = Math.ceil(timer);
}

function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0d0505'); g.addColorStop(0.4, '#1a0808');
  g.addColorStop(0.7, '#2a1010'); g.addColorStop(1, '#1a0a0a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = 'rgba(255, 200, 100, 0.15)';
  ctx.beginPath(); ctx.arc(750, 80, 50, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255, 200, 100, 0.08)';
  ctx.beginPath(); ctx.arc(750, 80, 80, 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = 'rgba(40, 20, 20, 0.4)';
  for (let i = 0; i < 5; i++) { const px = 100 + i * 180; ctx.fillRect(px, 100, 18, 320); ctx.fillRect(px - 20, 100, 58, 12); }

  ctx.fillStyle = '#2a1a1a'; ctx.fillRect(0, GROUND + 5, W, H - GROUND);
  ctx.fillStyle = '#1a0a0a'; ctx.fillRect(0, GROUND + 5, W, 3);

  ctx.strokeStyle = 'rgba(60, 30, 30, 0.3)'; ctx.lineWidth = 1;
  for (let i = 0; i < 20; i++) { ctx.beginPath(); ctx.moveTo(i * 48, GROUND + 8); ctx.lineTo(i * 48 + 24, GROUND + 8); ctx.stroke(); }
}

function startRound() {
  p1.reset(200, 1); p2.reset(700, -1);
  timer = 99; particles = [];
  state = 'countdown'; stateTimer = 100;
  hideMessage();
  roundTextEl.textContent = 'ROUND ' + round;
  updateUI();
}

function endRound(winner) {
  if (winner === 1) p1Score++; else p2Score++;
  scoreEl.textContent = p1Score + ' - ' + p2Score;
  if (p1Score >= 2) {
    state = 'gameover';
    showMessage('SCORPION GANA', '¡' + p1.name + ' es el campeón!');
  } else if (p2Score >= 2) {
    state = 'gameover';
    showMessage('SUB-ZERO GANA', '¡' + p2.name + ' es el campeón!');
  } else {
    state = 'roundend'; round++;
    showMessage(winner === 1 ? 'SCORPION' : 'SUB-ZERO', '¡Gana la ronda!');
    setTimeout(startRound, 2000);
  }
  updateUI();
}

let countdownText = '';

function gameLoop() {
  if (state === 'countdown') {
    p1.update(); p2.update(); pushApart();
    stateTimer--;
    const t = Math.ceil(stateTimer / 25);
    const texts = ['3', '2', '1', 'FIGHT!'];
    countdownText = texts[Math.min(3, 3 - t)] || 'FIGHT!';
    if (stateTimer <= 0) { state = 'fighting'; hideMessage(); }
  }

  if (state === 'fighting') {
    p1.move(!!keys['a'], !!keys['d'], !!keys['w']);
    p1.startBlock(!!keys['s']);
    if (keys['j']) p1.attack(atk.punch);
    if (keys['k']) p1.attack(atk.kick);
    if (keys['l']) p1.attack(atk.special);

    p2.move(!!keys['ArrowLeft'], !!keys['ArrowRight'], !!keys['ArrowUp']);
    p2.startBlock(!!keys['ArrowDown']);
    if (keys['1']) p2.attack(atk.punch);
    if (keys['2']) p2.attack(atk.kick);
    if (keys['3']) p2.attack(atk.special);

    p1.update(); p2.update(); pushApart();

    if (hitStop === 0) {
      let a = checkHit(p1, p2);
      if (a) {
        p2.takeDamage(a.damage); p2.vx += (p2.x - p1.x > 0 ? 1 : -1) * a.knockback;
        spawnParticles(p2.x, p2.y - p2.h / 2, '#ff4400'); spawnParticles(p2.x, p2.y - p2.h / 2, '#ffcc00');
        hitStop = 4; shakeX = (Math.random() - 0.5) * 8; shakeY = (Math.random() - 0.5) * 4;
      }
      a = checkHit(p2, p1);
      if (a) {
        p1.takeDamage(a.damage); p1.vx += (p1.x - p2.x > 0 ? 1 : -1) * a.knockback;
        spawnParticles(p1.x, p1.y - p1.h / 2, '#00aaff'); spawnParticles(p1.x, p1.y - p1.h / 2, '#ffffff');
        hitStop = 4; shakeX = (Math.random() - 0.5) * 8; shakeY = (Math.random() - 0.5) * 4;
      }
    }

    shakeX *= 0.8; shakeY *= 0.8;
    if (hitStop > 0) hitStop--;
    timer -= 1 / 60;
    if (timer <= 0) timer = 0;
    updateUI();

    if (p1.health <= 0) { spawnParticles(p1.x, p1.y - p1.h / 2, '#ff2200', 30); endRound(2); }
    else if (p2.health <= 0) { spawnParticles(p2.x, p2.y - p2.h / 2, '#ff2200', 30); endRound(1); }
    else if (timer <= 0) {
      if (p1.health > p2.health) endRound(1);
      else if (p2.health > p1.health) endRound(2);
      else endRound(Math.random() < 0.5 ? 1 : 2);
    }
  }

  if (state !== 'countdown' && state !== 'fighting') {
    p1.update(); p2.update(); updateParticles();
  }

  ctx.save();
  ctx.translate(shakeX, shakeY);
  ctx.clearRect(-5, -5, W + 10, H + 10);
  drawBackground();
  p1.draw(ctx); p2.draw(ctx);
  updateParticles(); drawParticles();

  if (state === 'countdown') {
    ctx.fillStyle = '#ffcc00';
    ctx.font = '100px "Passion One", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(255, 0, 0, 0.6)'; ctx.shadowBlur = 40;
    ctx.fillText(countdownText, W / 2, H / 2 - 20);
    ctx.shadowBlur = 0;
  }

  ctx.restore();
  requestAnimationFrame(gameLoop);
}

document.addEventListener('keydown', (e) => {
  keys[e.key] = true;
  if ((e.key === 'Enter' || e.key === ' ') && state === 'gameover') restartGame();
  e.preventDefault();
});
document.addEventListener('keyup', (e) => { keys[e.key] = false; e.preventDefault(); });
restartBtn.addEventListener('click', restartGame);

function restartGame() {
  p1Score = 0; p2Score = 0; round = 1;
  scoreEl.textContent = '0 - 0'; roundTextEl.textContent = 'ROUND 1';
  hideMessage(); startRound();
}

startRound();

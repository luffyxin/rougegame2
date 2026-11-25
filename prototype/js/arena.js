/**
 * Survivor-style auto combat. Formation center kites by itself;
 * player only watches (optional speed buttons). Build choices stay in prep / level-up.
 */

import { CLUTCH, DROP, ITEMS, waveConfig, facingAngle, slotOffset } from './data.js';

function rand(a, b) {
  return a + Math.random() * (b - a);
}

function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function norm(x, y) {
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l };
}

export class Arena {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} opts
   */
  constructor(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = opts;
    this.running = false;
    this.paused = false;
    this._raf = 0;
    this._last = 0;
    this.timeScale = 1.6;
  }

  setTimeScale(scale) {
    this.timeScale = scale;
  }

  /**
   * @param {{
   *   units: { defId: string, slot?: number, star?: number, facing?: number, wander?: boolean }[],
   *   laws: string[],
   *   mods?: Record<string, any>,
   *   wave: number,
   *   itemChoices?: () => { id: string, name: string, desc: string }[],
   *   onItemPicked?: (id: string) => void,
   *   onLevelUp: (choices: any[], pick: (id: string) => void) => void,
   *   onEnd: (result: { won: boolean, kills: number, gold: number, xp: number, level: number }) => void,
   * }} cfg
   */
  start(cfg) {
    this.stop();
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.cfg = cfg;
    this.laws = new Set(cfg.laws || []);
    this.mods = {
      dmg: 1, rate: 1, area: 1, magnet: 1, hp: 0, burstBonus: 0,
      contactResist: 0, rangedDmg: 1, rangedRange: 1, bladeDmg: 1,
      arcaneDmg: 1, arcaneArea: 1, ringArea: 1, critChance: 0,
      ...(cfg.mods || {}),
    };
    this.wave = cfg.wave || 1;
    this.wcfg = cfg.waveConfig || waveConfig(this.wave);
    this.time = 0;
    this.waveLen = this.wcfg.duration;
    this.bossAlive = false;
    this.kills = 0;
    this.xp = 0;
    this.level = 1;
    this.xpToLevel = this.wcfg.xpToFirst;
    this.pendingLevel = false;
    this.buffs = {
      dmg: this.mods.dmg,
      rate: this.mods.rate,
      area: this.mods.area,
      magnet: this.mods.magnet,
    };
    this.killStack = 0;
    this.shake = 0;
    this.flash = 0;
    this.goldLoot = 0;
    this.invuln = 0;
    this.overclock = 0;
    this.banners = [];
    this.floaters = [];

    const maxHp = 80 + (this.mods.hp || 0);
    this.player = {
      x: w * 0.5,
      y: h * 0.55,
      hp: maxHp,
      maxHp,
      radius: 16,
      speed: 130,
      vx: 0,
      vy: 0,
    };

    this.weapons = cfg.units.map((u, i) => this._makeWeapon(u, i));
    this.enemies = [];
    this.gems = [];
    this.projectiles = [];
    this.echoes = [];
    this.particles = [];
    this.spawnAcc = 0;
    this.orbitPhase = 0;

    if (this.wcfg.boss) {
      this._spawnBoss();
      this._banner(`${this.wcfg.act.name} · Boss 来袭`, '#d4a017');
    } else {
      this._banner(`${this.wcfg.act.name} · 第 ${this.wave} 波`, '#8aa093');
    }

    this.running = true;
    this.paused = false;
    this._last = performance.now();
    this._raf = requestAnimationFrame((t) => this._frame(t));
  }

  _makeWeapon(u, i) {
    const def = this.opts.units[u.defId];
    const star = u.star || 1;
    const starMult = star === 3 ? 3 : star === 2 ? 1.75 : 1;
    const slot = u.slot != null ? u.slot : i;
    const off = slotOffset(slot, 52);
    const ox = off.x;
    const oy = off.y;
    const facing = u.facing ?? 2;
    // ★1 melee stands still; ★★+ or 游猎符 unlocks walk (passed as u.wander)
    const canWander = !!(u.wander) && def.kind === 'melee' && def.id !== 'drone';
    return {
      def,
      star,
      starMult,
      slot,
      facing,
      faceAng: facingAngle(facing),
      ox,
      oy,
      x: this.player.x + ox,
      y: this.player.y + oy,
      vx: 0,
      vy: 0,
      radius: def.id === 'bulwark' ? 14 : 11,
      autonomous: canWander,
      mode: 'guard', // guard | engage | block
      blockT: 0,
      cd: rand(0, 0.4),
      angle: -Math.PI / 2 + slot * (Math.PI / 4),
      moveSpeed: def.id === 'bulwark' ? 155 : 195,
      leash: def.id === 'bulwark' ? 160 : 210,
    };
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._raf);
  }

  applyLevelPick(id) {
    // Permanent item — parent grants into run inventory; apply mild mid-wave bonus too
    if (this.cfg.onItemPicked) this.cfg.onItemPicked(id);
    if (id === 'whetstone') this.buffs.dmg *= 1.15;
    if (id === 'rapid_core') this.buffs.rate *= 1.15;
    if (id === 'wide_lens') this.buffs.area *= 1.15;
    if (id === 'iron_heart' || id === 'spare_slot') {
      this.player.maxHp += 35;
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 25);
    }
    if (id === 'magnet_ring') this.buffs.magnet *= 1.5;
    if (id === 'blood_charm') this.mods.burstBonus = (this.mods.burstBonus || 0) + 0.12;
    this.pendingLevel = false;
    this.paused = false;
  }

  _weaponDmg(wp) {
    const def = wp.def;
    let dmg = def.damage * wp.starMult * this.buffs.dmg;
    if (def.traits.includes('blade')) dmg *= this.mods.bladeDmg || 1;
    if (def.traits.includes('ranged') || def.kind === 'bolt') dmg *= this.mods.rangedDmg || 1;
    if (def.traits.includes('arcane')) dmg *= this.mods.arcaneDmg || 1;
    if (this.mods.critChance && def.kind === 'bolt' && Math.random() < this.mods.critChance) {
      dmg *= 2;
    }
    return dmg;
  }

  _weaponRange(wp) {
    const def = wp.def;
    let r = def.range * this.buffs.area;
    if (def.kind === 'bolt' || def.traits.includes('ranged')) r *= this.mods.rangedRange || 1;
    if (def.traits.includes('arcane') && def.kind === 'aura') r *= this.mods.arcaneArea || 1;
    if (def.traits.includes('ring')) r *= this.mods.ringArea || 1;
    // star stretch: ★ short, ★★ / ★★★ reach farther
    if (def.kind === 'melee' && def.id !== 'drone') {
      const star = wp.star || 1;
      r *= star >= 3 ? 1.35 : star >= 2 ? 1.18 : 0.92;
    }
    return r;
  }

  _frame(now) {
    if (!this.running) return;
    const raw = Math.min(0.05, (now - this._last) / 1000);
    this._last = now;
    const dt = this.paused ? 0 : raw * this.timeScale;

    if (dt > 0) this._update(dt);
    this._draw();
    this._raf = requestAnimationFrame((t) => this._frame(t));
  }

  _update(dt) {
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 2.2);
    this.flash = Math.max(0, this.flash - dt * 3);
    this.orbitPhase += dt;

    this.invuln = Math.max(0, this.invuln - dt);
    this.overclock = Math.max(0, this.overclock - dt);
    this._movePlayer(dt);
    this._updateFighters(dt);
    this._spawn(dt);
    this._weapons(dt);
    this._projectiles(dt);
    this._echoes(dt);
    this._enemies(dt);
    this._gems(dt);
    this._particles(dt);
    this._tickFx(dt);

    if (this.player.hp <= 0) {
      this._finish(false);
      return;
    }
    // Boss waves: survive duration AND boss dead (or time out with boss low)
    if (this.wcfg.boss) {
      const boss = this.enemies.find((e) => e.boss);
      if (!boss && this.time > 8) {
        this._finish(true);
        return;
      }
      if (this.time >= this.waveLen) {
        // time-out: must nearly kill boss (≤15%) or fail
        if (!boss || boss.hp / boss.maxHp <= 0.15) this._finish(true);
        else this._finish(false);
      }
      return;
    }
    if (this.time >= this.waveLen) {
      this._finish(true);
    }
  }

  _hasMeleeWeapons() {
    return this.weapons.some((wp) => wp.def.kind === 'melee');
  }

  _movePlayer(dt) {
    // Keep a "melee sweet ring" (~90–140) when we have melee, instead of always kiting to infinity.
    const p = this.player;
    let fx = 0;
    let fy = 0;
    const melee = this._hasMeleeWeapons();
    const panicR = melee ? 62 : 90;
    const holdR = melee ? 125 : 160;

    for (const e of this.enemies) {
      const d = dist(p, e) || 1;
      const threat = e.boss ? 2.2 : e.elite ? 1.5 : 1;
      if (d < panicR) {
        // too close: step out
        const push = threat * (panicR - d) / d;
        fx -= (e.x - p.x) * push * 1.4;
        fy -= (e.y - p.y) * push * 1.4;
      } else if (melee && d > holdR && d < 230) {
        // feed melee: drift toward mid-range packs
        const pull = threat * (d - holdR) / d * 0.45;
        fx += (e.x - p.x) * pull;
        fy += (e.y - p.y) * pull;
      } else if (!melee && d < holdR) {
        const push = threat * (holdR - d) / d * 0.7;
        fx -= (e.x - p.x) * push;
        fy -= (e.y - p.y) * push;
      }
    }

    let bestGem = null;
    let bestD = 160;
    for (const g of this.gems) {
      const d = dist(p, g);
      if (d < bestD) {
        bestD = d;
        bestGem = g;
      }
    }
    if (bestGem && this.enemies.length < 18) {
      fx += (bestGem.x - p.x) * 0.3;
      fy += (bestGem.y - p.y) * 0.3;
    }

    const cx = this.canvas.width * 0.5;
    const cy = this.canvas.height * 0.52;
    fx += (cx - p.x) * 0.08;
    fy += (cy - p.y) * 0.08;

    if (this.enemies.length < 4) {
      fx += Math.cos(this.time * 0.9) * 40;
      fy += Math.sin(this.time * 0.7) * 40;
    }

    const n = norm(fx, fy);
    const wantX = n.x * p.speed;
    const wantY = n.y * p.speed;
    p.vx += (wantX - p.vx) * Math.min(1, dt * 6);
    p.vy += (wantY - p.vy) * Math.min(1, dt * 6);
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    const pad = 36;
    p.x = clamp(p.x, pad, this.canvas.width - pad);
    p.y = clamp(p.y, pad, this.canvas.height - pad);
  }

  _spawn(dt) {
    // ramp within wave so openings feel safer, endings denser
    const ramp = 0.75 + Math.min(1.4, this.time / this.waveLen);
    const density = this.wcfg.spawnPerSec * ramp;
    this.spawnAcc += dt * density;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      this._spawnOne();
    }
  }

  _spawnOne() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const side = Math.floor(Math.random() * 4);
    let x = 0;
    let y = 0;
    if (side === 0) { x = rand(0, w); y = -20; }
    if (side === 1) { x = rand(0, w); y = h + 20; }
    if (side === 2) { x = -20; y = rand(0, h); }
    if (side === 3) { x = w + 20; y = rand(0, h); }
    const elite = Math.random() < this.wcfg.eliteChance;
    const hp = elite ? this.wcfg.eliteHp : this.wcfg.enemyHp;
    this.enemies.push({
      x, y,
      hp,
      maxHp: hp,
      speed: elite ? this.wcfg.enemySpeed * 0.75 : this.wcfg.enemySpeed + Math.random() * 20,
      radius: elite ? 16 : 10,
      elite,
      touch: elite ? this.wcfg.eliteTouch : this.wcfg.touch,
    });
  }

  _spawnBoss() {
    const w = this.canvas.width;
    this.enemies.push({
      x: w * 0.5,
      y: -40,
      hp: this.wcfg.bossHp,
      maxHp: this.wcfg.bossHp,
      speed: this.wcfg.bossSpeed,
      radius: 28,
      elite: true,
      boss: true,
      touch: this.wcfg.bossTouch,
    });
    this.bossAlive = true;
  }

  _updateFighters(dt) {
    for (const wp of this.weapons) {
      wp.blockT = Math.max(0, wp.blockT - dt);

      // Stationary melee / ranged / aura: glued to formation slot, fixed facing
      if (!wp.autonomous) {
        if (wp.def.id !== 'drone') {
          wp.x = this.player.x + wp.ox;
          wp.y = this.player.y + wp.oy;
        }
        // In-place block if enemy walks into facing cone (bulwark / blade)
        if (wp.def.kind === 'melee' && wp.def.id !== 'drone') {
          const near = this._nearestEnemy(wp.x, wp.y, wp.radius + 28);
          if (near && this._inFacingCone(wp, near, 1.1)) {
            wp.mode = 'block';
            wp.blockT = Math.max(wp.blockT, 0.12);
          } else {
            wp.mode = 'guard';
          }
        }
        continue;
      }

      const homeX = this.player.x + wp.ox;
      const homeY = this.player.y + wp.oy;
      let wantX = homeX;
      let wantY = homeY;
      wp.mode = 'guard';

      const threat = this._nearestEnemy(this.player.x, this.player.y, wp.leash + 40);

      if (wp.def.id === 'bulwark' && threat) {
        const n = norm(threat.x - this.player.x, threat.y - this.player.y);
        const stand = 50;
        wantX = this.player.x + n.x * stand;
        wantY = this.player.y + n.y * stand;
        wp.mode = 'block';
        wp.blockT = Math.max(wp.blockT, 0.15);
      } else if (threat) {
        const n = norm(threat.x - wp.x, threat.y - wp.y);
        const hold = 30;
        const side = (wp.slot % 2 === 0) ? 16 : -16;
        wantX = threat.x - n.x * hold - n.y * side;
        wantY = threat.y - n.y * hold + n.x * side;
        wp.mode = 'engage';
      }

      if (dist(wp, this.player) > wp.leash) {
        wantX = homeX;
        wantY = homeY;
        wp.mode = 'guard';
      }

      const toX = wantX - wp.x;
      const toY = wantY - wp.y;
      const len = Math.hypot(toX, toY) || 1;
      const speed = wp.moveSpeed * (wp.mode === 'block' ? 0.85 : 1);
      const step = Math.min(len, speed * dt);
      wp.x += (toX / len) * step;
      wp.y += (toY / len) * step;
    }
  }

  _inFacingCone(wp, e, halfArc = 0.75) {
    const ang = wp.faceAng;
    const a = Math.atan2(e.y - wp.y, e.x - wp.x);
    let diff = Math.abs(a - ang);
    while (diff > Math.PI) diff = Math.abs(diff - Math.PI * 2);
    return diff <= halfArc;
  }

  _weapons(dt) {
    const rateLaw = this.laws.has('overdrive') ? 1 + Math.min(0.8, this.killStack * 0.02) : 1;
    for (const wp of this.weapons) {
      const def = wp.def;
      const rate = def.rate * this.buffs.rate * rateLaw * (this.overclock > 0 ? 2 : 1);
      wp.cd -= dt * rate;
      const px = wp.x;
      const py = wp.y;
      const range = this._weaponRange(wp);
      const dmg = this._weaponDmg(wp);

      if (def.id === 'drone') {
        wp.angle += dt * 2.8;
        const r = range;
        wp.x = this.player.x + Math.cos(wp.angle) * r;
        wp.y = this.player.y + Math.sin(wp.angle) * r;
        this._damageCircle(wp.x, wp.y, 20, dmg * dt * 6.5, false);
        continue;
      }

      if (wp.cd > 0) continue;
      wp.cd = 1;

      if (def.kind === 'melee') {
        this._meleeStyleAttack(wp, range, dmg);
        continue;
      }

      const target = this._nearestEnemy(px, py, range);
      if (!target && def.kind !== 'aura') continue;

      if (def.kind === 'bolt' && target) {
        const n = norm(target.x - px, target.y - py);
        this.projectiles.push({
          x: px, y: py,
          vx: n.x * 340, vy: n.y * 340,
          dmg,
          life: 1.1,
          r: 4,
          color: def.color,
        });
      } else if (def.kind === 'aura') {
        this._damageCircle(px, py, range, dmg, true);
        this._burstParticles(px, py, def.color, 10);
        if (def.orbitShred) {
          const a = this.orbitPhase * 2.6 + (wp.slot || 0);
          const rr = range * 0.72;
          const bx = this.player.x + Math.cos(a) * rr;
          const by = this.player.y + Math.sin(a) * rr;
          this._damageCircle(bx, by, 22, dmg * 0.55, false);
        }
        if (this.laws.has('echo')) {
          this.echoes.push({
            x: px, y: py, r: range * 0.85,
            dmg: dmg * 0.4,
            life: 0.45, max: 0.45, color: def.color,
          });
        }
      }
    }
  }

  /**
   * Melee fights from their own world position (after autonomous move).
   */
  _meleeStyleAttack(wp, range, dmg) {
    const def = wp.def;
    const ox = wp.x;
    const oy = wp.y;

    if (def.id === 'blade' || def.id === 'hunter') {
      // Fixed facing when stationary; wanderers turn toward foe
      let ang = wp.faceAng;
      const halfArc = def.id === 'hunter' ? 0.72 : 0.65;
      const reach = range * 0.95;
      if (wp.autonomous) {
        const target = this._nearestEnemy(ox, oy, range * 1.2);
        if (target) ang = Math.atan2(target.y - oy, target.x - ox);
        wp.x += Math.cos(ang) * 10;
        wp.y += Math.sin(ang) * 10;
      }
      this._fanSlash(wp.x, wp.y, ang, reach, halfArc, dmg, def.color);
      this._slashFX(wp.x, wp.y, ang, reach, def.color);
      if (this.laws.has('echo')) {
        this.echoes.push({
          x: wp.x, y: wp.y, r: reach * 0.55, dmg: dmg * 0.28,
          life: 0.35, max: 0.35, color: def.color, ang, halfArc,
        });
      }
      return;
    }

    if (def.id === 'bulwark' || def.id === 'aegis') {
      wp.mode = 'block';
      wp.blockT = 0.45;
      let ang = wp.faceAng;
      if (wp.autonomous) {
        const t = this._nearestEnemy(ox, oy, range);
        if (t) ang = Math.atan2(t.y - oy, t.x - ox);
      }
      const halfArc = wp.autonomous ? 1.0 : 0.85;
      const reach = range * (wp.autonomous ? 0.75 : 0.7);
      this._fanSlash(ox, oy, ang, reach, halfArc, dmg, def.color);
      for (const e of this.enemies) {
        const d = dist(e, { x: ox, y: oy });
        if (d > reach || d < 8) continue;
        if (!this._inFacingCone({ ...wp, faceAng: ang, x: ox, y: oy }, e, halfArc)) continue;
        const n = norm(ox - e.x, oy - e.y);
        e.x += n.x * (wp.autonomous ? 18 : 12);
        e.y += n.y * (wp.autonomous ? 18 : 12);
      }
      if (this.laws.has('echo')) {
        this.echoes.push({
          x: ox, y: oy, r: reach * 0.55, dmg: dmg * 0.28,
          life: 0.35, max: 0.35, color: def.color, ang, halfArc,
        });
      }
      return;
    }

    this._damageCircle(ox, oy, range * 0.65, dmg, false);
    this._ringFX(ox, oy, range * 0.65, def.color);
  }

  /** Cone/fan hit from (x,y) facing ang, halfArc in radians. */
  _fanHit(x, y, ang, reach, halfArc, dmg) {
    for (const e of this.enemies) {
      const d = dist(e, { x, y });
      if (d > reach + e.radius) continue;
      const a = Math.atan2(e.y - y, e.x - x);
      let diff = Math.abs(a - ang);
      while (diff > Math.PI) diff = Math.abs(diff - Math.PI * 2);
      if (diff <= halfArc) this._hurtEnemy(e, dmg);
    }
  }

  _fanSlash(x, y, ang, reach, halfArc, dmg, color) {
    this._fanHit(x, y, ang, reach, halfArc, dmg);
    this.echoes.push({
      x, y, r: reach, dmg: 0, life: 0.16, max: 0.16, color,
      visualOnly: true, ang, halfArc,
    });
  }

  _ringFX(x, y, r, color) {
    this.echoes.push({
      x, y, r, dmg: 0, life: 0.18, max: 0.18, color, visualOnly: true,
    });
    this._burstParticles(x, y, color, 6);
  }

  _lungeTrail(x0, y0, x1, y1, color) {
    const steps = 6;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.particles.push({
        x: x0 + (x1 - x0) * t,
        y: y0 + (y1 - y0) * t,
        vx: 0,
        vy: 0,
        life: 0.2,
        color,
        r: 2.5,
      });
    }
  }

  _projectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      let hit = false;
      for (const e of this.enemies) {
        if (dist(p, e) < e.radius + p.r) {
          this._hurtEnemy(e, p.dmg);
          hit = true;
          if (this.laws.has('echo')) {
            this.echoes.push({
              x: p.x, y: p.y, r: 22, dmg: p.dmg * 0.4, life: 0.45, max: 0.45, color: p.color,
            });
          }
          break;
        }
      }
      if (hit || p.life <= 0) this.projectiles.splice(i, 1);
    }
  }

  _echoes(dt) {
    for (let i = this.echoes.length - 1; i >= 0; i--) {
      const e = this.echoes[i];
      e.life -= dt;
      if (e.life <= 0) {
        this.echoes.splice(i, 1);
        continue;
      }
      // damage once near birth (skip pure VFX rings)
      if (!e.visualOnly && e.dmg > 0 && e.life > e.max - dt * 1.5) {
        if (e.halfArc != null && e.ang != null) {
          this._fanHit(e.x, e.y, e.ang, e.r, e.halfArc, e.dmg);
        } else {
          this._damageCircle(e.x, e.y, e.r, e.dmg, false);
        }
      }
    }
  }

  _enemies(dt) {
    const frost = this.laws.has('frost') ? 0.82 : 1;
    const resist = 1 - (this.mods.contactResist || 0);
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      // Prefer colliding with blockers in front of the core
      const blocker = this._blockingFighter(e);
      let tx = this.player.x;
      let ty = this.player.y;
      if (blocker) {
        tx = blocker.x;
        ty = blocker.y;
      }
      const n = norm(tx - e.x, ty - e.y);
      e.x += n.x * e.speed * frost * (blocker ? 0.9 : 1) * dt;
      e.y += n.y * e.speed * frost * (blocker ? 0.9 : 1) * dt;

      if (blocker && dist(e, blocker) < e.radius + blocker.radius) {
        this._resolveBlock(e, blocker, dt);
      } else if (dist(e, this.player) < e.radius + this.player.radius) {
        if (this.invuln <= 0) {
          this.player.hp -= e.touch * resist * dt;
          this.shake = Math.min(1, this.shake + dt * 0.8);
        }
      }
      if (e.hp <= 0) {
        this._onKill(e);
        this.enemies.splice(i, 1);
      }
    }
  }

  /** Blockers: wandering interceptors, or stationary melee if enemy is in their facing cone. */
  _blockingFighter(e) {
    let best = null;
    let bestD = 52;
    for (const wp of this.weapons) {
      if (wp.def.kind !== 'melee' || wp.def.id === 'drone') continue;
      const d = dist(wp, e);
      if (d > 56) continue;

      let canBlock = false;
      if (wp.autonomous) {
        canBlock = wp.def.id === 'bulwark'
          || wp.mode === 'block'
          || (wp.def.id === 'blade' && wp.mode === 'engage' && d < 40);
      } else {
        // Stationary: only block enemies approaching from their set facing
        canBlock = d < e.radius + wp.radius + 10 && this._inFacingCone(wp, e, 0.95);
      }
      if (!canBlock) continue;

      const toPlayer = dist(e, this.player);
      const via = dist(e, wp) + dist(wp, this.player);
      if (via < toPlayer + 40 || d < e.radius + wp.radius + 8) {
        if (d < bestD) {
          bestD = d;
          best = wp;
        }
      }
    }
    return best;
  }

  _resolveBlock(e, wp, dt) {
    // Push enemy off the shield / blade
    const n = norm(e.x - wp.x, e.y - wp.y);
    const push = wp.def.id === 'bulwark' ? 70 : 40;
    e.x += n.x * push * dt;
    e.y += n.y * push * dt;

    if (wp.def.id === 'bulwark') {
      // Full intercept: core takes nothing; shield chips the foe
      wp.blockT = Math.max(wp.blockT, 0.2);
      wp.mode = 'block';
      e.hp -= 6 * dt * (wp.starMult || 1);
      if (Math.random() < dt * 3) {
        this._floater(wp.x, wp.y - 12, '格挡', '#c0c8d0');
      }
    } else {
      // Blade parry: mostly blocks, small chip to core
      const resist = 1 - (this.mods.contactResist || 0);
      if (this.invuln <= 0) {
        this.player.hp -= e.touch * 0.25 * resist * dt;
      }
      e.hp -= 10 * dt * (wp.starMult || 1);
      if (Math.random() < dt * 2) {
        this._floater(wp.x, wp.y - 12, '格挡', '#d4a017');
      }
    }
    this.shake = Math.min(1, this.shake + dt * 0.35);
  }

  _onKill(e) {
    this.kills += 1;
    this.killStack += 1;
    this.shake = Math.min(1, this.shake + (e.elite ? 0.35 : 0.12));
    this.flash = Math.min(1, this.flash + 0.25);
    this._burstParticles(e.x, e.y, e.elite ? '#d4a017' : '#c44b3c', e.elite ? 18 : 8);

    if (this.laws.has('leech')) {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 1);
    }

    this._rollDrops(e);

    const burstChance = (this.laws.has('burst') ? 0.28 : 0) + (this.mods.burstBonus || 0);
    if (burstChance > 0 && Math.random() < burstChance) {
      this._damageCircle(e.x, e.y, 70, 22 + this.wave * 3, true);
      this._burstParticles(e.x, e.y, '#ff8844', 16);
      this.shake = Math.min(1, this.shake + 0.25);
    }
  }

  _spawnPickup(x, y, pickup) {
    this.gems.push({
      x: x + rand(-10, 10),
      y: y + rand(-10, 10),
      ...pickup,
    });
  }

  _rollDrops(e) {
    const elite = !!e.elite;
    // XP: always at least one green gem
    const xpN = (this.laws.has('magnet') ? 2 : 1) + (elite ? 2 : 0);
    for (let i = 0; i < xpN; i++) {
      this._spawnPickup(e.x, e.y, {
        kind: 'xp',
        v: elite ? 4 : 2,
        r: 3.5,
        color: '#5dffb0',
      });
    }

    // Gold
    let goldChance = DROP.goldChance + (this.wcfg.goldChanceBonus || 0) + (elite ? DROP.eliteGoldBonus : 0);
    if (Math.random() < goldChance) {
      this._spawnPickup(e.x, e.y, {
        kind: 'gold',
        v: elite || e.boss ? 2 + Math.floor(Math.random() * 2) : 1,
        r: 4,
        color: '#d4a017',
      });
    }

    // Permanent item — tiny chance (boss almost guarantees one orb)
    let itemChance = DROP.itemChance * (this.wcfg.itemChanceMult || 1) * (elite ? DROP.eliteItemMult : 1);
    if (e.boss) itemChance = 0.85;
    if (Math.random() < itemChance) {
      const item = ITEMS[Math.floor(Math.random() * ITEMS.length)];
      this._spawnPickup(e.x, e.y, {
        kind: 'item',
        itemId: item.id,
        name: item.name,
        r: 7,
        color: '#c070ff',
      });
    }

    // Temporary clutch — rarer, more likely when low HP
    const low = this.player.hp / this.player.maxHp < 0.35;
    let clutchChance = (low ? DROP.clutchLowHpChance : DROP.clutchChance)
      * (elite ? DROP.eliteClutchMult : 1);
    if (Math.random() < clutchChance) {
      const c = CLUTCH[Math.floor(Math.random() * CLUTCH.length)];
      this._spawnPickup(e.x, e.y, {
        kind: 'clutch',
        clutchId: c.id,
        name: c.name,
        r: 8,
        color: '#ff6b4a',
      });
    }
  }

  _gems(dt) {
    const base = this.laws.has('magnet') ? 130 : 60;
    const magnet = base * this.buffs.magnet;
    for (let i = this.gems.length - 1; i >= 0; i--) {
      const g = this.gems[i];
      const pullR = g.kind === 'item' || g.kind === 'clutch' ? magnet * 0.85 : magnet;
      const d = dist(g, this.player);
      if (d < pullR) {
        const n = norm(this.player.x - g.x, this.player.y - g.y);
        const pull = 220 + (pullR - d) * 2;
        g.x += n.x * pull * dt;
        g.y += n.y * pull * dt;
      }
      if (dist(g, this.player) < this.player.radius + (g.r || 4) + 2) {
        this._collectPickup(g);
        this.gems.splice(i, 1);
      }
    }
  }

  _collectPickup(g) {
    if (g.kind === 'xp' || !g.kind) {
      this.xp += g.v || 2;
      this._floater(this.player.x, this.player.y - 20, `+${g.v} XP`, '#5dffb0');
      if (this.xp >= this.xpToLevel) this._levelUp();
      return;
    }
    if (g.kind === 'gold') {
      this.goldLoot += g.v;
      this._floater(this.player.x, this.player.y - 18, `+${g.v} 金`, '#d4a017');
      return;
    }
    if (g.kind === 'item') {
      // applyLevelPick grants into inventory + mid-wave buff
      this.applyLevelPick(g.itemId);
      this._banner(`获得道具 · ${g.name}`, '#c070ff');
      this.shake = Math.min(1, this.shake + 0.4);
      return;
    }
    if (g.kind === 'clutch') {
      this._applyClutch(g.clutchId, g.name);
    }
  }

  _applyClutch(id, name) {
    this._banner(`救场 · ${name}`, '#ff6b4a');
    this.shake = Math.min(1, this.shake + 0.55);
    this.flash = 1;
    if (id === 'nuke') {
      for (const e of this.enemies) {
        if (e.boss) e.hp = Math.max(1, e.hp * 0.55);
        else if (e.elite) e.hp = Math.max(1, e.hp * 0.25);
        else e.hp = 0;
      }
      this._burstParticles(this.player.x, this.player.y, '#ff8844', 40);
    } else if (id === 'fullheal') {
      this.player.hp = this.player.maxHp;
      this._burstParticles(this.player.x, this.player.y, '#5dffb0', 24);
    } else if (id === 'barrier') {
      this.invuln = Math.max(this.invuln, 4);
    } else if (id === 'overclock') {
      this.overclock = Math.max(this.overclock, 6);
    } else if (id === 'vacuum') {
      // collect all pickups instantly + small heal
      const loot = [...this.gems];
      this.gems.length = 0;
      for (const g of loot) {
        if (g.kind === 'clutch') continue; // avoid chain clutch
        this._collectPickup(g);
      }
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 15);
      this._burstParticles(this.player.x, this.player.y, '#5cb8ff', 20);
    }
  }

  _banner(text, color) {
    this.banners.push({ text, color, life: 2.2, max: 2.2 });
  }

  _floater(x, y, text, color) {
    this.floaters.push({
      x, y, text, color,
      life: 0.9, max: 0.9,
      vy: -36,
    });
  }

  _tickFx(dt) {
    for (let i = this.banners.length - 1; i >= 0; i--) {
      this.banners[i].life -= dt;
      if (this.banners[i].life <= 0) this.banners.splice(i, 1);
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life -= dt;
      f.y += f.vy * dt;
      if (f.life <= 0) this.floaters.splice(i, 1);
    }
  }

  _levelUp() {
    this.xp -= this.xpToLevel;
    this.level += 1;
    this.xpToLevel = Math.floor(this.xpToLevel * this.wcfg.xpScale + 5);
    this.pendingLevel = true;
    this.paused = true;
    const choices = this.cfg.itemChoices
      ? this.cfg.itemChoices()
      : [];
    this.cfg.onLevelUp(choices, (id) => this.applyLevelPick(id));
  }

  _particles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  _damageCircle(x, y, r, dmg, fx) {
    for (const e of this.enemies) {
      if (dist(e, { x, y }) <= r + e.radius) this._hurtEnemy(e, dmg);
    }
    if (fx) this._burstParticles(x, y, '#9b6bff', 8);
  }

  _hurtEnemy(e, dmg) {
    if (e.hp <= 0) return;
    e.hp -= dmg;
  }

  _nearestEnemy(x, y, range) {
    let best = null;
    let bestD = range;
    for (const e of this.enemies) {
      const d = dist(e, { x, y });
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  _burstParticles(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(40, 160);
      this.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: rand(0.2, 0.55), color, r: rand(1.5, 3.5),
      });
    }
  }

  _slashFX(x, y, ang, reach, color) {
    for (let i = 0; i < 6; i++) {
      const a = ang + rand(-0.9, 0.9);
      this.particles.push({
        x: x + Math.cos(a) * reach * 0.6,
        y: y + Math.sin(a) * reach * 0.6,
        vx: Math.cos(a) * 80,
        vy: Math.sin(a) * 80,
        life: 0.2,
        color,
        r: 2,
      });
    }
  }

  _finish(won) {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this._raf);
    const clearBonus = won
      ? this.wcfg.clearGold + Math.floor(this.kills / 14)
      : Math.max(1, Math.floor(this.wcfg.clearGold * 0.35) + Math.floor(this.kills / 25));
    const gold = clearBonus + this.goldLoot;
    this.cfg.onEnd({
      won,
      kills: this.kills,
      gold,
      goldLoot: this.goldLoot,
      clearGold: clearBonus,
      xp: this.xp,
      level: this.level,
      boss: !!this.wcfg.boss,
      final: !!this.wcfg.final,
      actName: this.wcfg.act.name,
    });
  }

  _draw() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const trauma = this.shake * this.shake;
    const ox = (Math.random() - 0.5) * 14 * trauma;
    const oy = (Math.random() - 0.5) * 10 * trauma;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#070b09';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(ox, oy);

    // ground grid
    ctx.strokeStyle = 'rgba(50, 80, 65, 0.25)';
    ctx.lineWidth = 1;
    const gz = 40;
    const gx = -((this.player.x % gz) + gz) % gz;
    const gy = -((this.player.y % gz) + gz) % gz;
    ctx.beginPath();
    for (let x = gx; x < w; x += gz) {
      ctx.moveTo(x, 0); ctx.lineTo(x, h);
    }
    for (let y = gy; y < h; y += gz) {
      ctx.moveTo(0, y); ctx.lineTo(w, y);
    }
    ctx.stroke();

    for (const g of this.gems) {
      const r = g.r || 3.5;
      ctx.fillStyle = g.color || '#5dffb0';
      ctx.beginPath();
      ctx.arc(g.x, g.y, r, 0, Math.PI * 2);
      ctx.fill();
      if (g.kind === 'item' || g.kind === 'clutch') {
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(g.x, g.y, r + 2 + Math.sin(this.time * 8) * 1.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    for (const e of this.echoes) {
      const a = e.life / e.max;
      ctx.strokeStyle = hexAlpha(e.color, 0.4 * a);
      ctx.fillStyle = hexAlpha(e.color, 0.12 * a);
      ctx.beginPath();
      if (e.halfArc != null && e.ang != null) {
        ctx.moveTo(e.x, e.y);
        ctx.arc(e.x, e.y, e.r, e.ang - e.halfArc, e.ang + e.halfArc);
        ctx.closePath();
      } else {
        ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.stroke();
    }

    for (const e of this.enemies) {
      ctx.fillStyle = e.boss ? '#ff4d3a' : e.elite ? '#d4a017' : '#8b3a32';
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius, 0, Math.PI * 2);
      ctx.fill();
      if (e.boss) {
        ctx.strokeStyle = 'rgba(255,220,160,0.7)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      if (e.hp < e.maxHp || e.boss) {
        const bw = e.boss ? 48 : 20;
        ctx.fillStyle = '#222';
        ctx.fillRect(e.x - bw / 2, e.y - e.radius - 9, bw, 4);
        ctx.fillStyle = e.boss ? '#ff6b4a' : '#3d9b6a';
        ctx.fillRect(e.x - bw / 2, e.y - e.radius - 9, bw * (e.hp / e.maxHp), 4);
      }
    }

    for (const p of this.projectiles) {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // weapons / fighters
    for (const wp of this.weapons) {
      const def = wp.def;
      const x = wp.x;
      const y = wp.y;
      const rad = (wp.radius || 6) * 0.55 + (wp.star || 1);

      if (wp.autonomous && (wp.mode === 'block' || wp.blockT > 0)) {
        ctx.strokeStyle = hexAlpha(def.color, 0.45 + Math.sin(this.time * 12) * 0.15);
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(x, y, rad + 7, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();

      // Facing tick (prep direction, or toward foe if wandering)
      {
        let a = wp.faceAng;
        if (wp.autonomous) {
          const foe = this._nearestEnemy(x, y, 160);
          if (foe) a = Math.atan2(foe.y - y, foe.x - x);
        }
        ctx.strokeStyle = '#e8f0ea';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(a) * (rad + 7), y + Math.sin(a) * (rad + 7));
        ctx.stroke();
      }

      if (def.kind === 'aura') {
        ctx.strokeStyle = hexAlpha(def.color, 0.25);
        ctx.beginPath();
        ctx.arc(x, y, this._weaponRange(wp), 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // player core
    if (this.invuln > 0) {
      ctx.strokeStyle = hexAlpha('#d4a017', 0.55 + Math.sin(this.time * 10) * 0.25);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(this.player.x, this.player.y, this.player.radius + 6, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = this.overclock > 0 ? '#ffd080' : '#e8f0ea';
    ctx.beginPath();
    ctx.arc(this.player.x, this.player.y, this.player.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0c1210';
    ctx.beginPath();
    ctx.arc(this.player.x, this.player.y, 6, 0, Math.PI * 2);
    ctx.fill();

    for (const p of this.particles) {
      ctx.fillStyle = hexAlpha(p.color, Math.max(0, p.life * 2));
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const f of this.floaters) {
      const a = clamp(f.life / f.max, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = f.color;
      ctx.font = 'bold 13px Segoe UI, sans-serif';
      ctx.fillText(f.text, f.x - 16, f.y);
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,220,160,${0.12 * this.flash})`;
      ctx.fillRect(0, 0, w, h);
    }

    // HUD overlay
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, w, 36);
    ctx.fillStyle = '#e8f0ea';
    ctx.font = '14px Segoe UI, sans-serif';
    const tag = this.wcfg.boss ? 'BOSS' : this.wcfg.act.name;
    ctx.fillText(
      `${tag} 波${this.wave}  ·  击杀 ${this.kills}  ·  Lv ${this.level}  ·  拾金 ${this.goldLoot}`,
      12,
      22,
    );
    const remain = Math.max(0, this.waveLen - this.time);
    ctx.fillText(`剩余 ${remain.toFixed(1)}s`, w - 110, 22);

    // HP
    ctx.fillStyle = '#222';
    ctx.fillRect(12, h - 22, 160, 10);
    ctx.fillStyle = this.invuln > 0 ? '#d4a017' : '#c44b3c';
    ctx.fillRect(12, h - 22, 160 * clamp(this.player.hp / this.player.maxHp, 0, 1), 10);

    // XP
    ctx.fillStyle = '#222';
    ctx.fillRect(180, h - 22, 160, 10);
    ctx.fillStyle = '#5dffb0';
    ctx.fillRect(180, h - 22, 160 * clamp(this.xp / this.xpToLevel, 0, 1), 10);

    // legend
    ctx.font = '11px Segoe UI, sans-serif';
    ctx.fillStyle = '#5dffb0';
    ctx.fillText('绿经验', 360, h - 14);
    ctx.fillStyle = '#d4a017';
    ctx.fillText('金金币', 410, h - 14);
    ctx.fillStyle = '#c070ff';
    ctx.fillText('紫道具', 460, h - 14);
    ctx.fillStyle = '#ff6b4a';
    ctx.fillText('红救场', 510, h - 14);

    for (const b of this.banners) {
      const a = clamp(b.life / b.max, 0, 1);
      ctx.globalAlpha = Math.min(1, a * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(w * 0.2, 48, w * 0.6, 36);
      ctx.fillStyle = b.color;
      ctx.font = 'bold 18px Segoe UI, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(b.text, w * 0.5, 72);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    }
  }
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function hexAlpha(hex, a) {
  const c = hex.replace('#', '');
  const n = parseInt(c.length === 3 ? c.split('').map((x) => x + x).join('') : c, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r},${g},${b},${a})`;
}

/** @typedef {{ id: string, name: string, cost: number, role: string, color: string, desc: string, damage: number, rate: number, range: number, kind: 'melee'|'bolt'|'aura', traits: string[] }} UnitDef */
/** @typedef {{ id: string, name: string, desc: string, cost: number }} LawDef */
/** @typedef {{ id: string, name: string, desc: string, cost: number, effect: Record<string, number> }} ItemDef */
/** @typedef {{ id: string, name: string, thresholds: number[], desc: (n: number) => string }} TraitDef */

/** @type {Record<string, UnitDef>} */
export const UNITS = {
  blade: {
    id: 'blade',
    name: '刀仔',
    cost: 3,
    role: '扇形近战',
    color: '#d4a017',
    desc: '★ 固定朝向扇砍；★★/游猎符才自行走位。羁绊：刃 / 前卫',
    damage: 14,
    rate: 1.85,
    range: 62,
    kind: 'melee',
    traits: ['blade', 'vanguard'],
  },
  bolt: {
    id: 'bolt',
    name: '弩手',
    cost: 3,
    role: '远程点射',
    color: '#5cb8ff',
    desc: '点射最近敌人，稳定但单段偏低。羁绊：远程 / 精准',
    damage: 8,
    rate: 1.55,
    range: 220,
    kind: 'bolt',
    traits: ['ranged', 'precise'],
  },
  aura: {
    id: 'aura',
    name: '祭环',
    cost: 4,
    role: '脉冲光环',
    color: '#9b6bff',
    desc: '周围脉冲伤害。羁绊：秘术 / 环',
    damage: 7,
    rate: 1.1,
    range: 96,
    kind: 'aura',
    traits: ['arcane', 'ring'],
  },
  drone: {
    id: 'drone',
    name: '飞刃',
    cost: 5,
    role: '环绕刃',
    color: '#3d9b6a',
    desc: '大半径环绕切割，风筝时仍能刮到外圈。羁绊：刃 / 环',
    damage: 9,
    rate: 8,
    range: 95,
    kind: 'melee',
    traits: ['blade', 'ring'],
  },
  bulwark: {
    id: 'bulwark',
    name: '盾卫',
    cost: 4,
    role: '朝向格挡',
    color: '#c0c8d0',
    desc: '★ 站桩朝向震波格挡；★★/游猎符才上前拦截。羁绊：前卫 / 铁壁',
    damage: 11,
    rate: 1.3,
    range: 72,
    kind: 'melee',
    traits: ['vanguard', 'iron'],
  },
  hex: {
    id: 'hex',
    name: '咒矢',
    cost: 4,
    role: '秘术点射',
    color: '#e070ff',
    desc: '较慢但高伤远程。羁绊：秘术 / 远程',
    damage: 16,
    rate: 1.0,
    range: 200,
    kind: 'bolt',
    traits: ['arcane', 'ranged'],
  },
  // —— 进化体（不进商店，仅配方合成）——
  hunter: {
    id: 'hunter',
    name: '猎刃',
    cost: 0,
    role: '进化近战',
    color: '#ffb020',
    desc: '永久走位的强化刀仔，扇砍更狠。羁绊：刃 / 前卫',
    damage: 20,
    rate: 2.1,
    range: 78,
    kind: 'melee',
    traits: ['blade', 'vanguard'],
    evolved: true,
    alwaysWander: true,
  },
  aegis: {
    id: 'aegis',
    name: '壁障',
    cost: 0,
    role: '进化盾',
    color: '#e8eef4',
    desc: '强化格挡与震波。羁绊：前卫 / 铁壁',
    damage: 15,
    rate: 1.45,
    range: 88,
    kind: 'melee',
    traits: ['vanguard', 'iron'],
    evolved: true,
    alwaysWander: true,
  },
  star_ring: {
    id: 'star_ring',
    name: '星环',
    cost: 0,
    role: '进化光环',
    color: '#b48cff',
    desc: '大范围脉冲，并带一圈切割。羁绊：秘术 / 环',
    damage: 11,
    rate: 1.25,
    range: 120,
    kind: 'aura',
    traits: ['arcane', 'ring'],
    evolved: true,
    orbitShred: true,
  },
};

/**
 * Evolution recipes. Consumes listed board units / items, places result on first consumed slot.
 * @type {{ id: string, name: string, desc: string, resultId: string, needStar?: number, unitIds: string[], itemIds?: string[], consumeExtraUnit?: string }[]}
 */
export const EVOLUTIONS = [
  {
    id: 'evo_hunter',
    name: '猎刃',
    desc: '刀仔 ★★+ ＋ 游猎符 → 猎刃（永久走位）',
    resultId: 'hunter',
    needStar: 2,
    unitIds: ['blade'],
    itemIds: ['hunt_charm'],
  },
  {
    id: 'evo_aegis',
    name: '壁障',
    desc: '盾卫 ★★+ ＋ 铁心 → 壁障',
    resultId: 'aegis',
    needStar: 2,
    unitIds: ['bulwark'],
    itemIds: ['iron_heart'],
  },
  {
    id: 'evo_star_ring',
    name: '星环',
    desc: '祭环 ＋ 飞刃（吞掉飞刃）→ 星环',
    resultId: 'star_ring',
    needStar: 1,
    unitIds: ['aura'],
    consumeExtraUnit: 'drone',
  },
];

/** Map node kinds for between-wave choices */
export const MAP_NODE_TYPES = {
  fight: {
    id: 'fight',
    name: '清潮',
    tag: '战斗',
    desc: '常规清潮，按当前波次难度。',
  },
  elite: {
    id: 'elite',
    name: '精英巢',
    tag: '高危',
    desc: '怪更密更肉，通关金更高。',
  },
  shop: {
    id: 'shop',
    name: '黑市驻扎',
    tag: '备战',
    desc: '+5 金，免费刷新商店 1 次，道具/法则更易刷出。',
  },
  event: {
    id: 'event',
    name: '裂隙事件',
    tag: '事件',
    desc: '随机机遇或小风险，然后照常开战。',
  },
  rest: {
    id: 'rest',
    name: '篝火休整',
    tag: '休整',
    desc: '回复 1 生命（不超过上限），本波开战略轻松。',
  },
};

export function rollMapNodes(wave, n = 3) {
  const act = getAct(wave);
  const pool = ['fight', 'fight', 'elite', 'shop', 'event', 'rest'];
  if (act.id >= 2) pool.push('elite', 'shop');
  if (isBossWave(wave)) return [{ ...MAP_NODE_TYPES.fight, forced: true }];
  const out = [];
  const used = new Set();
  let guard = 0;
  while (out.length < n && guard++ < 40) {
    const id = pool[Math.floor(Math.random() * pool.length)];
    if (used.has(id) && out.length < 2) continue;
    if (used.has(id)) continue;
    used.add(id);
    out.push({ ...MAP_NODE_TYPES[id] });
  }
  // always ensure at least one combat-ish option
  if (!out.some((x) => x.id === 'fight' || x.id === 'elite')) {
    out[0] = { ...MAP_NODE_TYPES.fight };
  }
  return out;
}

/** @type {Record<string, TraitDef>} */
export const TRAITS = {
  blade: {
    id: 'blade',
    name: '刃',
    thresholds: [2, 4],
    desc: (n) => (n >= 4 ? '刃系伤害 +40%' : '刃系伤害 +20%'),
  },
  ranged: {
    id: 'ranged',
    name: '远程',
    thresholds: [2, 3],
    desc: (n) => (n >= 3 ? '远程射程与伤害 +30%' : '远程射程 +15%、伤害 +10%'),
  },
  arcane: {
    id: 'arcane',
    name: '秘术',
    thresholds: [2],
    desc: () => '秘术单位伤害 +25%，光环范围 +15%',
  },
  ring: {
    id: 'ring',
    name: '环',
    thresholds: [2],
    desc: () => '环绕/光环范围 +25%',
  },
  vanguard: {
    id: 'vanguard',
    name: '前卫',
    thresholds: [2],
    desc: () => '阵心受到碰撞伤害 -30%',
  },
  precise: {
    id: 'precise',
    name: '精准',
    thresholds: [2],
    desc: () => '远程 20% 暴击（×2 伤害）',
  },
  iron: {
    id: 'iron',
    name: '铁壁',
    thresholds: [2],
    desc: () => '阵心最大生命 +40',
  },
};

/** @type {LawDef[]} */
export const LAWS = [
  { id: 'echo', name: '回声', cost: 4, desc: '攻击留下残影，再造成 40% 伤害。' },
  { id: 'magnet', name: '吸星', cost: 3, desc: '经验珠吸附半径 ×2.2，多掉珠。' },
  { id: 'burst', name: '尸爆', cost: 4, desc: '击杀 28% 概率爆炸。' },
  { id: 'overdrive', name: '过载', cost: 5, desc: '击杀叠射速，本波上限 +80%。' },
  { id: 'leech', name: '汲取', cost: 4, desc: '击杀回复 1 点阵心生命。' },
  { id: 'frost', name: '霜径', cost: 3, desc: '敌人移速 -18%。' },
];

/** @type {ItemDef[]} */
export const ITEMS = [
  { id: 'whetstone', name: '磨刀石', cost: 3, desc: '全局伤害 +15%', effect: { dmg: 1.15 } },
  { id: 'rapid_core', name: '急火芯', cost: 3, desc: '全局攻速 +15%', effect: { rate: 1.15 } },
  { id: 'wide_lens', name: '扩张镜', cost: 3, desc: '攻击范围 +15%', effect: { area: 1.15 } },
  { id: 'iron_heart', name: '铁心', cost: 4, desc: '阵心最大生命 +35', effect: { hp: 35 } },
  { id: 'magnet_ring', name: '强磁环', cost: 3, desc: '经验吸附 +50%', effect: { magnet: 1.5 } },
  { id: 'blood_charm', name: '血咒', cost: 4, desc: '击杀爆炸率 +12%（叠尸爆）', effect: { burstBonus: 0.12 } },
  { id: 'spare_slot', name: '扩容钉', cost: 5, desc: '法则板 +1 槽（最多 6）', effect: { lawSlot: 1 } },
  {
    id: 'hunt_charm',
    name: '游猎符',
    cost: 5,
    desc: '近战获得自行走位（等同 ★★ 机动）',
    effect: { meleeWander: 1 },
  },
];

/** Facing: 0上 1右 2下 3左 */
export const FACING = [
  { id: 0, label: '↑', angle: -Math.PI / 2 },
  { id: 1, label: '→', angle: 0 },
  { id: 2, label: '↓', angle: Math.PI / 2 },
  { id: 3, label: '←', angle: Math.PI },
];

export function facingAngle(facing) {
  return FACING[((facing % 4) + 4) % 4].angle;
}

export function facingLabel(facing) {
  return FACING[((facing % 4) + 4) % 4].label;
}

/** 8 slots in a ring around the core (prep + combat). Clockwise from North. */
export const BOARD_SIZE = 8;
/** CSS grid cell [row, col] in a 3×3 with center hub empty of units */
export const BOARD_SLOTS = [
  { id: 0, label: '北', gridRow: 1, gridCol: 2 },
  { id: 1, label: '东北', gridRow: 1, gridCol: 3 },
  { id: 2, label: '东', gridRow: 2, gridCol: 3 },
  { id: 3, label: '东南', gridRow: 3, gridCol: 3 },
  { id: 4, label: '南', gridRow: 3, gridCol: 2 },
  { id: 5, label: '西南', gridRow: 3, gridCol: 1 },
  { id: 6, label: '西', gridRow: 2, gridCol: 1 },
  { id: 7, label: '西北', gridRow: 1, gridCol: 1 },
];

/** World angle for slot (0=right, -PI/2=up). */
export function slotAngle(slotIdx) {
  const i = ((slotIdx % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE;
  return -Math.PI / 2 + i * (Math.PI / 4);
}

/** Default facing: outward from ring center. */
export function defaultFacing(slotIdx) {
  const a = slotAngle(slotIdx);
  let best = 0;
  let bestDiff = 99;
  for (let i = 0; i < 4; i++) {
    let d = Math.abs(facingAngle(i) - a);
    while (d > Math.PI) d -= Math.PI * 2;
    d = Math.abs(d);
    if (d < bestDiff) {
      bestDiff = d;
      best = i;
    }
  }
  return best;
}

/** Combat offset on the ring around the formation core. */
export function slotOffset(slotIdx, radius = 52) {
  const a = slotAngle(slotIdx);
  return { x: Math.cos(a) * radius, y: Math.sin(a) * radius };
}

/** Melee may auto-walk when ★★+、游猎符，或进化体自带 alwaysWander */
export function meleeCanWander(star, itemIds, defId) {
  const def = defId ? UNITS[defId] : null;
  if (def?.alwaysWander) return true;
  if ((star || 1) >= 2) return true;
  return (itemIds || []).includes('hunt_charm');
}

/**
 * List evolutions currently craftable.
 * @param {{ defId: string, star: number }[]} units
 * @param {string[]} items
 */
export function availableEvolutions(units, items) {
  const itemCount = {};
  for (const id of items) itemCount[id] = (itemCount[id] || 0) + 1;
  return EVOLUTIONS.filter((evo) => {
    for (const uid of evo.unitIds) {
      const u = units.find(
        (x) => x.defId === uid && (x.star || 1) >= (evo.needStar || 1),
      );
      if (!u) return false;
    }
    if (evo.consumeExtraUnit) {
      if (!units.some((x) => x.defId === evo.consumeExtraUnit)) return false;
    }
    for (const iid of evo.itemIds || []) {
      if (!itemCount[iid]) return false;
    }
    return true;
  });
}

export const LAW_SLOT_BASE = 4;
export const LAW_SLOT_MAX = 6;
export const STAR_MULT = [1, 1, 1.75, 3.0]; // index by star 1..3
/** Temporary clutch pickups (in-wave only, rare). */
export const CLUTCH = [
  { id: 'nuke', name: '清屏雷', desc: '立刻清空场上小怪（精英残血）' },
  { id: 'fullheal', name: '回春', desc: '阵心生命回满' },
  { id: 'barrier', name: '金身', desc: '4 秒无敌' },
  { id: 'overclock', name: '超频', desc: '6 秒攻速翻倍' },
  { id: 'vacuum', name: '真空吸', desc: '吸光全场掉落并小幅回血' },
];

/** Drop rates from a normal kill (elite uses multipliers in arena). */
export const DROP = {
  goldChance: 0.16,
  itemChance: 0.004,
  clutchChance: 0.002,
  clutchLowHpChance: 0.016, // when hp < 35%
  eliteGoldBonus: 0.18,
  eliteItemMult: 3,
  eliteClutchMult: 1.8,
};

/**
 * Run growth curve — designed for ~20–30 min, 9 waves / 3 acts.
 *
 * Power fantasy beats (player-side targets):
 *  W1–2  board 2–3 ★, first law
 *  W3    boss: first ★★ or trait breakpoint
 *  W4–5  fill board, 2–3 laws, item stack
 *  W6    boss: ★★ core online
 *  W7–8  chase ★★★ / deep traits
 *  W9    final boss showcase
 *
 * Threat tracks slightly ahead of average power so weak boards struggle,
 * strong boards feel the snowball — not a flat HP inflate.
 */
export const RUN = {
  maxWave: 9,
  startGold: 10,
  startLives: 2,
  interestCap: 4,
  interestPer10: 1, // +1 gold per 10 saved, capped
  rerollBase: 2,
  acts: [
    { id: 1, name: '荒原', from: 1, to: 3, boss: 3, goal: '凑出首个羁绊或 ★★' },
    { id: 2, name: '锈城', from: 4, to: 6, boss: 6, goal: '法则板成型，道具开始叠乘' },
    { id: 3, name: '深井', from: 7, to: 9, boss: 9, goal: '冲 ★★★ / 高阶羁绊，通关终局' },
  ],
};

export function getAct(wave) {
  return RUN.acts.find((a) => wave >= a.from && wave <= a.to) || RUN.acts[0];
}

export function isBossWave(wave) {
  return RUN.acts.some((a) => a.boss === wave);
}

export function isFinalWave(wave) {
  return wave >= RUN.maxWave;
}

/** Combat + reward numbers for a given wave. */
export function waveConfig(wave) {
  const act = getAct(wave);
  const boss = isBossWave(wave);
  const t = (wave - 1) / Math.max(1, RUN.maxWave - 1); // 0..1

  // Longer pressure windows; bosses especially
  const duration = boss ? 78 + act.id * 10 : 42 + wave * 4;

  // Denser packs; late acts spike hard
  const spawnPerSec = boss
    ? 1.65 + act.id * 0.28
    : 1.35 + t * 2.35;

  const enemyHp = Math.round((22 + wave * 9) * (boss ? 1.25 : 1));
  const eliteHp = Math.round((72 + wave * 26) * (boss ? 1.35 : 1));
  const eliteChance = boss ? 0.2 + act.id * 0.04 : 0.07 + t * 0.16;
  const touch = 9 + act.id * 2.2;
  const eliteTouch = 16 + act.id * 3.5;
  const enemySpeed = 78 + t * 28;

  // Tighter economy — must earn clears, less free snowball
  const clearGold = boss
    ? 8 + act.id * 4
    : 3 + wave;

  // Fewer mid-wave item levels; shop/boss matter more
  const xpToFirst = boss ? 36 : 20 + wave * 3;
  const xpScale = 1.32 + t * 0.2;

  // Shop offer count by act
  const shopSlots = 3 + act.id; // 4,5,6

  return {
    wave,
    act,
    boss,
    final: wave >= RUN.maxWave,
    duration,
    spawnPerSec,
    enemyHp,
    eliteHp,
    eliteChance,
    touch,
    eliteTouch,
    enemySpeed,
    clearGold,
    xpToFirst,
    xpScale,
    shopSlots,
    // boss entity
    bossHp: 780 + act.id * 380,
    bossTouch: 24 + act.id * 6,
    bossSpeed: 50,
    // drop mild buffs on later acts
    goldChanceBonus: act.id * 0.03,
    itemChanceMult: 1 + (act.id - 1) * 0.35,
  };
}

/** Weighted unit pool unlocks with wave (keeps early shop cheap/readable). */
export function shopUnitIds(wave) {
  const all = Object.keys(UNITS).filter((id) => !UNITS[id].evolved);
  if (wave <= 2) return all.filter((id) => UNITS[id].cost <= 3);
  if (wave <= 4) return all.filter((id) => UNITS[id].cost <= 4);
  return all;
}

export function interestFor(gold) {
  return Math.min(RUN.interestCap, Math.floor(gold / 10) * RUN.interestPer10);
}

export function rerollCost(wave) {
  return RUN.rerollBase + Math.floor((wave - 1) / 3);
}

/** Milestone text for prep HUD. */
export function milestoneText(wave, boardUnits) {
  const act = getAct(wave);
  const boss = isBossWave(wave);
  const stars = boardUnits.map((u) => u.star || 1);
  const has2 = stars.some((s) => s >= 2);
  const has3 = stars.some((s) => s >= 3);
  const traits = activeTraits(countTraits(boardUnits));
  const active = traits.filter((t) => t.tier > 0).length;

  if (wave > RUN.maxWave) return '本局已通关';
  if (boss && wave === RUN.maxWave) return '终局 Boss：展示完整构筑';
  if (boss) return `本波 Boss · 目标：${act.goal}`;
  if (wave <= 2 && !active) return '目标：凑齐任意羁绊 2 件';
  if (wave <= 3 && !has2) return '目标：3 同名合成 ★★';
  if (wave <= 6 && active < 2) return '目标：同时激活 2 条羁绊';
  if (wave <= 8 && !has3) return '目标：冲击 ★★★ 或深羁绊';
  return act.goal;
}

/** Item pick bias: later/boss prefer pricier items. */
export function pickItemChoices(wave, n = 3) {
  const boss = isBossWave(wave);
  const act = getAct(wave);
  const pool = [...ITEMS];
  // weight by cost vs act
  const weighted = [];
  for (const it of pool) {
    let w = 1;
    if (act.id === 1 && it.cost <= 3) w = 3;
    if (act.id === 2 && it.cost >= 3 && it.cost <= 4) w = 3;
    if (act.id === 3 && it.cost >= 4) w = 3;
    if (boss) w += 2;
    for (let i = 0; i < w; i++) weighted.push(it);
  }
  const out = [];
  const used = new Set();
  while (out.length < n && weighted.length) {
    const it = weighted[Math.floor(Math.random() * weighted.length)];
    if (used.has(it.id)) continue;
    used.add(it.id);
    out.push(it);
  }
  // fill if needed
  for (const it of pool) {
    if (out.length >= n) break;
    if (!used.has(it.id)) out.push(it);
  }
  return out;
}

export function starLabel(star) {
  return '★'.repeat(star);
}

/**
 * Count unique trait contributors on board (each unit counts once per trait, star does not double-count for traits — TFT style unique champions; here each piece counts).
 * @param {{ defId: string }[]} units
 */
export function countTraits(units) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const u of units) {
    const def = UNITS[u.defId];
    if (!def) continue;
    for (const t of def.traits) {
      counts[t] = (counts[t] || 0) + 1;
    }
  }
  return counts;
}

/**
 * @param {Record<string, number>} counts
 */
export function activeTraits(counts) {
  /** @type {{ id: string, name: string, count: number, tier: number, desc: string }[]} */
  const out = [];
  for (const [id, count] of Object.entries(counts)) {
    const trait = TRAITS[id];
    if (!trait) continue;
    let tier = 0;
    for (const th of trait.thresholds) {
      if (count >= th) tier = th;
    }
    out.push({
      id,
      name: trait.name,
      count,
      tier,
      desc: tier ? trait.desc(tier) : `还需 ${trait.thresholds[0] - count} 激活`,
    });
  }
  out.sort((a, b) => b.tier - a.tier || b.count - a.count);
  return out;
}

/**
 * Aggregate combat modifiers from items + active traits.
 * @param {string[]} itemIds
 * @param {{ id: string, tier: number }[]} traits
 */
export function buildCombatMods(itemIds, traits) {
  const mods = {
    dmg: 1,
    rate: 1,
    area: 1,
    magnet: 1,
    hp: 0,
    burstBonus: 0,
    contactResist: 0,
    rangedDmg: 1,
    rangedRange: 1,
    bladeDmg: 1,
    arcaneDmg: 1,
    arcaneArea: 1,
    ringArea: 1,
    critChance: 0,
    leech: false,
    frost: false,
  };

  for (const id of itemIds) {
    const it = ITEMS.find((x) => x.id === id);
    if (!it) continue;
    for (const [k, v] of Object.entries(it.effect)) {
      if (k === 'hp' || k === 'burstBonus' || k === 'lawSlot') mods[k] = (mods[k] || 0) + v;
      else if (typeof mods[k] === 'number' && mods[k] >= 1) mods[k] *= v;
      else mods[k] = v;
    }
  }

  for (const t of traits) {
    if (!t.tier) continue;
    if (t.id === 'blade') mods.bladeDmg *= t.tier >= 4 ? 1.4 : 1.2;
    if (t.id === 'ranged') {
      if (t.tier >= 3) {
        mods.rangedDmg *= 1.3;
        mods.rangedRange *= 1.3;
      } else {
        mods.rangedDmg *= 1.1;
        mods.rangedRange *= 1.15;
      }
    }
    if (t.id === 'arcane') {
      mods.arcaneDmg *= 1.25;
      mods.arcaneArea *= 1.15;
    }
    if (t.id === 'ring') mods.ringArea *= 1.25;
    if (t.id === 'vanguard') mods.contactResist = 0.18;
    if (t.id === 'precise') mods.critChance = 0.2;
    if (t.id === 'iron') mods.hp += 40;
  }

  return mods;
}

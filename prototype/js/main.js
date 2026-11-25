import {
  UNITS,
  LAWS,
  ITEMS,
  TRAITS,
  LAW_SLOT_BASE,
  LAW_SLOT_MAX,
  starLabel,
  countTraits,
  activeTraits,
  buildCombatMods,
  RUN,
  waveConfig,
  getAct,
  isBossWave,
  shopUnitIds,
  interestFor,
  rerollCost,
  milestoneText,
  pickItemChoices,
  defaultFacing,
  facingLabel,
  meleeCanWander,
  BOARD_SIZE,
  BOARD_SLOTS,
  rollMapNodes,
  availableEvolutions,
} from './data.js';
import { Arena } from './arena.js';

const state = {
  gold: RUN.startGold,
  wave: 1,
  lives: RUN.startLives,
  nextUid: 1,
  runWon: false,
  /** @type {({ defId: string, slot: number, uid: number, star: number, facing: number } | null)[]} */
  board: Array(BOARD_SIZE).fill(null),
  ownedLaws: /** @type {string[]} */ ([]),
  /** @type {(string | null)[]} */
  lawSlots: Array(LAW_SLOT_BASE).fill(null),
  extraLawSlots: 0,
  items: /** @type {string[]} */ ([]),
  /** @type {{ kind: 'unit'|'law'|'item', id: string }[]} */
  shop: [],
  selectedLaw: null,
  pendingItemPicks: 0,
  /** map */
  pathLocked: false,
  mapChoices: /** @type {any[]} */ ([]),
  routeLabel: '',
  freeReroll: 0,
  shopBias: 'normal', // normal | rich
  nextCombat: {
    elite: false,
    spawnMult: 1,
    clearGoldMult: 1,
    durationMult: 1,
    soft: false,
  },
};

const el = {
  hud: document.getElementById('hud'),
  map: document.getElementById('panel-map'),
  mapChoices: document.getElementById('map-choices'),
  prep: document.getElementById('panel-prep'),
  arenaPanel: document.getElementById('panel-arena'),
  result: document.getElementById('panel-result'),
  board: document.getElementById('board'),
  shop: document.getElementById('shop'),
  lawPool: document.getElementById('law-pool'),
  lawSlots: document.getElementById('law-slots'),
  bonds: document.getElementById('bonds'),
  items: document.getElementById('items'),
  evolutions: document.getElementById('evolutions'),
  btnReroll: document.getElementById('btn-reroll'),
  btnFight: document.getElementById('btn-fight'),
  btnContinue: document.getElementById('btn-continue'),
  resultTitle: document.getElementById('result-title'),
  resultBody: document.getElementById('result-body'),
  resultChoices: document.getElementById('result-choices'),
  levelModal: document.getElementById('levelup-modal'),
  levelChoices: document.getElementById('levelup-choices'),
  canvas: document.getElementById('arena'),
};

const arena = new Arena(el.canvas, { units: UNITS });

function lawSlotCount() {
  return Math.min(LAW_SLOT_MAX, LAW_SLOT_BASE + state.extraLawSlots);
}

function syncLawSlots() {
  const n = lawSlotCount();
  while (state.lawSlots.length < n) state.lawSlots.push(null);
  while (state.lawSlots.length > n) {
    const removed = state.lawSlots.pop();
    // unequipped law stays owned
    void removed;
  }
}

function placedUnits() {
  return state.board.filter(Boolean);
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function rollShop() {
  const cfg = waveConfig(state.wave);
  const units = shopUnitIds(state.wave);
  state.shop = [];
  let unitW = state.wave <= 3 ? 0.62 : state.wave <= 6 ? 0.5 : 0.42;
  let lawW = state.wave <= 3 ? 0.2 : 0.25;
  if (state.shopBias === 'rich') {
    unitW = 0.35;
    lawW = 0.3;
  }
  for (let i = 0; i < cfg.shopSlots; i++) {
    const r = Math.random();
    if (r < unitW) {
      state.shop.push({ kind: 'unit', id: pickRandom(units) });
    } else if (r < unitW + lawW) {
      state.shop.push({ kind: 'law', id: pickRandom(LAWS).id });
    } else {
      const pool = ITEMS.filter((x) => x.id !== 'spare_slot' || state.extraLawSlots < 2);
      state.shop.push({ kind: 'item', id: pickRandom(pool).id });
    }
  }
}

function show(panel) {
  el.map?.classList.toggle('hidden', panel !== 'map');
  el.prep.classList.toggle('hidden', panel !== 'prep');
  el.arenaPanel.classList.toggle('hidden', panel !== 'arena');
  el.result.classList.toggle('hidden', panel !== 'result');
}

function resetCombatMods() {
  state.nextCombat = {
    elite: false,
    spawnMult: 1,
    clearGoldMult: 1,
    durationMult: 1,
    soft: false,
  };
  state.shopBias = 'normal';
}

function openMapSelect() {
  if (isBossWave(state.wave)) {
    state.pathLocked = true;
    state.routeLabel = 'Boss 关 · 固定清潮';
    resetCombatMods();
    rollShop();
    show('prep');
    renderAll();
    return;
  }
  state.mapChoices = rollMapNodes(state.wave, 3);
  state.pathLocked = false;
  renderMapChoices();
  show('map');
}

function renderMapChoices() {
  if (!el.mapChoices) return;
  el.mapChoices.innerHTML = '';
  state.mapChoices.forEach((node) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'map-node';
    btn.innerHTML = `
      <span class="tag">${node.tag}</span>
      <span class="title">${node.name}</span>
      <span class="desc">${node.desc}</span>
    `;
    btn.addEventListener('click', () => pickMapNode(node));
    el.mapChoices.appendChild(btn);
  });
}

function pickMapNode(node) {
  resetCombatMods();
  state.pathLocked = true;
  state.routeLabel = `${node.name}（${node.tag}）`;
  state.freeReroll = 0;

  if (node.id === 'elite') {
    state.nextCombat.elite = true;
    state.nextCombat.spawnMult = 1.5;
    state.nextCombat.clearGoldMult = 1.4;
    state.nextCombat.durationMult = 1.15;
    flashHint('精英巢：本波压力上升，通关金更丰');
  } else if (node.id === 'shop') {
    state.gold += 5;
    state.freeReroll = 1;
    state.shopBias = 'rich';
    flashHint('黑市：+5 金，并可免费刷新一次');
  } else if (node.id === 'rest') {
    state.lives = Math.min(RUN.startLives, state.lives + 1);
    state.nextCombat.soft = true;
    state.nextCombat.spawnMult = 0.92;
    state.nextCombat.durationMult = 0.95;
    flashHint('休整：生命 +1，本波稍缓');
  } else if (node.id === 'event') {
    resolveEvent();
  } else {
    flashHint('清潮：常规开战');
  }

  rollShop();
  show('prep');
  renderAll();
}

function resolveEvent() {
  const roll = Math.random();
  if (roll < 0.28) {
    const item = pickRandom(ITEMS);
    grantItem(item.id);
    flashHint(`事件：拾获 ${item.name}`);
  } else if (roll < 0.5) {
    const law = pickRandom(LAWS.filter((l) => !state.ownedLaws.includes(l.id)));
    if (law) {
      grantLaw(law.id);
      flashHint(`事件：领悟法则 ${law.name}`);
    } else {
      state.gold += 5;
      flashHint('事件：法则已齐，改得 5 金');
    }
  } else if (roll < 0.7) {
    if (state.gold >= 4) {
      state.gold -= 4;
      grantItem(pickRandom(ITEMS.filter((i) => i.cost >= 4)).id);
      flashHint('事件：花 4 金赌到一件较好道具');
    } else {
      state.gold += 3;
      flashHint('事件：囊中羞涩，得 3 金救济');
    }
  } else if (roll < 0.85) {
    state.gold += 10;
    flashHint('事件：捡到钱袋 +10 金');
  } else {
    state.nextCombat.elite = true;
    state.nextCombat.spawnMult = 1.25;
    state.nextCombat.clearGoldMult = 1.35;
    flashHint('事件：惊动精英……本波变难，但赏金更高');
  }
}

function applyInterest() {
  const gain = interestFor(state.gold);
  state.gold += gain;
  return gain;
}

function flashHint(msg) {
  let tip = document.getElementById('prep-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'prep-tip';
    tip.className = 'prep-tip';
    const shopBlock = document.getElementById('shop')?.parentElement;
    const actions = shopBlock?.querySelector('.prep-actions');
    if (actions) shopBlock.insertBefore(tip, actions);
    else document.getElementById('shop')?.after(tip);
  }
  tip.textContent = msg;
  tip.classList.add('show');
  clearTimeout(flashHint._t);
  flashHint._t = setTimeout(() => tip.classList.remove('show'), 1800);
}

function sellPrice(unit) {
  const def = UNITS[unit.defId];
  const base = Math.max(1, Math.floor(def.cost / 2));
  return base * unit.star * unit.star;
}

/** Try TFT-style merge: 3 same defId+star → 1 star+1 */
function tryMergeAll() {
  let merged = false;
  for (let star = 1; star <= 2; star++) {
    /** @type {Record<string, number[]>} */
    const groups = {};
    state.board.forEach((cell, idx) => {
      if (!cell || cell.star !== star) return;
      if (!groups[cell.defId]) groups[cell.defId] = [];
      groups[cell.defId].push(idx);
    });
    for (const [defId, idxs] of Object.entries(groups)) {
      while (idxs.length >= 3) {
        const keep = idxs.shift();
        const a = idxs.shift();
        const b = idxs.shift();
        state.board[a] = null;
        state.board[b] = null;
        state.board[keep].star = star + 1;
        merged = true;
        flashHint(`${UNITS[defId].name} 升到 ${starLabel(star + 1)}`);
      }
    }
  }
  return merged;
}

function addUnitToBoard(defId, star = 1) {
  const empty = state.board.findIndex((c) => !c);
  if (empty < 0) return false;
  state.board[empty] = {
    defId,
    star,
    slot: empty,
    uid: state.nextUid++,
    facing: defaultFacing(empty),
  };
  tryMergeAll();
  return true;
}

function grantItem(itemId) {
  const item = ITEMS.find((x) => x.id === itemId);
  if (!item) return;
  if (item.effect.lawSlot) {
    state.extraLawSlots = Math.min(2, state.extraLawSlots + item.effect.lawSlot);
    syncLawSlots();
  }
  state.items.push(itemId);
}

function grantLaw(lawId) {
  if (!state.ownedLaws.includes(lawId)) state.ownedLaws.push(lawId);
  const empty = state.lawSlots.findIndex((x) => !x);
  if (empty >= 0 && !state.lawSlots.includes(lawId)) {
    state.lawSlots[empty] = lawId;
  }
}

function buyFromShop(shopIndex) {
  const offer = state.shop[shopIndex];
  if (!offer) return;

  if (offer.kind === 'unit') {
    const def = UNITS[offer.id];
    if (state.gold < def.cost) return flashHint(`金币不足（需要 ${def.cost}）`);
    if (!addUnitToBoard(offer.id)) return flashHint('棋盘已满，卖掉或合成腾位');
    state.gold -= def.cost;
  } else if (offer.kind === 'law') {
    const law = LAWS.find((l) => l.id === offer.id);
    if (!law) return;
    if (state.ownedLaws.includes(law.id)) return flashHint('已拥有该法则');
    if (state.gold < law.cost) return flashHint(`金币不足（需要 ${law.cost}）`);
    state.gold -= law.cost;
    grantLaw(law.id);
  } else if (offer.kind === 'item') {
    const item = ITEMS.find((x) => x.id === offer.id);
    if (!item) return;
    if (state.gold < item.cost) return flashHint(`金币不足（需要 ${item.cost}）`);
    state.gold -= item.cost;
    grantItem(item.id);
  }

  state.shop.splice(shopIndex, 1);
  renderAll();
}

function renderHud() {
  const placed = placedUnits().length;
  const laws = state.lawSlots.filter(Boolean).length;
  const act = getAct(state.wave);
  const cfg = waveConfig(state.wave);
  const interest = interestFor(state.gold);
  const tip = milestoneText(state.wave, placedUnits());
  el.hud.innerHTML = `
    <span>金币 <b>${state.gold}</b>${interest ? ` <small>(利息+${interest})</small>` : ''}</span>
    <span>${act.name} <b>${state.wave}/${RUN.maxWave}</b>${cfg.boss ? ' · Boss' : ''}</span>
    <span>生命 <b>${state.lives}</b></span>
    <span>棋子 <b>${placed}/${BOARD_SIZE}</b></span>
    <span>法则 <b>${laws}/${lawSlotCount()}</b></span>
    <span>道具 <b>${state.items.length}</b></span>
  `;
  let mile = document.getElementById('milestone');
  if (!mile) {
    mile = document.createElement('div');
    mile.id = 'milestone';
    mile.className = 'milestone';
    el.prep?.prepend(mile);
  }
  mile.textContent = tip;
}

function renderBoard() {
  el.board.innerHTML = '';
  el.board.className = 'board board-ring';

  const hub = document.createElement('div');
  hub.className = 'board-hub';
  hub.innerHTML = '<span>阵心</span>';
  hub.style.gridRow = '2';
  hub.style.gridColumn = '2';
  el.board.appendChild(hub);

  BOARD_SLOTS.forEach((slot) => {
    const idx = slot.id;
    const cell = state.board[idx];
    const wrap = document.createElement('div');
    wrap.className = 'cell' + (cell ? ' filled' : '');
    wrap.style.gridRow = String(slot.gridRow);
    wrap.style.gridColumn = String(slot.gridCol);

    if (!cell) {
      wrap.innerHTML = `<span class="meta">${slot.label}</span>`;
      el.board.appendChild(wrap);
      return;
    }
    if (cell.facing == null) cell.facing = defaultFacing(idx);
    cell.slot = idx;
    const def = UNITS[cell.defId];
    const traits = def.traits.map((t) => TRAITS[t].name).join('/');
    const wander = def.kind === 'melee' && def.id !== 'drone'
      && meleeCanWander(cell.star, state.items, cell.defId);
    const face = facingLabel(cell.facing);

    wrap.innerHTML = `
      <span class="name">${def.name} ${starLabel(cell.star)}</span>
      <span class="meta">${traits}</span>
      <span class="facing-row">
        <button type="button" class="face-btn" data-act="face" title="点击转向">${face}</button>
        <button type="button" class="sell-btn" data-act="sell" title="卖出">卖</button>
      </span>
      <span class="meta">${wander ? '走位' : def.kind === 'melee' && def.id !== 'drone' ? '站桩' : ''}</span>
    `;
    wrap.addEventListener('click', (ev) => {
      const act = ev.target?.dataset?.act;
      if (act === 'face') {
        cell.facing = ((cell.facing || 0) + 1) % 4;
        renderAll();
        return;
      }
      if (act === 'sell') {
        state.gold += sellPrice(cell);
        state.board[idx] = null;
        renderAll();
      }
    });
    el.board.appendChild(wrap);
  });
}

function renderBonds() {
  if (!el.bonds) return;
  const counts = countTraits(placedUnits());
  const list = activeTraits(counts);
  el.bonds.innerHTML = '';
  if (!list.length) {
    el.bonds.innerHTML = '<div class="muted">上阵棋子后显示羁绊</div>';
    return;
  }
  for (const t of list) {
    const div = document.createElement('div');
    div.className = 'bond' + (t.tier ? ' active' : '');
    const need = TRAITS[t.id].thresholds.map(String).join('/');
    div.innerHTML = `
      <span class="bond-name">${t.name} ${t.count}/${need}</span>
      <span class="bond-desc">${t.desc}</span>
    `;
    el.bonds.appendChild(div);
  }
}

function renderEvolutions() {
  if (!el.evolutions) return;
  el.evolutions.innerHTML = '';
  const craftable = availableEvolutions(placedUnits(), state.items);
  if (!craftable.length) {
    el.evolutions.innerHTML =
      '<div class="muted">配方：刀仔★★+游猎符→猎刃 · 盾卫★★+铁心→壁障 · 祭环+飞刃→星环</div>';
    return;
  }
  craftable.forEach((evo) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'evo-card';
    btn.innerHTML = `<span class="title">进化 · ${evo.name}</span><span class="desc">${evo.desc}</span>`;
    btn.addEventListener('click', () => doEvolution(evo));
    el.evolutions.appendChild(btn);
  });
}

function doEvolution(evo) {
  const units = placedUnits();
  const mainIdx = state.board.findIndex(
    (c) => c && evo.unitIds.includes(c.defId) && (c.star || 1) >= (evo.needStar || 1),
  );
  if (mainIdx < 0) return flashHint('缺少主材料棋子');

  if (evo.consumeExtraUnit) {
    const extraIdx = state.board.findIndex(
      (c, i) => c && c.defId === evo.consumeExtraUnit && i !== mainIdx,
    );
    if (extraIdx < 0) return flashHint('缺少被吞并的棋子');
    state.board[extraIdx] = null;
  }

  for (const iid of evo.itemIds || []) {
    const at = state.items.indexOf(iid);
    if (at < 0) return flashHint('缺少道具材料');
    state.items.splice(at, 1);
  }

  const keep = state.board[mainIdx];
  state.board[mainIdx] = {
    defId: evo.resultId,
    star: Math.max(keep.star || 1, evo.needStar || 1),
    slot: keep.slot ?? mainIdx,
    uid: state.nextUid++,
    facing: keep.facing ?? defaultFacing(keep.slot ?? mainIdx),
  };
  flashHint(`进化成功：${UNITS[evo.resultId].name}`);
  renderAll();
}

function renderItems() {
  if (!el.items) return;
  el.items.innerHTML = '';
  if (!state.items.length) {
    el.items.innerHTML = '<div class="muted">波内升级与结算可选永久道具，商店也会卖</div>';
    return;
  }
  /** @type {Record<string, number>} */
  const stacked = {};
  for (const id of state.items) stacked[id] = (stacked[id] || 0) + 1;
  for (const [id, n] of Object.entries(stacked)) {
    const item = ITEMS.find((x) => x.id === id);
    if (!item) continue;
    const div = document.createElement('div');
    div.className = 'inv-item';
    div.innerHTML = `
      <span class="title">${item.name}${n > 1 ? ` ×${n}` : ''}</span>
      <span class="desc">${item.desc}</span>
    `;
    el.items.appendChild(div);
  }
}

function renderShop() {
  el.shop.innerHTML = '';
  state.shop.forEach((offer, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'item';
    if (offer.kind === 'unit') {
      const def = UNITS[offer.id];
      const traits = def.traits.map((t) => TRAITS[t].name).join('·');
      btn.classList.toggle('disabled-look', state.gold < def.cost);
      btn.innerHTML = `
        <span class="title">棋子 · ${def.name}</span>
        <span class="price">${def.cost} 金 · ${traits}</span>
        <span class="desc">${def.desc}（3 同名同星合成升星）</span>
      `;
    } else if (offer.kind === 'law') {
      const law = LAWS.find((l) => l.id === offer.id);
      const owned = state.ownedLaws.includes(law.id);
      btn.classList.toggle('disabled-look', owned || state.gold < law.cost);
      btn.innerHTML = `
        <span class="title">法则 · ${law.name}${owned ? '（已有）' : ''}</span>
        <span class="price">${law.cost} 金</span>
        <span class="desc">${law.desc}</span>
      `;
    } else {
      const item = ITEMS.find((x) => x.id === offer.id);
      btn.classList.toggle('disabled-look', state.gold < item.cost);
      btn.innerHTML = `
        <span class="title">道具 · ${item.name}</span>
        <span class="price">${item.cost} 金 · 永久</span>
        <span class="desc">${item.desc}</span>
      `;
    }
    btn.addEventListener('click', () => buyFromShop(i));
    el.shop.appendChild(btn);
  });
}

function renderLaws() {
  syncLawSlots();
  el.lawSlots.innerHTML = '';
  state.lawSlots.forEach((id, i) => {
    const slot = document.createElement('button');
    slot.type = 'button';
    slot.className = 'law-slot' + (id ? ' filled' : '');
    slot.textContent = id ? LAWS.find((l) => l.id === id).name : `槽 ${i + 1}`;
    slot.addEventListener('click', () => {
      if (state.lawSlots[i]) {
        state.lawSlots[i] = null;
        renderAll();
        return;
      }
      if (state.selectedLaw) {
        const already = state.lawSlots.indexOf(state.selectedLaw);
        if (already >= 0) state.lawSlots[already] = null;
        state.lawSlots[i] = state.selectedLaw;
        state.selectedLaw = null;
        renderAll();
      } else {
        flashHint('先点下方已拥有的法则再装上');
      }
    });
    el.lawSlots.appendChild(slot);
  });

  el.lawPool.innerHTML = '';
  if (!state.ownedLaws.length) {
    el.lawPool.innerHTML = '<div class="muted">商店购买法则后出现在这里，再装到上方槽位</div>';
    return;
  }
  state.ownedLaws.forEach((lawId) => {
    const law = LAWS.find((l) => l.id === lawId);
    const equipped = state.lawSlots.includes(lawId);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'law-card' + (state.selectedLaw === lawId ? ' selected' : '');
    btn.innerHTML = `
      <span class="title">${law.name}${equipped ? ' · 已装备' : ''}</span>
      <span class="desc">${law.desc}</span>
    `;
    btn.addEventListener('click', () => {
      if (equipped) {
        const idx = state.lawSlots.indexOf(lawId);
        if (idx >= 0) state.lawSlots[idx] = null;
        state.selectedLaw = null;
      } else {
        const empty = state.lawSlots.findIndex((x) => !x);
        if (empty >= 0) {
          state.lawSlots[empty] = lawId;
          state.selectedLaw = null;
        } else {
          state.selectedLaw = lawId;
          flashHint('法则板已满，点一个槽替换，或买扩容钉');
        }
      }
      renderAll();
    });
    el.lawPool.appendChild(btn);
  });
}

function renderRouteBanner() {
  let ban = document.getElementById('route-banner');
  if (!ban) {
    ban = document.createElement('div');
    ban.id = 'route-banner';
    ban.className = 'route-banner';
    el.prep?.prepend(ban);
  }
  ban.textContent = state.pathLocked
    ? `本波路线：${state.routeLabel || '清潮'}${state.freeReroll ? ' · 含免费刷新' : ''}`
    : '尚未选择路线';
}

function renderAll() {
  syncLawSlots();
  renderHud();
  renderRouteBanner();
  renderBoard();
  renderBonds();
  renderEvolutions();
  renderItems();
  renderShop();
  renderLaws();
  el.btnFight.disabled = !placedUnits().length || state.runWon || !state.pathLocked;
  const rc = state.freeReroll > 0 ? 0 : rerollCost(state.wave);
  el.btnReroll.textContent = rc === 0 ? '免费刷新' : `刷新 (${rc}金)`;
  el.btnReroll.disabled = state.gold < rc && rc > 0;
  if (isBossWave(state.wave)) el.btnFight.textContent = '挑战 Boss';
  else if (state.nextCombat.elite) el.btnFight.textContent = '挑战精英巢';
  else el.btnFight.textContent = '开战';
}

function randomItemChoices(n = 3) {
  return pickItemChoices(state.wave, n);
}

function startFight() {
  const units = placedUnits().map((u) => {
    const slot = u.slot ?? 0;
    return {
      defId: u.defId,
      slot,
      star: u.star,
      facing: u.facing ?? defaultFacing(slot),
      wander: meleeCanWander(u.star, state.items, u.defId),
    };
  });
  if (!units.length) return;
  if (!state.pathLocked) {
    flashHint('先选择路线');
    openMapSelect();
    return;
  }

  const traits = activeTraits(countTraits(units));
  const mods = buildCombatMods(state.items, traits);

  show('arena');
  el.levelModal.classList.add('hidden');
  renderHud();

  const base = waveConfig(state.wave);
  const wcfg = {
    ...base,
    spawnPerSec: base.spawnPerSec * state.nextCombat.spawnMult,
    eliteChance: state.nextCombat.elite
      ? Math.min(0.35, base.eliteChance + 0.12)
      : base.eliteChance,
    clearGold: Math.round(base.clearGold * state.nextCombat.clearGoldMult),
    duration: Math.round(base.duration * state.nextCombat.durationMult),
    enemyHp: state.nextCombat.elite ? Math.round(base.enemyHp * 1.2) : base.enemyHp,
    eliteHp: state.nextCombat.elite ? Math.round(base.eliteHp * 1.15) : base.eliteHp,
  };
  arena.start({
    units,
    laws: state.lawSlots.filter(Boolean),
    mods,
    wave: state.wave,
    waveConfig: wcfg,
    onLevelUp: (choices, pick) => {
      el.levelModal.classList.remove('hidden');
      document.querySelector('#levelup-modal h2').textContent = '获得永久道具';
      el.levelChoices.innerHTML = '';
      choices.forEach((c) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'item';
        btn.innerHTML = `<span class="title">${c.name}</span><span class="desc">${c.desc}</span>`;
        btn.addEventListener('click', () => {
          el.levelModal.classList.add('hidden');
          pick(c.id);
        });
        el.levelChoices.appendChild(btn);
      });
    },
    itemChoices: () => randomItemChoices(3),
    onItemPicked: (itemId) => {
      grantItem(itemId);
    },
    onEnd: (result) => {
      if (!result.won) state.lives -= 1;
      state.gold += result.gold;

      show('result');
      el.resultChoices.innerHTML = '';
      const lootNote = result.goldLoot ? ` · 拾金 ${result.goldLoot}` : '';

      if (result.won && result.final) {
        state.runWon = true;
        el.resultTitle.textContent = '通关 · 深井已平';
        el.resultBody.textContent = `终局击杀 ${result.kills} · +${result.gold} 金${lootNote}。构筑跑完了一轮。`;
        el.btnContinue.textContent = '再来一局';
        el.btnContinue.disabled = false;
        // still offer one victory item
        offerResultItems('胜利封印 · 选一件带走（新局仍重置，仅本波收藏感）', true);
        renderHud();
        return;
      }

      if (state.lives <= 0) {
        el.resultTitle.textContent = '本局结束';
        el.resultBody.textContent = `倒在 ${result.actName || ''} 第 ${state.wave} 波。点继续开新局。`;
        el.btnContinue.textContent = '再来一局';
        el.btnContinue.disabled = false;
        renderHud();
        return;
      }

      if (result.won) {
        const clearedWave = state.wave;
        state.wave += 1;
        const interest = applyInterest();
        el.resultTitle.textContent = result.boss
          ? `${result.actName} Boss 击破`
          : '清潮成功';
        el.resultBody.textContent =
          `击杀 ${result.kills} · 通关奖 ${result.clearGold || result.gold - (result.goldLoot || 0)} 金${lootNote}` +
          `${interest ? ` · 利息 +${interest}` : ''}。选一件永久道具：`;
        offerResultItems(
          result.boss ? 'Boss 宝箱（偏高阶）' : '波次补给',
          false,
          clearedWave,
        );
      } else {
        el.resultTitle.textContent = '阵心被吞噬';
        el.resultBody.textContent = `击杀 ${result.kills} · +${result.gold} 金${lootNote}。剩余生命 ${state.lives}。`;
        el.btnContinue.textContent = '回到备战';
        el.btnContinue.disabled = false;
      }
      renderHud();
    },
  });
}

function offerResultItems(heading, victoryOnly, forWave = state.wave) {
  el.btnContinue.disabled = true;
  el.btnContinue.textContent = '选完道具后继续';
  const note = document.createElement('div');
  note.className = 'muted';
  note.textContent = heading;
  el.resultChoices.appendChild(note);
  const choices = pickItemChoices(victoryOnly ? RUN.maxWave : forWave, 3);
  choices.forEach((c) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'item';
    btn.innerHTML = `<span class="title">${c.name}</span><span class="desc">${c.desc}</span>`;
    btn.addEventListener('click', () => {
      if (!victoryOnly) grantItem(c.id);
      el.resultChoices.innerHTML = `<div class="muted">已选择：${c.name}</div>`;
      el.btnContinue.disabled = false;
      el.btnContinue.textContent = victoryOnly ? '再来一局' : '回到备战';
      renderHud();
    });
    el.resultChoices.appendChild(btn);
  });
}

function resetRun() {
  Object.assign(state, {
    gold: RUN.startGold,
    wave: 1,
    lives: RUN.startLives,
    board: Array(BOARD_SIZE).fill(null),
    ownedLaws: [],
    lawSlots: Array(LAW_SLOT_BASE).fill(null),
    extraLawSlots: 0,
    items: [],
    shop: [],
    selectedLaw: null,
    pendingItemPicks: 0,
    runWon: false,
    pathLocked: false,
    mapChoices: [],
    routeLabel: '',
    freeReroll: 0,
    shopBias: 'normal',
  });
  resetCombatMods();
}

el.btnReroll.addEventListener('click', () => {
  if (state.freeReroll > 0) {
    state.freeReroll -= 1;
    rollShop();
    renderAll();
    return;
  }
  const cost = rerollCost(state.wave);
  if (state.gold < cost) return;
  state.gold -= cost;
  rollShop();
  renderAll();
});

document.getElementById('speed-btns')?.addEventListener('click', (ev) => {
  const btn = ev.target.closest('button[data-speed]');
  if (!btn) return;
  arena.setTimeScale(Number(btn.dataset.speed));
  document.querySelectorAll('#speed-btns button').forEach((b) => {
    b.classList.toggle('active', b === btn);
  });
});

el.btnFight.addEventListener('click', startFight);

el.btnContinue.addEventListener('click', () => {
  if (state.lives <= 0 || state.runWon) {
    resetRun();
    openMapSelect();
    return;
  }
  openMapSelect();
});

openMapSelect();

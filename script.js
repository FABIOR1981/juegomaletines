/* ==========================================================================
   Simulador de Maletines — juego clásico completo
   Fases: mezcla -> elegir maletín propio -> rondas de apertura + oferta
          (Trato / No Trato) -> cambio final -> revelación
   Toda la parametrización vive en CONFIG: es el punto de enganche para los
   modos de juego que se agreguen más adelante.
   ========================================================================== */

const CONFIG = {
  values: [
    // Columna izquierda (valores bajos / medios)
    1, 2, 5, 10, 25, 50, 75, 100, 200, 300, 400, 500, 750,
    // Columna derecha (valores altos)
    1000, 2500, 5000, 10000, 20000, 30000, 40000, 50000, 75000, 100000, 250000, 500000, 1000000
  ],

  // Cuántos maletines se abren en cada ronda. La suma debe ser
  // values.length - 2 (queda el propio + uno para el cambio final).
  roundPlan: [6, 5, 4, 3, 2, 1, 1, 1, 1],

  allowFinalSwap: true,
  locale: 'es-ES'
};

// Presets de la banca: cada modo define el rango del factor de oferta
// (arranca tacaño y sube hacia el VE a medida que avanza la partida).
const BANK_PRESETS = {
  normal:   { label: 'Normal',   start: 0.60, end: 0.90 },
  tacana:   { label: 'Tacaña',   start: 0.42, end: 0.72 },
  generosa: { label: 'Generosa', start: 0.72, end: 0.97 }
};

// Estado de los modos elegidos en el panel superior. Se puede tocar mientras
// no arrancó la partida (fase PICK antes de elegir maletín); se bloquea
// apenas se elige el maletín propio.
let modes = {
  bank: 'normal',
  educativo: false,
  perfil: false
};

// Modo de la app: 'basico' | 'tv' | 'seguimiento'.
// 'tv' es puramente estético (no cambia reglas). 'seguimiento' cambia el
// modelo de datos entero: no hay mezcla aleatoria, el usuario va anotando
// a mano qué premio salió de cada maletín mientras mira el programa real.
let appMode = 'basico';

function visualTv() {
  return appMode === 'tv' || appMode === 'seguimiento';
}

function isSeguimiento() {
  return appMode === 'seguimiento';
}

// Guarda el último maletín abierto para dispararle el destello dorado una
// sola vez, en el próximo render, si el modo visual TV está activo.
let pendingFlash = null; // { id, big }

/* ------------------------------------------------------------------------
   MODO SEGUIMIENTO — mismo set de 26 premios que el juego, pero sin mezcla:
   el usuario arma un maletín (lo toca) y después toca el valor que anunció
   el programa para asignárselo. El "VE" y la "oferta estimada" se recalculan
   sobre lo que queda en el pool real, igual que en el juego clásico.
   ------------------------------------------------------------------------ */

function createEmptyTracker() {
  return {
    cases: CONFIG.values.map((_, i) => ({ id: i + 1, value: null, opened: false, isPlayer: false })),
    usedValues: new Set(),
    armedCaseId: null,
    markingPlayer: false,
    playerCaseId: null,
    log: [] // { kind: 'apertura'|'oferta', seq, caseId?, value?, amount?, ve, modelEstimate? }
  };
}

let tracker = createEmptyTracker();

function trackerRemainingValues() {
  return CONFIG.values.filter(v => !tracker.usedValues.has(v));
}

function trackerExpectedValue() {
  const vals = trackerRemainingValues();
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function trackerBankOffer() {
  const total = CONFIG.values.length;
  const opened = tracker.usedValues.size;
  const progress = opened / (total - 2 || 1);
  const preset = BANK_PRESETS[modes.bank] || BANK_PRESETS.normal;
  const factor = preset.start + Math.min(progress, 1) * (preset.end - preset.start);
  return trackerExpectedValue() * factor;
}

function resetTracker(skipConfirm) {
  const hasProgress = tracker.usedValues.size > 0 || tracker.log.length > 0 || tracker.playerCaseId != null;
  if (hasProgress && !skipConfirm) {
    if (!window.confirm('Esto borra el seguimiento actual. ¿Continuar?')) return;
  }
  tracker = createEmptyTracker();
  setModePanelLocked(false);
  hideAllOverlays();
  renderAll();
}

function armCase(id) {
  const c = tracker.cases.find(item => item.id === id);
  if (!c) return;

  if (tracker.markingPlayer) {
    tracker.cases.forEach(item => { item.isPlayer = false; });
    c.isPlayer = true;
    tracker.playerCaseId = id;
    tracker.markingPlayer = false;
    $('seg-mark-player-btn').classList.remove('active');
    renderAll();
    return;
  }

  if (c.opened) return;
  tracker.armedCaseId = (tracker.armedCaseId === id) ? null : id;
  renderAll();
}

function assignValue(value) {
  if (tracker.armedCaseId == null || tracker.usedValues.has(value)) return;

  const c = tracker.cases.find(item => item.id === tracker.armedCaseId);
  if (!c || c.opened) return;

  c.value = value;
  c.opened = true;
  tracker.usedValues.add(value);
  tracker.log.push({
    kind: 'apertura',
    seq: tracker.log.length + 1,
    caseId: c.id,
    value,
    ve: Math.round(trackerExpectedValue())
  });
  tracker.armedCaseId = null;
  pendingFlash = visualTv() ? { id: c.id, big: value >= 100000 } : null;
  renderAll();
}

function undoLastTrackerAction() {
  const last = tracker.log.pop();
  if (!last) return;

  if (last.kind === 'apertura') {
    const c = tracker.cases.find(item => item.id === last.caseId);
    if (c) { c.value = null; c.opened = false; }
    tracker.usedValues.delete(last.value);
  }
  renderAll();
}

function registerRealOffer(amount) {
  if (!amount || amount <= 0) return;
  tracker.log.push({
    kind: 'oferta',
    seq: tracker.log.length + 1,
    amount: Math.round(amount),
    ve: Math.round(trackerExpectedValue()),
    modelEstimate: Math.round(trackerBankOffer())
  });
  renderAll();
}

function finishTracking() {
  hideAllOverlays();

  const playerC = tracker.cases.find(c => c.isPlayer);
  const revealed = playerC && playerC.opened;

  $('result-title').innerText = 'Resumen del seguimiento';
  $('result-amount').innerText = revealed ? formatMoney(playerC.value) : '—';
  $('result-sub').innerText = revealed
    ? `El maletín del participante (Nº ${playerC.id}) terminó revelado con ${formatMoney(playerC.value)}.`
    : playerC
      ? `El maletín del participante (Nº ${playerC.id}) quedó sin revelar.`
      : 'No se marcó el maletín del participante.';
  $('risk-profile').hidden = true;
  $('play-again-btn').innerText = 'Cerrar resumen';

  const hist = $('result-history');
  const offers = tracker.log.filter(l => l.kind === 'oferta');

  if (!offers.length) {
    hist.innerHTML = '<h3>Ofertas reales registradas</h3>' +
      '<p style="color:#94a3b8;font-size:0.9rem;">No se registró ninguna oferta de la banca.</p>';
  } else {
    hist.innerHTML =
      '<h3>Ofertas reales vs. modelo</h3>' +
      offers.map(o => {
        const diff = o.amount - o.modelEstimate;
        const sign = diff >= 0 ? '+' : '-';
        return `
        <div class="hist-row">
          <span>Real ${formatMoney(o.amount)}</span>
          <span>VE ${formatMoney(o.ve)}</span>
          <span class="hist-offer">Modelo ${formatMoney(o.modelEstimate)}</span>
          <span class="hist-dec ${diff >= 0 ? 'deal' : 'nodeal'}">${sign}${formatMoney(Math.abs(diff))}</span>
        </div>`;
      }).join('');
  }

  $('result-overlay').hidden = false;
}

function setAppMode(newMode) {
  if (newMode === appMode) return;

  const classicProgress = state.playerCaseId != null || state.history.length > 0;
  const trackerProgress = tracker.usedValues.size > 0 || tracker.log.length > 0 || tracker.playerCaseId != null;
  const hasProgress = isSeguimiento() ? trackerProgress : classicProgress;

  if (hasProgress && !window.confirm('Cambiar de modo reinicia lo que llevás hecho hasta ahora. ¿Continuar?')) {
    return;
  }

  appMode = newMode;

  document.querySelectorAll('#app-mode-segmented .seg-btn')
    .forEach(b => b.classList.toggle('active', b.dataset.value === newMode));

  document.body.classList.toggle('theme-tv', visualTv());
  $('seg-toolbar').hidden = !isSeguimiento();

  if (isSeguimiento()) {
    $('round-card-label').innerText = 'Abiertos';
    $('reset-btn').innerText = 'Reiniciar Seguimiento';
    resetTracker(true);
  } else {
    $('round-card-label').innerText = 'Ronda';
    $('reset-btn').innerText = 'Reiniciar Juego';
    $('seg-log').hidden = true;
    initGame();
  }
}

/* ----------------------------- Estado ----------------------------------- */

const PHASE = {
  SHUFFLE: 'shuffle',
  PICK: 'pick',
  OPEN: 'open',
  OFFER: 'offer',
  SWAP: 'swap',
  END: 'end'
};

let state = createEmptyState();
let isShuffling = false;

function createEmptyState() {
  return {
    phase: PHASE.PICK,
    cases: [],          // { id, value, opened, isPlayer }
    playerCaseId: null,
    roundIndex: 0,
    opensLeftInRound: 0,
    history: [],        // { round, offer, ve, decision }
    result: null
  };
}

/* ----------------------------- Utilidades -------------------------------- */

const $ = (id) => document.getElementById(id);

function formatMoney(amount) {
  return '$' + Math.round(amount).toLocaleString(CONFIG.locale);
}

function animateCount(el, from, to, duration) {
  const start = performance.now();
  function step(now) {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    el.innerText = formatMoney(from + (to - from) * eased);
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function unopenedCases() {
  return state.cases.filter(c => !c.opened);
}

function remainingValues() {
  return unopenedCases().map(c => c.value);
}

function revealedValues() {
  return state.cases.filter(c => c.opened).map(c => c.value);
}

function expectedValue() {
  const vals = remainingValues();
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function bankOffer() {
  const total = CONFIG.values.length;
  const openedCount = total - remainingValues().length;
  const progress = openedCount / (total - 2 || 1);   // 0 al inicio, ~1 al final
  const preset = BANK_PRESETS[modes.bank] || BANK_PRESETS.normal;
  const factor = preset.start + Math.min(progress, 1) * (preset.end - preset.start);
  return expectedValue() * factor;
}

/* --------------------- Estadísticas modo educativo ----------------------- */

function stdDeviationOf(vals) {
  if (!vals.length) return 0;
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const variance = vals.reduce((acc, v) => acc + (v - mean) ** 2, 0) / vals.length;
  return Math.sqrt(variance);
}

function medianOf(vals) {
  const sorted = [...vals].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function stdDeviation() {
  return stdDeviationOf(remainingValues());
}

function median() {
  return medianOf(remainingValues());
}

/* ------------------------ Perfil de riesgo -------------------------------- */

function computeRiskProfile() {
  const r = state.result;

  if (r.type !== 'deal') {
    return {
      tag: 'Buscador de riesgo',
      detail: 'Jugaste hasta el final sin aceptar ninguna oferta de la banca.'
    };
  }

  const last = state.history[state.history.length - 1];
  const ratio = last && last.ve ? last.offer / last.ve : 0;
  const pct = Math.round(ratio * 100);

  if (ratio < 0.68) {
    return {
      tag: 'Conservador',
      detail: `Aceptaste apenas la oferta llegó al ${pct}% del valor esperado: preferiste la certeza antes que arriesgar.`
    };
  }
  if (ratio < 0.85) {
    return {
      tag: 'Equilibrado',
      detail: `Aceptaste con una oferta del ${pct}% del valor esperado: ni te apuraste ni forzaste el límite.`
    };
  }
  return {
    tag: 'Buscador de riesgo',
    detail: `Esperaste hasta que la oferta llegó al ${pct}% del valor esperado antes de aceptar.`
  };
}

function playerCase() {
  return state.cases.find(c => c.id === state.playerCaseId) || null;
}

function totalRounds() {
  return CONFIG.roundPlan.length;
}

/* ----------------------------- Ciclo de juego ---------------------------- */

function initGame() {
  if (isShuffling) return;

  hideAllOverlays();

  const allCases = document.querySelectorAll('.case');
  const allBadges = document.querySelectorAll('.value-badge');

  if (allCases.length > 0) {
    isShuffling = true;
    state.phase = PHASE.SHUFFLE;
    setStatus('Mezclando maletines...');

    allCases.forEach(el => applyShuffleVars(el, 80, 30));
    allBadges.forEach(el => applyShuffleVars(el, 30, 10));

    setTimeout(() => {
      executeReset();
      isShuffling = false;
    }, 1200);
  } else {
    executeReset();
  }
}

function applyShuffleVars(el, spread, rotSpread) {
  el.style.setProperty('--tx', (Math.random() * spread - spread / 2) + 'px');
  el.style.setProperty('--ty', (Math.random() * spread - spread / 2) + 'px');
  el.style.setProperty('--rot', (Math.random() * rotSpread - rotSpread / 2) + 'deg');
  el.classList.add('shuffling');
}

function executeReset() {
  const shuffledValues = shuffle(CONFIG.values);

  state = createEmptyState();
  state.phase = PHASE.PICK;
  state.cases = CONFIG.values.map((_, i) => ({
    id: i + 1,
    value: shuffledValues[i],
    opened: false,
    isPlayer: false
  }));

  setModePanelLocked(false);
  renderAll();
}

function pickPlayerCase(id) {
  const c = state.cases.find(item => item.id === id);
  if (!c) return;

  c.isPlayer = true;
  state.playerCaseId = id;
  state.phase = PHASE.OPEN;
  state.roundIndex = 0;
  state.opensLeftInRound = CONFIG.roundPlan[0];

  setModePanelLocked(true);
  renderAll();
}

function openCase(id) {
  const c = state.cases.find(item => item.id === id);
  if (!c || c.opened || c.isPlayer) return;

  c.opened = true;
  state.opensLeftInRound--;
  pendingFlash = visualTv() ? { id: c.id, big: c.value >= 100000 } : null;

  // Se corta la interacción antes de mostrar la oferta para que no se
  // abran maletines de más durante la pausa.
  if (state.opensLeftInRound <= 0) state.phase = PHASE.OFFER;

  renderAll();

  if (state.phase === PHASE.OFFER) {
    setTimeout(startOfferPhase, 650);
  }
}

function startOfferPhase() {
  state.phase = PHASE.OFFER;

  const offer = bankOffer();
  const ve = expectedValue();
  const pending = unopenedCases().length - 1; // sin contar el propio

  const subText =
    `Valor esperado del tablero: ${formatMoney(ve)} · ` +
    `La oferta es el ${Math.round((offer / ve) * 100)}% del VE · ` +
    (pending > 0
      ? `Si rechazás, seguís con ${pending} maletín${pending === 1 ? '' : 'es'} en juego.`
      : 'Si rechazás, vas a la decisión final.');

  $('offer-overlay').hidden = false;
  renderStatus();

  if (visualTv()) {
    $('offer-thinking').hidden = false;
    $('offer-amount').style.visibility = 'hidden';
    $('offer-sub').style.visibility = 'hidden';
    $('deal-btn').disabled = true;
    $('nodeal-btn').disabled = true;

    setTimeout(() => {
      $('offer-thinking').hidden = true;
      $('offer-amount').style.visibility = 'visible';
      $('offer-sub').style.visibility = 'visible';
      $('offer-sub').innerText = subText;
      animateCount($('offer-amount'), 0, offer, 700);
      $('deal-btn').disabled = false;
      $('nodeal-btn').disabled = false;
    }, 1100);
  } else {
    $('offer-amount').innerText = formatMoney(offer);
    $('offer-sub').innerText = subText;
  }
}

function acceptOffer() {
  const offer = bankOffer();
  logDecision('Trato', offer);
  finish({
    type: 'deal',
    amount: offer,
    playerValue: playerCase().value
  });
}

function rejectOffer() {
  logDecision('No Trato', bankOffer());
  $('offer-overlay').hidden = true;

  state.roundIndex++;

  if (state.roundIndex >= totalRounds()) {
    startFinalPhase();
  } else {
    state.phase = PHASE.OPEN;
    state.opensLeftInRound = CONFIG.roundPlan[state.roundIndex];
    renderAll();
  }
}

function logDecision(decision, offer) {
  state.history.push({
    round: state.roundIndex + 1,
    offer: Math.round(offer),
    ve: Math.round(expectedValue()),
    decision
  });
}

function startFinalPhase() {
  const other = unopenedCases().find(c => !c.isPlayer);

  if (!CONFIG.allowFinalSwap || !other) {
    finish({ type: 'keep', amount: playerCase().value, playerValue: playerCase().value });
    return;
  }

  state.phase = PHASE.SWAP;
  const mine = playerCase();

  $('swap-sub').innerText =
    `Quedan dos maletines: el tuyo (Nº ${mine.id}) y el Nº ${other.id}. ` +
    `Los premios que siguen vivos son ${formatMoney(Math.min(mine.value, other.value))} y ` +
    `${formatMoney(Math.max(mine.value, other.value))}. ¿Cambiás?`;

  $('swap-overlay').hidden = false;
  renderAll();
}

function resolveFinal(didSwap) {
  const mine = playerCase();
  const other = unopenedCases().find(c => !c.isPlayer);
  const finalCase = didSwap ? other : mine;

  finish({
    type: didSwap ? 'swap' : 'keep',
    amount: finalCase.value,
    playerValue: mine.value,
    otherValue: other ? other.value : null,
    finalCaseId: finalCase.id
  });
}

function finish(result) {
  state.result = result;
  state.phase = PHASE.END;

  // Revelar todo el tablero
  state.cases.forEach(c => { c.opened = true; });

  hideAllOverlays();
  renderBoard();
  renderStatus();
  renderMetrics();
  renderResult();

  $('play-again-btn').innerText = 'Jugar de nuevo';
  $('result-overlay').hidden = false;
}

/* ----------------------------- Render ------------------------------------ */

function renderAll() {
  if (isSeguimiento()) {
    renderTrackerBoard();
    renderTrackerMetrics();
    renderTrackerStatus();
    renderTrackerPlayerBar();
    renderSegLog();
  } else {
    renderBoard();
    renderMetrics();
    renderStatus();
    renderPlayerBar();
  }
}

function renderBoard() {
  const lowList = $('low-values-list');
  const highList = $('high-values-list');
  lowList.innerHTML = '';
  highList.innerHTML = '';

  const gone = revealedValues();
  const half = Math.ceil(CONFIG.values.length / 2);

  const makeBadge = (val, cls) => {
    const badge = document.createElement('div');
    badge.className = `value-badge ${cls} ${gone.includes(val) ? 'eliminated' : ''}`;
    badge.innerText = formatMoney(val);
    return badge;
  };

  CONFIG.values.slice(0, half).forEach(v => lowList.appendChild(makeBadge(v, 'low')));
  CONFIG.values.slice(half).forEach(v => highList.appendChild(makeBadge(v, 'high')));

  const grid = $('cases-grid');
  grid.innerHTML = '';

  const clickable = (state.phase === PHASE.PICK) ||
                    (state.phase === PHASE.OPEN);

  const flash = pendingFlash;

  state.cases.forEach(c => {
    const el = document.createElement('div');
    const classes = ['case'];
    if (c.opened) classes.push('opened');
    if (c.isPlayer) classes.push('player');
    if (state.phase === PHASE.PICK) classes.push('selectable');
    if (flash && flash.id === c.id) classes.push('just-opened-tv');
    el.className = classes.join(' ');

    el.innerHTML = `
      <div class="handle"></div>
      <div class="num">${c.id}</div>
      <div class="val-hidden">${c.opened ? formatMoney(c.value) : ''}</div>
      ${c.isPlayer && !c.opened ? '<div class="mine-tag">TUYO</div>' : ''}
    `;

    if (clickable && !c.opened && !c.isPlayer) {
      el.addEventListener('click', () => {
        if (state.phase === PHASE.PICK) pickPlayerCase(c.id);
        else if (state.phase === PHASE.OPEN) openCase(c.id);
      });
    }

    grid.appendChild(el);
  });

  if (flash) {
    if (flash.big) {
      grid.classList.add('big-hit-tv');
      setTimeout(() => grid.classList.remove('big-hit-tv'), 700);
    }
    pendingFlash = null;
  }
}

function renderMetrics() {
  const count = remainingValues().length;
  $('remaining-count').innerText = count;

  const roundLabel = state.phase === PHASE.PICK
    ? '-'
    : `${Math.min(state.roundIndex + 1, totalRounds())} / ${totalRounds()}`;
  $('round-label').innerText = state.phase === PHASE.END ? 'Fin' : roundLabel;

  if (count === 0) {
    $('ve-val').innerText = '$0';
    $('bank-offer').innerText = '$0';
    return;
  }

  $('ve-val').innerText = formatMoney(expectedValue());
  $('bank-offer').innerText = state.phase === PHASE.PICK ? '—' : formatMoney(bankOffer());

  renderEduRow(remainingValues());
}

function renderEduRow(vals) {
  const row = $('edu-row');
  row.hidden = !modes.educativo;
  if (!modes.educativo) return;

  if (!vals.length) {
    $('edu-std').innerText = '$0';
    $('edu-median').innerText = '$0';
    $('edu-min').innerText = '$0';
    $('edu-max').innerText = '$0';
    return;
  }

  $('edu-std').innerText = formatMoney(stdDeviationOf(vals));
  $('edu-median').innerText = formatMoney(medianOf(vals));
  $('edu-min').innerText = formatMoney(Math.min(...vals));
  $('edu-max').innerText = formatMoney(Math.max(...vals));
}

function renderStatus() {
  switch (state.phase) {
    case PHASE.SHUFFLE:
      setStatus('Mezclando maletines...');
      break;
    case PHASE.PICK:
      setStatus('Elegí tu maletín: es el que te llevás si no aceptás ninguna oferta.');
      break;
    case PHASE.OPEN: {
      const n = state.opensLeftInRound;
      setStatus(`Ronda ${state.roundIndex + 1}: abrí ${n} maletín${n === 1 ? '' : 'es'} más.`);
      break;
    }
    case PHASE.OFFER:
      setStatus('La banca hizo su oferta. ¿Trato o No Trato?');
      break;
    case PHASE.SWAP:
      setStatus('Dos maletines en juego: quedarte o cambiar.');
      break;
    case PHASE.END:
      setStatus('Partida terminada.');
      break;
  }
}

function setStatus(text) {
  $('status-bar').innerText = text;
  const ticker = $('tv-ticker-text');
  if (ticker) ticker.innerText = text;
}

function renderPlayerBar() {
  const bar = $('player-case-bar');
  if (!state.playerCaseId) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;
  $('player-case-num').innerText = 'Nº ' + state.playerCaseId;
  $('player-case-hint').innerText = state.phase === PHASE.END
    ? `contenía ${formatMoney(playerCase().value)}`
    : 'queda cerrado hasta el final';
}

function renderResult() {
  const r = state.result;
  const mineValue = r.playerValue;

  let title, sub;

  if (r.type === 'deal') {
    title = 'Cerraste trato con la banca';
    const diff = mineValue - r.amount;
    sub = `Tu maletín Nº ${state.playerCaseId} tenía ${formatMoney(mineValue)}. ` +
          (diff > 0
            ? `Dejaste ${formatMoney(diff)} sobre la mesa.`
            : `Le ganaste ${formatMoney(Math.abs(diff))} a la banca.`);
  } else if (r.type === 'keep') {
    title = 'Te quedaste con tu maletín';
    sub = r.otherValue != null
      ? `El otro maletín tenía ${formatMoney(r.otherValue)}.`
      : 'Jugaste hasta el final sin aceptar ninguna oferta.';
  } else {
    title = 'Cambiaste de maletín';
    sub = `Tu maletín original (Nº ${state.playerCaseId}) tenía ${formatMoney(mineValue)}.`;
  }

  const bestOffer = state.history.reduce((max, h) => Math.max(max, h.offer), 0);
  if (bestOffer > 0 && r.type !== 'deal') {
    sub += ` La mejor oferta que rechazaste fue ${formatMoney(bestOffer)}.`;
  }

  $('result-title').innerText = title;
  $('result-amount').innerText = formatMoney(r.amount);
  $('result-sub').innerText = sub;

  const riskBlock = $('risk-profile');
  if (modes.perfil) {
    const profile = computeRiskProfile();
    $('risk-tag').innerText = profile.tag;
    $('risk-detail').innerText = profile.detail;
    riskBlock.hidden = false;
  } else {
    riskBlock.hidden = true;
  }

  const hist = $('result-history');
  if (!state.history.length) {
    hist.innerHTML = '';
    return;
  }

  hist.innerHTML =
    '<h3>Historial de ofertas</h3>' +
    state.history.map(h => `
      <div class="hist-row">
        <span>Ronda ${h.round}</span>
        <span>VE ${formatMoney(h.ve)}</span>
        <span class="hist-offer">${formatMoney(h.offer)}</span>
        <span class="hist-dec ${h.decision === 'Trato' ? 'deal' : 'nodeal'}">${h.decision}</span>
      </div>`).join('');
}

/* --------------------------- Render: seguimiento -------------------------- */

function renderTrackerBoard() {
  const lowList = $('low-values-list');
  const highList = $('high-values-list');
  lowList.innerHTML = '';
  highList.innerHTML = '';

  const half = Math.ceil(CONFIG.values.length / 2);
  const pickMode = tracker.armedCaseId != null;

  const makeBadge = (val, cls) => {
    const badge = document.createElement('div');
    const isUsed = tracker.usedValues.has(val);
    const classes = ['value-badge', cls];
    if (isUsed) classes.push('eliminated');
    if (pickMode && !isUsed) classes.push('pickable');
    badge.className = classes.join(' ');
    badge.innerText = formatMoney(val);

    if (pickMode && !isUsed) {
      badge.addEventListener('click', () => assignValue(val));
    }
    return badge;
  };

  CONFIG.values.slice(0, half).forEach(v => lowList.appendChild(makeBadge(v, 'low')));
  CONFIG.values.slice(half).forEach(v => highList.appendChild(makeBadge(v, 'high')));

  const grid = $('cases-grid');
  grid.innerHTML = '';
  const flash = pendingFlash;

  tracker.cases.forEach(c => {
    const el = document.createElement('div');
    const classes = ['case'];
    if (c.opened) classes.push('opened');
    if (c.isPlayer) classes.push('player');
    if (tracker.armedCaseId === c.id) classes.push('armed-seg');
    if (tracker.markingPlayer && !c.opened) classes.push('selectable');
    if (flash && flash.id === c.id) classes.push('just-opened-tv');
    el.className = classes.join(' ');

    el.innerHTML = `
      <div class="handle"></div>
      <div class="num">${c.id}</div>
      <div class="val-hidden">${c.opened ? formatMoney(c.value) : ''}</div>
      ${c.isPlayer ? '<div class="mine-tag">TUYO</div>' : ''}
    `;

    el.addEventListener('click', () => armCase(c.id));
    grid.appendChild(el);
  });

  if (flash) {
    if (flash.big) {
      grid.classList.add('big-hit-tv');
      setTimeout(() => grid.classList.remove('big-hit-tv'), 700);
    }
    pendingFlash = null;
  }
}

function renderTrackerMetrics() {
  const vals = trackerRemainingValues();
  $('remaining-count').innerText = vals.length;
  $('round-label').innerText = tracker.usedValues.size;

  if (!vals.length) {
    $('ve-val').innerText = '$0';
    $('bank-offer').innerText = '$0';
  } else {
    $('ve-val').innerText = formatMoney(trackerExpectedValue());
    $('bank-offer').innerText = formatMoney(trackerBankOffer());
  }

  renderEduRow(vals);
}

function renderTrackerStatus() {
  let text;
  if (tracker.markingPlayer) {
    text = 'Tocá el maletín del participante en el tablero.';
  } else if (tracker.armedCaseId != null) {
    text = `Maletín Nº ${tracker.armedCaseId} armado: tocá el valor que salió al aire.`;
  } else {
    text = 'Tocá un maletín y después el valor que anunciaron en el programa.';
  }
  setStatus(text);
}

function renderTrackerPlayerBar() {
  const bar = $('player-case-bar');
  if (tracker.playerCaseId == null) {
    bar.hidden = true;
    return;
  }
  const c = tracker.cases.find(item => item.id === tracker.playerCaseId);
  bar.hidden = false;
  $('player-case-num').innerText = 'Nº ' + tracker.playerCaseId;
  $('player-case-hint').innerText = (c && c.opened)
    ? `revelado: ${formatMoney(c.value)}`
    : 'aún sin revelar';
}

function renderSegLog() {
  const panel = $('seg-log');
  const body = $('seg-log-body');

  if (!tracker.log.length) {
    panel.hidden = true;
    body.innerHTML = '';
    return;
  }

  panel.hidden = false;
  body.innerHTML = tracker.log.map(entry => {
    if (entry.kind === 'apertura') {
      return `
        <div class="hist-row">
          <span>#${entry.seq}</span>
          <span>Maletín Nº ${entry.caseId}</span>
          <span class="hist-offer">${formatMoney(entry.value)}</span>
          <span>VE ${formatMoney(entry.ve)}</span>
        </div>`;
    }
    const diff = entry.amount - entry.modelEstimate;
    const sign = diff >= 0 ? '+' : '-';
    return `
      <div class="hist-row">
        <span>#${entry.seq}</span>
        <span>Oferta real ${formatMoney(entry.amount)}</span>
        <span class="hist-offer">Modelo ${formatMoney(entry.modelEstimate)}</span>
        <span class="hist-dec ${diff >= 0 ? 'deal' : 'nodeal'}">${sign}${formatMoney(Math.abs(diff))}</span>
      </div>`;
  }).join('');
}

function setModePanelLocked(locked) {
  const panel = $('mode-panel');
  panel.classList.toggle('locked', locked);

  panel.querySelectorAll('.seg-btn').forEach(btn => { btn.disabled = locked; });
  panel.querySelectorAll('input[type="checkbox"]').forEach(input => { input.disabled = locked; });
}

function hideAllOverlays() {
  ['offer-overlay', 'swap-overlay', 'result-overlay'].forEach(id => { $(id).hidden = true; });
  $('offer-thinking').hidden = true;
  $('offer-amount').style.visibility = 'visible';
  $('offer-sub').style.visibility = 'visible';
  $('deal-btn').disabled = false;
  $('nodeal-btn').disabled = false;
}

/* ----------------------------- Eventos ----------------------------------- */

document.addEventListener('DOMContentLoaded', () => {
  $('reset-btn').addEventListener('click', () => {
    if (isSeguimiento()) resetTracker();
    else initGame();
  });

  $('play-again-btn').addEventListener('click', () => {
    if (isSeguimiento()) {
      $('result-overlay').hidden = true; // cierra el resumen, no borra lo registrado
    } else {
      initGame();
    }
  });

  $('deal-btn').addEventListener('click', acceptOffer);
  $('nodeal-btn').addEventListener('click', rejectOffer);
  $('keep-btn').addEventListener('click', () => resolveFinal(false));
  $('swap-btn').addEventListener('click', () => resolveFinal(true));

  // Selector de banca (3 posiciones)
  document.querySelectorAll('#bank-segmented .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      modes.bank = btn.dataset.value;
      document.querySelectorAll('#bank-segmented .seg-btn')
        .forEach(b => b.classList.toggle('active', b === btn));
      if (isSeguimiento()) renderTrackerMetrics();
      else renderMetrics();
    });
  });

  // Switches de modo educativo y perfil de riesgo
  $('toggle-educativo').addEventListener('change', (e) => {
    modes.educativo = e.target.checked;
    if (isSeguimiento()) renderEduRow(trackerRemainingValues());
    else renderEduRow(remainingValues());
  });
  $('toggle-perfil').addEventListener('change', (e) => {
    modes.perfil = e.target.checked;
  });

  // Selector de Modo (Básico / TV / Seguimiento)
  document.querySelectorAll('#app-mode-segmented .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => setAppMode(btn.dataset.value));
  });

  // Toolbar de seguimiento
  $('seg-mark-player-btn').addEventListener('click', () => {
    tracker.markingPlayer = !tracker.markingPlayer;
    tracker.armedCaseId = null;
    $('seg-mark-player-btn').classList.toggle('active', tracker.markingPlayer);
    renderAll();
  });

  $('seg-register-offer-btn').addEventListener('click', () => {
    const input = $('seg-real-offer-input');
    const amount = parseFloat(input.value);
    if (!amount || amount <= 0) return;
    registerRealOffer(amount);
    input.value = '';
  });

  $('seg-real-offer-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('seg-register-offer-btn').click();
  });

  $('seg-undo-btn').addEventListener('click', undoLastTrackerAction);
  $('seg-finish-btn').addEventListener('click', finishTracking);

  initGame();
});

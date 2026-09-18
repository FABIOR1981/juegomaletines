/* ==========================================================================
   Dinámicas — archivo independiente del juego principal (juego.html /
   script.js / styles.css). Comparte el mismo modelo de valor esperado /
   oferta de la banca, pero con dos variantes pensadas para uso con
   personas o grupos, no para jugar solo.
   ========================================================================== */

const CONFIG = {
  values: [
    1, 2, 5, 10, 25, 50, 75, 100, 200, 300, 400, 500, 750,
    1000, 2500, 5000, 10000, 20000, 30000, 40000, 50000, 75000, 100000, 250000, 500000, 1000000
  ],
  roundPlan: [6, 5, 4, 3, 2, 1, 1, 1, 1],
  locale: 'es-ES'
};

const BANK = { start: 0.60, end: 0.90 };
const FIXED_SEED = 20260918;
const GROUP_ROUND_SECONDS = 45;

const $ = (id) => document.getElementById(id);

function formatMoney(amount) {
  return '$' + Math.round(amount).toLocaleString(CONFIG.locale);
}

function totalRounds() {
  return CONFIG.roundPlan.length;
}

function seededShuffle(array, seed) {
  const arr = [...array];
  let s = seed;
  function rand() {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function shuffleRandom(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function expectedValueOf(vals) {
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function bankOfferOf(vals) {
  const total = CONFIG.values.length;
  const opened = total - vals.length;
  const progress = opened / (total - 2 || 1);
  const factor = BANK.start + Math.min(progress, 1) * (BANK.end - BANK.start);
  return expectedValueOf(vals) * factor;
}

/* -------------------------- Navegación entre pantallas -------------------- */

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}

/* ============================================================================
   DINÁMICA INDIVIDUAL — tablero fijo (seededShuffle), mide perfil de riesgo
   y tiempo de deliberación por oferta.
   ============================================================================ */

let ind = null;

function indCreateCases() {
  const values = seededShuffle(CONFIG.values, FIXED_SEED);
  return CONFIG.values.map((_, i) => ({ id: i + 1, value: values[i], opened: false, isPlayer: false }));
}

function indStart(name) {
  ind = {
    name: name || 'Sin nombre',
    cases: indCreateCases(),
    playerCaseId: null,
    phase: 'pick',
    roundIndex: 0,
    opensLeft: 0,
    history: [],
    offerShownAt: null,
    startedAt: performance.now(),
    result: null
  };
  hideIndOverlays();
  showScreen('screen-individual-play');
  indRenderAll();
}

function indUnopened() { return ind.cases.filter(c => !c.opened); }
function indRemainingValues() { return indUnopened().map(c => c.value); }
function indPlayerCase() { return ind.cases.find(c => c.id === ind.playerCaseId); }

function indPick(id) {
  const c = ind.cases.find(item => item.id === id);
  if (!c) return;
  c.isPlayer = true;
  ind.playerCaseId = id;
  ind.phase = 'open';
  ind.roundIndex = 0;
  ind.opensLeft = CONFIG.roundPlan[0];
  indRenderAll();
}

function indOpen(id) {
  const c = ind.cases.find(item => item.id === id);
  if (!c || c.opened || c.isPlayer) return;
  c.opened = true;
  ind.opensLeft--;
  if (ind.opensLeft <= 0) ind.phase = 'offer';
  indRenderAll();
  if (ind.phase === 'offer') setTimeout(indShowOffer, 400);
}

function indShowOffer() {
  const vals = indRemainingValues();
  const ve = expectedValueOf(vals);
  const offer = bankOfferOf(vals);
  const pending = vals.length - 1;

  $('ind-offer-amount').innerText = formatMoney(offer);$('ind-offer-sub').innerText =
    `Valor esperado: ${formatMoney(ve)} · Oferta = ${Math.round((offer / ve) * 100)}% del VE · ` +
    (pending > 0 ? `Si rechazás, seguís con ${pending} maletín${pending === 1 ? '' : 'es'}.` : 'Última oportunidad antes del cambio final.');

  ind.offerShownAt = performance.now();
  $('ind-offer-overlay').hidden = false;
  indRenderStatus();
}

function indDecide(decision) {
  const vals = indRemainingValues();
  const ve = expectedValueOf(vals);
  const offer = bankOfferOf(vals);
  const latencyMs = ind.offerShownAt ? Math.round(performance.now() - ind.offerShownAt) : 0;

  ind.history.push({ round: ind.roundIndex + 1, ve: Math.round(ve), offer: Math.round(offer), decision, latencyMs });

  if (decision === 'Trato') {
    $('ind-offer-overlay').hidden = true;
    indFinish({ type: 'deal', amount: offer, playerValue: indPlayerCase().value });
    return;
  }

  $('ind-offer-overlay').hidden = true;
  ind.roundIndex++;
  if (ind.roundIndex >= totalRounds()) {
    indStartFinalPhase();
  } else {
    ind.phase = 'open';
    ind.opensLeft = CONFIG.roundPlan[ind.roundIndex];
    indRenderAll();
  }
}

function indStartFinalPhase() {
  const other = indUnopened().find(c => !c.isPlayer);
  if (!other) {
    indFinish({ type: 'keep', amount: indPlayerCase().value, playerValue: indPlayerCase().value });
    return;
  }
  ind.phase = 'swap';
  const mine = indPlayerCase();
  $('ind-swap-sub').innerText =
    `Quedan dos maletines: el tuyo (Nº ${mine.id}) y el Nº ${other.id}. ` +
    `Los premios vivos son ${formatMoney(Math.min(mine.value, other.value))} y ${formatMoney(Math.max(mine.value, other.value))}. ¿Cambiás?`;
  $('ind-swap-overlay').hidden = false;
  indRenderAll();
}

function indResolveFinal(didSwap) {
  const mine = indPlayerCase();
  const other = indUnopened().find(c => !c.isPlayer);
  const finalCase = didSwap ? other : mine;
  indFinish({
    type: didSwap ? 'swap' : 'keep',
    amount: finalCase.value,
    playerValue: mine.value,
    otherValue: other ? other.value : null
  });
}

function indComputeRiskProfile(result) {
  if (result.type !== 'deal') {
    return {
      tag: 'Buscador de riesgo',
      detail: 'Llegaste hasta el final sin aceptar ofertas: mantuviste la incertidumbre completa hasta el último instante.'
    };
  }

  const last = ind.history[ind.history.length - 1];
  const ratio = last && last.ve ? last.offer / last.ve : 0;
  const pct = Math.round(ratio * 100);

  if (ratio < 0.68) {
    return {
      tag: 'Conservador',
      detail: `Aceptaste cuando la oferta llegó al ${pct}% del valor esperado: preferiste asegurar una cifra cierta antes que arriesgar.`
    };
  }
  if (ratio < 0.85) {
    return {
      tag: 'Equilibrado',
      detail: `Aceptaste cuando la oferta llegó al ${pct}% del valor esperado: lograste un balance entre prudencia y oportunidad.`
    };
  }
  return {
    tag: 'Buscador de riesgo',
    detail: `Esperaste hasta que la oferta llegó al ${pct}% del valor esperado antes de aceptar: mostraste alta tolerancia a la volatilidad.`
  };
}

function indRenderProReport(ind, profile, totalMs, avgMs) {
  const history = ind.history || [];
  const last = history.length ? history[history.length - 1] : null;
  const ratio = (last && last.ve) ? (last.offer / last.ve) : 0;

  const speedStyle = avgMs < 3000 ? "Procesamiento Intuitivo / Heurístico Rápido" : "Procesamiento Pausado / Analítico Reflexivo";
  const outcomeText = ind.result.type === 'deal' ? `Aceptó oferta de ${formatMoney(ind.result.amount)}` : `Rechazó todas las ofertas (Llegó al final)`;

  let qualitativeObs = '';
  if (ind.result.type !== 'deal') {
    qualitativeObs = 'Demuestra una orientación marcada hacia la maximización del resultado bajo alta incertidumbre, priorizando el beneficio potencial sobre la seguridad del capital inmediato.';
  } else if (ratio < 0.68) {
    qualitativeObs = 'Muestra una aversión al riesgo pronunciada. Estuvo dispuesto a ceder más del 32% del valor esperado ponderado a cambio de eliminar la incertidumbre.';
  } else {
    qualitativeObs = 'Muestra una conducta negociadora equilibrada, evaluando racionalmente el costo de oportunidad y cerrando cuando el retorno marginal justificaba la certeza.';
  }

  const tableRows = history.map(h => {
    const rPct = Math.round((h.offer / h.ve) * 100);
    return `
      <tr style="border-bottom:1px solid rgba(148,163,184,0.1);">
        <td style="padding:6px;">Ronda ${h.round}</td>
        <td style="padding:6px;">${formatMoney(h.ve)}</td>
        <td style="padding:6px;">${formatMoney(h.offer)} (${rPct}%)</td>
        <td style="padding:6px; font-weight:bold;">${h.decision}</td>
        <td style="padding:6px;">${(h.latencyMs / 1000).toFixed(1)}s</td>
      </tr>
    `;
  }).join('');

  const html = `
    <div style="font-size:0.85rem; display:flex; flex-direction:column; gap:10px;">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; background:rgba(0,0,0,0.2); padding:10px; border-radius:8px;">
        <div><strong>Participante:</strong> ${ind.name || 'Sin especificar'}</div>
        <div><strong>Fecha:</strong> ${new Date().toLocaleDateString('es-ES')}</div>
        <div><strong>Perfil de Riesgo:</strong> <span>${profile.tag}</span></div>
        <div><strong>Estilo de Decisión:</strong> ${speedStyle}</div>
      </div>

      <div style="background:rgba(0,0,0,0.2); padding:10px; border-radius:8px;">
        <strong style="display:block; margin-bottom:4px;">Resumen Ejecutivo:</strong>
        <ul style="margin-left:18px; margin-bottom:0; line-height:1.4;">
          <li><strong>Resultado Final:</strong> ${outcomeText}.</li>
          <li><strong>Tiempo Total de Deliberación:</strong> ${(totalMs / 1000).toFixed(1)} segundos (Promedio de ${(avgMs / 1000).toFixed(1)}s por oferta).</li>
          <li><strong>Diagnóstico Cualitativo:</strong> ${qualitativeObs}</li>
        </ul>
      </div>

      <div style="margin-top:6px;">
        <strong style="display:block; margin-bottom:6px;">Matriz Cuantitativa de Ofertas y Tiempos:</strong>
        <table style="width:100%; border-collapse:collapse; text-align:left; font-size:0.8rem; background:rgba(0,0,0,0.2); border-radius:8px; overflow:hidden;">
          <thead>
            <tr style="background:rgba(148,163,184,0.1); font-family:Orbitron,sans-serif; font-size:0.68rem; text-transform:uppercase;">
              <th style="padding:6px;">Ronda</th>
              <th style="padding:6px;">VE</th>
              <th style="padding:6px;">Oferta (% VE)</th>
              <th style="padding:6px;">Decisión</th>
              <th style="padding:6px;">Tiempo</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>
    </div>
  `;

  $('ind-pro-report-content').innerHTML = html;
}

function indFinish(result) {
  ind.result = result;
  ind.phase = 'end';
  ind.cases.forEach(c => { c.opened = true; });
  hideIndOverlays();
  indRenderBoard();
  indRenderStatus();
  indRenderMetrics();
  indRenderResult();
  $('ind-result-overlay').hidden = false;
}

/* --------------------------------- Render --------------------------------- */

function indRenderAll() {
  indRenderBoard();
  indRenderMetrics();
  indRenderStatus();
  indRenderPlayerBar();
}

function indRenderBoard() {
  const lowList = $('ind-low-list');
  const highList = $('ind-high-list');
  lowList.innerHTML = '';
  highList.innerHTML = '';

  const revealed = ind.cases.filter(c => c.opened).map(c => c.value);
  const half = Math.ceil(CONFIG.values.length / 2);

  const makeBadge = (val, cls) => {
    const b = document.createElement('div');
    b.className = `value-badge ${cls} ${revealed.includes(val) ? 'eliminated' : ''}`;
    b.innerText = formatMoney(val);
    return b;
  };

  CONFIG.values.slice(0, half).forEach(v => lowList.appendChild(makeBadge(v, 'low')));
  CONFIG.values.slice(half).forEach(v => highList.appendChild(makeBadge(v, 'high')));

  const grid = $('ind-cases-grid');
  grid.innerHTML = '';
  const clickable = ind.phase === 'pick' || ind.phase === 'open';

  ind.cases.forEach(c => {
    const el = document.createElement('div');
    const classes = ['case'];
    if (c.opened) classes.push('opened');
    if (c.isPlayer) classes.push('player');
    if (ind.phase === 'pick') classes.push('selectable');
    el.className = classes.join(' ');
    el.innerHTML = `
      <div class="num">${c.id}</div>
      ${c.opened ? `<div class="val">${formatMoney(c.value)}</div>` : ''}
      ${c.isPlayer && !c.opened ? '<div class="mine-tag">TUYO</div>' : ''}
    `;
    if (clickable && !c.opened && !c.isPlayer) {
      el.addEventListener('click', () => {
        if (ind.phase === 'pick') indPick(c.id);
        else if (ind.phase === 'open') indOpen(c.id);
      });
    }
    grid.appendChild(el);
  });
}

function indRenderMetrics() {
  const vals = indRemainingValues();
  $('ind-remaining').innerText = vals.length;
  $('ind-round-label').innerText = ind.phase === 'end'
    ? 'Fin'
    : ind.phase === 'pick' ? '-' : `${Math.min(ind.roundIndex + 1, totalRounds())} / ${totalRounds()}`;
  $('ind-ve').innerText = vals.length ? formatMoney(expectedValueOf(vals)) : '$0';$('ind-offer').innerText = (vals.length && ind.phase !== 'pick') ? formatMoney(bankOfferOf(vals)) : '—';
}

function indRenderStatus() {
  let text;
  switch (ind.phase) {
    case 'pick': text = 'Elegí tu maletín: es el que te llevás si no aceptás ninguna oferta.'; break;
    case 'open': text = `Ronda ${ind.roundIndex + 1}: abrí ${ind.opensLeft} maletín${ind.opensLeft === 1 ? '' : 'es'} más.`; break;
    case 'offer': text = 'La banca hizo su oferta. ¿Trato o No Trato?'; break;
    case 'swap': text = 'Dos maletines en juego: quedarse o cambiar.'; break;
    case 'end': text = 'Prueba terminada.'; break;
    default: text = '';
  }
  $('ind-status').innerText = text;
}

function indRenderPlayerBar() {
  const bar = $('ind-player-bar');
  if (ind.playerCaseId == null) { bar.hidden = true; return; }
  bar.hidden = false;
  $('ind-player-num').innerText = 'Nº ' + ind.playerCaseId;
  $('ind-player-hint').innerText = ind.phase === 'end'
    ? `contenía ${formatMoney(indPlayerCase().value)}`
    : 'queda cerrado hasta el final';
}

function indRenderResult() {
  const r = ind.result;
  let title, sub;

  if (r.type === 'deal') {
    title = 'Cerraste trato con la banca';
    const diff = r.playerValue - r.amount;
    sub = `Tu maletín (Nº ${ind.playerCaseId}) tenía ${formatMoney(r.playerValue)}. ` +
      (diff > 0 ? `Dejaste ${formatMoney(diff)} sobre la mesa.` : `Le ganaste ${formatMoney(Math.abs(diff))} a la banca.`);
  } else if (r.type === 'keep') {
    title = 'Te quedaste con tu maletín';
    sub = r.otherValue != null ? `El otro maletín tenía ${formatMoney(r.otherValue)}.` : 'Llegaste al final sin aceptar ninguna oferta.';
  } else {
    title = 'Cambiaste de maletín';
    sub = `Tu maletín original (Nº ${ind.playerCaseId}) tenía ${formatMoney(r.playerValue)}.`;
  }

  $('ind-result-title').innerText = `${title} — ${ind.name}`;
  $('ind-result-amount').innerText = formatMoney(r.amount);$('ind-result-sub').innerText = sub;

  const profile = indComputeRiskProfile(r);
  $('ind-risk-tag').innerText = profile.tag;
  $('ind-risk-detail').innerText = profile.detail;

  const totalMs = ind.history.reduce((acc, h) => acc + h.latencyMs, 0);
  const avgMs = ind.history.length ? Math.round(totalMs / ind.history.length) : 0;

  $('ind-result-history').innerHTML =
    `<h3>Decisiones tomadas</h3>` +
    ind.history.map(h => `
      <div class="hist-row">
        <span>Ronda ${h.round}</span>
        <span>VE ${formatMoney(h.ve)}</span>
        <span class="hist-offer">${formatMoney(h.offer)}</span>
        <span class="hist-dec ${h.decision === 'Trato' ? 'deal' : 'nodeal'}">${h.decision}</span>
      </div>`).join('');

  // Generar reporte profesional
  indRenderProReport(ind, profile, totalMs, avgMs);

  // Estado inicial
  $('ind-pro-report').hidden = true;
  $('ind-toggle-pro-btn').innerText = '👁️ Ver Informe Profesional';
}

function hideIndOverlays() {
  ['ind-offer-overlay', 'ind-swap-overlay', 'ind-result-overlay'].forEach(id => { $(id).hidden = true; });
}

/* ============================================================================
   DINÁMICA GRUPAL — tablero al azar, decisión en consenso con cronómetro y
   registro opcional de quién impulsó cada decisión.
   ============================================================================ */

let grpParticipants = [];
let grp = null;
let grpTimerHandle = null;

function grpAddParticipant(name) {
  const clean = name.trim();
  if (!clean) return;
  grpParticipants.push(clean);
  renderGrpParticipantEditor();
}

function grpRemoveParticipant(index) {
  grpParticipants.splice(index, 1);
  renderGrpParticipantEditor();
}

function renderGrpParticipantEditor() {
  const box = $('grp-participant-list');
  if (!grpParticipants.length) {
    box.innerHTML = '<p class="empty-note">Todavía no agregaste participantes (es opcional).</p>';
    return;
  }
  box.innerHTML = '';
  grpParticipants.forEach((name, i) => {
    const row = document.createElement('div');
    row.className = 'participant-row';
    row.innerHTML = `<span>${name}</span><button type="button" data-i="${i}">Quitar</button>`;
    row.querySelector('button').addEventListener('click', () => grpRemoveParticipant(i));
    box.appendChild(row);
  });
}

function grpFillDriverSelects() {
  ['grp-driver-select', 'grp-swap-driver-select'].forEach(id => {
    const sel = $(id);
    sel.innerHTML = '<option value="">— Sin especificar —</option>' +
      grpParticipants.map(n => `<option value="${n}">${n}</option>`).join('');
  });
}

function grpCreateCases() {
  const values = shuffleRandom(CONFIG.values);
  return CONFIG.values.map((_, i) => ({ id: i + 1, value: values[i], opened: false, isPlayer: false }));
}

function grpStart() {
  grp = {
    cases: grpCreateCases(),
    playerCaseId: null,
    phase: 'pick',
    roundIndex: 0,
    opensLeft: 0,
    history: [],
    result: null
  };
  grpFillDriverSelects();
  hideGrpOverlays();
  showScreen('screen-group-play');
  grpRenderAll();
}

function grpUnopened() { return grp.cases.filter(c => !c.opened); }
function grpRemainingValues() { return grpUnopened().map(c => c.value); }
function grpPlayerCase() { return grp.cases.find(c => c.id === grp.playerCaseId); }

function grpPick(id) {
  const c = grp.cases.find(item => item.id === id);
  if (!c) return;
  c.isPlayer = true;
  grp.playerCaseId = id;
  grp.phase = 'open';
  grp.roundIndex = 0;
  grp.opensLeft = CONFIG.roundPlan[0];
  grpRenderAll();
}

function grpOpen(id) {
  const c = grp.cases.find(item => item.id === id);
  if (!c || c.opened || c.isPlayer) return;
  c.opened = true;
  grp.opensLeft--;
  if (grp.opensLeft <= 0) grp.phase = 'offer';
  grpRenderAll();
  if (grp.phase === 'offer') setTimeout(grpShowOffer, 400);
}

function grpShowOffer() {
  const vals = grpRemainingValues();
  const ve = expectedValueOf(vals);
  const offer = bankOfferOf(vals);
  const pending = vals.length - 1;

  $('grp-offer-amount').innerText = formatMoney(offer);$('grp-offer-sub').innerText =
    `Valor esperado: ${formatMoney(ve)} · Oferta = ${Math.round((offer / ve) * 100)}% del VE · ` +
    (pending > 0 ? `Si rechazan, siguen con ${pending} maletín${pending === 1 ? '' : 'es'}.` : 'Última oportunidad antes del cambio final.');

  $('grp-driver-select').value = '';$('grp-offer-overlay').hidden = false;
  grpRenderStatus();
  grpStartTimer(offer, ve);
}

function grpStartTimer(offer, ve) {
  clearInterval(grpTimerHandle);
  let secondsLeft = GROUP_ROUND_SECONDS;
  const ring = $('grp-countdown');
  ring.innerText = secondsLeft + 's';
  ring.classList.remove('low');

  grpTimerHandle = setInterval(() => {
    secondsLeft--;
    ring.innerText = Math.max(secondsLeft, 0) + 's';
    if (secondsLeft <= 10) ring.classList.add('low');
    if (secondsLeft <= 0) {
      clearInterval(grpTimerHandle);
      grpDecide('No Trato', true);
    }
  }, 1000);
}

function grpDecide(decision, auto) {
  clearInterval(grpTimerHandle);
  const vals = grpRemainingValues();
  const ve = expectedValueOf(vals);
  const offer = bankOfferOf(vals);
  const driver = auto ? '' : $('grp-driver-select').value;

  grp.history.push({ round: grp.roundIndex + 1, ve: Math.round(ve), offer: Math.round(offer), decision, driver, auto: !!auto });

  if (decision === 'Trato') {
    $('grp-offer-overlay').hidden = true;
    grpFinish({ type: 'deal', amount: offer, playerValue: grpPlayerCase().value });
    return;
  }

  $('grp-offer-overlay').hidden = true;
  grp.roundIndex++;
  if (grp.roundIndex >= totalRounds()) {
    grpStartFinalPhase();
  } else {
    grp.phase = 'open';
    grp.opensLeft = CONFIG.roundPlan[grp.roundIndex];
    grpRenderAll();
  }
}

function grpStartFinalPhase() {
  const other = grpUnopened().find(c => !c.isPlayer);
  if (!other) {
    grpFinish({ type: 'keep', amount: grpPlayerCase().value, playerValue: grpPlayerCase().value });
    return;
  }
  grp.phase = 'swap';
  const mine = grpPlayerCase();
  $('grp-swap-sub').innerText =
    `Quedan dos maletines: el suyo (Nº ${mine.id}) y el Nº ${other.id}. ` +
    `Los premios vivos son ${formatMoney(Math.min(mine.value, other.value))} y ${formatMoney(Math.max(mine.value, other.value))}. ¿Cambian?`;
  $('grp-swap-driver-select').value = '';$('grp-swap-overlay').hidden = false;
  grpRenderAll();
}

function grpResolveFinal(didSwap) {
  const mine = grpPlayerCase();
  const other = grpUnopened().find(c => !c.isPlayer);
  const finalCase = didSwap ? other : mine;
  const driver = $('grp-swap-driver-select').value;

  grp.history.push({
    round: totalRounds() + 1,
    ve: 0,
    offer: 0,
    decision: didSwap ? 'Cambió' : 'Se quedó',
    driver,
    auto: false,
    isFinal: true
  });

  grpFinish({
    type: didSwap ? 'swap' : 'keep',
    amount: finalCase.value,
    playerValue: mine.value,
    otherValue: other ? other.value : null
  });
}

function grpFinish(result) {
  grp.result = result;
  grp.phase = 'end';
  grp.cases.forEach(c => { c.opened = true; });
  hideGrpOverlays();
  grpRenderBoard();
  grpRenderStatus();
  grpRenderMetrics();
  grpRenderResult();
  $('grp-result-overlay').hidden = false;
}

/* --------------------------------- Render --------------------------------- */

function grpRenderAll() {
  grpRenderBoard();
  grpRenderMetrics();
  grpRenderStatus();
  grpRenderPlayerBar();
}

function grpRenderBoard() {
  const lowList = $('grp-low-list');
  const highList = $('grp-high-list');
  lowList.innerHTML = '';
  highList.innerHTML = '';

  const revealed = grp.cases.filter(c => c.opened).map(c => c.value);
  const half = Math.ceil(CONFIG.values.length / 2);

  const makeBadge = (val, cls) => {
    const b = document.createElement('div');
    b.className = `value-badge ${cls} ${revealed.includes(val) ? 'eliminated' : ''}`;
    b.innerText = formatMoney(val);
    return b;
  };

  CONFIG.values.slice(0, half).forEach(v => lowList.appendChild(makeBadge(v, 'low')));
  CONFIG.values.slice(half).forEach(v => highList.appendChild(makeBadge(v, 'high')));

  const grid = $('grp-cases-grid');
  grid.innerHTML = '';
  const clickable = grp.phase === 'pick' || grp.phase === 'open';

  grp.cases.forEach(c => {
    const el = document.createElement('div');
    const classes = ['case'];
    if (c.opened) classes.push('opened');
    if (c.isPlayer) classes.push('player');
    if (grp.phase === 'pick') classes.push('selectable');
    el.className = classes.join(' ');
    el.innerHTML = `
      <div class="num">${c.id}</div>
      ${c.opened ? `<div class="val">${formatMoney(c.value)}</div>` : ''}
      ${c.isPlayer && !c.opened ? '<div class="mine-tag">GRUPO</div>' : ''}
    `;
    if (clickable && !c.opened && !c.isPlayer) {
      el.addEventListener('click', () => {
        if (grp.phase === 'pick') grpPick(c.id);
        else if (grp.phase === 'open') grpOpen(c.id);
      });
    }
    grid.appendChild(el);
  });
}

function grpRenderMetrics() {
  const vals = grpRemainingValues();
  $('grp-remaining').innerText = vals.length;
  $('grp-round-label').innerText = grp.phase === 'end'
    ? 'Fin'
    : grp.phase === 'pick' ? '-' : `${Math.min(grp.roundIndex + 1, totalRounds())} / ${totalRounds()}`;
  $('grp-ve').innerText = vals.length ? formatMoney(expectedValueOf(vals)) : '$0';$('grp-offer').innerText = (vals.length && grp.phase !== 'pick') ? formatMoney(bankOfferOf(vals)) : '—';
}

function grpRenderStatus() {
  let text;
  switch (grp.phase) {
    case 'pick': text = 'Elijan el maletín del grupo.'; break;
    case 'open': text = `Ronda ${grp.roundIndex + 1}: abran ${grp.opensLeft} maletín${grp.opensLeft === 1 ? '' : 'es'} más.`; break;
    case 'offer': text = 'La banca ofrece. Discutan y decidan antes de que termine el tiempo.'; break;
    case 'swap': text = 'Dos maletines en juego: quedarse o cambiar.'; break;
    case 'end': text = 'Dinámica terminada.'; break;
    default: text = '';
  }
  $('grp-status').innerText = text;
}

function grpRenderPlayerBar() {
  const bar = $('grp-player-bar');
  if (grp.playerCaseId == null) { bar.hidden = true; return; }
  bar.hidden = false;
  $('grp-player-num').innerText = 'Nº ' + grp.playerCaseId;
  $('grp-player-hint').innerText = grp.phase === 'end'
    ? `contenía ${formatMoney(grpPlayerCase().value)}`
    : 'queda cerrado hasta el final';
}

function grpParticipationTally() {
  const counts = {};
  grp.history.forEach(h => {
    if (h.driver) counts[h.driver] = (counts[h.driver] || 0) + 1;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function grpRenderResult() {
  const r = grp.result;
  let title, sub;

  if (r.type === 'deal') {
    title = 'El grupo cerró trato con la banca';
    const diff = r.playerValue - r.amount;
    sub = `El maletín del grupo (Nº ${grp.playerCaseId}) tenía ${formatMoney(r.playerValue)}. ` +
      (diff > 0 ? `Dejaron ${formatMoney(diff)} sobre la mesa.` : `Le ganaron ${formatMoney(Math.abs(diff))} a la banca.`);
  } else if (r.type === 'keep') {
    title = 'El grupo se quedó con su maletín';
    sub = r.otherValue != null ? `El otro maletín tenía ${formatMoney(r.otherValue)}.` : 'Llegaron al final sin aceptar ninguna oferta.';
  } else {
    title = 'El grupo cambió de maletín';
    sub = `El maletín original (Nº ${grp.playerCaseId}) tenía ${formatMoney(r.playerValue)}.`;
  }

  $('grp-result-title').innerText = title;
  $('grp-result-amount').innerText = formatMoney(r.amount);$('grp-result-sub').innerText = sub;

  const tally = grpParticipationTally();
  const partBox = $('grp-participation-list');
  if (!tally.length) {
    partBox.innerHTML = '<p class="empty-note">No se registraron participantes en las decisiones.</p>';
  } else {
    const max = tally[0][1];
    partBox.innerHTML = '<h3 style="font-family:Orbitron,sans-serif;font-size:0.72rem;letter-spacing:1px;text-transform:uppercase;color:#64748b;margin-bottom:10px;">Participación en las decisiones</h3>' +
      tally.map(([name, count]) => `
        <div class="participation-row">
          <span>${name}</span>
          <span class="participation-bar-track"><span class="participation-bar-fill" style="width:${(count / max) * 100}%"></span></span>
          <span>${count}</span>
        </div>`).join('');
  }

  $('grp-result-history').innerHTML =
    '<h3>Historial de decisiones</h3>' +
    grp.history.map(h => `
      <div class="hist-row">
        <span>${h.isFinal ? 'Final' : 'Ronda ' + h.round}</span>
        <span class="hist-offer">${h.offer ? formatMoney(h.offer) : '—'}</span>
        <span class="hist-dec ${h.auto ? 'auto' : (h.decision === 'Trato' ? 'deal' : 'nodeal')}">${h.decision}${h.auto ? ' (auto)' : ''}</span>
        <span>${h.driver || '—'}</span>
      </div>`).join('');
}

function hideGrpOverlays() {
  clearInterval(grpTimerHandle);
  ['grp-offer-overlay', 'grp-swap-overlay', 'grp-result-overlay'].forEach(id => { $(id).hidden = true; });
}

/* ----------------------------- Eventos globales --------------------------- */

document.addEventListener('DOMContentLoaded', () => {
  // Menú
  document.querySelectorAll('.dyn-card[data-target]').forEach(card => {
    card.addEventListener('click', () => {
      const target = card.dataset.target;
      if (target === 'individual') showScreen('screen-individual-intro');
      if (target === 'group') showScreen('screen-group-intro');
    });
  });

  document.querySelectorAll('[data-back]').forEach(btn => {
    btn.addEventListener('click', () => showScreen('screen-menu'));
  });

  // ---- Individual ----
  $('ind-start-btn').addEventListener('click', () => indStart($('ind-name-input').value));
  $('ind-deal-btn').addEventListener('click', () => indDecide('Trato'));$('ind-nodeal-btn').addEventListener('click', () => indDecide('No Trato'));
  $('ind-keep-btn').addEventListener('click', () => indResolveFinal(false));$('ind-swap-btn').addEventListener('click', () => indResolveFinal(true));

  // Toggle de la vista profesional
  $('ind-toggle-pro-btn').addEventListener('click', () => {
    const reportBox = $('ind-pro-report');
    const isHidden = reportBox.hidden;
    reportBox.hidden = !isHidden;
    $('ind-toggle-pro-btn').innerText = isHidden ? '🙈 Ocultar Informe Profesional' : '👁️ Ver Informe Profesional';
  });

  // Impresión exclusiva del informe profesional
  $('ind-print-pro-btn').addEventListener('click', () => {
    document.body.classList.add('printing-pro-report');
    window.print();
    document.body.classList.remove('printing-pro-report');
  });

  $('ind-again-btn').addEventListener('click', () => {
    hideIndOverlays();
    $('ind-name-input').value = '';
    showScreen('screen-individual-intro');
  });

  $('ind-reset-btn').addEventListener('click', () => {
    if (ind && ind.history.length && !window.confirm('Esto reinicia la prueba actual. ¿Continuar?')) return;
    indStart(ind ? ind.name : '');
  });

  // ---- Grupal ----
  $('grp-add-btn').addEventListener('click', () => {
    const input = $('grp-name-input');
    grpAddParticipant(input.value);
    input.value = '';
    input.focus();
  });
  $('grp-name-input').addEventListener('keydown', (e) => {     if (e.key === 'Enter') { e.preventDefault();$('grp-add-btn').click(); }
  });
  $('grp-start-btn').addEventListener('click', grpStart);
  $('grp-deal-btn').addEventListener('click', () => grpDecide('Trato', false));$('grp-nodeal-btn').addEventListener('click', () => grpDecide('No Trato', false));
  $('grp-keep-btn').addEventListener('click', () => grpResolveFinal(false));$('grp-swap-btn').addEventListener('click', () => grpResolveFinal(true));
  $('grp-print-btn').addEventListener('click', () => window.print());$('grp-again-btn').addEventListener('click', () => {
    hideGrpOverlays();
    showScreen('screen-group-intro');
  });
  $('grp-reset-btn').addEventListener('click', () => {
    if (grp && grp.history.length && !window.confirm('Esto reinicia la dinámica actual. ¿Continuar?')) return;
    grpStart();
  });

  renderGrpParticipantEditor();
});
/* ==========================================================================
   Dinámicas — Archivo independiente para el juego de maletines y evaluación psicométrica
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

function formatValue(amount, isAbstract) {
  const rounded = Math.round(amount);
  if (isAbstract) {
    return rounded.toLocaleString(CONFIG.locale) + ' pts';
  }
  return '$' + rounded.toLocaleString(CONFIG.locale);
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

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}

/* ============================================================================
   DETECCIÓN DE PARÁMETROS URL (MODO CLÍNICO / PSICOMÉTRICO AUTOMÁTICO)
   ============================================================================ */

function checkUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const isPsico = params.get('psico') === 'true' || params.get('modo') === 'clinico' || params.get('abstract') === 'true';
  
  if (isPsico) {
    const indCheck = $('ind-abstract-mode');
    const grpCheck = $('grp-abstract-mode');
    if (indCheck) indCheck.checked = true;
    if (grpCheck) grpCheck.checked = true;
    document.title = "Evaluación Psicométrica de Toma de Decisiones";
  }
}

/* ============================================================================
   DINÁMICA INDIVIDUAL (PSICOMÉTRICA / ABSTRACTA)
   ============================================================================ */

let ind = null;

function indCreateCases() {
  const values = seededShuffle(CONFIG.values, FIXED_SEED);
  return CONFIG.values.map((_, i) => ({ id: i + 1, value: values[i], opened: false, isPlayer: false }));
}

function indStart(name, isAbstract) {
  ind = {
    name: name || 'Evaluado/a sin nombre',
    isAbstract: !!isAbstract,
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

  $('ind-offer-amount').innerText = formatValue(offer, ind.isAbstract);$('ind-offer-sub').innerText =
    `Valor Esperado: ${formatValue(ve, ind.isAbstract)} · Oferta = ${Math.round((offer / ve) * 100)}% del VE · ` +
    (pending > 0 ? `Si rechaza, continúa con ${pending} posición${pending === 1 ? '' : 'es'}.` : 'Última oportunidad antes del dilema final.');

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
    `Dilema final: quedan dos posiciones (su posición N° ${mine.id} y la N° ${other.id}). ` +
    `Los valores posibles son ${formatValue(Math.min(mine.value, other.value), ind.isAbstract)} y ${formatValue(Math.max(mine.value, other.value), ind.isAbstract)}. ¿Desea cambiar de posición?`;
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
      tag: 'Buscador de riesgo / Maximizador',
      detail: 'Mantuvo la posición hasta el término del ejercicio sin aceptar tratos intermedios. Alta tolerancia a la entropía y resistencia a la aversión a la pérdida.'
    };
  }

  const last = ind.history[ind.history.length - 1];
  const ratio = last && last.ve ? last.offer / last.ve : 0;
  const pct = Math.round(ratio * 100);

  if (ratio < 0.68) {
    return {
      tag: 'Conservador / Aversión a la pérdida',
      detail: `Aceptó al alcanzar el ${pct}% del valor esperado. Evidenció preferencia por asegurar rendimiento cierto frente a la volatilidad.`
    };
  }
  if (ratio < 0.85) {
    return {
      tag: 'Equilibrado / Racional Adaptativo',
      detail: `Aceptó con una oferta del ${pct}% del valor esperado. Demostró balance adecuado entre costo de oportunidad y prudencia.`
    };
  }
  return {
    tag: 'Buscador de riesgo / Alta Asunción',
    detail: `Exigió hasta el ${pct}% del valor esperado antes de cerrar el trato. Tolerancia superior al riesgo y búsqueda activa de retornos.`
  };
}

function indRenderProReport(ind, profile, totalMs, avgMs) {
  const history = ind.history || [];
  const last = history.length ? history[history.length - 1] : null;
  const ratio = (last && last.ve) ? (last.offer / last.ve) : 0;

  const speedStyle = avgMs < 3000 ? "Procesamiento Intuitivo / Heurístico Rápido (Sistema 1)" : "Procesamiento Analítico / Reflexivo (Sistema 2)";
  const outcomeText = ind.result.type === 'deal' ? `Aceptó oferta de ${formatValue(ind.result.amount, ind.isAbstract)}` : `Rechazó todas las ofertas (Llegó al final)`;

  let qualitativeObs = '';
  if (ind.result.type !== 'deal') {
    qualitativeObs = 'Demuestra conducta orientada a la maximización bajo incertidumbre pura, priorizando el resultado potencial máximo sobre la seguridad inmediata.';
  } else if (ratio < 0.68) {
    qualitativeObs = 'Se observa aversión pronunciada a la pérdida (Prospect Theory). Priorizó la reducción de la incertidumbre cediendo parte sustancial del valor esperado.';
  } else {
    qualitativeObs = 'Patrón de negociación adaptativo. Evaluó racionalmente el valor esperado y cerró cuando el retorno marginal justificaba la certeza.';
  }

  const tableRows = history.map(h => {
    const rPct = Math.round((h.offer / h.ve) * 100);
    return `
      <tr style="border-bottom:1px solid rgba(148,163,184,0.1);">
        <td style="padding:6px;">Ronda ${h.round}</td>
        <td style="padding:6px;">${formatValue(h.ve, ind.isAbstract)}</td>
        <td style="padding:6px;">${formatValue(h.offer, ind.isAbstract)} (${rPct}%)</td>
        <td style="padding:6px; font-weight:bold;">${h.decision}</td>
        <td style="padding:6px;">${(h.latencyMs / 1000).toFixed(1)}s</td>
      </tr>
    `;
  }).join('');

  const html = `
    <div style="font-size:0.85rem; display:flex; flex-direction:column; gap:10px;">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; background:rgba(0,0,0,0.2); padding:10px; border-radius:8px;">
        <div><strong>Evaluado/a:</strong> ${ind.name || 'Sin especificar'}</div>
        <div><strong>Fecha:</strong> ${new Date().toLocaleDateString('es-ES')}</div>
        <div><strong>Modalidad:</strong> ${ind.isAbstract ? 'Psicométrica (Puntos Abstractos)' : 'Monetaria Clásica'}</div>
        <div><strong>Perfil Taxonómico:</strong> <span>${profile.tag}</span></div>
        <div style="grid-column: span 2;"><strong>Estilo Cognitivo Dominante:</strong> ${speedStyle}</div>
      </div>

      <div style="background:rgba(0,0,0,0.2); padding:10px; border-radius:8px;">
        <strong style="display:block; margin-bottom:4px;">Síntesis Psicométrica y Conductual:</strong>
        <ul style="margin-left:18px; margin-bottom:0; line-height:1.4;">
          <li><strong>Resultado Final:</strong> ${outcomeText} (${formatValue(ind.result.amount, ind.isAbstract)}).</li>
          <li><strong>Tiempo de Latencia Cognitiva:</strong> ${(totalMs / 1000).toFixed(1)}s acumulados (Promedio de ${(avgMs / 1000).toFixed(1)}s por oferta).</li>
          <li><strong>Análisis Clínico / Conductual:</strong> ${qualitativeObs}</li>
        </ul>
      </div>

      <div style="margin-top:6px;">
        <strong style="display:block; margin-bottom:6px;">Matriz Cuantitativa de Ofertas, VE y Latencias:</strong>
        <table style="width:100%; border-collapse:collapse; text-align:left; font-size:0.8rem; background:rgba(0,0,0,0.2); border-radius:8px; overflow:hidden;">
          <thead>
            <tr style="background:rgba(148,163,184,0.1); font-family:Orbitron,sans-serif; font-size:0.68rem; text-transform:uppercase;">
              <th style="padding:6px;">Ronda</th>
              <th style="padding:6px;">VE</th>
              <th style="padding:6px;">Oferta (% VE)</th>
              <th style="padding:6px;">Decisión</th>
              <th style="padding:6px;">Latencia</th>
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
    b.innerText = formatValue(val, ind.isAbstract);
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
      ${c.opened ? `<div class="val">${formatValue(c.value, ind.isAbstract)}</div>` : ''}
      ${c.isPlayer && !c.opened ? '<div class="mine-tag">PROPIA</div>' : ''}
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
  $('ind-ve').innerText = vals.length ? formatValue(expectedValueOf(vals), ind.isAbstract) : formatValue(0, ind.isAbstract);
  $('ind-offer').innerText = (vals.length && ind.phase !== 'pick') ? formatValue(bankOfferOf(vals), ind.isAbstract) : '—';
}

function indRenderStatus() {
  let text;
  switch (ind.phase) {
    case 'pick': text = 'Seleccione la posición base (maletín del evaluado).'; break;
    case 'open': text = `Ronda ${ind.roundIndex + 1}: abra ${ind.opensLeft} posición${ind.opensLeft === 1 ? '' : 'es'} más.`; break;
    case 'offer': text = 'La banca emitió oferta. ¿Aceptar (Trato) o Rechazar (No Trato)?'; break;
    case 'swap': text = 'Dilema final: conservar o cambiar de posición.'; break;
    case 'end': text = 'Evaluación finalizada.'; break;
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
    ? `contenía ${formatValue(indPlayerCase().value, ind.isAbstract)}`
    : 'posición bloqueada';
}

function indRenderResult() {
  const r = ind.result;
  let title, sub;

  if (r.type === 'deal') {
    title = 'Trato cerrado con la banca';
    const diff = r.playerValue - r.amount;
    sub = `La posición original (Nº ${ind.playerCaseId}) contenía ${formatValue(r.playerValue, ind.isAbstract)}. ` +
      (diff > 0 ? `Diferencia frente al potencial: ${formatValue(diff, ind.isAbstract)} sobre la mesa.` : `Superó la expectativa de la banca en ${formatValue(Math.abs(diff), ind.isAbstract)}.`);
  } else if (r.type === 'keep') {
    title = 'Conservó su posición original';
    sub = r.otherValue != null ? `La posición restante contenía ${formatValue(r.otherValue, ind.isAbstract)}.` : 'Llegó al final sin aceptar tratos.';
  } else {
    title = 'Decidió cambiar de posición';
    sub = `Su posición original (Nº ${ind.playerCaseId}) contenía ${formatValue(r.playerValue, ind.isAbstract)}.`;
  }

  $('ind-result-title').innerText = `${title} — ${ind.name}`;
  $('ind-result-amount').innerText = formatValue(r.amount, ind.isAbstract);$('ind-result-sub').innerText = sub;

  const profile = indComputeRiskProfile(r);
  $('ind-risk-tag').innerText = profile.tag;
  $('ind-risk-detail').innerText = profile.detail;

  const totalMs = ind.history.reduce((acc, h) => acc + h.latencyMs, 0);
  const avgMs = ind.history.length ? Math.round(totalMs / ind.history.length) : 0;

  $('ind-result-history').innerHTML =
    `<h3>Historial de decisiones y latencias</h3>` +
    ind.history.map(h => `
      <div class="hist-row">
        <span>Ronda ${h.round}</span>
        <span>VE ${formatValue(h.ve, ind.isAbstract)}</span>
        <span class="hist-offer">${formatValue(h.offer, ind.isAbstract)}</span>
        <span class="hist-dec ${h.decision === 'Trato' ? 'deal' : 'nodeal'}">${h.decision}</span>
      </div>`).join('');

  indRenderProReport(ind, profile, totalMs, avgMs);

  $('ind-pro-report').hidden = true;
  $('ind-toggle-pro-btn').innerText = '👁️ Ver Informe Psicométrico';
}

function hideIndOverlays() {
  ['ind-offer-overlay', 'ind-swap-overlay', 'ind-result-overlay'].forEach(id => {
    const el = $(id);
    if (el) el.hidden = true;
  });
}

/* ============================================================================
   DINÁMICA GRUPAL
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
    if (sel) {
      sel.innerHTML = '<option value="">— Sin especificar —</option>' +
        grpParticipants.map(n => `<option value="${n}">${n}</option>`).join('');
    }
  });
}

function grpCreateCases() {
  const values = shuffleRandom(CONFIG.values);
  return CONFIG.values.map((_, i) => ({ id: i + 1, value: values[i], opened: false, isPlayer: false }));
}

function grpStart(isAbstract) {
  grp = {
    isAbstract: !!isAbstract,
    cases: grpCreateCases(),
    playerCaseId: null,
    phase: 'pick',
    roundIndex: 0,
    opensLeft: 0,
    history: [],
    result: null
  };
  clearInterval(grpTimerHandle);
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

  $('grp-offer-amount').innerText = formatValue(offer, grp.isAbstract);$('grp-offer-sub').innerText =
    `Valor esperado: ${formatValue(ve, grp.isAbstract)} · Oferta = ${Math.round((offer / ve) * 100)}% del VE · ` +
    (pending > 0 ? `Si rechazan, continúan con ${pending} posición${pending === 1 ? '' : 'es'}.` : 'Última oportunidad antes del dilema final.');

  $('grp-driver-select').value = '';$('grp-offer-overlay').hidden = false;
  grpRenderStatus();
  grpStartTimer();
}

function grpStartTimer() {
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
    `Quedan dos posiciones: la del grupo (Nº ${mine.id}) y la Nº ${other.id}. ` +
    `Los valores vivos son ${formatValue(Math.min(mine.value, other.value), grp.isAbstract)} y ${formatValue(Math.max(mine.value, other.value), grp.isAbstract)}. ¿Deciden cambiar?`;
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

function grpRenderProReport(grp) {
  const history = grp.history || [];
  const tally = grpParticipationTally();
  const totalDecisions = history.length;

  let leadersHtml = '';
  if (tally.length) {
    leadersHtml = tally.map(([name, count]) => {
      const pct = Math.round((count / totalDecisions) * 100);
      return `<li><strong>${name}:</strong> Impulsó ${count} decisión(es) (${pct}% de influencia en el liderazgo grupal).</li>`;
    }).join('');
  } else {
    leadersHtml = '<li>No se asignaron impulsores explícitos durante la dinámica.</li>';
  }

  const autoDecisions = history.filter(h => h.auto).length;
  const timeObs = autoDecisions > 0
    ? `El grupo experimentó ${autoDecisions} decisión(es) forzada(s) por expiración del tiempo límite (45s), evidenciando fricción o bloqueo en el consenso.`
    : 'El grupo gestionó fluidamente el límite de tiempo (45s), alcanzando acuerdos de manera sincronizada.';

  const tableRows = history.map(h => `
    <tr style="border-bottom:1px solid rgba(148,163,184,0.1);">
      <td style="padding:6px;">${h.isFinal ? 'Final' : 'Ronda ' + h.round}</td>
      <td style="padding:6px;">${h.ve ? formatValue(h.ve, grp.isAbstract) : '—'}</td>
      <td style="padding:6px;">${h.offer ? formatValue(h.offer, grp.isAbstract) : '—'}</td>
      <td style="padding:6px; font-weight:bold;">${h.decision}${h.auto ? ' (Tiempo agotado)' : ''}</td>
      <td style="padding:6px;">${h.driver || 'Consenso tácito'}</td>
    </tr>
  `).join('');

  const html = `
    <div style="font-size:0.85rem; display:flex; flex-direction:column; gap:10px;">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; background:rgba(0,0,0,0.2); padding:10px; border-radius:8px;">
        <div><strong>Modalidad Grupal:</strong> Consenso Cronometrado</div>
        <div><strong>Fecha:</strong> ${new Date().toLocaleDateString('es-ES')}</div>
        <div><strong>Participantes:</strong> ${grpParticipants.length || 'No especificados'}</div>
        <div><strong>Resultado:</strong> ${formatValue(grp.result.amount, grp.isAbstract)}</div>
      </div>

      <div style="background:rgba(0,0,0,0.2); padding:10px; border-radius:8px;">
        <strong style="display:block; margin-bottom:4px;">Análisis de Liderazgo e Influencia:</strong>
        <ul style="margin-left:18px; margin-bottom:6px; line-height:1.4;">
          ${leadersHtml}
        </ul>
        <strong style="display:block; margin-top:8px; margin-bottom:4px;">Gestión de la Presión Temporal:</strong>
        <p style="margin:0; line-height:1.4;">${timeObs}</p>
      </div>

      <div style="margin-top:6px;">
        <strong style="display:block; margin-bottom:6px;">Matriz Grupal de Decisiones y Liderazgo:</strong>
        <table style="width:100%; border-collapse:collapse; text-align:left; font-size:0.8rem; background:rgba(0,0,0,0.2); border-radius:8px; overflow:hidden;">
          <thead>
            <tr style="background:rgba(148,163,184,0.1); font-family:Orbitron,sans-serif; font-size:0.68rem; text-transform:uppercase;">
              <th style="padding:6px;">Ronda</th>
              <th style="padding:6px;">VE</th>
              <th style="padding:6px;">Oferta</th>
              <th style="padding:6px;">Decisión</th>
              <th style="padding:6px;">Impulsor</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>
    </div>
  `;

  $('grp-pro-report-content').innerHTML = html;
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
    b.innerText = formatValue(val, grp.isAbstract);
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
      ${c.opened ? `<div class="val">${formatValue(c.value, grp.isAbstract)}</div>` : ''}
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
  $('grp-ve').innerText = vals.length ? formatValue(expectedValueOf(vals), grp.isAbstract) : formatValue(0, grp.isAbstract);
  $('grp-offer').innerText = (vals.length && grp.phase !== 'pick') ? formatValue(bankOfferOf(vals), grp.isAbstract) : '—';
}

function grpRenderStatus() {
  let text;
  switch (grp.phase) {
    case 'pick': text = 'Elijan la posición del grupo.'; break;
    case 'open': text = `Ronda ${grp.roundIndex + 1}: abran ${grp.opensLeft} posición${grp.opensLeft === 1 ? '' : 'es'} más.`; break;
    case 'offer': text = 'La banca ofrece. Discutan y decidan antes de que concluya el tiempo.'; break;
    case 'swap': text = 'Dos posiciones en juego: mantener o cambiar.'; break;
    case 'end': text = 'Dinámica finalizada.'; break;
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
    ? `contenía ${formatValue(grpPlayerCase().value, grp.isAbstract)}`
    : 'posición bloqueada';
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
    sub = `La posición del grupo (Nº ${grp.playerCaseId}) contenía ${formatValue(r.playerValue, grp.isAbstract)}. ` +
      (diff > 0 ? `Diferencia sobre la mesa: ${formatValue(diff, grp.isAbstract)}.` : `Superaron la oferta de la banca.`);
  } else if (r.type === 'keep') {
    title = 'El grupo conservó su posición';
    sub = r.otherValue != null ? `La otra posición contenía ${formatValue(r.otherValue, grp.isAbstract)}.` : 'Llegaron al final sin aceptar tratos.';
  } else {
    title = 'El grupo cambió de posición';
    sub = `La posición original (Nº ${grp.playerCaseId}) contenía ${formatValue(r.playerValue, grp.isAbstract)}.`;
  }

  $('grp-result-title').innerText = title;
  $('grp-result-amount').innerText = formatValue(r.amount, grp.isAbstract);$('grp-result-sub').innerText = sub;

  const tally = grpParticipationTally();
  const partBox = $('grp-participation-list');
  if (!tally.length) {
    partBox.innerHTML = '<p class="empty-note">No se registraron impulsores en las decisiones.</p>';
  } else {
    const max = tally[0][1];
    partBox.innerHTML = '<h3 style="font-family:Orbitron,sans-serif;font-size:0.72rem;letter-spacing:1px;text-transform:uppercase;color:#64748b;margin-bottom:10px;">Influencia y liderazgo en decisiones</h3>' +
      tally.map(([name, count]) => `
        <div class="participation-row">
          <span>${name}</span>
          <span class="participation-bar-track"><span class="participation-bar-fill" style="width:${(count / max) * 100}%"></span></span>
          <span>${count}</span>
        </div>`).join('');
  }

  $('grp-result-history').innerHTML =
    '<h3>Historial de decisiones grupales</h3>' +
    grp.history.map(h => `
      <div class="hist-row">
        <span>${h.isFinal ? 'Final' : 'Ronda ' + h.round}</span>
        <span class="hist-offer">${h.offer ? formatValue(h.offer, grp.isAbstract) : '—'}</span>
        <span class="hist-dec ${h.auto ? 'auto' : (h.decision === 'Trato' ? 'deal' : 'nodeal')}">${h.decision}${h.auto ? ' (auto)' : ''}</span>
        <span>${h.driver || '—'}</span>
      </div>`).join('');

  grpRenderProReport(grp);
  $('grp-pro-report').hidden = true;
  $('grp-toggle-pro-btn').innerText = '👁️ Ver Informe Psicométrico Grupal';
}

function hideGrpOverlays() {
  clearInterval(grpTimerHandle);
  ['grp-offer-overlay', 'grp-swap-overlay', 'grp-result-overlay'].forEach(id => {
    const el = $(id);
    if (el) el.hidden = true;
  });
}

/* ----------------------------- Eventos globales --------------------------- */

document.addEventListener('DOMContentLoaded', () => {
  checkUrlParams(); // Activa automáticamente el modo psicométrico si viene por URL (ej: ?psico=true)

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

  // Individual
  $('ind-start-btn').addEventListener('click', () => {
    const name = $('ind-name-input').value;
    const isAbstract = $('ind-abstract-mode').checked;
    indStart(name, isAbstract);
  });
  $('ind-deal-btn').addEventListener('click', () => indDecide('Trato'));$('ind-nodeal-btn').addEventListener('click', () => indDecide('No Trato'));
  $('ind-keep-btn').addEventListener('click', () => indResolveFinal(false));$('ind-swap-btn').addEventListener('click', () => indResolveFinal(true));

  $('ind-toggle-pro-btn').addEventListener('click', () => {
    const reportBox = $('ind-pro-report');
    const isHidden = reportBox.hidden;
    reportBox.hidden = !isHidden;
    $('ind-toggle-pro-btn').innerText = isHidden ? '🙈 Ocultar Informe Psicométrico' : '👁️ Ver Informe Psicométrico';
  });

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
    if (ind && ind.history.length && !window.confirm('Esto reinicia la evaluación actual. ¿Continuar?')) return;
    indStart(ind ? ind.name : '', ind ? ind.isAbstract : true);
  });

  // Grupal
  $('grp-add-btn').addEventListener('click', () => {
    const input = $('grp-name-input');
    grpAddParticipant(input.value);
    input.value = '';
    input.focus();
  });
  $('grp-name-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); $('grp-add-btn').click(); }
  });
  $('grp-start-btn').addEventListener('click', () => {
    const isAbstract = $('grp-abstract-mode').checked;
    grpStart(isAbstract);
  });
  $('grp-deal-btn').addEventListener('click', () => grpDecide('Trato', false));$('grp-nodeal-btn').addEventListener('click', () => grpDecide('No Trato', false));
  $('grp-keep-btn').addEventListener('click', () => grpResolveFinal(false));$('grp-swap-btn').addEventListener('click', () => grpResolveFinal(true));

  $('grp-toggle-pro-btn').addEventListener('click', () => {
    const reportBox = $('grp-pro-report');
    const isHidden = reportBox.hidden;
    reportBox.hidden = !isHidden;
    $('grp-toggle-pro-btn').innerText = isHidden ? '🙈 Ocultar Informe Grupal' : '👁️ Ver Informe Psicométrico Grupal';
  });

  $('grp-print-pro-btn').addEventListener('click', () => {
    document.body.classList.add('printing-grp-report');
    window.print();
    document.body.classList.remove('printing-grp-report');
  });

  $('grp-again-btn').addEventListener('click', () => {
    hideGrpOverlays();
    showScreen('screen-group-intro');
  });

  $('grp-reset-btn').addEventListener('click', () => {
    if (grp && grp.history.length && !window.confirm('Esto reinicia la dinámica actual. ¿Continuar?')) return;
    grpStart(grp ? grp.isAbstract : true);
  });

  renderGrpParticipantEditor();
});
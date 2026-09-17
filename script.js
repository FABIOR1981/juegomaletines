const INITIAL_VALUES = [
  1, 2, 5, 10, 25, 50, 75, 100, 200, 300, 400, 500, 750,
  1000, 2500, 5000, 10000, 20000, 30000, 40000, 50000, 75000, 100000, 250000, 500000, 1000000
];

let cases = [];
let remainingValues = [];

function formatMoney(amount) {
  return '$' + amount.toLocaleString('es-ES');
}

function shuffle(array) {
  let arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function initGame() {
  const shuffledValues = shuffle(INITIAL_VALUES);
  remainingValues = [...INITIAL_VALUES];
  cases = [];

  for (let i = 0; i < 26; i++) {
    cases.push({
      id: i + 1,
      value: shuffledValues[i],
      opened: false
    });
  }

  renderBoard();
  updateMetrics();
}

function renderBoard() {
  const lowList = document.getElementById('low-values-list');
  const highList = document.getElementById('high-values-list');
  lowList.innerHTML = '';
  highList.innerHTML = '';

  INITIAL_VALUES.slice(0, 13).forEach(val => {
    const badge = document.createElement('div');
    badge.className = `value-badge low ${!remainingValues.includes(val) ? 'eliminated' : ''}`;
    badge.innerText = formatMoney(val);
    lowList.appendChild(badge);
  });

  INITIAL_VALUES.slice(13).forEach(val => {
    const badge = document.createElement('div');
    badge.className = `value-badge high ${!remainingValues.includes(val) ? 'eliminated' : ''}`;
    badge.innerText = formatMoney(val);
    highList.appendChild(badge);
  });

  const grid = document.getElementById('cases-grid');
  grid.innerHTML = '';

  cases.forEach(c => {
    const caseEl = document.createElement('div');
    caseEl.className = `case ${c.opened ? 'opened' : ''}`;
    caseEl.addEventListener('click', () => openCase(c.id));

    caseEl.innerHTML = `
      <div class="handle"></div>
      <div class="num">${c.id}</div>
      <div class="val-hidden">${c.opened ? formatMoney(c.value) : ''}</div>
    `;
    grid.appendChild(caseEl);
  });
}

function openCase(id) {
  const c = cases.find(item => item.id === id);
  if (c.opened) return;

  c.opened = true;
  const idx = remainingValues.indexOf(c.value);
  if (idx !== -1) {
    remainingValues.splice(idx, 1);
  }

  renderBoard();
  updateMetrics();
}

function updateMetrics() {
  const count = remainingValues.length;
  document.getElementById('remaining-count').innerText = count;

  if (count === 0) {
    document.getElementById('ve-val').innerText = '$0';
    document.getElementById('bank-offer').innerText = '$0';
    return;
  }

  const sum = remainingValues.reduce((a, b) => a + b, 0);
  const ve = sum / count;

  const factorOferta = 0.60 + ((26 - count) / 25) * 0.25; 
  const oferta = ve * factorOferta;

  document.getElementById('ve-val').innerText = formatMoney(Math.round(ve));
  document.getElementById('bank-offer').innerText = formatMoney(Math.round(oferta));
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('reset-btn').addEventListener('click', initGame);
  initGame();
});
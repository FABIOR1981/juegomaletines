const INITIAL_VALUES = [
  // Columna Izquierda (Valores Bajos / Medios)
  1, 2, 5, 10, 25, 50, 75, 100, 200, 300, 400, 500, 750,
  
  // Columna Derecha (Valores Altos / Mayores)
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
  const allCases = document.querySelectorAll('.case');
  const allBadges = document.querySelectorAll('.value-badge');

  if (allCases.length > 0) {
    allCases.forEach((el, index) => {
      el.classList.add('shuffling');
      el.style.animationDelay = `${(index % 5) * 0.05}s`;
    });

    allBadges.forEach((el, index) => {
      el.classList.add('shuffling');
      el.style.animationDelay = `${(index % 4) * 0.04}s`;
    });

    setTimeout(() => {
      executeReset();
    }, 700);
  } else {
    executeReset();
  }
}

function executeReset() {
  const shuffledValues = shuffle(INITIAL_VALUES);
  remainingValues = [...INITIAL_VALUES];
  cases = [];

  for (let i = 0; i < INITIAL_VALUES.length; i++) {
    cases.push({
      id: i + 1,
      value: shuffledValues[i],
      opened: false
    });
  }

  renderBoard();
  updateMetrics();

  const newCases = document.querySelectorAll('.case');
  const newBadges = document.querySelectorAll('.value-badge');

  newCases.forEach(el => el.classList.add('settling'));
  newBadges.forEach(el => el.classList.add('settling'));
}

function renderBoard() {
  const lowList = document.getElementById('low-values-list');
  const highList = document.getElementById('high-values-list');
  lowList.innerHTML = '';
  highList.innerHTML = '';

  const half = Math.ceil(INITIAL_VALUES.length / 2);

  INITIAL_VALUES.slice(0, half).forEach(val => {
    const badge = document.createElement('div');
    badge.className = `value-badge low ${!remainingValues.includes(val) ? 'eliminated' : ''}`;
    badge.innerText = formatMoney(val);
    lowList.appendChild(badge);
  });

  INITIAL_VALUES.slice(half).forEach(val => {
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
  const totalCases = INITIAL_VALUES.length;
  document.getElementById('remaining-count').innerText = count;

  if (count === 0) {
    document.getElementById('ve-val').innerText = '$0';
    document.getElementById('bank-offer').innerText = '$0';
    return;
  }

  const sum = remainingValues.reduce((a, b) => a + b, 0);
  const ve = sum / count;

  const factorOferta = 0.60 + ((totalCases - count) / (totalCases - 1 || 1)) * 0.25; 
  const oferta = ve * factorOferta;

  document.getElementById('ve-val').innerText = formatMoney(Math.round(ve));
  document.getElementById('bank-offer').innerText = formatMoney(Math.round(oferta));
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('reset-btn').addEventListener('click', initGame);
  initGame();
});
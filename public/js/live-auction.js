const socket = io();

const roomCode = sessionStorage.getItem('roomCode');
const teamCode = sessionStorage.getItem('teamCode');
const ownerName = sessionStorage.getItem('ownerName');
const isHost = sessionStorage.getItem('isHost') === 'true';

if (!roomCode || !teamCode || !ownerName) {
  window.location.href = '/index.html';
}

// ---------- DOM refs ----------
const roomCodeTag = document.getElementById('roomCodeTag');
const progressPill = document.getElementById('progressPill');
const statusBanner = document.getElementById('statusBanner');
const playerRole = document.getElementById('playerRole');
const playerName = document.getElementById('playerName');
const playerCountry = document.getElementById('playerCountry');
const basePriceValue = document.getElementById('basePriceValue');
const currentBidValue = document.getElementById('currentBidValue');
const highestBidderValue = document.getElementById('highestBidderValue');
const timerValue = document.getElementById('timerValue');
const timerRing = document.getElementById('timerRing');
const bidButtons = document.getElementById('bidButtons');
const bidError = document.getElementById('bidError');
const hostControls = document.getElementById('hostControls');
const sidebarTeams = document.getElementById('sidebarTeams');

const statusTabs = document.querySelectorAll('.status-tab');
const panelAvailable = document.getElementById('panelAvailable');
const panelSold = document.getElementById('panelSold');
const panelUnsold = document.getElementById('panelUnsold');
const countAvailable = document.getElementById('countAvailable');
const countSold = document.getElementById('countSold');
const countUnsold = document.getElementById('countUnsold');

const statsTableBody = document.getElementById('statsTableBody');

const teamModalOverlay = document.getElementById('teamModalOverlay');
const teamModalContent = document.getElementById('teamModalContent');
const teamModalClose = document.getElementById('teamModalClose');

const pauseBtn = document.getElementById('pauseBtn');
const resumeBtn = document.getElementById('resumeBtn');
const skipBtn = document.getElementById('skipBtn');
const unsoldBtn = document.getElementById('unsoldBtn');
const endBtn = document.getElementById('endBtn');

roomCodeTag.textContent = roomCode;

// ---------- Local state mirror ----------
let state = {
  status: 'waiting',
  paused: false,
  player: null,
  currentBid: 0,
  currentBidderTeam: null,
  timerRemaining: 0,
  auctionTimer: 0,
  maxPlayersPerTeam: null,
  maxOverseasPlayers: null,
  playersDone: 0,
  totalPlayers: 0,
  teams: [],
  ended: false,
  lists: { available: [], sold: [], unsold: [] }
};

function formatMoney(lakhs) {
  if (lakhs === null || lakhs === undefined) return '-';
  if (lakhs >= 100) {
    const cr = lakhs / 100;
    const crText = Number.isInteger(cr) ? cr : cr.toFixed(2);
    return `₹${crText} Cr`;
  }
  return `₹${lakhs} L`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : str;
  return div.innerHTML;
}

function myTeam() {
  return state.teams.find((t) => t.teamCode === teamCode);
}

function renderPlayer() {
  if (!state.player) {
    playerRole.textContent = '-';
    playerName.textContent = state.ended ? 'Auction Ended' : 'Waiting for next player...';
    playerCountry.textContent = '-';
    basePriceValue.textContent = '-';
    currentBidValue.textContent = '-';
    highestBidderValue.textContent = 'No bids yet';
    return;
  }

  playerRole.textContent = state.player.role;
  playerName.textContent = state.player.name;
  playerCountry.textContent = state.player.country + (state.player.overseas ? ' (Overseas)' : '');
  basePriceValue.textContent = formatMoney(state.player.basePrice);
  currentBidValue.textContent = formatMoney(state.currentBid);

  if (state.currentBidderTeam) {
    const bidder = state.teams.find((t) => t.teamCode === state.currentBidderTeam);
    highestBidderValue.textContent = bidder
      ? `${bidder.teamCode} — ${bidder.ownerName}`
      : state.currentBidderTeam;
  } else {
    highestBidderValue.textContent = 'No bids yet';
  }
}

function renderTimer() {
  timerValue.textContent = state.player ? state.timerRemaining : '-';
  timerRing.classList.toggle('low', state.timerRemaining <= 5 && state.timerRemaining > 0);
}

function renderProgress() {
  if (state.totalPlayers) {
    progressPill.textContent = `Player ${Math.min(state.playersDone + 1, state.totalPlayers)} / ${state.totalPlayers}`;
  } else {
    progressPill.textContent = 'Player - / -';
  }
}

function renderSidebar() {
  sidebarTeams.innerHTML = '';
  state.teams.forEach((t) => {
    const row = document.createElement('div');
    row.className = 'sidebar-team-row' + (t.teamCode === teamCode ? ' me' : '');

    const overseasLimit = state.maxOverseasPlayers != null ? state.maxOverseasPlayers : '-';
    const playersLimit = state.maxPlayersPerTeam != null ? state.maxPlayersPerTeam : '-';

    row.innerHTML = `
      <div class="st-top">
        <span class="st-code">${t.teamCode}</span>
        <span class="st-owner">${escapeHtml(t.ownerName)}${t.isHost ? ' <span class="badge">HOST</span>' : ''}${t.teamCode === teamCode ? ' <span class="badge you">YOU</span>' : ''}</span>
      </div>
      <div class="st-stats">
        <span>Budget: <strong>${formatMoney(t.budgetRemaining)}</strong></span>
        <span>Players: <strong>${t.playersBoughtCount}/${playersLimit}</strong></span>
        <span>Overseas: <strong>${t.overseasCount}/${overseasLimit}</strong></span>
      </div>
      <button class="btn btn-outline view-team-btn" data-team="${t.teamCode}">VIEW</button>
    `;
    sidebarTeams.appendChild(row);
  });
}

function renderStats() {
  if (!statsTableBody) return;
  statsTableBody.innerHTML = '';
  state.teams.forEach((t) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${t.teamCode}</td>
      <td>${formatMoney(t.budgetRemaining)}</td>
      <td>${t.playersBoughtCount}/${state.maxPlayersPerTeam ?? '-'}</td>
      <td>${t.batCount ?? 0}</td>
      <td>${t.bowlCount ?? 0}</td>
      <td>${t.arCount ?? 0}</td>
      <td>${t.wkCount ?? 0}</td>
      <td>${t.overseasCount}/${state.maxOverseasPlayers ?? '-'}</td>
    `;
    statsTableBody.appendChild(tr);
  });
}

function playerRowHtml(p, extra) {
  return `
    <div class="status-player-row">
      <span class="sp-name">${escapeHtml(p.name)}</span>
      <span class="sp-meta">${p.role}${p.overseas ? ' · Overseas' : ''}${extra ? ' · ' + extra : ''}</span>
    </div>
  `;
}

function renderStatusLists() {
  const lists = state.lists || { available: [], sold: [], unsold: [] };

  countAvailable.textContent = lists.available.length;
  countSold.textContent = lists.sold.length;
  countUnsold.textContent = lists.unsold.length;

  panelAvailable.innerHTML = lists.available.length
    ? lists.available.map((p) => playerRowHtml(p, formatMoney(p.basePrice))).join('')
    : '<p class="hint-msg">No players remaining.</p>';

  panelSold.innerHTML = lists.sold.length
    ? lists.sold
        .map((s) => playerRowHtml(s.player, `${s.teamCode} · ${formatMoney(s.price)}`))
        .join('')
    : '<p class="hint-msg">No players sold yet.</p>';

  panelUnsold.innerHTML = lists.unsold.length
    ? lists.unsold.map((p) => playerRowHtml(p)).join('')
    : '<p class="hint-msg">No unsold players yet.</p>';
}

statusTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    statusTabs.forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    panelAvailable.style.display = tab.dataset.tab === 'available' ? 'block' : 'none';
    panelSold.style.display = tab.dataset.tab === 'sold' ? 'block' : 'none';
    panelUnsold.style.display = tab.dataset.tab === 'unsold' ? 'block' : 'none';
  });
});

// ---------- VIEW TEAM modal ----------
async function openTeamModal(code) {
  teamModalContent.innerHTML = '<p class="hint-msg">Loading squad...</p>';
  teamModalOverlay.style.display = 'flex';
  try {
    const res = await fetch(`/api/rooms/${roomCode}/squads`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load squad.');
    const squad = data.squads.find((s) => s.teamCode === code);
    if (!squad) throw new Error('Team not found.');
    renderTeamModal(squad);
  } catch (err) {
    teamModalContent.innerHTML = `<p class="error-msg">${escapeHtml(err.message)}</p>`;
  }
}

function renderTeamModal(squad) {
  const players = squad.players
    .map(
      (p) => `
      <div class="squad-player-row">
        <span class="sq-name">${escapeHtml(p.name)}</span>
        <span class="sq-role">${p.roleAbbr}</span>
        <span class="sq-country">${escapeHtml(p.country)}${p.overseas ? ' · Overseas' : ''}</span>
      </div>`
    )
    .join('');

  teamModalContent.innerHTML = `
    <h2>${squad.teamCode}</h2>
    <p class="modal-owner">${escapeHtml(squad.ownerName)}${squad.isHost ? ' <span class="badge">HOST</span>' : ''}</p>
    <div class="wr-grid modal-stats-grid">
      <div class="wr-stat"><div class="label">Budget Left</div><div class="value">${formatMoney(squad.budgetRemaining)}</div></div>
      <div class="wr-stat"><div class="label">Players</div><div class="value">${squad.playersBoughtCount} / ${squad.maxPlayersPerTeam}</div></div>
      <div class="wr-stat"><div class="label">Overseas</div><div class="value">${squad.overseasCount} / ${squad.maxOverseasPlayers}</div></div>
    </div>
    <div class="squad-player-list">
      ${players || '<p class="hint-msg">No players bought yet.</p>'}
    </div>
  `;
}

sidebarTeams.addEventListener('click', (e) => {
  const btn = e.target.closest('.view-team-btn');
  if (!btn) return;
  openTeamModal(btn.dataset.team);
});

teamModalClose.addEventListener('click', () => {
  teamModalOverlay.style.display = 'none';
});

teamModalOverlay.addEventListener('click', (e) => {
  if (e.target === teamModalOverlay) teamModalOverlay.style.display = 'none';
});

function evaluateBidButtons() {
  const buttons = bidButtons.querySelectorAll('.bid-btn');
  const team = myTeam();

  const globallyDisabled =
    state.ended ||
    state.status !== 'in_progress' ||
    state.paused ||
    !state.player ||
    !team;

  buttons.forEach((btn) => {
    if (globallyDisabled) {
      btn.disabled = true;
      return;
    }

    const amount = Number(btn.dataset.amount);
    let disabled = false;

    if (team.playersBoughtCount >= state.maxPlayersPerTeam) disabled = true;
    if (state.player.overseas && team.overseasCount >= state.maxOverseasPlayers) disabled = true;
    if (state.currentBidderTeam === teamCode) disabled = true;
    if (team.budgetRemaining < state.currentBid + amount) disabled = true;

    btn.disabled = disabled;
  });
}

function evaluateHostButtons() {
  if (!isHost) return;
  const active = state.status === 'in_progress' && !state.ended;
  pauseBtn.disabled = !active || state.paused;
  resumeBtn.disabled = !active || !state.paused;
  skipBtn.disabled = !active || !state.player;
  unsoldBtn.disabled = !active || !state.player;
  endBtn.disabled = state.ended;
}

function showBanner(text, color) {
  statusBanner.style.display = 'block';
  statusBanner.style.background = color;
  statusBanner.textContent = text;
}

function hideBanner() {
  statusBanner.style.display = 'none';
}

function renderAll() {
  renderPlayer();
  renderTimer();
  renderProgress();
  renderSidebar();
  renderStats();
  renderStatusLists();
  evaluateBidButtons();
  evaluateHostButtons();
}

function applySnapshot(snap) {
  if (!snap) return;
  state.status = snap.status;
  state.paused = snap.paused;
  state.player = snap.player;
  state.currentBid = snap.currentBid;
  state.currentBidderTeam = snap.currentBidderTeam;
  state.timerRemaining = snap.timerRemaining;
  state.auctionTimer = snap.auctionTimer;
  state.maxPlayersPerTeam = snap.maxPlayersPerTeam;
  state.maxOverseasPlayers = snap.maxOverseasPlayers;
  state.playersDone = snap.playersDone;
  state.totalPlayers = snap.totalPlayers;
  state.teams = snap.teams;
  state.lists = snap.lists || state.lists;
  state.ended = snap.status === 'completed';
}

// ---------- Enter the live auction room ----------
if (isHost) {
  hostControls.style.display = 'block';
}

socket.on('connect', () => {
  socket.emit('auction:enter', { roomCode, teamCode }, (response) => {
    if (!response || !response.ok) {
      bidError.textContent = (response && response.error) || 'Unable to join live auction.';
      return;
    }
    applySnapshot(response.snapshot);
    if (state.ended) {
      window.location.href = `/results.html?code=${roomCode}`;
      return;
    }
    hideBanner();
    renderAll();
  });
});

// ---------- Live events ----------
socket.on('auction:newPlayer', (snap) => {
  hideBanner();
  bidError.textContent = '';
  applySnapshot(snap);
  renderAll();
});

socket.on('auction:tick', ({ timerRemaining }) => {
  state.timerRemaining = timerRemaining;
  renderTimer();
});

socket.on('auction:bidUpdate', ({ currentBid, currentBidderTeam, timerRemaining }) => {
  state.currentBid = currentBid;
  state.currentBidderTeam = currentBidderTeam;
  state.timerRemaining = timerRemaining;
  bidError.textContent = '';
  renderPlayer();
  renderTimer();
  evaluateBidButtons();
});

socket.on('auction:result', (data) => {
  state.teams = data.teams;
  renderSidebar();
  renderStats();

  if (data.status === 'SOLD') {
    const buyer = state.teams.find((t) => t.teamCode === data.soldToTeam);
    showBanner(
      `SOLD! ${data.player.name} → ${data.soldToTeam}${buyer ? ' (' + buyer.ownerName + ')' : ''} for ${formatMoney(data.price)}`,
      'var(--success)'
    );
  } else if (data.status === 'UNSOLD') {
    showBanner(`UNSOLD: ${data.player.name}`, 'var(--danger)');
  } else if (data.status === 'SKIPPED') {
    showBanner(`SKIPPED: ${data.player.name}`, 'var(--gray)');
  }

  // Lock bidding while the result is being revealed.
  bidButtons.querySelectorAll('.bid-btn').forEach((btn) => (btn.disabled = true));
});

socket.on('auction:lists', (lists) => {
  state.lists = lists;
  renderStatusLists();
});

socket.on('auction:paused', ({ timerRemaining }) => {
  state.paused = true;
  state.timerRemaining = timerRemaining;
  showBanner('Auction Paused by Host', 'var(--gray)');
  renderTimer();
  evaluateBidButtons();
  evaluateHostButtons();
});

socket.on('auction:resumed', ({ timerRemaining }) => {
  state.paused = false;
  state.timerRemaining = timerRemaining;
  hideBanner();
  renderTimer();
  evaluateBidButtons();
  evaluateHostButtons();
});

socket.on('auction:ended', () => {
  state.ended = true;
  state.status = 'completed';
  state.player = null;
  showBanner('Auction Has Ended — heading to Results...', 'var(--navy)');
  renderAll();

  setTimeout(() => {
    window.location.href = `/results.html?code=${roomCode}`;
  }, 2500);
});

// ---------- Bid button clicks ----------
bidButtons.addEventListener('click', (e) => {
  const btn = e.target.closest('.bid-btn');
  if (!btn || btn.disabled) return;

  const amount = Number(btn.dataset.amount);
  bidButtons.querySelectorAll('.bid-btn').forEach((b) => (b.disabled = true));

  socket.emit('auction:bid', { roomCode, amount }, (response) => {
    if (!response || !response.ok) {
      bidError.textContent = (response && response.error) || 'Bid failed.';
    } else {
      bidError.textContent = '';
    }
    evaluateBidButtons();
  });
});

// ---------- Host control clicks ----------
if (isHost) {
  pauseBtn.addEventListener('click', () => {
    socket.emit('auction:pause', { roomCode }, () => {});
  });
  resumeBtn.addEventListener('click', () => {
    socket.emit('auction:resume', { roomCode }, () => {});
  });
  skipBtn.addEventListener('click', () => {
    socket.emit('auction:skip', { roomCode }, () => {});
  });
  unsoldBtn.addEventListener('click', () => {
    socket.emit('auction:markUnsold', { roomCode }, () => {});
  });
  endBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to end the auction for everyone?')) {
      socket.emit('auction:end', { roomCode }, () => {});
    }
  });
}

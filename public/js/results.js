const params = new URLSearchParams(window.location.search);
const roomCode = (params.get('code') || sessionStorage.getItem('roomCode') || '').toUpperCase();

const resultsGrid = document.getElementById('resultsGrid');
const resultsLoading = document.getElementById('resultsLoading');
const resultsSubtitle = document.getElementById('resultsSubtitle');

const teamModalOverlay = document.getElementById('teamModalOverlay');
const teamModalContent = document.getElementById('teamModalContent');
const teamModalClose = document.getElementById('teamModalClose');

const downloadCanvas = document.getElementById('downloadCanvas');

if (!roomCode) {
  window.location.href = '/index.html';
}

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

let squadsCache = [];

async function loadResults() {
  try {
    const res = await fetch(`/api/rooms/${roomCode}/squads`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load results.');

    squadsCache = data.squads;
    resultsSubtitle.textContent = `Room ${data.roomCode} · ${squadsCache.length} teams`;
    renderResultsGrid();
  } catch (err) {
    resultsLoading.textContent = err.message || 'Failed to load results.';
  }
}

function renderResultsGrid() {
  resultsGrid.innerHTML = '';

  squadsCache.forEach((squad) => {
    const card = document.createElement('div');
    card.className = 'card result-card';
    card.innerHTML = `
      <h2>${squad.teamCode}</h2>
      <p class="modal-owner">${escapeHtml(squad.ownerName)}${squad.isHost ? ' <span class="badge">HOST</span>' : ''}</p>
      <div class="wr-grid modal-stats-grid">
        <div class="wr-stat"><div class="label">Budget Left</div><div class="value">${formatMoney(squad.budgetRemaining)}</div></div>
        <div class="wr-stat"><div class="label">Players</div><div class="value">${squad.playersBoughtCount}</div></div>
        <div class="wr-stat"><div class="label">Overseas</div><div class="value">${squad.overseasCount}</div></div>
      </div>
      <div class="result-role-grid">
        <div><span>BAT</span><strong>${squad.batCount}</strong></div>
        <div><span>BOWL</span><strong>${squad.bowlCount}</strong></div>
        <div><span>AR</span><strong>${squad.arCount}</strong></div>
        <div><span>WK</span><strong>${squad.wkCount}</strong></div>
      </div>
      <div class="action-row">
        <button class="btn btn-secondary view-btn" data-team="${squad.teamCode}">VIEW TEAM</button>
        <button class="btn btn-primary download-btn" data-team="${squad.teamCode}">DOWNLOAD TEAM</button>
      </div>
    `;
    resultsGrid.appendChild(card);
  });
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
      ${players || '<p class="hint-msg">No players bought.</p>'}
    </div>
  `;
}

resultsGrid.addEventListener('click', (e) => {
  const viewBtn = e.target.closest('.view-btn');
  if (viewBtn) {
    const squad = squadsCache.find((s) => s.teamCode === viewBtn.dataset.team);
    if (squad) {
      renderTeamModal(squad);
      teamModalOverlay.style.display = 'flex';
    }
    return;
  }

  const downloadBtn = e.target.closest('.download-btn');
  if (downloadBtn) {
    const squad = squadsCache.find((s) => s.teamCode === downloadBtn.dataset.team);
    if (squad) downloadTeamPng(squad);
  }
});

teamModalClose.addEventListener('click', () => {
  teamModalOverlay.style.display = 'none';
});

teamModalOverlay.addEventListener('click', (e) => {
  if (e.target === teamModalOverlay) teamModalOverlay.style.display = 'none';
});

// =====================================================================
// DOWNLOAD TEAM — renders a mobile-friendly, share-ready PNG using the
// native Canvas 2D API (no external libraries, no PDF).
// =====================================================================
function downloadTeamPng(squad) {
  const width = 1080;
  const headerHeight = 360;
  const rowHeight = 64;
  const footerHeight = 90;
  const players = squad.players.length ? squad.players : [{ name: 'No players bought', roleAbbr: '', country: '', overseas: false }];
  const height = headerHeight + players.length * rowHeight + footerHeight;

  downloadCanvas.width = width;
  downloadCanvas.height = height;
  const ctx = downloadCanvas.getContext('2d');

  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, '#0b1e3f');
  bg.addColorStop(1, '#142c5c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Header band
  ctx.fillStyle = '#ff7a00';
  ctx.fillRect(0, 0, width, 10);

  // Team name
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 72px Segoe UI, Arial, sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(squad.teamCode, 48, 110);

  ctx.font = '600 30px Segoe UI, Arial, sans-serif';
  ctx.fillStyle = '#cfd8ea';
  ctx.fillText(squad.ownerName + (squad.isHost ? '  ·  HOST' : ''), 48, 150);

  // Stat boxes: Budget Left, Players, Overseas
  const stats = [
    { label: 'BUDGET LEFT', value: formatMoney(squad.budgetRemaining) },
    { label: 'PLAYERS', value: `${squad.playersBoughtCount}` },
    { label: 'OVERSEAS', value: `${squad.overseasCount}` }
  ];
  const boxW = (width - 48 * 2 - 24 * 2) / 3;
  const boxY = 190;
  const boxH = 120;

  stats.forEach((s, i) => {
    const x = 48 + i * (boxW + 24);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    roundRect(ctx, x, boxY, boxW, boxH, 14);
    ctx.fill();

    ctx.fillStyle = '#ff9838';
    ctx.font = '700 22px Segoe UI, Arial, sans-serif';
    ctx.fillText(s.label, x + 20, boxY + 42);

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 40px Segoe UI, Arial, sans-serif';
    ctx.fillText(s.value, x + 20, boxY + 90);
  });

  // Player list
  let y = headerHeight;
  players.forEach((p, idx) => {
    if (idx % 2 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fillRect(0, y, width, rowHeight);
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = '600 30px Segoe UI, Arial, sans-serif';
    ctx.fillText(`${idx + 1}. ${p.name}`, 48, y + 42);

    if (p.roleAbbr) {
      ctx.fillStyle = '#ff9838';
      ctx.font = '700 28px Segoe UI, Arial, sans-serif';
      const label = `${p.roleAbbr} · ${p.country}${p.overseas ? ' (O/S)' : ''}`;
      const labelWidth = ctx.measureText(label).width;
      ctx.fillText(label, width - 48 - labelWidth, y + 40);
    }

    y += rowHeight;
  });

  // Footer
  ctx.fillStyle = '#7c8798';
  ctx.font = '500 22px Segoe UI, Arial, sans-serif';
  ctx.fillText(`Room ${roomCode} · IPL Auction`, 48, height - 34);

  ctx.fillStyle = '#ff7a00';
  ctx.fillRect(0, height - 10, width, 10);

  // Trigger automatic download
  downloadCanvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${squad.teamCode}_squad.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, 'image/png');
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

loadResults();

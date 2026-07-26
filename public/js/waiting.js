const socket = io();

const roomCode = sessionStorage.getItem('roomCode');
const teamCode = sessionStorage.getItem('teamCode');
const ownerName = sessionStorage.getItem('ownerName');
const isHost = sessionStorage.getItem('isHost') === 'true';

const subtitleText = document.getElementById('subtitleText');
const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const budgetValue = document.getElementById('budgetValue');
const timerValue = document.getElementById('timerValue');
const maxPlayersValue = document.getElementById('maxPlayersValue');
const maxOverseasValue = document.getElementById('maxOverseasValue');
const progressText = document.getElementById('progressText');
const teamsList = document.getElementById('teamsList');
const waitingError = document.getElementById('waitingError');
const startAuctionBtn = document.getElementById('startAuctionBtn');
const hostHint = document.getElementById('hostHint');

if (!roomCode || !teamCode || !ownerName) {
  window.location.href = '/index.html';
}

roomCodeDisplay.textContent = roomCode;

function renderRoom(room) {
  budgetValue.textContent = `${room.budgetPerTeam} Cr`;
  timerValue.textContent = `${room.auctionTimer} sec`;
  maxPlayersValue.textContent = room.maxPlayersPerTeam;
  maxOverseasValue.textContent = room.maxOverseasPlayers;

  progressText.textContent = `${room.teams.length} / ${room.maxTeams} Teams Joined`;

  teamsList.innerHTML = '';
  room.teams.forEach((t) => {
    const row = document.createElement('div');
    row.className = 'team-row';

    const youBadge = t.teamCode === teamCode ? '<span class="badge you">YOU</span>' : '';
    const hostBadge = t.isHost ? '<span class="badge">HOST</span>' : '';
    const statusDot = `<span class="dot ${t.connected ? 'online' : 'offline'}"></span>`;

    row.innerHTML = `
      <span class="team-code">${t.teamCode}</span>
      <span class="owner-name">${statusDot}${escapeHtml(t.ownerName)}</span>
      ${hostBadge}${youBadge}
    `;
    teamsList.appendChild(row);
  });

  if (isHost) {
    startAuctionBtn.style.display = 'block';
    hostHint.style.display = 'block';
    const enoughTeams = room.teams.length >= room.minTeamsRequired;
    startAuctionBtn.disabled = !enoughTeams;
    hostHint.textContent = enoughTeams
      ? 'You can start the auction whenever you\'re ready.'
      : `Need at least ${room.minTeamsRequired} teams to start (currently ${room.teams.length}).`;
  } else {
    startAuctionBtn.style.display = 'none';
    hostHint.style.display = 'block';
    hostHint.textContent = 'Waiting for the host to start the auction...';
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function handleJoinAck(response) {
  if (!response.ok) {
    waitingError.textContent = response.error || 'Unable to connect to room.';
    subtitleText.textContent = 'Connection failed';
    return;
  }
  subtitleText.textContent = `You're in as ${response.you.teamCode} — ${response.you.ownerName}`;
  renderRoom(response.room);
}

socket.on('connect', () => {
  if (isHost) {
    socket.emit('room:enterAsHost', { roomCode }, handleJoinAck);
  } else {
    socket.emit('room:rejoin', { roomCode, teamCode }, handleJoinAck);
  }
});

socket.on('room:update', (room) => {
  renderRoom(room);
});

socket.on('auction:go', () => {
  waitingError.style.color = '#2ecc71';
  waitingError.textContent = 'Auction is starting...';
  startAuctionBtn.disabled = true;
  window.location.href = '/live-auction.html';
});

startAuctionBtn.addEventListener('click', () => {
  startAuctionBtn.disabled = true;
  socket.emit('room:startAuction', { roomCode }, (response) => {
    if (!response.ok) {
      waitingError.style.color = '';
      waitingError.textContent = response.error;
      startAuctionBtn.disabled = false;
    }
  });
});

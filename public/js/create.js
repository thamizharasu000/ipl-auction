const IPL_TEAMS = ['CSK', 'MI', 'RCB', 'KKR', 'GT', 'SRH', 'RR', 'DC', 'PBKS', 'LSG'];
const BUDGET_OPTIONS = [75, 100, 120, 150];
const TIMER_OPTIONS = [5, 10, 20, 30];
const MAX_PLAYERS_OPTIONS = [15, 20, 25];
const MAX_OVERSEAS_OPTIONS = [4, 6, 8];

const state = {
  hostTeam: null,
  budgetPerTeam: 100,
  auctionTimer: 10,
  maxPlayersPerTeam: 20,
  maxOverseasPlayers: 8
};

function buildPillGroup(containerId, options, formatter, stateKey, defaultValue) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  options.forEach((opt) => {
    const pill = document.createElement('div');
    pill.className = 'option-pill';
    pill.textContent = formatter(opt);
    if (opt === defaultValue) pill.classList.add('selected');
    pill.addEventListener('click', () => {
      container.querySelectorAll('.option-pill').forEach((p) => p.classList.remove('selected'));
      pill.classList.add('selected');
      state[stateKey] = opt;
    });
    container.appendChild(pill);
  });
}

function buildTeamGrid() {
  const container = document.getElementById('teamGrid');
  container.innerHTML = '';
  IPL_TEAMS.forEach((team) => {
    const pill = document.createElement('div');
    pill.className = 'option-pill';
    pill.textContent = team;
    pill.addEventListener('click', () => {
      container.querySelectorAll('.option-pill').forEach((p) => p.classList.remove('selected'));
      pill.classList.add('selected');
      state.hostTeam = team;
    });
    container.appendChild(pill);
  });
}

buildTeamGrid();
buildPillGroup('budgetGrid', BUDGET_OPTIONS, (v) => `${v} Cr`, 'budgetPerTeam', state.budgetPerTeam);
buildPillGroup('timerGrid', TIMER_OPTIONS, (v) => `${v} sec`, 'auctionTimer', state.auctionTimer);
buildPillGroup('maxPlayersGrid', MAX_PLAYERS_OPTIONS, (v) => `${v}`, 'maxPlayersPerTeam', state.maxPlayersPerTeam);
buildPillGroup('maxOverseasGrid', MAX_OVERSEAS_OPTIONS, (v) => `${v}`, 'maxOverseasPlayers', state.maxOverseasPlayers);

const form = document.getElementById('createForm');
const errorMsg = document.getElementById('errorMsg');
const createBtn = document.getElementById('createBtn');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorMsg.textContent = '';

  const hostName = document.getElementById('hostName').value.trim();
  const password = document.getElementById('password').value;

  if (!hostName) {
    errorMsg.textContent = 'Please enter your name.';
    return;
  }
  if (!state.hostTeam) {
    errorMsg.textContent = 'Please select your IPL team.';
    return;
  }

  createBtn.disabled = true;
  createBtn.textContent = 'Creating...';

  try {
    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hostName,
        hostTeam: state.hostTeam,
        password,
        budgetPerTeam: state.budgetPerTeam,
        auctionTimer: state.auctionTimer,
        maxPlayersPerTeam: state.maxPlayersPerTeam,
        maxOverseasPlayers: state.maxOverseasPlayers
      })
    });

    const data = await res.json();

    if (!res.ok) {
      errorMsg.textContent = data.error || 'Failed to create room.';
      createBtn.disabled = false;
      createBtn.textContent = 'Create Room';
      return;
    }

    // Persist identity for the waiting room / reconnect support
    sessionStorage.setItem('roomCode', data.roomCode);
    sessionStorage.setItem('teamCode', state.hostTeam);
    sessionStorage.setItem('ownerName', hostName);
    sessionStorage.setItem('isHost', 'true');
    sessionStorage.setItem('inviteLink', data.inviteLink);

    window.location.href = `/room-created.html?code=${data.roomCode}`;
  } catch (err) {
    console.error(err);
    errorMsg.textContent = 'Network error. Please try again.';
    createBtn.disabled = false;
    createBtn.textContent = 'Create Room';
  }
});

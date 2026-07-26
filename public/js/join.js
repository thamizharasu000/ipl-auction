const IPL_TEAMS = ['CSK', 'MI', 'RCB', 'KKR', 'GT', 'SRH', 'RR', 'DC', 'PBKS', 'LSG'];

const socket = io();

let roomCode = null;
let roomHasPassword = false;
let takenTeams = [];
let selectedTeam = null;
let enteredPassword = '';

const step1Card = document.getElementById('step1Card');
const step2Card = document.getElementById('step2Card');
const step3Card = document.getElementById('step3Card');

const roomCodeInput = document.getElementById('roomCodeInput');
const step1Error = document.getElementById('step1Error');
const step1Btn = document.getElementById('step1Btn');

const passwordInput = document.getElementById('passwordInput');
const step2Error = document.getElementById('step2Error');
const step2Btn = document.getElementById('step2Btn');

const nameInput = document.getElementById('nameInput');
const teamGrid = document.getElementById('teamGrid');
const step3Error = document.getElementById('step3Error');
const step3Btn = document.getElementById('step3Btn');

// Prefill room code from ?code= query param (invite link)
const urlParams = new URLSearchParams(window.location.search);
const prefillCode = urlParams.get('code');
if (prefillCode) {
  roomCodeInput.value = prefillCode;
}

function extractCode(raw) {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  try {
    if (trimmed.includes('://')) {
      const url = new URL(trimmed);
      const codeParam = url.searchParams.get('code');
      if (codeParam) return codeParam.toUpperCase();
    }
  } catch (e) {
    // not a valid URL, fall through
  }
  return trimmed.toUpperCase();
}

function buildTeamGrid() {
  teamGrid.innerHTML = '';
  IPL_TEAMS.forEach((team) => {
    const pill = document.createElement('div');
    pill.className = 'option-pill';
    pill.textContent = team;

    if (takenTeams.includes(team)) {
      pill.classList.add('taken');
    } else {
      pill.addEventListener('click', () => {
        teamGrid.querySelectorAll('.option-pill').forEach((p) => p.classList.remove('selected'));
        pill.classList.add('selected');
        selectedTeam = team;
      });
    }
    teamGrid.appendChild(pill);
  });
}

step1Btn.addEventListener('click', async () => {
  step1Error.textContent = '';
  const code = extractCode(roomCodeInput.value);

  if (!code) {
    step1Error.textContent = 'Please enter a room code or invite link.';
    return;
  }

  step1Btn.disabled = true;
  step1Btn.textContent = 'Checking...';

  try {
    const res = await fetch(`/api/rooms/${code}`);
    const data = await res.json();

    if (!res.ok) {
      step1Error.textContent = data.error || 'Room not found.';
      step1Btn.disabled = false;
      step1Btn.textContent = 'Join Room';
      return;
    }

    roomCode = data.roomCode;
    roomHasPassword = data.hasPassword;
    takenTeams = data.takenTeams || [];

    step1Card.style.display = 'none';

    if (roomHasPassword) {
      step2Card.style.display = 'block';
    } else {
      buildTeamGrid();
      step3Card.style.display = 'block';
    }
  } catch (err) {
    console.error(err);
    step1Error.textContent = 'Network error. Please try again.';
  }

  step1Btn.disabled = false;
  step1Btn.textContent = 'Join Room';
});

step2Btn.addEventListener('click', () => {
  step2Error.textContent = '';
  enteredPassword = passwordInput.value;
  step2Card.style.display = 'none';
  buildTeamGrid();
  step3Card.style.display = 'block';
});

step3Btn.addEventListener('click', () => {
  step3Error.textContent = '';
  const name = nameInput.value.trim();

  if (!name) {
    step3Error.textContent = 'Please enter your name.';
    return;
  }
  if (!selectedTeam) {
    step3Error.textContent = 'Please select an available team.';
    return;
  }

  step3Btn.disabled = true;
  step3Btn.textContent = 'Joining...';

  socket.emit('room:verifyAndJoin', {
    roomCode,
    password: enteredPassword,
    name,
    teamCode: selectedTeam
  }, (response) => {
    step3Btn.disabled = false;
    step3Btn.textContent = 'Join Room';

    if (!response.ok) {
      if ((response.error || '').toLowerCase().includes('password')) {
        step3Card.style.display = 'none';
        step2Error.textContent = response.error;
        step2Card.style.display = 'block';
      } else {
        step3Error.textContent = response.error;
      }
      return;
    }

    sessionStorage.setItem('roomCode', roomCode);
    sessionStorage.setItem('teamCode', selectedTeam);
    sessionStorage.setItem('ownerName', name);
    sessionStorage.setItem('isHost', 'false');

    window.location.href = '/waiting.html';
  });
});

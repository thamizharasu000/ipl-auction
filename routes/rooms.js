const express = require('express');
const { customAlphabet } = require('nanoid');
const Room = require('../models/Room');
const { buildSquads } = require('../utils/squadBuilder');

const router = express.Router();

const nanoid = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6); // no confusing chars (0,O,1,I)

const BUDGET_OPTIONS = [75, 100, 120, 150];
const TIMER_OPTIONS = [5, 10, 20, 30];
const MAX_PLAYERS_OPTIONS = [15, 20, 25];
const MAX_OVERSEAS_OPTIONS = [4, 6, 8];
const MAX_NAME_LENGTH = 30;

// Convert Cr -> Lakhs for internal storage
function crToLakh(cr) {
  return cr * 100;
}

/**
 * POST /api/rooms
 * Create a new auction room. Host becomes the first team entry.
 */
router.post('/', async (req, res) => {
  try {
    const {
      hostName,
      hostTeam,
      password,
      budgetPerTeam,
      auctionTimer,
      maxPlayersPerTeam,
      maxOverseasPlayers
    } = req.body;

    if (!hostName || !hostTeam || !budgetPerTeam || !auctionTimer || !maxPlayersPerTeam || !maxOverseasPlayers) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    if (!Room.IPL_TEAMS.includes(hostTeam)) {
      return res.status(400).json({ error: 'Invalid team selected.' });
    }

    const trimmedHostName = hostName.trim().slice(0, MAX_NAME_LENGTH);
    if (!trimmedHostName) {
      return res.status(400).json({ error: 'Please enter a valid name.' });
    }

    // Validate the configuration options server-side (never trust the
    // client-rendered pills alone) so a tampered request gets a clean 400
    // instead of a generic Mongoose validation failure.
    const budget = Number(budgetPerTeam);
    const timer = Number(auctionTimer);
    const maxPlayers = Number(maxPlayersPerTeam);
    const maxOverseas = Number(maxOverseasPlayers);

    if (!BUDGET_OPTIONS.includes(budget)) {
      return res.status(400).json({ error: 'Invalid budget per team.' });
    }
    if (!TIMER_OPTIONS.includes(timer)) {
      return res.status(400).json({ error: 'Invalid auction timer.' });
    }
    if (!MAX_PLAYERS_OPTIONS.includes(maxPlayers)) {
      return res.status(400).json({ error: 'Invalid max players per team.' });
    }
    if (!MAX_OVERSEAS_OPTIONS.includes(maxOverseas)) {
      return res.status(400).json({ error: 'Invalid max overseas players.' });
    }

    const trimmedPassword = password && password.trim() ? password.trim().slice(0, 30) : null;

    // Ensure unique room code. On the extremely rare chance of a collision
    // slipping past the pre-check (a concurrent create landed first), retry
    // with a fresh code instead of failing the whole request.
    let room;
    let lastErr;
    for (let attempt = 0; attempt < 5 && !room; attempt++) {
      const roomCode = nanoid();
      try {
        room = await Room.create({
          roomCode,
          hostName: trimmedHostName,
          hostTeam,
          password: trimmedPassword,
          budgetPerTeam: budget,
          auctionTimer: timer,
          maxPlayersPerTeam: maxPlayers,
          maxOverseasPlayers: maxOverseas,
          teams: [
            {
              teamCode: hostTeam,
              ownerName: trimmedHostName,
              isHost: true,
              budgetRemaining: crToLakh(budget),
              playersBought: [],
              overseasCount: 0
            }
          ]
        });
      } catch (err) {
        lastErr = err;
        // 11000 = duplicate key (roomCode collision) — retry with a new code.
        if (err.code !== 11000) throw err;
      }
    }

    if (!room) throw lastErr || new Error('Could not allocate a unique room code.');

    return res.status(201).json({
      roomCode: room.roomCode,
      inviteLink: `${req.protocol}://${req.get('host')}/join.html?code=${room.roomCode}`
    });
  } catch (err) {
    console.error('[ROOMS] create error:', err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: 'Invalid room configuration.' });
    }
    return res.status(500).json({ error: 'Failed to create room.' });
  }
});

/**
 * GET /api/rooms/:code
 * Public lookup used by the Join page before a socket connection is made.
 * Never exposes the raw password.
 */
router.get('/:code', async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const room = await Room.findOne({ roomCode: code });

    if (!room) {
      return res.status(404).json({ error: 'Room not found.' });
    }

    return res.json({
      roomCode: room.roomCode,
      hasPassword: !!room.password,
      status: room.status,
      budgetPerTeam: room.budgetPerTeam,
      auctionTimer: room.auctionTimer,
      maxPlayersPerTeam: room.maxPlayersPerTeam,
      maxOverseasPlayers: room.maxOverseasPlayers,
      maxTeams: room.maxTeams,
      minTeamsRequired: room.minTeamsRequired,
      teamsJoined: room.teams.length,
      takenTeams: room.teams.map((t) => t.teamCode),
      allTeams: Room.IPL_TEAMS
    });
  } catch (err) {
    console.error('[ROOMS] lookup error:', err);
    return res.status(500).json({ error: 'Failed to fetch room.' });
  }
});

/**
 * GET /api/rooms/:code/squads
 * Full live/final squad breakdown for every team in the room — powers the
 * "VIEW" popup on the Live Team Panel (any connected user can view any
 * team) and the Results page. Never includes player photos, just
 * name/role/country per the "no player images" requirement.
 */
router.get('/:code/squads', async (req, res) => {
  try {
    const code = req.params.code.toUpperCase();
    const room = await Room.findOne({ roomCode: code });

    if (!room) {
      return res.status(404).json({ error: 'Room not found.' });
    }

    const squads = await buildSquads(room);
    return res.json({ roomCode: room.roomCode, status: room.status, squads });
  } catch (err) {
    console.error('[ROOMS] squads error:', err);
    return res.status(500).json({ error: 'Failed to fetch squads.' });
  }
});

module.exports = router;

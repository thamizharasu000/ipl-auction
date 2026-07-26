const Room = require('../models/Room');
const Player = require('../models/Player');
const { roleCountField } = require('../utils/roleUtils');

/**
 * In-memory live auction state, keyed by roomCode.
 * This is the authoritative source for the fast-moving parts of an auction
 * (current player, current bid, current bidder, timer). It is intentionally
 * NOT persisted on every tick to avoid hammering MongoDB every second.
 * Player order is randomized fresh here every time an auction starts, so a
 * brand new room always gets a brand new shuffle ("reset random order for
 * next room").
 */
const engines = new Map();

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function publicPlayer(player) {
  if (!player) return null;
  return {
    id: player._id.toString(),
    name: player.name,
    role: player.role,
    country: player.country,
    basePrice: player.basePrice,
    overseas: !!player.overseas
  };
}

function teamsSidebar(room) {
  return room.teams.map((t) => ({
    teamCode: t.teamCode,
    ownerName: t.ownerName,
    isHost: t.isHost,
    budgetRemaining: t.budgetRemaining,
    playersBoughtCount: t.playersBought.length,
    overseasCount: t.overseasCount,
    batCount: t.batCount,
    bowlCount: t.bowlCount,
    arCount: t.arCount,
    wkCount: t.wkCount
  }));
}

/**
 * Live Auction Status tabs: Available / Sold / Unsold.
 * Built straight from the in-memory engine so it always matches exactly
 * what's currently on screen for the active player.
 */
function buildStatusLists(roomCode) {
  const engine = engines.get(roomCode);
  if (!engine) return { available: [], sold: [], unsold: [] };

  const available = engine.players
    .slice(engine.currentIndex + 1)
    .map(publicPlayer);

  const sold = engine.soldList.map((s) => ({
    player: publicPlayer(s.player),
    teamCode: s.teamCode,
    price: s.price
  }));

  const unsold = engine.unsoldList.map(publicPlayer);

  return { available, sold, unsold };
}

function broadcastLists(io, roomCode) {
  io.to(roomCode).emit('auction:lists', buildStatusLists(roomCode));
}

/**
 * A team has "completed" its squad once it hits the max player limit.
 * Auction auto-ends the instant every joined team is in this state.
 */
function allTeamsFull(room) {
  if (!room.teams.length) return false;
  return room.teams.every((t) => t.playersBought.length >= room.maxPlayersPerTeam);
}

function clearRoomInterval(engine) {
  if (engine && engine.interval) {
    clearInterval(engine.interval);
    engine.interval = null;
  }
}

async function buildAuctionSnapshot(roomCode) {
  const engine = engines.get(roomCode);
  const room = await Room.findOne({ roomCode });
  if (!room) return null;

  return {
    status: room.status,
    paused: engine ? engine.paused : false,
    player: engine ? publicPlayer(engine.currentPlayer) : null,
    currentBid: engine ? engine.currentBid : 0,
    currentBidderTeam: engine ? engine.currentBidderTeam : null,
    timerRemaining: engine ? engine.timerRemaining : 0,
    auctionTimer: room.auctionTimer,
    maxPlayersPerTeam: room.maxPlayersPerTeam,
    maxOverseasPlayers: room.maxOverseasPlayers,
    playersDone: engine ? engine.currentIndex : 0,
    totalPlayers: engine ? engine.players.length : 0,
    teams: teamsSidebar(room),
    lists: buildStatusLists(roomCode)
  };
}

/**
 * Kick off a brand-new auction for a room: load every seeded player,
 * randomize the order (each player appears exactly once), and start
 * auctioning the first player.
 */
async function initAuction(io, roomCode) {
  const room = await Room.findOne({ roomCode });
  if (!room) return;

  const allPlayers = await Player.find({});
  const shuffled = shuffle(allPlayers);

  const engine = {
    players: shuffled,
    currentIndex: -1,
    currentPlayer: null,
    currentBid: 0,
    currentBidderTeam: null,
    timerRemaining: 0,
    paused: false,
    interval: null,
    ended: false,
    // True the instant a player's outcome starts being resolved (sold/unsold/
    // skipped) until the next player begins. Blocks late bids that would
    // otherwise slip in during the async DB round-trip of resolution.
    locked: false,
    soldList: [],
    unsoldList: []
  };
  engines.set(roomCode, engine);

  room.status = 'in_progress';
  room.currentPlayerIndex = 0;
  room.currentBid = 0;
  room.currentBidderTeam = null;
  room.auctionPaused = false;
  await room.save();

  await startNextPlayer(io, roomCode);
}

async function startNextPlayer(io, roomCode) {
  const engine = engines.get(roomCode);
  if (!engine || engine.ended) return;

  const room = await Room.findOne({ roomCode });
  if (!room) return;

  // Auto Auction End: every team already has a full squad.
  if (allTeamsFull(room)) {
    await endAuction(io, roomCode, 'teams_full');
    return;
  }

  clearRoomInterval(engine);

  engine.currentIndex += 1;

  if (engine.currentIndex >= engine.players.length) {
    await endAuction(io, roomCode, 'all_players_done');
    return;
  }

  engine.currentPlayer = engine.players[engine.currentIndex];
  engine.currentBid = engine.currentPlayer.basePrice;
  engine.currentBidderTeam = null;
  engine.timerRemaining = room.auctionTimer;
  engine.paused = false;
  engine.locked = false;

  room.currentPlayerIndex = engine.currentIndex;
  room.currentBid = engine.currentBid;
  room.currentBidderTeam = null;
  room.auctionPaused = false;
  await room.save();

  io.to(roomCode).emit('auction:newPlayer', await buildAuctionSnapshot(roomCode));

  startTicking(io, roomCode);
}

function startTicking(io, roomCode) {
  const engine = engines.get(roomCode);
  if (!engine) return;

  clearRoomInterval(engine);

  engine.interval = setInterval(async () => {
    const e = engines.get(roomCode);
    if (!e || e.ended) {
      clearRoomInterval(e);
      return;
    }
    if (e.paused) return;

    e.timerRemaining -= 1;

    if (e.timerRemaining <= 0) {
      clearRoomInterval(e);
      const status = e.currentBidderTeam ? 'sold' : 'unsold';
      await resolveCurrentPlayer(io, roomCode, status);
      return;
    }

    io.to(roomCode).emit('auction:tick', { timerRemaining: e.timerRemaining });
  }, 1000);
}

/**
 * Place a bid. amountLakhs is the increment: 10 (₹10L), 50 (₹50L),
 * 100 (₹1 Cr), or 200 (₹2 Cr).
 */
async function placeBid(io, roomCode, teamCode, amountLakhs) {
  const engine = engines.get(roomCode);
  if (!engine || engine.ended) return { ok: false, error: 'Auction is not active.' };
  if (engine.paused) return { ok: false, error: 'Auction is currently paused.' };
  if (!engine.currentPlayer) return { ok: false, error: 'No active player right now.' };
  if (engine.locked) return { ok: false, error: 'Bidding is closed for this player.' };

  const validIncrements = [10, 50, 100, 200];
  const increment = Number(amountLakhs);
  if (!validIncrements.includes(increment)) {
    return { ok: false, error: 'Invalid bid amount.' };
  }

  const room = await Room.findOne({ roomCode });
  if (!room) return { ok: false, error: 'Room not found.' };
  if (room.status !== 'in_progress') return { ok: false, error: 'Auction is not live.' };

  // Re-check after the DB round-trip: the current player may have just been
  // resolved (sold/unsold/skipped) while this bid was in flight.
  if (engine.locked || engine.ended || !engine.currentPlayer) {
    return { ok: false, error: 'Bidding is closed for this player.' };
  }

  const team = room.teams.find((t) => t.teamCode === teamCode);
  if (!team) return { ok: false, error: 'Team not found in this room.' };

  if (team.playersBought.length >= room.maxPlayersPerTeam) {
    return { ok: false, error: 'Your squad is already full.' };
  }

  if (engine.currentPlayer.overseas && team.overseasCount >= room.maxOverseasPlayers) {
    return { ok: false, error: 'Overseas player limit reached for your team.' };
  }

  if (engine.currentBidderTeam === teamCode) {
    return { ok: false, error: 'You are already the highest bidder.' };
  }

  const newBid = engine.currentBid + increment;

  if (team.budgetRemaining < newBid) {
    return { ok: false, error: 'Insufficient budget for this bid.' };
  }

  engine.currentBid = newBid;
  engine.currentBidderTeam = teamCode;

  // Last-second rule: any valid bid at 5s or less resets the timer to exactly 5s.
  if (engine.timerRemaining <= 5) {
    engine.timerRemaining = 5;
  }

  room.currentBid = engine.currentBid;
  room.currentBidderTeam = engine.currentBidderTeam;
  await room.save();

  io.to(roomCode).emit('auction:bidUpdate', {
    currentBid: engine.currentBid,
    currentBidderTeam: engine.currentBidderTeam,
    timerRemaining: engine.timerRemaining
  });

  return { ok: true };
}

/**
 * Finalize the current player as SOLD (if there's a highest bidder) or
 * UNSOLD, update the winning team's budget/roster/overseas count, then
 * automatically advance to the next player after a short reveal pause.
 */
async function resolveCurrentPlayer(io, roomCode, forcedStatus) {
  const engine = engines.get(roomCode);
  if (!engine || !engine.currentPlayer || engine.locked) return;

  // Lock immediately (before any await) so no bid placed concurrently with
  // this resolution can slip through and corrupt the outcome.
  engine.locked = true;
  clearRoomInterval(engine);

  const room = await Room.findOne({ roomCode });
  if (!room) return;

  const player = engine.currentPlayer;
  let status = forcedStatus === 'sold' && engine.currentBidderTeam ? 'sold' : 'unsold';
  let soldPrice = null;
  let soldToTeam = null;

  if (status === 'sold') {
    const team = room.teams.find((t) => t.teamCode === engine.currentBidderTeam);
    if (team) {
      soldPrice = engine.currentBid;
      soldToTeam = team.teamCode;
      team.budgetRemaining -= soldPrice;
      team.playersBought.push({ player: player._id, price: soldPrice });
      if (player.overseas) team.overseasCount += 1;

      const field = roleCountField(player.role);
      if (field) team[field] += 1;

      await room.save();

      engine.soldList.push({ player, teamCode: soldToTeam, price: soldPrice });
    } else {
      status = 'unsold';
    }
  }

  if (status === 'unsold') {
    engine.unsoldList.push(player);
  }

  io.to(roomCode).emit('auction:result', {
    status: status.toUpperCase(),
    player: publicPlayer(player),
    price: soldPrice,
    soldToTeam,
    teams: teamsSidebar(room)
  });

  broadcastLists(io, roomCode);

  // Auto Auction End: check right away in case this purchase just filled
  // the last remaining team, so we don't wait on an unnecessary next player.
  const refreshedRoom = await Room.findOne({ roomCode });
  if (refreshedRoom && allTeamsFull(refreshedRoom)) {
    setTimeout(() => {
      endAuction(io, roomCode, 'teams_full');
    }, 2500);
    return;
  }

  setTimeout(() => {
    startNextPlayer(io, roomCode);
  }, 2500);
}

async function skipPlayer(io, roomCode) {
  const engine = engines.get(roomCode);
  if (!engine || !engine.currentPlayer) return { ok: false, error: 'No active player to skip.' };
  if (engine.locked) return { ok: false, error: 'This player is already being resolved.' };

  engine.locked = true;
  clearRoomInterval(engine);

  const room = await Room.findOne({ roomCode });

  engine.unsoldList.push(engine.currentPlayer);

  io.to(roomCode).emit('auction:result', {
    status: 'SKIPPED',
    player: publicPlayer(engine.currentPlayer),
    price: null,
    soldToTeam: null,
    teams: room ? teamsSidebar(room) : []
  });

  broadcastLists(io, roomCode);

  setTimeout(() => {
    startNextPlayer(io, roomCode);
  }, 1200);

  return { ok: true };
}

async function markUnsold(io, roomCode) {
  const engine = engines.get(roomCode);
  if (!engine || !engine.currentPlayer) return { ok: false, error: 'No active player.' };
  if (engine.locked) return { ok: false, error: 'This player is already being resolved.' };
  await resolveCurrentPlayer(io, roomCode, 'unsold');
  return { ok: true };
}

async function pauseAuction(io, roomCode) {
  const engine = engines.get(roomCode);
  if (!engine || engine.ended) return { ok: false, error: 'Auction is not active.' };
  if (engine.paused) return { ok: true };

  engine.paused = true;

  const room = await Room.findOne({ roomCode });
  if (room) {
    room.auctionPaused = true;
    await room.save();
  }

  io.to(roomCode).emit('auction:paused', { timerRemaining: engine.timerRemaining });
  return { ok: true };
}

async function resumeAuction(io, roomCode) {
  const engine = engines.get(roomCode);
  if (!engine || engine.ended) return { ok: false, error: 'Auction is not active.' };
  if (!engine.paused) return { ok: true };

  engine.paused = false;

  const room = await Room.findOne({ roomCode });
  if (room) {
    room.auctionPaused = false;
    await room.save();
  }

  io.to(roomCode).emit('auction:resumed', { timerRemaining: engine.timerRemaining });
  return { ok: true };
}

async function endAuction(io, roomCode, reason = 'host_ended') {
  const engine = engines.get(roomCode);
  if (engine) {
    clearRoomInterval(engine);
    engine.ended = true;
  }

  const room = await Room.findOne({ roomCode });
  if (room) {
    room.status = 'completed';
    await room.save();
  }

  io.to(roomCode).emit('auction:ended', { reason });
  engines.delete(roomCode);

  return { ok: true };
}

module.exports = {
  engines,
  initAuction,
  startNextPlayer,
  placeBid,
  skipPlayer,
  markUnsold,
  pauseAuction,
  resumeAuction,
  endAuction,
  buildAuctionSnapshot
};

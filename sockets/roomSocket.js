const Room = require('../models/Room');
const auctionEngine = require('./auctionEngine');

function crToLakh(cr) {
  return cr * 100;
}

const MAX_NAME_LENGTH = 30;

function publicRoomState(room) {
  return {
    roomCode: room.roomCode,
    hostName: room.hostName,
    hostTeam: room.hostTeam,
    hasPassword: !!room.password,
    budgetPerTeam: room.budgetPerTeam,
    auctionTimer: room.auctionTimer,
    maxPlayersPerTeam: room.maxPlayersPerTeam,
    maxOverseasPlayers: room.maxOverseasPlayers,
    minTeamsRequired: room.minTeamsRequired,
    maxTeams: room.maxTeams,
    status: room.status,
    teams: room.teams.map((t) => ({
      teamCode: t.teamCode,
      ownerName: t.ownerName,
      isHost: t.isHost,
      connected: !!t.socketId
    })),
    allTeams: Room.IPL_TEAMS
  };
}

module.exports = function registerRoomSocket(io) {
  io.on('connection', (socket) => {
    // ---------- Host enters waiting room (room already created via REST) ----------
    socket.on('room:enterAsHost', async ({ roomCode }, ack) => {
      try {
        const room = await Room.findOne({ roomCode: (roomCode || '').toUpperCase() });
        if (!room) return ack && ack({ ok: false, error: 'Room not found.' });

        const hostTeamEntry = room.teams.find((t) => t.isHost);
        if (!hostTeamEntry) return ack && ack({ ok: false, error: 'Host entry missing.' });

        hostTeamEntry.socketId = socket.id;
        await room.save();

        socket.data.roomCode = room.roomCode;
        socket.data.teamCode = hostTeamEntry.teamCode;
        socket.data.isHost = true;
        socket.join(room.roomCode);

        ack && ack({ ok: true, room: publicRoomState(room), you: { teamCode: hostTeamEntry.teamCode, ownerName: hostTeamEntry.ownerName, isHost: true } });
        io.to(room.roomCode).emit('room:update', publicRoomState(room));
      } catch (err) {
        console.error('[SOCKET] enterAsHost error:', err);
        ack && ack({ ok: false, error: 'Server error.' });
      }
    });

    // ---------- Guest verifies room code / password and joins with name+team ----------
    socket.on('room:verifyAndJoin', async ({ roomCode, password, name, teamCode }, ack) => {
      try {
        const code = (roomCode || '').toUpperCase();
        const room = await Room.findOne({ roomCode: code });
        if (!room) return ack && ack({ ok: false, error: 'Room not found.' });

        if (room.status !== 'waiting') {
          return ack && ack({ ok: false, error: 'Auction has already started or ended.' });
        }

        if (room.password && room.password !== (password || '').trim()) {
          return ack && ack({ ok: false, error: 'Incorrect password.' });
        }

        if (!name || !name.trim()) {
          return ack && ack({ ok: false, error: 'Name is required.' });
        }

        const trimmedName = name.trim().slice(0, MAX_NAME_LENGTH);

        if (!Room.IPL_TEAMS.includes(teamCode)) {
          return ack && ack({ ok: false, error: 'Invalid team.' });
        }

        if (room.teams.some((t) => t.teamCode === teamCode)) {
          return ack && ack({ ok: false, error: 'Team already taken. Please choose another.' });
        }

        if (room.teams.length >= room.maxTeams) {
          return ack && ack({ ok: false, error: 'Room is full.' });
        }

        room.teams.push({
          teamCode,
          ownerName: trimmedName,
          isHost: false,
          socketId: socket.id,
          budgetRemaining: crToLakh(room.budgetPerTeam),
          playersBought: [],
          overseasCount: 0
        });
        await room.save();

        socket.data.roomCode = room.roomCode;
        socket.data.teamCode = teamCode;
        socket.data.isHost = false;
        socket.join(room.roomCode);

        ack && ack({ ok: true, room: publicRoomState(room), you: { teamCode, ownerName: trimmedName, isHost: false } });
        io.to(room.roomCode).emit('room:update', publicRoomState(room));
      } catch (err) {
        console.error('[SOCKET] verifyAndJoin error:', err);
        ack && ack({ ok: false, error: 'Server error.' });
      }
    });

    // ---------- Reconnect support (page refresh in waiting room) ----------
    socket.on('room:rejoin', async ({ roomCode, teamCode }, ack) => {
      try {
        const code = (roomCode || '').toUpperCase();
        const room = await Room.findOne({ roomCode: code });
        if (!room) return ack && ack({ ok: false, error: 'Room not found.' });

        const teamEntry = room.teams.find((t) => t.teamCode === teamCode);
        if (!teamEntry) return ack && ack({ ok: false, error: 'Team not found in room.' });

        teamEntry.socketId = socket.id;
        await room.save();

        socket.data.roomCode = room.roomCode;
        socket.data.teamCode = teamEntry.teamCode;
        socket.data.isHost = teamEntry.isHost;
        socket.join(room.roomCode);

        ack && ack({ ok: true, room: publicRoomState(room), you: { teamCode: teamEntry.teamCode, ownerName: teamEntry.ownerName, isHost: teamEntry.isHost } });
        io.to(room.roomCode).emit('room:update', publicRoomState(room));
      } catch (err) {
        console.error('[SOCKET] rejoin error:', err);
        ack && ack({ ok: false, error: 'Server error.' });
      }
    });

    // ---------- Host starts the auction (Part 2 will implement the actual auction flow) ----------
    socket.on('room:startAuction', async ({ roomCode }, ack) => {
      try {
        const code = (roomCode || '').toUpperCase();
        const room = await Room.findOne({ roomCode: code });
        if (!room) return ack && ack({ ok: false, error: 'Room not found.' });

        if (!socket.data.isHost || socket.data.roomCode !== room.roomCode) {
          return ack && ack({ ok: false, error: 'Only the host can start the auction.' });
        }

        if (room.teams.length < room.minTeamsRequired) {
          return ack && ack({ ok: false, error: `At least ${room.minTeamsRequired} teams are required to start.` });
        }

        if (room.status !== 'waiting') {
          return ack && ack({ ok: false, error: 'Auction has already been started.' });
        }

        // Tell every connected client to navigate to the Live Auction page immediately.
        io.to(room.roomCode).emit('auction:go', { roomCode: room.roomCode });
        ack && ack({ ok: true });

        // Load all seeded players, randomize their order, and begin the auction.
        await auctionEngine.initAuction(io, room.roomCode);
      } catch (err) {
        console.error('[SOCKET] startAuction error:', err);
        ack && ack({ ok: false, error: 'Server error.' });
      }
    });

    // =====================================================================
    // PART 2 — LIVE AUCTION ENGINE
    // =====================================================================

    // ---------- Client enters the Live Auction page (after navigating there) ----------
    socket.on('auction:enter', async ({ roomCode, teamCode }, ack) => {
      try {
        const code = (roomCode || '').toUpperCase();
        const room = await Room.findOne({ roomCode: code });
        if (!room) return ack && ack({ ok: false, error: 'Room not found.' });

        const teamEntry = room.teams.find((t) => t.teamCode === teamCode);
        if (!teamEntry) return ack && ack({ ok: false, error: 'Team not found in room.' });

        teamEntry.socketId = socket.id;
        await room.save();

        socket.data.roomCode = room.roomCode;
        socket.data.teamCode = teamEntry.teamCode;
        socket.data.isHost = teamEntry.isHost;
        socket.join(room.roomCode);

        const snapshot = await auctionEngine.buildAuctionSnapshot(room.roomCode);

        ack && ack({
          ok: true,
          you: { teamCode: teamEntry.teamCode, ownerName: teamEntry.ownerName, isHost: teamEntry.isHost },
          snapshot
        });
      } catch (err) {
        console.error('[SOCKET] auction:enter error:', err);
        ack && ack({ ok: false, error: 'Server error.' });
      }
    });

    // ---------- Any connected team places a bid ----------
    socket.on('auction:bid', async ({ roomCode, amount }, ack) => {
      try {
        const code = (roomCode || '').toUpperCase();
        if (socket.data.roomCode !== code || !socket.data.teamCode) {
          return ack && ack({ ok: false, error: 'You are not in this room.' });
        }
        const result = await auctionEngine.placeBid(io, code, socket.data.teamCode, amount);
        ack && ack(result);
      } catch (err) {
        console.error('[SOCKET] auction:bid error:', err);
        ack && ack({ ok: false, error: 'Server error.' });
      }
    });

    // ---------- Host control: Pause Auction ----------
    socket.on('auction:pause', async ({ roomCode }, ack) => {
      const code = (roomCode || '').toUpperCase();
      if (!socket.data.isHost || socket.data.roomCode !== code) {
        return ack && ack({ ok: false, error: 'Only the host can pause the auction.' });
      }
      ack && ack(await auctionEngine.pauseAuction(io, code));
    });

    // ---------- Host control: Resume Auction ----------
    socket.on('auction:resume', async ({ roomCode }, ack) => {
      const code = (roomCode || '').toUpperCase();
      if (!socket.data.isHost || socket.data.roomCode !== code) {
        return ack && ack({ ok: false, error: 'Only the host can resume the auction.' });
      }
      ack && ack(await auctionEngine.resumeAuction(io, code));
    });

    // ---------- Host control: Skip Player ----------
    socket.on('auction:skip', async ({ roomCode }, ack) => {
      const code = (roomCode || '').toUpperCase();
      if (!socket.data.isHost || socket.data.roomCode !== code) {
        return ack && ack({ ok: false, error: 'Only the host can skip a player.' });
      }
      ack && ack(await auctionEngine.skipPlayer(io, code));
    });

    // ---------- Host control: Mark Player Unsold ----------
    socket.on('auction:markUnsold', async ({ roomCode }, ack) => {
      const code = (roomCode || '').toUpperCase();
      if (!socket.data.isHost || socket.data.roomCode !== code) {
        return ack && ack({ ok: false, error: 'Only the host can mark a player unsold.' });
      }
      ack && ack(await auctionEngine.markUnsold(io, code));
    });

    // ---------- Host control: End Auction ----------
    socket.on('auction:end', async ({ roomCode }, ack) => {
      const code = (roomCode || '').toUpperCase();
      if (!socket.data.isHost || socket.data.roomCode !== code) {
        return ack && ack({ ok: false, error: 'Only the host can end the auction.' });
      }
      ack && ack(await auctionEngine.endAuction(io, code, 'host_ended'));
    });

    // ---------- Handle disconnect ----------
    socket.on('disconnect', async () => {
      try {
        const { roomCode, teamCode } = socket.data || {};
        if (!roomCode || !teamCode) return;

        const room = await Room.findOne({ roomCode });
        if (!room) return;

        const teamEntry = room.teams.find((t) => t.teamCode === teamCode);
        if (teamEntry && teamEntry.socketId === socket.id) {
          teamEntry.socketId = null;
          await room.save();
          io.to(roomCode).emit('room:update', publicRoomState(room));
        }
      } catch (err) {
        console.error('[SOCKET] disconnect handling error:', err);
      }
    });
  });
};

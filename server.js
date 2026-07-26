require('dotenv').config();
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const connectDB = require('./config/db');
const Player = require('./models/Player');
const playersData = require('./seed/playersData');
const roomsRouter = require('./routes/rooms');
const registerRoomSocket = require('./sockets/roomSocket');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Deployed behind a reverse proxy (Render, Heroku, Nginx, etc.) in production,
// so req.protocol/req.get('host') resolve correctly for invite link generation.
app.set('trust proxy', 1);

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/rooms', roomsRouter);

registerRoomSocket(io);

async function autoSeedPlayers() {
  const count = await Player.countDocuments();
  if (count === 0) {
    await Player.insertMany(playersData);
    console.log(`[SEED] Auto-seeded ${playersData.length} players into MongoDB.`);
  } else {
    console.log(`[SEED] Players collection already populated (${count} players). Skipping auto-seed.`);
  }
}

async function start() {
  await connectDB();
  await autoSeedPlayers();

  server.listen(PORT, () => {
    console.log(`[SERVER] IPL Auction app running at http://localhost:${PORT}`);
  });
}

start();

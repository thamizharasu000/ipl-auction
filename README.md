# IPL Auction Web App — Part 1

Node.js + Express + Socket.IO + MongoDB (Mongoose) + vanilla HTML/CSS/JS.

## What's implemented (Part 1)
- 250+ real IPL players auto-seeded into MongoDB on server start (`seed/playersData.js`, 258 players).
- Home page (Create Auction / Join Auction).
- Create Auction page: host name, IPL team, optional password, budget (75/100/120/150 Cr),
  auction timer (5/10/20/30s), max players/team (15/20/25), max overseas (4/6/8).
- Room created page: room code, invite link, copy, share, "Enter Waiting Room".
- Join Auction page: room code / invite link first → password (if set) → name + team
  (taken teams greyed out).
- Waiting Room: live team list via Socket.IO, settings summary, X/10 teams joined,
  host-only "Start Auction" button (enabled once min 2 teams have joined).
- No auction/bidding page yet — that's Part 2.

## Setup

```bash
npm install
cp .env.example .env      # edit MONGO_URI if needed
npm start                 # or: npm run dev (nodemon)
```

MongoDB must be running and reachable at `MONGO_URI` (defaults to
`mongodb://127.0.0.1:27017/ipl_auction`). Players are seeded automatically the
first time the server connects to an empty `players` collection. You can also
run the seed manually:

```bash
npm run seed
```

Then open `http://localhost:3000`.

## Project structure

```
server.js              Express + Socket.IO bootstrap
config/db.js            Mongoose connection
models/Player.js        Player schema (master pool)
models/Room.js           Room schema (settings, teams, status)
routes/rooms.js          REST: create room, look up room
sockets/roomSocket.js    Real-time: join/rejoin, waiting-room updates, start-auction event
seed/playersData.js      258 IPL players
seed/seedPlayers.js      Manual seed script
public/                  index.html, create.html, room-created.html, join.html, waiting.html
public/css/style.css     Shared styles (no framework)
public/js/*.js           Page-specific vanilla JS
```

Waiting for **PART 2** (auction/bidding room) before continuing.

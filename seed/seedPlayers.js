require('dotenv').config();
const connectDB = require('../config/db');
const Player = require('../models/Player');
const playersData = require('./playersData');

async function seed() {
  await connectDB();

  const existingCount = await Player.countDocuments();
  if (existingCount > 0) {
    console.log(`[SEED] Players collection already has ${existingCount} documents. Skipping seed.`);
    console.log('[SEED] To force re-seed, drop the "players" collection and re-run: npm run seed');
    process.exit(0);
  }

  await Player.insertMany(playersData);
  console.log(`[SEED] Inserted ${playersData.length} players into MongoDB.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error('[SEED] Error seeding players:', err);
  process.exit(1);
});

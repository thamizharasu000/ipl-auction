const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ipl_auction';
  try {
    await mongoose.connect(uri);
    console.log('[DB] MongoDB connected:', uri);
  } catch (err) {
    console.error('[DB] MongoDB connection error:', err.message);
    process.exit(1);
  }
}

module.exports = connectDB;

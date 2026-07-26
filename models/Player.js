const mongoose = require('mongoose');

const PlayerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  role: {
    type: String,
    required: true,
    enum: ['Batter', 'Bowler', 'All-Rounder', 'Wicketkeeper'],
  },
  country: {
    type: String,
    required: true,
    trim: true
  },
  basePrice: {
    // Stored in Lakhs (e.g. 20 = 20 Lakh, 100 = 1 Cr)
    type: Number,
    required: true
  },
  overseas: {
    type: Boolean,
    required: true,
    default: false
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Player', PlayerSchema);

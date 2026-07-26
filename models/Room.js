const mongoose = require('mongoose');

const IPL_TEAMS = ['CSK', 'MI', 'RCB', 'KKR', 'GT', 'SRH', 'RR', 'DC', 'PBKS', 'LSG'];

const TeamSchema = new mongoose.Schema({
  teamCode: {
    type: String,
    required: true,
    enum: IPL_TEAMS
  },
  ownerName: {
    type: String,
    required: true,
    trim: true
  },
  isHost: {
    type: Boolean,
    default: false
  },
  socketId: {
    type: String,
    default: null
  },
  budgetRemaining: {
    type: Number, // in Lakhs
    required: true
  },
  playersBought: [{
    player: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },
    price: Number
  }],
  overseasCount: {
    type: Number,
    default: 0
  },
  batCount: {
    type: Number,
    default: 0
  },
  bowlCount: {
    type: Number,
    default: 0
  },
  arCount: {
    type: Number,
    default: 0
  },
  wkCount: {
    type: Number,
    default: 0
  },
  joinedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const RoomSchema = new mongoose.Schema({
  roomCode: {
    type: String,
    required: true,
    unique: true, // unique: true already creates an index; no need for a separate index: true
    uppercase: true
  },
  hostName: {
    type: String,
    required: true,
    trim: true
  },
  hostTeam: {
    type: String,
    required: true,
    enum: IPL_TEAMS
  },
  password: {
    type: String,
    default: null // null / empty => no password required
  },
  budgetPerTeam: {
    type: Number, // in Cr
    required: true,
    enum: [75, 100, 120, 150]
  },
  auctionTimer: {
    type: Number, // in seconds
    required: true,
    enum: [5, 10, 20, 30]
  },
  maxPlayersPerTeam: {
    type: Number,
    required: true,
    enum: [15, 20, 25]
  },
  maxOverseasPlayers: {
    type: Number,
    required: true,
    enum: [4, 6, 8]
  },
  teams: {
    type: [TeamSchema],
    default: []
  },
  minTeamsRequired: {
    type: Number,
    default: 2
  },
  maxTeams: {
    type: Number,
    default: 10
  },
  status: {
    type: String,
    enum: ['waiting', 'in_progress', 'completed'],
    default: 'waiting'
  },
  playerQueue: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Player'
  }],
  currentPlayerIndex: {
    type: Number,
    default: 0
  },
  currentBid: {
    // in Lakhs; live auction state (mirrors in-memory engine for reconnect support)
    type: Number,
    default: 0
  },
  currentBidderTeam: {
    type: String,
    default: null
  },
  auctionPaused: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

RoomSchema.statics.IPL_TEAMS = IPL_TEAMS;

module.exports = mongoose.model('Room', RoomSchema);

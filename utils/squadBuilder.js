const { roleAbbr } = require('./roleUtils');

/**
 * Populates every team's playersBought.player and returns a clean,
 * client-ready array. Kept in one place so the "View Team" popup during
 * the live auction and the Results page render identical data.
 */
async function buildSquads(room) {
  await room.populate('teams.playersBought.player');

  return room.teams.map((t) => ({
    teamCode: t.teamCode,
    ownerName: t.ownerName,
    isHost: t.isHost,
    budgetRemaining: t.budgetRemaining,
    budgetPerTeam: room.budgetPerTeam,
    playersBoughtCount: t.playersBought.length,
    maxPlayersPerTeam: room.maxPlayersPerTeam,
    overseasCount: t.overseasCount,
    maxOverseasPlayers: room.maxOverseasPlayers,
    batCount: t.batCount,
    bowlCount: t.bowlCount,
    arCount: t.arCount,
    wkCount: t.wkCount,
    players: t.playersBought
      .filter((pb) => pb.player)
      .map((pb) => ({
        name: pb.player.name,
        role: pb.player.role,
        roleAbbr: roleAbbr(pb.player.role),
        country: pb.player.country,
        overseas: !!pb.player.overseas,
        price: pb.price
      }))
  }));
}

module.exports = { buildSquads };

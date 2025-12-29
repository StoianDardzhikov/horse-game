const config = require("../config");

function setupGameNamespace(io, sessionService, gameEngine) {
  const gameNamespace = io.of("/ws/game");

  gameNamespace.on("connection", (socket) => {
    const sessionId = socket.handshake.query.sessionId;
    const session = sessionService.getSession(sessionId);

    if (!session) {
      socket.emit("error", {
        message: "Invalid session",
        code: "INVALID_SESSION",
      });
      socket.disconnect();
      return;
    }

    sessionService.setSocketId(sessionId, "game", socket.id);
    console.log(`Game socket connected: ${socket.id} (${session.playerId})`);

    // Send current state
    socket.emit("round_state", gameEngine.getState());

    // Send horses info
    socket.emit("horses", config.GAME.HORSES.map((h) => ({
      id: h.id,
      name: h.name,
      color: h.color,
      payout: h.payout,
    })));

    // Send history
    const historyData = gameEngine.history.slice(0, 20).map((h) => ({
      roundId: h.roundId,
      winningHorse: h.outcome.winningHorse,
      horseName: h.outcome.horseName,
      color: h.outcome.color,
      payout: h.outcome.payout,
      timestamp: h.timestamp,
    }));
    socket.emit("history", historyData);

    socket.on("disconnect", () => {
      console.log(`Game socket disconnected: ${socket.id}`);
    });
  });

  return gameNamespace;
}

module.exports = setupGameNamespace;

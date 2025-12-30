const config = require("../config");

function setupControlsNamespace(io, sessionService, betService, gameEngine) {
  const controlsNamespace = io.of("/ws/controls");

  controlsNamespace.on("connection", (socket) => {
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

    sessionService.setSocketId(sessionId, "controls", socket.id);
    console.log(
      `Controls socket connected: ${socket.id} (${session.playerId})`
    );

    // Send current state
    socket.emit("balance_update", {
      balance: session.balance,
      currency: session.currency,
    });
    socket.emit("round_state", gameEngine.getState());

    // Send horses info
    socket.emit("horses", config.GAME.HORSES.map((h) => ({
      id: h.id,
      name: h.name,
      color: h.color,
      payout: h.payout,
    })));

    // Check for existing bet
    const existingBet = gameEngine.getBet(session.playerId);
    if (existingBet) {
      socket.emit("bet_status", { hasBet: true, ...existingBet });
    }

    // Handle bet
    socket.on("bet", async (data) => {
      try {
        const result = await betService.placeBet(
          sessionId,
          data.amount,
          data.betType || "horse",
          data.selection,
          data.timestamp || null
        );
        socket.emit("bet_result", result);

        // Broadcast to others (redacted player ID)
        socket.broadcast.emit("player_bet", {
          odifiedPlayerId: session.playerId.substring(0, 4) + "***",
          amount: data.amount,
          selection: data.selection,
        });
      } catch (e) {
        socket.emit("bet_result", { success: false, error: e.message });
      }
    });

    // Handle balance request
    socket.on("get_balance", async () => {
      try {
        if (session.callbackBaseUrl) {
          const balanceResponse = await betService.callbackService.getBalance(
            session.playerId,
            sessionId,
            session.callbackBaseUrl
          );
          sessionService.updateBalance(sessionId, balanceResponse.balance);
          socket.emit("balance_update", {
            balance: balanceResponse.balance,
            currency: session.currency,
          });
        } else {
          socket.emit("balance_update", {
            balance: session.balance,
            currency: session.currency,
          });
        }
      } catch (e) {
        socket.emit("error", { message: "Failed to fetch balance" });
      }
    });

    socket.on("disconnect", () => {
      console.log(`Controls socket disconnected: ${socket.id}`);
    });
  });

  return controlsNamespace;
}

module.exports = setupControlsNamespace;

const config = require("../config");

class BetService {
  constructor(gameEngine, callbackService, sessionService) {
    this.gameEngine = gameEngine;
    this.callbackService = callbackService;
    this.sessionService = sessionService;
  }

  async placeBet(sessionId, amount, betType, selection, clientTimestamp = null) {
    const session = this.sessionService.getSession(sessionId);
    if (!session) throw new Error("Invalid session");

    if (amount < config.GAME.MIN_BET || amount > config.GAME.MAX_BET) {
      throw new Error(
        `Bet must be between ${config.GAME.MIN_BET} and ${config.GAME.MAX_BET}`
      );
    }

    if (amount > session.balance) {
      throw new Error("Insufficient balance");
    }

    const roundId = this.gameEngine.currentRound?.roundId;
    if (!roundId) throw new Error("No active round");

    // For testing without platform, just deduct locally
    let transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    let newBalance = session.balance - amount;

    // Try platform callback if configured
    if (session.callbackBaseUrl) {
      try {
        const betResponse = await this.callbackService.placeBet(
          session,
          roundId,
          amount,
          betType,
          selection
        );

        if (betResponse.status !== "OK") {
          throw new Error(betResponse.message || "Bet rejected by platform");
        }
        transactionId = betResponse.transactionId;
        newBalance = betResponse.newBalance;
      } catch (e) {
        // If callback fails, continue with local balance for testing
        console.warn("Platform callback failed, using local balance:", e.message);
      }
    }

    // Register bet in engine
    try {
      this.gameEngine.registerBet(
        session.playerId,
        amount,
        betType,
        selection,
        transactionId,
        clientTimestamp
      );
    } catch (e) {
      // Rollback if engine rejects
      if (session.callbackBaseUrl) {
        try {
          await this.callbackService.rollback(
            session,
            roundId,
            amount,
            transactionId,
            "REGISTRATION_FAILED"
          );
        } catch (rollbackError) {
          console.error("Rollback failed:", rollbackError.message);
        }
      }
      throw e;
    }

    // Update cached balance
    this.sessionService.updateBalance(sessionId, newBalance);

    return {
      success: true,
      betId: transactionId,
      amount,
      newBalance,
    };
  }

  async processWin(
    sessionId,
    roundId,
    betAmount,
    multiplier,
    winAmount,
    betTransactionId,
    outcome
  ) {
    const session = this.sessionService.getSession(sessionId);
    if (!session) return null;

    let newBalance = session.balance + winAmount;

    // Try platform callback if configured
    if (session.callbackBaseUrl) {
      try {
        const winResponse = await this.callbackService.creditWin(
          session,
          roundId,
          betAmount,
          multiplier,
          winAmount,
          betTransactionId,
          outcome
        );
        newBalance = winResponse.newBalance;
      } catch (e) {
        console.error("Failed to credit win via platform:", e.message);
        // Continue with local balance for testing
      }
    }

    this.sessionService.updateBalance(sessionId, newBalance);
    return newBalance;
  }
}

module.exports = BetService;

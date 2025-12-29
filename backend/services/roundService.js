const config = require("../config");

class RoundService {
  constructor(io, gameEngine, seedManager, betService, sessionService) {
    this.io = io;
    this.gameEngine = gameEngine;
    this.seedManager = seedManager;
    this.betService = betService;
    this.sessionService = sessionService;
    this.gameNamespace = null;
    this.controlsNamespace = null;
    this.isRunning = false;
    this.tickInterval = null;
  }

  setNamespaces(gameNs, controlsNs) {
    this.gameNamespace = gameNs;
    this.controlsNamespace = controlsNs;
  }

  start() {
    this.isRunning = true;
    this.runGameLoop();
  }

  stop() {
    this.isRunning = false;
    if (this.tickInterval) clearInterval(this.tickInterval);
  }

  async runGameLoop() {
    while (this.isRunning) {
      await this.runRound();
      await this.delay(config.GAME.ROUND_DELAY_MS);
    }
  }

  async runRound() {
    // 1. Create round with pre-calculated outcome
    const seedData = this.seedManager.getVerificationData();
    const round = this.gameEngine.createRound(
      seedData.serverSeed,
      seedData.clientSeed,
      seedData.nonce
    );

    // 2. Betting phase
    this.gameNamespace.emit("betting_phase", {
      roundId: round.roundId,
      duration: config.GAME.BETTING_PHASE_MS,
      serverSeedHash: seedData.serverSeedHash,
      horses: config.GAME.HORSES.map((h) => ({
        id: h.id,
        name: h.name,
        color: h.color,
        payout: h.payout,
      })),
    });
    this.controlsNamespace.emit("betting_phase", {
      roundId: round.roundId,
      duration: config.GAME.BETTING_PHASE_MS,
      horses: config.GAME.HORSES.map((h) => ({
        id: h.id,
        name: h.name,
        color: h.color,
        payout: h.payout,
      })),
    });

    await this.delay(config.GAME.BETTING_PHASE_MS);

    // 3. Start round
    this.gameEngine.startRound();
    const raceProgression = this.gameEngine.getRaceProgression();

    this.gameNamespace.emit("round_start", {
      roundId: round.roundId,
      raceDuration: config.GAME.RACE_DURATION_MS,
    });
    this.controlsNamespace.emit("round_start", {
      roundId: round.roundId,
      raceDuration: config.GAME.RACE_DURATION_MS,
    });

    // 4. Run the race (send tick updates)
    await this.runRacePhase(round, raceProgression);

    // 5. End round
    const results = this.gameEngine.endRound();

    // 6. Broadcast outcome with verification data
    this.gameNamespace.emit("round_end", {
      roundId: round.roundId,
      outcome: round.outcome,
      serverSeed: seedData.serverSeed,
      clientSeed: seedData.clientSeed,
      nonce: seedData.nonce,
    });
    this.controlsNamespace.emit("round_end", {
      roundId: round.roundId,
      outcome: round.outcome,
    });

    // 7. Process results and send to individual players
    await this.processResults(results, round.roundId, round.outcome);

    // 8. Advance seed for next round
    this.seedManager.advance();

    // 9. Send updated history
    const historyData = this.gameEngine.history.slice(0, 20).map((h) => ({
      roundId: h.roundId,
      winningHorse: h.outcome.winningHorse,
      horseName: h.outcome.horseName,
      color: h.outcome.color,
      payout: h.outcome.payout,
      timestamp: h.timestamp,
    }));
    this.gameNamespace.emit("history", historyData);
  }

  async runRacePhase(round, raceProgression) {
    const tickInterval = config.GAME.TICK_INTERVAL_MS;
    const totalTicks = raceProgression[0].positions.length;

    for (let tick = 0; tick < totalTicks; tick++) {
      const positions = raceProgression.map((horse) => ({
        id: horse.id,
        name: horse.name,
        color: horse.color,
        position: horse.positions[tick],
      }));

      this.gameNamespace.emit("round_tick", {
        tick,
        totalTicks,
        elapsed: tick * tickInterval,
        positions,
      });
      this.controlsNamespace.emit("round_tick", {
        tick,
        totalTicks,
        elapsed: tick * tickInterval,
      });

      await this.delay(tickInterval);
    }
  }

  async processResults(results, roundId, outcome) {
    for (const result of results) {
      const session = this.sessionService.getSessionByPlayerId(result.playerId);
      if (!session) continue;

      if (result.won && result.amount > 0) {
        const newBalance = await this.betService.processWin(
          session.sessionId,
          roundId,
          result.amount / result.multiplier, // bet amount
          result.multiplier,
          result.amount,
          result.transactionId,
          outcome
        );

        this.emitToPlayer(session.controlsSocketId, "round_result", {
          won: true,
          amount: result.amount,
          multiplier: result.multiplier,
          outcome,
          newBalance,
        });
      } else {
        this.emitToPlayer(session.controlsSocketId, "round_result", {
          won: false,
          amount: 0,
          outcome,
          newBalance: session.balance,
        });
      }
    }
  }

  emitToPlayer(socketId, event, data) {
    if (socketId) {
      this.controlsNamespace.to(socketId).emit(event, data);
    }
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = RoundService;

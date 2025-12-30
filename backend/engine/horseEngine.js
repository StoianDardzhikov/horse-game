const crypto = require("crypto");
const config = require("../config");

class HorseEngine {
  constructor() {
    this.currentRound = null;
    this.history = [];
    this.horses = config.GAME.HORSES;
  }

  createRound(serverSeed, clientSeed, nonce) {
    const roundId = `R-${Date.now()}-${nonce}`;
    const outcome = this.calculateOutcome(serverSeed, clientSeed, nonce);

    this.currentRound = {
      roundId,
      outcome,
      state: "BETTING",
      startTime: null,
      bettingStartTime: Date.now(),
      bettingEndTime: Date.now() + config.GAME.BETTING_PHASE_MS,
      bets: new Map(),
      horsePositions: this.horses.map((h) => ({ id: h.id, position: 0 })),
    };

    return this.currentRound;
  }

  calculateOutcome(serverSeed, clientSeed, nonce) {
    const hmac = crypto
      .createHmac("sha256", serverSeed)
      .update(`${clientSeed}:${nonce}`)
      .digest("hex");

    // Use first 13 hex chars for high precision
    const hashValue = parseInt(hmac.substring(0, 13), 16);
    const maxValue = Math.pow(16, 13);
    const rawResult = hashValue / maxValue; // 0 to 1

    // Determine winning horse based on cumulative probability
    let cumulative = 0;
    for (const horse of this.horses) {
      cumulative += horse.probability;
      if (rawResult < cumulative) {
        return {
          winningHorse: horse.id,
          horseName: horse.name,
          color: horse.color,
          payout: horse.payout,
          rawValue: rawResult,
        };
      }
    }

    // Fallback to last horse (should not happen)
    const lastHorse = this.horses[this.horses.length - 1];
    return {
      winningHorse: lastHorse.id,
      horseName: lastHorse.name,
      color: lastHorse.color,
      payout: lastHorse.payout,
      rawValue: rawResult,
    };
  }

  // Generate race progression data for animation
  // Creates realistic race with drama and natural speed variations
  generateRaceProgression(outcome, durationMs, tickIntervalMs) {
    const ticks = Math.floor(durationMs / tickIntervalMs);

    // Determine race type for variety
    const raceType = Math.random();
    let raceStyle;
    if (raceType < 0.3) {
      raceStyle = 'photoFinish';    // Very close finish, multiple horses in contention
    } else if (raceType < 0.5) {
      raceStyle = 'comeFromBehind'; // Winner trails then surges
    } else if (raceType < 0.7) {
      raceStyle = 'wireToWire';     // Winner leads most of the race
    } else {
      raceStyle = 'midRaceDuel';    // Two horses battle, winner pulls away late
    }

    // Pick a challenger horse (not the winner) for duel scenarios
    const nonWinners = this.horses.filter(h => h.id !== outcome.winningHorse);
    const challenger = nonWinners[Math.floor(Math.random() * nonWinners.length)];

    // Pre-generate race characteristics for each horse
    const horseData = this.horses.map((horse) => {
      const isWinner = horse.id === outcome.winningHorse;
      const isChallenger = horse.id === challenger.id;

      // Final positions vary by race style
      let finalPosition;
      if (isWinner) {
        finalPosition = 100;
      } else if (isChallenger && (raceStyle === 'photoFinish' || raceStyle === 'midRaceDuel')) {
        finalPosition = 97 + Math.random() * 2.5; // Very close second
      } else if (raceStyle === 'photoFinish') {
        finalPosition = 94 + Math.random() * 5; // Everyone close
      } else {
        finalPosition = 88 + Math.random() * 9; // Normal spread
      }

      // Base speed variation
      const baseSpeed = 0.92 + Math.random() * 0.16;

      // Phase speeds with more variation for drama
      let phase1Speed, phase2Speed, phase3Speed;

      if (isWinner) {
        if (raceStyle === 'comeFromBehind') {
          phase1Speed = 0.85 + Math.random() * 0.1;  // Start slow
          phase2Speed = 0.95 + Math.random() * 0.1;  // Build up
          phase3Speed = 1.15 + Math.random() * 0.1;  // Strong finish
        } else if (raceStyle === 'wireToWire') {
          phase1Speed = 1.1 + Math.random() * 0.1;   // Fast start
          phase2Speed = 1.0 + Math.random() * 0.1;   // Maintain
          phase3Speed = 1.0 + Math.random() * 0.1;   // Hold on
        } else {
          phase1Speed = 0.95 + Math.random() * 0.15;
          phase2Speed = 1.0 + Math.random() * 0.1;
          phase3Speed = 1.1 + Math.random() * 0.1;
        }
      } else if (isChallenger) {
        if (raceStyle === 'midRaceDuel' || raceStyle === 'photoFinish') {
          phase1Speed = 1.0 + Math.random() * 0.15;  // Competitive start
          phase2Speed = 1.05 + Math.random() * 0.1;  // Push hard
          phase3Speed = 0.95 + Math.random() * 0.1;  // Fade slightly
        } else {
          phase1Speed = 1.05 + Math.random() * 0.1;  // Early leader
          phase2Speed = 0.95 + Math.random() * 0.1;
          phase3Speed = 0.9 + Math.random() * 0.1;   // Tire out
        }
      } else {
        // Regular horses - random personalities
        const personality = Math.random();
        if (personality < 0.33) {
          // Front runner type
          phase1Speed = 1.05 + Math.random() * 0.1;
          phase2Speed = 0.95 + Math.random() * 0.1;
          phase3Speed = 0.85 + Math.random() * 0.1;
        } else if (personality < 0.66) {
          // Steady pacer
          phase1Speed = 0.95 + Math.random() * 0.1;
          phase2Speed = 0.95 + Math.random() * 0.1;
          phase3Speed = 0.95 + Math.random() * 0.1;
        } else {
          // Closer type
          phase1Speed = 0.88 + Math.random() * 0.1;
          phase2Speed = 0.98 + Math.random() * 0.1;
          phase3Speed = 1.05 + Math.random() * 0.1;
        }
      }

      // Surge moments - brief speed boosts at random points
      const hasSurge = Math.random() < 0.6;
      const surgePoint = 0.3 + Math.random() * 0.5; // Between 30-80% of race
      const surgeStrength = 0.05 + Math.random() * 0.1;

      // Starting reaction time
      const startDelay = Math.random() * 0.025;

      return {
        id: horse.id,
        name: horse.name,
        color: horse.color,
        isWinner,
        isChallenger,
        finalPosition,
        baseSpeed,
        phase1Speed,
        phase2Speed,
        phase3Speed,
        hasSurge,
        surgePoint,
        surgeStrength,
        startDelay,
        positions: [],
      };
    });

    // Generate positions for each tick
    for (let tick = 0; tick <= ticks; tick++) {
      const progress = tick / ticks;

      horseData.forEach((horse) => {
        let position = this.calculateRealisticPosition(progress, horse);

        // Apply surge bonus
        if (horse.hasSurge && progress > horse.surgePoint && progress < horse.surgePoint + 0.15) {
          const surgeProgress = (progress - horse.surgePoint) / 0.15;
          const surgeBonus = Math.sin(surgeProgress * Math.PI) * horse.surgeStrength * horse.finalPosition;
          position += surgeBonus;
        }

        // Ensure monotonic increase
        if (horse.positions.length > 0) {
          const lastPos = horse.positions[horse.positions.length - 1];
          position = Math.max(lastPos + 0.05, position);
        }

        position = Math.min(position, horse.finalPosition);
        horse.positions.push(position);
      });
    }

    // Ensure final positions are exact
    horseData.forEach((horse) => {
      horse.positions[horse.positions.length - 1] = horse.finalPosition;
    });

    // Light smoothing
    this.smoothPositions(horseData);

    return horseData;
  }

  // Calculate realistic position based on phase speeds
  calculateRealisticPosition(progress, horse) {
    const adjustedProgress = Math.max(0, progress - horse.startDelay) / (1 - horse.startDelay);
    if (adjustedProgress <= 0) return 0;

    const target = horse.finalPosition;
    let position = 0;

    // Five micro-phases for smoother transitions
    if (adjustedProgress <= 0.2) {
      // Acceleration out of gate
      const phaseProgress = adjustedProgress / 0.2;
      position = this.easeOutQuad(phaseProgress) * 0.2 * target * horse.phase1Speed * horse.baseSpeed;
    } else if (adjustedProgress <= 0.4) {
      // Early race
      const prev = 0.2 * target * horse.phase1Speed * horse.baseSpeed;
      const phaseProgress = (adjustedProgress - 0.2) / 0.2;
      position = prev + phaseProgress * 0.2 * target * horse.phase1Speed * horse.baseSpeed;
    } else if (adjustedProgress <= 0.6) {
      // Mid race
      const prev = 0.4 * target * horse.phase1Speed * horse.baseSpeed;
      const phaseProgress = (adjustedProgress - 0.4) / 0.2;
      position = prev + phaseProgress * 0.2 * target * horse.phase2Speed * horse.baseSpeed;
    } else if (adjustedProgress <= 0.8) {
      // Late race
      const prev = 0.4 * target * horse.phase1Speed * horse.baseSpeed +
                   0.2 * target * horse.phase2Speed * horse.baseSpeed;
      const phaseProgress = (adjustedProgress - 0.6) / 0.2;
      position = prev + phaseProgress * 0.2 * target * horse.phase2Speed * horse.baseSpeed;
    } else {
      // Final stretch
      const prev = 0.4 * target * horse.phase1Speed * horse.baseSpeed +
                   0.4 * target * horse.phase2Speed * horse.baseSpeed;
      const phaseProgress = (adjustedProgress - 0.8) / 0.2;
      position = prev + this.easeInQuad(phaseProgress) * 0.2 * target * horse.phase3Speed * horse.baseSpeed;
    }

    // Normalize to final position
    const rawTotal = 0.4 * target * horse.phase1Speed * horse.baseSpeed +
                     0.4 * target * horse.phase2Speed * horse.baseSpeed +
                     0.2 * target * horse.phase3Speed * horse.baseSpeed;

    return (position / rawTotal) * target * adjustedProgress;
  }

  // Light smoothing pass
  smoothPositions(horseData) {
    horseData.forEach((horse) => {
      const positions = horse.positions;
      if (positions.length < 3) return;

      for (let pass = 0; pass < 2; pass++) {
        for (let i = 1; i < positions.length - 1; i++) {
          const smoothed = (positions[i - 1] + positions[i] * 2 + positions[i + 1]) / 4;
          positions[i] = Math.max(positions[i - 1] + 0.02, smoothed);
        }
      }
      positions[positions.length - 1] = horse.finalPosition;
    });
  }

  // Easing functions for smooth animation
  easeInQuad(t) {
    return t * t;
  }

  easeOutQuad(t) {
    return 1 - (1 - t) * (1 - t);
  }

  easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  registerBet(playerId, amount, betType, selection, transactionId, clientTimestamp = null) {
    if (!this.currentRound) {
      throw new Error("Betting not allowed");
    }

    const now = Date.now();
    const gracePeriodEnd = this.currentRound.bettingEndTime + config.GAME.BET_GRACE_PERIOD_MS;

    // Allow bet if:
    // 1. Still in BETTING state, OR
    // 2. Within grace period AND (client timestamp was during betting OR no client timestamp provided)
    const inBettingState = this.currentRound.state === "BETTING";
    const withinGracePeriod = now <= gracePeriodEnd;
    const clientWasDuringBetting = clientTimestamp && clientTimestamp <= this.currentRound.bettingEndTime;

    if (!inBettingState && !(withinGracePeriod && (clientWasDuringBetting || !clientTimestamp))) {
      throw new Error("Betting not allowed");
    }

    if (this.currentRound.bets.has(playerId)) {
      throw new Error("Already placed a bet");
    }

    // Validate horse selection
    const horseId = parseInt(selection);
    const horse = this.horses.find((h) => h.id === horseId);
    if (!horse) {
      throw new Error("Invalid horse selection");
    }

    this.currentRound.bets.set(playerId, {
      amount,
      betType,
      selection: horseId,
      horseName: horse.name,
      payout: horse.payout,
      transactionId,
      timestamp: now,
    });

    return true;
  }

  startRound() {
    if (!this.currentRound || this.currentRound.state !== "BETTING") {
      throw new Error("Cannot start round");
    }
    this.currentRound.state = "RUNNING";
    this.currentRound.startTime = Date.now();

    // Generate the race progression for animation
    this.currentRound.raceProgression = this.generateRaceProgression(
      this.currentRound.outcome,
      config.GAME.RACE_DURATION_MS,
      config.GAME.TICK_INTERVAL_MS
    );
  }

  calculateWin(bet, outcome) {
    const won = bet.selection === outcome.winningHorse;
    return {
      won,
      multiplier: won ? bet.payout : 0,
      amount: won ? bet.amount * bet.payout : 0,
    };
  }

  endRound() {
    const results = [];

    for (const [playerId, bet] of this.currentRound.bets) {
      const result = this.calculateWin(bet, this.currentRound.outcome);
      results.push({
        playerId,
        odifiedPlayerId: playerId.substring(0, 4) + "***",
        ...bet,
        ...result,
      });
    }

    this.history.unshift({
      roundId: this.currentRound.roundId,
      outcome: this.currentRound.outcome,
      timestamp: Date.now(),
      totalBets: this.currentRound.bets.size,
    });

    if (this.history.length > 50) this.history.pop();

    this.currentRound.state = "ENDED";
    return results;
  }

  getState() {
    return {
      state: this.currentRound?.state || "WAITING",
      roundId: this.currentRound?.roundId,
      betsCount: this.currentRound?.bets?.size || 0,
      horses: this.horses.map((h) => ({
        id: h.id,
        name: h.name,
        color: h.color,
        payout: h.payout,
      })),
    };
  }

  getBet(playerId) {
    return this.currentRound?.bets?.get(playerId) || null;
  }

  getRaceProgression() {
    return this.currentRound?.raceProgression || null;
  }
}

module.exports = HorseEngine;

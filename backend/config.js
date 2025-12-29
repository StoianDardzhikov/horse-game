module.exports = {
  PORT: process.env.PORT || 3000,
  PROVIDER_SECRET: process.env.PROVIDER_SECRET || "horse-race-secret-key",

  GAME: {
    // Timing
    TICK_INTERVAL_MS: 50,
    ROUND_DELAY_MS: 5000,
    BETTING_PHASE_MS: 15000,
    RACE_DURATION_MS: 8000,

    // Bet limits
    MIN_BET: 1,
    MAX_BET: 100000000000,

    // Horse configuration - 6 horses with probabilities that sum to 100%
    // RTP = sum(probability * payout) = ~96.5%
    HORSES: [
      { id: 1, name: "Thunder Bolt", color: "#e74c3c", probability: 0.30, payout: 3.22 },
      { id: 2, name: "Silver Storm", color: "#3498db", probability: 0.25, payout: 3.86 },
      { id: 3, name: "Golden Glory", color: "#f1c40f", probability: 0.20, payout: 4.83 },
      { id: 4, name: "Midnight Run", color: "#9b59b6", probability: 0.12, payout: 8.04 },
      { id: 5, name: "Wild Spirit", color: "#2ecc71", probability: 0.08, payout: 12.06 },
      { id: 6, name: "Lucky Star", color: "#e67e22", probability: 0.05, payout: 19.30 },
    ],
    // RTP verification: 0.30*3.22 + 0.25*3.86 + 0.20*4.83 + 0.12*8.04 + 0.08*12.06 + 0.05*19.30 = 0.9655 (96.55%)
  },

  CALLBACK: {
    TIMEOUT_MS: 10000,
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY_MS: 1000,
  },

  SESSION: {
    EXPIRY_MS: 24 * 60 * 60 * 1000,
  },
};

const axios = require("axios");
const { hmacSha256 } = require("../util/hmac");
const config = require("../config");

class CallbackService {
  constructor() {
    this.client = axios.create({
      timeout: config.CALLBACK.TIMEOUT_MS,
      headers: { "Content-Type": "application/json" },
    });
  }

  async makeCallback(url, payload, retries = config.CALLBACK.RETRY_ATTEMPTS) {
    const signature = hmacSha256(
      JSON.stringify(payload),
      config.PROVIDER_SECRET
    );

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await this.client.post(url, payload, {
          headers: {
            "X-Provider-Signature": signature,
            "X-Request-ID": payload.requestId || `REQ-${Date.now()}`,
          },
        });
        return response.data;
      } catch (error) {
        console.error(`Callback attempt ${attempt} failed:`, error.message);
        if (attempt === retries) throw error;
        await new Promise((r) =>
          setTimeout(r, config.CALLBACK.RETRY_DELAY_MS * attempt)
        );
      }
    }
  }

  async placeBet(session, roundId, amount, betType, selection) {
    const payload = {
      requestId: `BET-${roundId}-${session.playerId}-${Date.now()}`,
      roundId,
      playerId: session.playerId,
      sessionId: session.sessionId,
      amount,
      currency: session.currency,
      betType,
      selection,
      timestamp: Date.now(),
    };
    return this.makeCallback(`${session.callbackBaseUrl}/bet`, payload);
  }

  async creditWin(
    session,
    roundId,
    betAmount,
    multiplier,
    winAmount,
    betTransactionId,
    outcome
  ) {
    const payload = {
      requestId: `WIN-${roundId}-${session.playerId}-${Date.now()}`,
      roundId,
      playerId: session.playerId,
      sessionId: session.sessionId,
      betAmount,
      multiplier,
      winAmount,
      currency: session.currency,
      betTransactionId,
      outcome: JSON.stringify(outcome),
      timestamp: Date.now(),
    };
    return this.makeCallback(`${session.callbackBaseUrl}/win`, payload);
  }

  async rollback(session, roundId, amount, originalTransactionId, reason) {
    const payload = {
      requestId: `ROLLBACK-${roundId}-${session.playerId}-${Date.now()}`,
      roundId,
      playerId: session.playerId,
      sessionId: session.sessionId,
      amount,
      currency: session.currency,
      originalTransactionId,
      reason,
      timestamp: Date.now(),
    };
    return this.makeCallback(`${session.callbackBaseUrl}/rollback`, payload);
  }

  async getBalance(playerId, sessionId, callbackBaseUrl) {
    const payload = {
      playerId,
      sessionId,
      timestamp: Date.now(),
    };
    return this.makeCallback(`${callbackBaseUrl}/balance`, payload);
  }
}

module.exports = CallbackService;

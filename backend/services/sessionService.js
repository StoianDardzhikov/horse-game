const { v4: uuidv4 } = require("uuid");
const { validateSignature } = require("../util/hmac");
const config = require("../config");

class SessionService {
  constructor(callbackService) {
    this.sessions = new Map();
    this.callbackService = callbackService;
    setInterval(() => this.cleanupExpired(), 60000);
  }

  async createSession({
    playerId,
    currency,
    callbackBaseUrl,
    token,
    timestamp,
    signature,
  }) {
    const sessionId = `SESSION-${uuidv4()}`;
    const expiresAt = Date.now() + config.SESSION.EXPIRY_MS;

    let balance = 1000; // Default balance for testing
    try {
      if (callbackBaseUrl) {
        const balanceResponse = await this.callbackService.getBalance(
          playerId,
          sessionId,
          callbackBaseUrl
        );
        balance = balanceResponse.balance;
      }
    } catch (e) {
      console.error("Failed to fetch initial balance:", e.message);
    }

    const session = {
      sessionId,
      playerId,
      currency: currency || "EUR",
      callbackBaseUrl,
      token,
      signature,
      balance,
      createdAt: Date.now(),
      expiresAt,
      isConnected: false,
      gameSocketId: null,
      controlsSocketId: null,
    };

    this.sessions.set(sessionId, session);

    return {
      sessionId,
      gameUrl: `/game-iframe/?sessionId=${sessionId}`,
      controlsUrl: `/controls-iframe/?sessionId=${sessionId}`,
      expiresAt,
    };
  }

  getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(sessionId);
      return null;
    }
    return session;
  }

  getSessionByPlayerId(playerId) {
    for (const [sessionId, session] of this.sessions) {
      if (session.playerId === playerId && Date.now() <= session.expiresAt) {
        return session;
      }
    }
    return null;
  }

  updateBalance(sessionId, newBalance) {
    const session = this.sessions.get(sessionId);
    if (session) session.balance = newBalance;
  }

  setSocketId(sessionId, type, socketId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      if (type === "game") session.gameSocketId = socketId;
      else if (type === "controls") session.controlsSocketId = socketId;
      session.isConnected = true;
    }
  }

  cleanupExpired() {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions) {
      if (now > session.expiresAt) {
        this.sessions.delete(sessionId);
      }
    }
  }

  getAllSessions() {
    return this.sessions;
  }
}

module.exports = SessionService;

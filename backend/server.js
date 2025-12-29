const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const cors = require("cors");

const config = require("./config");
const HorseEngine = require("./engine/horseEngine");
const SeedManager = require("./engine/seeds");
const CallbackService = require("./services/callbackService");
const SessionService = require("./services/sessionService");
const BetService = require("./services/betService");
const RoundService = require("./services/roundService");
const setupGameNamespace = require("./ws/gameNamespace");
const setupControlsNamespace = require("./ws/controlsNamespace");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

app.use(cors());
app.use(express.json());

// Static files
app.use(
  "/game-iframe",
  express.static(path.join(__dirname, "../frontend/game-iframe"))
);
app.use(
  "/controls-iframe",
  express.static(path.join(__dirname, "../frontend/controls-iframe"))
);

// Initialize services
const gameEngine = new HorseEngine();
const seedManager = new SeedManager();
const callbackService = new CallbackService();
const sessionService = new SessionService(callbackService);
const betService = new BetService(gameEngine, callbackService, sessionService);
const roundService = new RoundService(io, gameEngine, seedManager, betService, sessionService);

// REST Endpoints
app.post("/session/init", async (req, res) => {
  try {
    const result = await sessionService.createSession(req.body);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/session/:sessionId", (req, res) => {
  const session = sessionService.getSession(req.params.sessionId);
  if (!session) return res.status(404).json({ error: "Session not found" });
  res.json({ playerId: session.playerId, currency: session.currency });
});

app.get("/game/state", (req, res) => res.json(gameEngine.getState()));
app.get("/game/history", (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const historyData = gameEngine.history.slice(0, limit).map((h) => ({
    roundId: h.roundId,
    winningHorse: h.outcome.winningHorse,
    horseName: h.outcome.horseName,
    color: h.outcome.color,
    payout: h.outcome.payout,
    timestamp: h.timestamp,
  }));
  res.json(historyData);
});

app.get("/provably-fair", (req, res) => res.json(seedManager.getPublicData()));
app.post("/provably-fair/verify", (req, res) => {
  const { serverSeed, clientSeed, nonce } = req.body;
  const outcome = gameEngine.calculateOutcome(serverSeed, clientSeed, nonce);
  res.json({ verified: true, outcome });
});

app.get("/game-iframe", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/game-iframe/index.html"));
});
app.get("/controls-iframe", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/controls-iframe/index.html"));
});
app.get("/health", (req, res) =>
  res.json({ status: "ok", timestamp: Date.now() })
);

// WebSocket namespaces
const gameNs = setupGameNamespace(io, sessionService, gameEngine);
const controlsNs = setupControlsNamespace(io, sessionService, betService, gameEngine);
roundService.setNamespaces(gameNs, controlsNs);

// Start game loop
roundService.start();

// Graceful shutdown
process.on("SIGTERM", () => {
  roundService.stop();
  server.close();
});
process.on("SIGINT", () => {
  roundService.stop();
  server.close();
});

server.listen(config.PORT, () => {
  console.log(`Horse Race game provider running on port ${config.PORT}`);
});

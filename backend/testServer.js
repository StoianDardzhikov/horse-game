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
  path: "/horses/socket.io",
});

app.use(cors());
app.use(express.json());

// Initialize services
const gameEngine = new HorseEngine();
const seedManager = new SeedManager();
const callbackService = new CallbackService();
const sessionService = new SessionService(callbackService);
const betService = new BetService(gameEngine, callbackService, sessionService);
const roundService = new RoundService(io, gameEngine, seedManager, betService, sessionService);

// Router with /horses prefix
const gameRouter = express.Router();

gameRouter.post("/session/init", async (req, res) => {
  try {
    const result = await sessionService.createSession(req.body);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

gameRouter.get("/session/:sessionId", (req, res) => {
  const session = sessionService.getSession(req.params.sessionId);
  if (!session) return res.status(404).json({ error: "Session not found" });
  res.json({ playerId: session.playerId, currency: session.currency });
});

gameRouter.get("/game/state", (req, res) => res.json(gameEngine.getState()));
gameRouter.get("/game/history", (req, res) => {
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

gameRouter.get("/provably-fair", (req, res) =>
  res.json(seedManager.getPublicData())
);
gameRouter.post("/provably-fair/verify", (req, res) => {
  const { serverSeed, clientSeed, nonce } = req.body;
  const outcome = gameEngine.calculateOutcome(serverSeed, clientSeed, nonce);
  res.json({ verified: true, outcome });
});

gameRouter.get("/game-iframe", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/game-iframe/index.html"));
});
gameRouter.get("/controls-iframe", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/controls-iframe/index.html"));
});
gameRouter.use(
  "/game-iframe",
  express.static(path.join(__dirname, "../frontend/game-iframe"))
);
gameRouter.use(
  "/controls-iframe",
  express.static(path.join(__dirname, "../frontend/controls-iframe"))
);
gameRouter.get("/health", (req, res) =>
  res.json({ status: "ok", timestamp: Date.now() })
);

// Mount router
app.use("/horses", gameRouter);

// Also serve a test page at root
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Horse Racing - Test</title>
      <style>
        body { font-family: Arial, sans-serif; background: #1a1a2e; color: #fff; padding: 20px; }
        .container { display: flex; gap: 20px; height: 90vh; }
        iframe { border: 2px solid #3a3a5e; border-radius: 8px; }
        .game-frame { flex: 2; height: 100%; }
        .controls-frame { flex: 1; height: 100%; }
        h1 { text-align: center; color: #00ff88; }
        .actions { text-align: center; margin-bottom: 20px; }
        button { background: #00ff88; color: #000; border: none; padding: 10px 20px;
                 border-radius: 4px; cursor: pointer; margin: 0 10px; font-weight: bold; }
        button:hover { background: #00cc6a; }
        #session-info { text-align: center; margin-bottom: 10px; font-size: 12px; color: #888; }
      </style>
    </head>
    <body>
      <h1>Horse Racing Casino Game</h1>
      <div class="actions">
        <button onclick="createSession()">Create New Session</button>
      </div>
      <div id="session-info">Click "Create New Session" to start</div>
      <div class="container">
        <iframe id="game-frame" class="game-frame" src="about:blank"></iframe>
        <iframe id="controls-frame" class="controls-frame" src="about:blank"></iframe>
      </div>
      <script>
        async function createSession() {
          const response = await fetch('/horses/session/init', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              playerId: 'player-' + Date.now(),
              currency: 'EUR'
            })
          });
          const data = await response.json();
          document.getElementById('session-info').textContent = 'Session: ' + data.sessionId;
          document.getElementById('game-frame').src = '/horses' + data.gameUrl;
          document.getElementById('controls-frame').src = '/horses' + data.controlsUrl;
        }
      </script>
    </body>
    </html>
  `);
});

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
  console.log(`Test page: http://localhost:${config.PORT}/`);
  console.log(`Endpoints available at /horses/*`);
});

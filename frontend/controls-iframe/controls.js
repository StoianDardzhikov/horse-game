class GameControls {
  constructor() {
    this.socket = null;
    this.balance = 0;
    this.currency = "EUR";
    this.currentBet = null;
    this.selectedHorse = null;
    this.horses = [];
    this.state = "WAITING";
    this.currentRoundId = null;
    this.betPending = false; // Track if bet is being processed
    this.init();
  }

  init() {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get("sessionId");
    if (!sessionId) {
      this.showStatus("No session ID provided", "error");
      return;
    }
    this.connectSocket(sessionId);
    this.setupEventListeners();
  }

  connectSocket(sessionId) {
    this.socket = io("/ws/controls", {
      path: "/horses/socket.io/",
      query: { sessionId },
      transports: ["websocket", "polling"],
    });

    this.socket.on("connect", () => this.onConnect());
    this.socket.on("disconnect", () => this.onDisconnect());
    this.socket.on("horses", (data) => this.onHorses(data));
    this.socket.on("balance_update", (data) => this.onBalanceUpdate(data));
    this.socket.on("bet_result", (data) => this.onBetResult(data));
    this.socket.on("round_result", (data) => this.onRoundResult(data));
    this.socket.on("bet_status", (data) => this.onBetStatus(data));
    this.socket.on("round_state", (data) => this.onRoundState(data));
    this.socket.on("betting_phase", (data) => this.onBettingPhase(data));
    this.socket.on("round_start", (data) => this.onRoundStart(data));
    this.socket.on("round_tick", (data) => this.onRoundTick(data));
    this.socket.on("round_end", (data) => this.onRoundEnd(data));
    this.socket.on("error", (data) => this.onError(data));
  }

  setupEventListeners() {
    document
      .getElementById("bet-btn")
      .addEventListener("click", () => this.placeBet());

    document.querySelectorAll(".quick-bet-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => this.handleQuickBet(e));
    });
  }

  onConnect() {
    document.getElementById("connection-status").className = "connected";
    this.socket.emit("get_balance");
    this.setRoundStatus("Connected", "");
  }

  onDisconnect() {
    document.getElementById("connection-status").className = "disconnected";
    this.setRoundStatus("Disconnected", "");
  }

  onHorses(data) {
    this.horses = data;
    this.renderHorseSelection();
  }

  onBalanceUpdate(data) {
    this.balance = data.balance;
    this.currency = data.currency || this.currency;
    document.getElementById("balance").textContent = this.balance.toFixed(2);
    document.getElementById("currency").textContent = this.currency;
  }

  onBetResult(data) {
    this.betPending = false;
    const betBtn = document.getElementById("bet-btn");
    betBtn.textContent = "Place Bet";

    if (data.success) {
      this.currentBet = { amount: data.amount, betId: data.betId };
      this.balance = data.newBalance;
      document.getElementById("balance").textContent = this.balance.toFixed(2);

      const horse = this.horses.find((h) => h.id === this.selectedHorse);
      document.getElementById("current-bet").style.display = "block";
      document.getElementById("current-bet-amount").textContent =
        data.amount.toFixed(2) + " " + this.currency;
      document.getElementById("current-bet-horse").innerHTML =
        `on <span style="color: ${horse?.color}">${horse?.name}</span> (${horse?.payout}x)`;

      betBtn.style.display = "none";
      this.disableBetInputs(true);
      this.showStatus("Bet placed! Good luck!", "success");
    } else {
      // Re-enable button and inputs if bet failed AND still in betting phase
      if (this.state === "BETTING") {
        this.disableBetInputs(false);
        this.validateBet();
      }
      this.showStatus(data.error || "Bet failed", "error");
    }
  }

  onRoundResult(data) {
    if (data.won) {
      this.showStatus(
        `YOU WON ${data.amount.toFixed(2)} ${this.currency}! (${data.multiplier}x)`,
        "success"
      );
    } else {
      this.showStatus("Better luck next race!", "info");
    }
    if (data.newBalance !== undefined) {
      this.balance = data.newBalance;
      document.getElementById("balance").textContent = this.balance.toFixed(2);
    }
    this.resetBetUI();
  }

  onBetStatus(data) {
    // Only apply bet status if it's for the current round
    if (data.hasBet && this.state === "BETTING") {
      this.currentBet = data;
      this.selectedHorse = data.selection;
      this.betPending = false;
      const horse = this.horses.find((h) => h.id === data.selection);

      document.getElementById("current-bet").style.display = "block";
      document.getElementById("current-bet-amount").textContent =
        data.amount.toFixed(2) + " " + this.currency;
      document.getElementById("current-bet-horse").innerHTML =
        `on <span style="color: ${horse?.color}">${horse?.name}</span>`;

      document.getElementById("bet-btn").style.display = "none";
      this.disableBetInputs(true);

      // Highlight selected horse
      document.querySelectorAll(".horse-btn").forEach((btn) => {
        btn.classList.toggle("selected", parseInt(btn.dataset.id) === data.selection);
      });
    }
  }

  onRoundState(data) {
    this.state = data.state;
    if (data.horses) {
      this.horses = data.horses;
      this.renderHorseSelection();
    }
    this.updateUI();
  }

  onBettingPhase(data) {
    // New round starting - always reset bet UI from previous round
    if (this.currentRoundId !== data.roundId) {
      this.resetBetUI();
      this.currentRoundId = data.roundId;
    }

    this.state = "BETTING";
    this.betPending = false;

    if (data.horses) {
      this.horses = data.horses;
      this.renderHorseSelection();
    }
    this.setRoundStatus("BETTING OPEN", "betting");
    this.updateUI();
  }

  onRoundStart(data) {
    this.state = "RUNNING";
    this.setRoundStatus("RACE IN PROGRESS", "running");

    // If bet was still pending when round started, it likely failed or was too late
    if (this.betPending && !this.currentBet) {
      this.betPending = false;
      const betBtn = document.getElementById("bet-btn");
      betBtn.textContent = "Place Bet";
      this.showStatus("Bet was not placed in time", "error");
    }

    this.updateUI();
  }

  onRoundTick(data) {
    // Just visual update, status is already set
  }

  onRoundEnd(data) {
    this.state = "ENDED";
    const winner = data.outcome;
    this.setRoundStatus(`WINNER: ${winner.horseName}`, "");

    // If player didn't bet this round (no currentBet), reset UI now
    // If player did bet, wait for onRoundResult to reset
    if (!this.currentBet) {
      this.resetBetUI();
    }

    this.updateUI();
  }

  onError(data) {
    this.showStatus(data.message || "An error occurred", "error");
  }

  renderHorseSelection() {
    const container = document.getElementById("horse-selection");
    container.innerHTML = "";

    this.horses.forEach((horse) => {
      const btn = document.createElement("button");
      btn.className = "horse-btn";
      btn.dataset.id = horse.id;
      btn.innerHTML = `
        <div class="horse-number">#${horse.id}</div>
        <div class="horse-name" style="color: ${horse.color}">${horse.name}</div>
        <div class="horse-odds" style="color: #00ff88">${horse.payout.toFixed(2)}x</div>
      `;
      btn.addEventListener("click", () => this.selectHorse(horse.id));
      container.appendChild(btn);
    });
  }

  selectHorse(horseId) {
    if (this.state !== "BETTING" || this.currentBet || this.betPending) return;

    this.selectedHorse = horseId;
    document.querySelectorAll(".horse-btn").forEach((btn) => {
      btn.classList.toggle("selected", parseInt(btn.dataset.id) === horseId);
    });

    // Enable bet button if amount is valid
    this.validateBet();
  }

  validateBet() {
    const amount = parseFloat(document.getElementById("bet-amount").value);
    const btn = document.getElementById("bet-btn");

    if (this.state === "BETTING" && !this.currentBet && !this.betPending && this.selectedHorse && amount > 0 && amount <= this.balance) {
      btn.disabled = false;
    } else {
      btn.disabled = true;
    }
  }

  placeBet() {
    // Prevent double clicks
    if (this.betPending || this.currentBet) {
      return;
    }

    const amount = parseFloat(document.getElementById("bet-amount").value);
    if (isNaN(amount) || amount <= 0) {
      this.showStatus("Enter a valid bet amount", "error");
      return;
    }
    if (amount > this.balance) {
      this.showStatus("Insufficient balance", "error");
      return;
    }
    if (!this.selectedHorse) {
      this.showStatus("Please select a horse", "error");
      return;
    }

    // Mark bet as pending and disable UI immediately
    this.betPending = true;
    const betBtn = document.getElementById("bet-btn");
    betBtn.disabled = true;
    betBtn.textContent = "Placing...";
    this.disableBetInputs(true);

    // Include timestamp so server knows when bet was initiated
    this.socket.emit("bet", {
      amount,
      selection: this.selectedHorse.toString(),
      timestamp: Date.now(),
    });
  }

  handleQuickBet(e) {
    const btn = e.target;
    const action = btn.dataset.action;
    const value = parseFloat(btn.dataset.value);
    const input = document.getElementById("bet-amount");

    if (value) {
      input.value = value;
    } else if (action === "half") {
      const current = parseFloat(input.value) || 0;
      input.value = Math.max(1, Math.floor(current / 2));
    } else if (action === "double") {
      const current = parseFloat(input.value) || 1;
      input.value = Math.min(current * 2, this.balance);
    } else if (action === "max") {
      input.value = Math.floor(this.balance);
    }

    this.validateBet();
  }

  updateUI() {
    const betBtn = document.getElementById("bet-btn");

    switch (this.state) {
      case "BETTING":
        if (!this.currentBet && !this.betPending) {
          betBtn.style.display = "block";
          betBtn.textContent = "Place Bet";
          this.disableBetInputs(false);
          this.validateBet();
        } else if (this.betPending) {
          betBtn.disabled = true;
          betBtn.textContent = "Placing...";
          this.disableBetInputs(true);
        }
        break;
      case "RUNNING":
      case "ENDED":
      case "WAITING":
        if (!this.betPending) {
          betBtn.disabled = true;
        }
        this.disableBetInputs(true);
        break;
    }
  }

  disableBetInputs(disabled) {
    document.getElementById("bet-amount").disabled = disabled;
    document
      .querySelectorAll(".quick-bet-btn")
      .forEach((b) => (b.disabled = disabled));
    document
      .querySelectorAll(".horse-btn")
      .forEach((b) => (b.disabled = disabled));
  }

  resetBetUI() {
    this.currentBet = null;
    this.selectedHorse = null;
    this.betPending = false;

    const betBtn = document.getElementById("bet-btn");
    betBtn.style.display = "block";
    betBtn.disabled = true;
    betBtn.textContent = "Place Bet";

    document.getElementById("current-bet").style.display = "none";
    document
      .querySelectorAll(".horse-btn")
      .forEach((b) => b.classList.remove("selected"));
  }

  setRoundStatus(text, type) {
    const el = document.getElementById("round-status");
    el.textContent = text;
    el.className = "round-status " + type;
  }

  showStatus(message, type) {
    const el = document.getElementById("status-message");
    el.textContent = message;
    el.className = `status-message status-${type}`;
    setTimeout(() => {
      el.className = "status-message";
    }, 5000);
  }
}

// Add input listener for bet validation
document.getElementById("bet-amount").addEventListener("input", () => {
  if (window.controls) {
    window.controls.validateBet();
  }
});

window.controls = new GameControls();

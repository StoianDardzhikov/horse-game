class GameDisplay {
  constructor() {
    this.socket = null;
    this.state = "WAITING";
    this.roundId = null;
    this.history = [];
    this.horses = [];
    this.countdownInterval = null;
    this.bettingTimerInterval = null;
    this.init();
  }

  init() {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get("sessionId");
    if (!sessionId) {
      this.showStatus("No session ID provided");
      return;
    }
    this.connectSocket(sessionId);
  }

  connectSocket(sessionId) {
    this.socket = io("/ws/game", {
      path: "/horses/socket.io/",
      query: { sessionId },
      transports: ["websocket", "polling"],
    });

    this.socket.on("connect", () => this.onConnect());
    this.socket.on("disconnect", () => this.onDisconnect());
    this.socket.on("horses", (data) => this.onHorses(data));
    this.socket.on("round_state", (data) => this.onRoundState(data));
    this.socket.on("betting_phase", (data) => this.onBettingPhase(data));
    this.socket.on("round_start", (data) => this.onRoundStart(data));
    this.socket.on("round_tick", (data) => this.onRoundTick(data));
    this.socket.on("round_end", (data) => this.onRoundEnd(data));
    this.socket.on("history", (data) => this.onHistory(data));
    this.socket.on("waiting", (data) => this.onWaiting(data));
    this.socket.on("error", (data) => this.onError(data));
  }

  onConnect() {
    document.getElementById("connection-status").className = "connected";
    document.getElementById("connection-status").textContent = "Connected";
  }

  onDisconnect() {
    document.getElementById("connection-status").className = "disconnected";
    document.getElementById("connection-status").textContent = "Disconnected";
  }

  onHorses(data) {
    this.horses = data;
    this.renderTrack();
  }

  onRoundState(data) {
    this.state = data.state;
    document.getElementById("round-id").textContent = data.roundId || "-";
    if (data.horses) {
      this.horses = data.horses;
      this.renderTrack();
    }
  }

  onBettingPhase(data) {
    this.state = "BETTING";
    this.roundId = data.roundId;
    document.getElementById("round-id").textContent = data.roundId;

    if (data.horses) {
      this.horses = data.horses;
      this.renderTrack();
    }

    this.hideWinner();
    this.hideLeaderDisplay();
    this.resetHorsePositions();
    this.showStatus("PLACE YOUR BETS!");
    this.startCountdown(data.duration / 1000);
    this.startBettingTimer(data.duration / 1000);
  }

  onRoundStart(data) {
    this.state = "RUNNING";
    this.clearCountdown();
    this.hideBettingTimer();
    this.showStatus("AND THEY'RE OFF!");
  }

  onRoundTick(data) {
    // Update horse positions
    if (data.positions) {
      data.positions.forEach((pos) => {
        const horse = document.getElementById(`horse-${pos.id}`);
        if (horse) {
          // Position is 0-100, track is about 90% of container width
          const trackWidth = horse.parentElement.offsetWidth - 50;
          horse.style.left = `${(pos.position / 100) * trackWidth}px`;
        }
      });

      // Update leader display
      this.updateLeaderDisplay(data.positions);
    }

    // Update status with progress
    const progress = Math.floor((data.tick / data.totalTicks) * 100);
    if (progress < 100) {
      this.showStatus(`Racing... ${progress}%`);
    }
  }

  updateLeaderDisplay(positions) {
    if (!positions || positions.length === 0) return;

    // Sort by position to find leader and second place
    const sorted = [...positions].sort((a, b) => b.position - a.position);
    const leader = sorted[0];
    const second = sorted[1];

    // Calculate margin
    const margin = leader.position - second.position;
    let marginText = '';

    if (margin < 0.5) {
      marginText = 'NECK AND NECK!';
    } else if (margin < 2) {
      marginText = 'by a nose';
    } else if (margin < 5) {
      marginText = 'by a head';
    } else if (margin < 10) {
      marginText = 'by 1 length';
    } else {
      marginText = `by ${Math.floor(margin / 5)} lengths`;
    }

    // Update display
    const leaderDisplay = document.getElementById('leader-display');
    const leaderHorse = document.getElementById('leader-horse');
    const leaderMargin = document.getElementById('leader-margin');

    leaderDisplay.classList.add('active');
    leaderHorse.textContent = `#${leader.id} ${leader.name}`;
    leaderHorse.style.color = leader.color;
    leaderMargin.textContent = marginText;
  }

  hideLeaderDisplay() {
    document.getElementById('leader-display').classList.remove('active');
  }

  onRoundEnd(data) {
    this.state = "ENDED";
    this.clearCountdown();
    this.hideLeaderDisplay();
    this.showStatus("RACE FINISHED!");
    this.showWinner(data.outcome);
  }

  onHistory(data) {
    this.history = data;
    this.renderHistory();
  }

  onWaiting(data) {
    this.state = "WAITING";
    this.showStatus("Waiting for next race...");
  }

  onError(data) {
    console.error("Game error:", data);
    this.showStatus("Error: " + data.message);
  }

  renderTrack() {
    const track = document.getElementById("race-track");
    track.innerHTML = "";

    this.horses.forEach((horse, index) => {
      const lane = document.createElement("div");
      lane.className = "lane";
      lane.innerHTML = `
        <div class="lane-number">#${horse.id}</div>
        <div class="horse-info">
          <div class="horse-name" style="color: ${horse.color}">${horse.name}</div>
          <div class="horse-odds">${horse.payout.toFixed(2)}x</div>
        </div>
        <div class="lane-track">
          <div class="horse" id="horse-${horse.id}">&#127943;</div>
          <div class="finish-line"></div>
        </div>
      `;
      track.appendChild(lane);
    });
  }

  resetHorsePositions() {
    this.horses.forEach((horse) => {
      const horseEl = document.getElementById(`horse-${horse.id}`);
      if (horseEl) {
        horseEl.style.left = "0px";
      }
    });
  }

  showWinner(outcome) {
    const display = document.getElementById("winner-display");
    document.getElementById("winner-name").textContent = outcome.horseName;
    document.getElementById("winner-name").style.color = outcome.color;
    document.getElementById("winner-payout").textContent = `${outcome.payout.toFixed(2)}x Payout`;
    display.style.display = "block";
  }

  hideWinner() {
    document.getElementById("winner-display").style.display = "none";
  }

  showStatus(text) {
    document.getElementById("status-text").textContent = text;
  }

  startCountdown(seconds) {
    this.clearCountdown();
    let remaining = Math.ceil(seconds);
    document.getElementById("countdown").textContent = remaining + "s";
    this.countdownInterval = setInterval(() => {
      remaining--;
      document.getElementById("countdown").textContent =
        remaining > 0 ? remaining + "s" : "";
      if (remaining <= 0) this.clearCountdown();
    }, 1000);
  }

  clearCountdown() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
    document.getElementById("countdown").textContent = "";
  }

  startBettingTimer(seconds) {
    this.hideBettingTimer();
    let remaining = Math.ceil(seconds);
    const timerEl = document.getElementById("betting-timer");
    const valueEl = document.getElementById("timer-value");

    timerEl.classList.add("active");
    timerEl.classList.remove("closing");
    valueEl.textContent = remaining;

    this.bettingTimerInterval = setInterval(() => {
      remaining--;
      valueEl.textContent = remaining;

      // Add urgency when 5 seconds or less
      if (remaining <= 5) {
        timerEl.classList.add("closing");
      }

      if (remaining <= 0) {
        this.hideBettingTimer();
      }
    }, 1000);
  }

  hideBettingTimer() {
    if (this.bettingTimerInterval) {
      clearInterval(this.bettingTimerInterval);
      this.bettingTimerInterval = null;
    }
    const timerEl = document.getElementById("betting-timer");
    timerEl.classList.remove("active", "closing");
  }

  renderHistory() {
    const container = document.getElementById("history-bar");
    container.innerHTML = "";

    this.history.slice(0, 15).forEach((item) => {
      const el = document.createElement("div");
      el.className = "history-item";
      el.style.background = item.color + "33"; // Add transparency
      el.innerHTML = `
        <span class="history-horse-num" style="color: ${item.color}">#${item.winningHorse}</span>
        <span class="history-payout">${item.payout.toFixed(2)}x</span>
      `;
      container.appendChild(el);
    });
  }
}

const game = new GameDisplay();

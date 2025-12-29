const crypto = require("crypto");

class SeedManager {
  constructor(chainLength = 10000) {
    this.chainLength = chainLength;
    this.seedChain = [];
    this.currentIndex = 0;
    this.clientSeed = crypto.randomBytes(32).toString("hex");
    this.nonce = 0;
    this.generateChain();
  }

  generateChain() {
    let seed = crypto.randomBytes(32).toString("hex");
    this.seedChain = [seed];
    for (let i = 1; i < this.chainLength; i++) {
      seed = crypto.createHash("sha256").update(seed).digest("hex");
      this.seedChain.push(seed);
    }
    this.seedChain.reverse();
    this.currentIndex = 0;
  }

  getCurrentSeed() {
    return this.seedChain[this.currentIndex];
  }

  getCurrentSeedHash() {
    return crypto
      .createHash("sha256")
      .update(this.getCurrentSeed())
      .digest("hex");
  }

  advance() {
    this.currentIndex++;
    this.nonce++;
    if (this.currentIndex >= this.chainLength) {
      this.generateChain();
    }
  }

  getVerificationData() {
    return {
      serverSeed: this.getCurrentSeed(),
      serverSeedHash: this.getCurrentSeedHash(),
      clientSeed: this.clientSeed,
      nonce: this.nonce,
    };
  }

  getPublicData() {
    return {
      serverSeedHash: this.getCurrentSeedHash(),
      clientSeed: this.clientSeed,
      nonce: this.nonce,
    };
  }
}

module.exports = SeedManager;

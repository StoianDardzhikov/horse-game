const crypto = require("crypto");

function hmacSha256(data, secret) {
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function validateSignature(data, signature, secret) {
  const expected = hmacSha256(data, secret);
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

module.exports = { hmacSha256, sha256, validateSignature };

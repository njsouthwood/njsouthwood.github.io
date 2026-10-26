// ── Hashed gate answers ─────────────────────────────────────────────────────
  // A few puzzle answers are stored as salted, iterated SHA-256 hashes instead
  // of plaintext, making it impossible for hackers to bypass. 
  // (searching git history is cheating).
module.exports = { SALT: 'njs-terminal-v1::', ITERATIONS: 2000 };
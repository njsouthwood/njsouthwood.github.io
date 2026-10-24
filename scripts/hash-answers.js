#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// hash-answers.js — regenerate the hashed gate answers for the terminal game.
//
// WHY: a few puzzle answers are stored as salted, iterated SHA-256 hashes
// instead of plaintext — so a developer who opens the page source to cheat
// finds a hash, not the answer. It isn't real security (the answers are short
// and derivable from in-game clues, and the salt/iterations are public in the
// client), just a wink back at anyone trying to shortcut the game.
//
// The plaintext answers are NOT in this file or anywhere in the repo. They
// live only in a local, gitignored .env.local (or in the real environment),
// so nothing in version control reveals them.
//
// HOW IT WORKS: the browser normalizes an answer (lowercase, strip spaces),
// prepends a public salt, and runs SHA-256 N times. The result is compared to
// the stored hash. This script does the exact same computation with Node's
// built-in crypto so the two always agree. No dependencies, no server.
//
// USAGE:
//   1. copy .env.local.example to .env.local and fill in the answers.
//   2. node scripts/hash-answers.js
//   3. paste each printed `answerHash: [...]` line into the matching node in
//      js/terminal.js.
// Keep HASH_SALT and HASH_ITERATIONS identical to hashConfig in js/terminal.js
// or the browser check will never match.
// ─────────────────────────────────────────────────────────────────────────────

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ── load .env.local (simple parser; real env vars win over file values) ──────
function loadEnvLocal() {
  const file = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    // strip matching surrounding quotes, if present
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnvLocal();

// ── config (overridable via env; defaults match js/terminal.js hashConfig) ────
const SALT = process.env.HASH_SALT || 'njs-terminal-v1::';
const ITERATIONS = parseInt(process.env.HASH_ITERATIONS || '2000', 10);

function normalize(s) {
  return s.toLowerCase().replace(/\s+/g, '');
}

// SHA-256 applied ITERATIONS times over (salt + normalized answer), hex output.
// Mirrors the browser's Web Crypto loop exactly (UTF-8 bytes, hex of digest).
function hashAnswer(answer) {
  let data = Buffer.from(SALT + normalize(answer), 'utf8');
  for (let i = 0; i < ITERATIONS; i++) {
    data = crypto.createHash('sha256').update(data).digest(); // raw bytes each round
  }
  return data.toString('hex');
}

// Each env var is a comma-separated list of every accepted spelling for a gate.
// All spellings get hashed so synonyms still work. The plaintext lives only in
// .env.local — never in this file.
const GATE_ENV = {
  termOn: 'TERM_ANSWERS',
  serverSealed: 'RIDDLE_ANSWERS',
  safe: 'SAFE_ANSWERS',
};

function parseList(envVal) {
  return (envVal || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const missing = [];
const output = [];
for (const [node, envName] of Object.entries(GATE_ENV)) {
  const answers = parseList(process.env[envName]);
  if (answers.length === 0) {
    missing.push(`${envName} (for node "${node}")`);
    continue;
  }
  const hashes = answers.map(hashAnswer);
  output.push(`// ${node}  (from ${envName})`);
  output.push(`answerHash: ${JSON.stringify(hashes)},\n`);
}

if (missing.length) {
  console.error('ERROR: missing required env vars:\n  ' + missing.join('\n  '));
  console.error('\nSet them in .env.local (see .env.local.example) and re-run.');
  process.exit(1);
}

// The test backdoor phrase (single value, not a list). Optional — if unset,
// the backdoor stays disabled. Paste the printed line over BACKDOOR_HASH in
// js/terminal.js.
const backdoor = (process.env.BACKDOOR_ANSWER || '').trim();

console.log('// salt:', JSON.stringify(SALT), ' iterations:', ITERATIONS);
console.log('// paste each answerHash line into the matching node in js/terminal.js\n');
console.log(output.join('\n'));

if (backdoor) {
  console.log('// backdoor  (from BACKDOOR_ANSWER) — replace BACKDOOR_HASH in js/terminal.js');
  console.log(`const BACKDOOR_HASH = ${JSON.stringify(hashAnswer(backdoor))};`);
} else {
  console.log('// BACKDOOR_ANSWER not set — backdoor disabled (BACKDOOR_HASH left as-is).');
}

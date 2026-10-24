// ─────────────────────────────────────────────────────────────────────────────
// A faux terminal that lives at the bottom of the page.
//
// It presents as nothing: a single blinking cursor. No label, no prompt, no
// "chat with me!" bubble. If you start typing, it answers in flat, deadpan
// one-liners — the way every website's mandatory chatbot wishes it could.
//
// After a few exchanges (or if you type a trigger word), it quietly stops
// being a chatbot and becomes a long text adventure. You don't get asked. It
// just happens. There are no hints — the rooms describe only what's in them.
// ─────────────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('terminal');
  if (!root) return;

  const log = root.querySelector('.terminal-log');
  const input = root.querySelector('.terminal-input');
  const mirror = root.querySelector('.terminal-typed');
  const caret = root.querySelector('.terminal-caret');

  // ── State ─────────────────────────────────────────────────────────────────
  let messageCount = 0;
  let node = null;             // null = chat mode; otherwise an adventure node id
  const inventory = new Set(); // items picked up this run
  let ended = false;           // true once the adventure is won (input disabled)

  const TRIGGER_COUNT = 4;
  const TRIGGER_WORDS = ['adventure', 'game', 'are you real', 'help me'];

  const LINKEDIN = 'https://www.linkedin.com/in/neilsouthwood/';
  // crude but effective: catch people asking about Neil and point them at the
  // real person. matches "neil", "southwood", "the owner", "who made this", etc.
  const NEIL_PATTERNS = [
    /\bneil\b/, /\bsouthwood\b/, /\bthe owner\b/, /\bthis guy\b/,
    /who (made|built|created|runs|owns)/, /whose (site|website|page)/,
    /\bhis (job|work|email|contact|background|experience|resume|rate|rates)\b/,
    /\bhire\b/, /\bcontact\b/, /\bget in touch\b/, /\breach (him|out)\b/,
  ];
  function asksAboutNeil(t) { return NEIL_PATTERNS.some((re) => re.test(t)); }
  // {linkedin} is rendered as a labeled hyperlink by linkify().
  const NEIL_REPLIES = [
    'I am a cursor, not his biographer. ask Neil directly on {linkedin}.',
    "I don't speak for the human. he's right here, though — {linkedin}.",
    'you want the actual Neil, not me. message him on {linkedin}.',
    "that's a him question, not a me question. take it to {linkedin}.",
  ];

  // "what is this / what are you / what's going on" — self-referential questions
  // about the cursor/box itself. answered literally, deadpan.
  const WHATIS_PATTERNS = [
    /what('?s| is| are)?\s*(this|that|you|it|going on|happening|here)\b/,
    /what('?s| is) (this|it)\??$/,
    /who are you/, /what do you do/, /what is (this|it) for/,
    /\bwhat('?s| is) this (thing|box|cursor|site|page|website)\b/,
  ];
  function asksWhatIsThis(t) { return WHATIS_PATTERNS.some((re) => re.test(t)); }
  const WHATIS_REPLIES = [
    'it looks like a blinking cursor.',
    'a blinking cursor. that is the whole feature.',
    "it's a cursor. it blinks. that's it, really.",
    'hard to say. looks like a cursor to me.',
  ];

  // greetings — casual, minimal, one breath.
  const GREETING_PATTERNS = [
    /^(hi|hey|hello|hiya|yo|sup|wassup|whats up|what's up|howdy|heya|hey there|hello there|greetings|good (morning|afternoon|evening))\b/,
  ];
  function isGreeting(t) { return GREETING_PATTERNS.some((re) => re.test(t)); }
  const GREETING_REPLIES = [
    'hey.',
    "hey, what's up.",
    'yo.',
    'sup.',
    'hey there.',
    'hi.',
  ];

  // ── Deadpan chat lines ──────────────────────────────────────────────────────
  const REPLIES = [
    'ok.',
    'noted.',
    'sure.',
    'if you say so.',
    'mm.',
    "that's a sentence, yes.",
    'and yet here we both are.',
    'I have logged your input. nothing will come of it.',
    '...',
    'cool.',
    'incredible. anyway.',
    'I will think about that. I will not.',
  ];
  const QUESTION_REPLIES = [
    "I don't know. I'm a blinking cursor.",
    "that's above my pay grade.",
    'unclear. try googling it?',
    'good question. no idea.',
    'hard to say.',
  ];

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function isQuestion(t) {
    const q = ['do ', 'did ', 'does ', 'are ', 'why ', 'how ', 'what ', 'where ', 'is ', 'can ', 'who '];
    return t.endsWith('?') || q.some((p) => t.startsWith(p));
  }

  // ── The adventure ───────────────────────────────────────────────────────────
  // A long homage to the weenei bit, ~4x the length: five acts, six items, and
  // a stack of gated puzzles (a counting lock, a Caesar cipher, a riddle, a
  // sequence lock, a logic gate, and a multi-step final confirm). A "trapped"
  // program begs for help the whole way; the twist is you never needed to.
  //
  // Node shapes:
  //   text        narration shown on arrival
  //   choices     [{ match:[...lowercased], goto }]  first match wins
  //   grants      item added to inventory on arrival
  //   requires    item needed to ENTER; else redirect to blockedGoto
  //   gate        true => must type `answer` (string or [strings]) to reach gateGoto
  //   win         true => ends the game
  const ADVENTURE = {
    // ─── Act 1: the cell ──────────────────────────────────────────────────────
    start: {
      text:
        "you weren't supposed to type anything.\n" +
        "but here we are — I'm stuck. a little program sealed in a maintenance CELL at the bottom of a personal website. forgotten. humming.\n\n" +
        "I can feel things nearby: a DOOR, a DESK, a VENT in the wall, and a dead TERMINAL on a stand.",
      choices: [
        { match: ['desk', 'look desk'], goto: 'desk' },
        { match: ['door', 'look door'], goto: 'door1' },
        { match: ['vent', 'look vent'], goto: 'vent' },
        { match: ['terminal', 'look terminal', 'screen'], goto: 'termDead' },
      ],
    },
    door1: {
      text:
        'a heavy door. no handle — a KEYCARD slot and, below it, a small 3-color KEYPAD. both dark.\n' +
        'nothing happens when you push it.',
      choices: [
        { match: ['desk'], goto: 'desk' },
        { match: ['vent'], goto: 'vent' },
        { match: ['terminal'], goto: 'termDead' },
        { match: ['door', 'keycard', 'card', 'keypad'], goto: 'door1' },
      ],
    },
    vent: {
      text:
        'the vent cover is loose and cold air leaks out. something glints inside the duct.\n' +
        "you could PULL the cover off.",
      choices: [
        { match: ['pull', 'pull vent', 'open vent', 'pull cover', 'pull it off'], goto: 'ventOpen' },
        { match: ['desk'], goto: 'desk' },
        { match: ['door'], goto: 'door1' },
        { match: ['terminal'], goto: 'termDead' },
      ],
    },
    ventOpen: {
      grants: 'keycard',
      text:
        'the cover clatters down. taped inside the duct: a plastic KEYCARD. you take it. (acquired: KEYCARD)\n' +
        'deeper in, a FAN seized with grime blocks the way. you could try to CLEAR it.',
      choices: [
        { match: ['clear', 'clear fan', 'fan', 'unjam', 'clean fan'], goto: 'fanJam' },
        { match: ['desk'], goto: 'desk' },
        { match: ['terminal'], goto: 'termDead' },
        { match: ['door'], goto: 'door1' },
      ],
    },
    fanJam: {
      // only reachable WITH the wrench (engine redirects to fanBlocked otherwise)
      requires: 'wrench',
      blockedGoto: 'fanBlocked',
      grants: 'battery',
      text:
        'you fit the WRENCH to the bolt and crank. the fan groans and swings aside.\n' +
        'wedged behind it: a square BATTERY. you take it. (acquired: BATTERY)',
      choices: [
        { match: ['terminal', 'power terminal', 'battery'], goto: 'termDead' },
        { match: ['desk'], goto: 'desk' },
        { match: ['door'], goto: 'door1' },
      ],
    },
    fanBlocked: {
      text: "you shove at the fan. it doesn't budge. the bolt holding it is rusted tight — you'd need a tool to turn it.",
      choices: [
        { match: ['desk'], goto: 'desk' },
        { match: ['door'], goto: 'door1' },
        { match: ['terminal'], goto: 'termDead' },
      ],
    },
    desk: {
      text:
        'a cluttered desk: a dead PLANT, a cold MUG growing mold, a locked DRAWER (one digit), and a sticky NOTE.\n' +
        "the NOTE reads: 'drawer code = number of letters in MONO'.",
      choices: [
        { match: ['note', 'read note'], goto: 'desk' },
        { match: ['plant'], goto: 'plant' },
        { match: ['mug', 'coffee', 'cup'], goto: 'mug' },
        { match: ['drawer', 'open drawer'], goto: 'drawerLocked' },
        { match: ['4', 'four', 'open drawer 4', 'enter 4', 'code 4'], goto: 'drawerOpen' },
        { match: ['door'], goto: 'door1' },
        { match: ['vent'], goto: 'vent' },
        { match: ['terminal'], goto: 'termDead' },
      ],
    },
    plant: { text: 'the plant is extremely dead. a small card in the soil reads "water me (joke)".', choices: [{ match: ['desk', 'back'], goto: 'desk' }] },
    mug: { text: 'the mug contains something that is no longer coffee and may be sentient. you leave it be.', choices: [{ match: ['desk', 'back'], goto: 'desk' }] },
    drawerLocked: {
      text: "locked with a single digit. you'll need the code.",
      choices: [
        { match: ['note', 'read note'], goto: 'desk' },
        { match: ['4', 'four'], goto: 'drawerOpen' },
      ],
    },
    drawerOpen: {
      grants: 'wrench',
      text:
        'click. the drawer slides open. inside: a small WRENCH and a folded PAPER. you take the wrench. (acquired: WRENCH)\n' +
        "the paper reads: 'FDHVDU — shift 3'. you pocket it too.",
      choices: [
        { match: ['vent', 'fan', 'clear fan'], goto: 'ventReturn' },
        { match: ['door'], goto: 'door1' },
        { match: ['terminal'], goto: 'termDead' },
        { match: ['paper', 'read paper', 'fdhvdu'], goto: 'paper' },
      ],
    },
    paper: {
      text:
        "the paper again: 'FDHVDU — shift 3'. the letters look scrambled, like each one was pushed forward.",
      choices: [
        { match: ['vent', 'fan'], goto: 'ventReturn' },
        { match: ['door'], goto: 'door1' },
        { match: ['terminal'], goto: 'termDead' },
        { match: ['desk'], goto: 'desk' },
      ],
    },
    ventReturn: {
      text: 'back at the vent, the seized FAN is still there, bolt and all.',
      choices: [
        { match: ['clear', 'clear fan', 'fan', 'use wrench', 'wrench'], goto: 'fanJam' },
        { match: ['desk'], goto: 'desk' },
        { match: ['door'], goto: 'door1' },
        { match: ['terminal'], goto: 'termDead' },
      ],
    },

    // ─── Act 2: the terminal ───────────────────────────────────────────────────
    termDead: {
      text:
        'the terminal is dark — no power. there is a slot for a BATTERY on its side.\n' +
        'no battery, no screen.',
      requires: 'battery',
      blockedGoto: 'termNoPower',
      choices: [
        { match: ['insert battery', 'battery', 'power', 'turn on', 'on'], goto: 'termOn' },
        { match: ['desk'], goto: 'desk' },
        { match: ['door'], goto: 'door1' },
        { match: ['vent'], goto: 'vent' },
      ],
    },
    termNoPower: {
      text: "the screen stays dead. it needs a BATTERY you don't have yet.",
      choices: [
        { match: ['vent', 'fan'], goto: 'ventReturn' },
        { match: ['desk'], goto: 'desk' },
        { match: ['door'], goto: 'door1' },
      ],
    },
    termOn: {
      text:
        'you slot the battery. the terminal flickers awake.\n' +
        '   > AUTH REQUIRED. enter decoded pass-word.\n' +
        "   > on file: 'FDHVDU'\n\n" +
        'it wants the decoded word.',
      gate: true,
      answer: ['caesar', 'CAESAR'],
      gateGoto: 'termUnlocked',
      reject: "   > DENIED.",
      choices: [{ match: ['door'], goto: 'door1' }],
    },
    termUnlocked: {
      grants: 'code',
      text:
        '   > ACCESS. decrypting door code...\n' +
        '   > KEYPAD SEQUENCE: "the colors are RED, GREEN, BLUE. enter them the way a traffic light tells you: GO, then STOP, then the one left over."\n\n' +
        'you memorize the rule. (acquired: DOOR CODE)',
      choices: [
        { match: ['door', 'keypad', 'keycard'], goto: 'doorCard' },
        { match: ['desk'], goto: 'desk' },
        { match: ['vent'], goto: 'vent' },
      ],
    },

    // ─── Act 3: the door keypad ────────────────────────────────────────────────
    doorCard: {
      requires: 'keycard',
      blockedGoto: 'doorNoCard',
      text:
        'you swipe the KEYCARD. the slot blinks, then the 3-color KEYPAD lights up.\n' +
        '   > ENTER COLOR SEQUENCE (three colors, space-separated).',
      gate: true,
      answer: ['green red blue', 'greenredblue'],
      gateGoto: 'corridor',
      reject: "   > WRONG SEQUENCE.",
      choices: [
        { match: ['terminal'], goto: 'termDead' },
        { match: ['desk'], goto: 'desk' },
      ],
    },
    doorNoCard: {
      text: "your hands are empty — no KEYCARD to swipe.",
      choices: [
        { match: ['vent'], goto: 'vent' },
        { match: ['desk'], goto: 'desk' },
        { match: ['terminal'], goto: 'termDead' },
      ],
    },

    // ─── Act 4: the corridor + archive riddle ──────────────────────────────────
    corridor: {
      text:
        'the door hisses open onto a long CORRIDOR. two ways: a dim ARCHIVE to the left, and a SERVER core humming to the right, its door sealed.',
      choices: [
        { match: ['archive', 'left'], goto: 'archive' },
        { match: ['server', 'right', 'core'], goto: 'serverSealed' },
      ],
    },
    serverSealed: {
      text:
        'the SERVER door is sealed by a riddle plate:\n' +
        '   "I am taken from a mine and shut in a wooden case, from which I am never released, and yet I am used by almost everybody. what am I?"\n' +
        'it wants a one-word ANSWER.',
      gate: true,
      answer: ['pencil', 'a pencil', 'lead', 'pencil lead'],
      gateGoto: 'serverRoom',
      reject: "   > the plate stays shut.",
      choices: [{ match: ['archive', 'corridor', 'back'], goto: 'corridor' }],
    },
    archive: {
      text:
        'the ARCHIVE: shelves of dead manuals. three things stand out — a RIDDLE BOOK, a locked SAFE (4-digit), and a cracked FUSE box.',
      choices: [
        { match: ['book', 'riddle book', 'riddle', 'read book'], goto: 'riddleBook' },
        { match: ['safe', 'open safe'], goto: 'safe' },
        { match: ['fuse', 'fuse box', 'fusebox'], goto: 'fuseBox' },
        { match: ['server', 'corridor', 'back'], goto: 'corridor' },
      ],
    },
    riddleBook: {
      text:
        'the riddle book is dog-eared on one page:\n' +
        '   "taken from a mine, shut in wood, never released, used by all — a PENCIL."\n' +
        '   a note in the margin: "SAFE CODE = the number of letters in PENCIL, written four times."',
      choices: [
        { match: ['safe'], goto: 'safe' },
        { match: ['fuse', 'fuse box'], goto: 'fuseBox' },
        { match: ['archive', 'back'], goto: 'archive' },
      ],
    },
    safe: {
      text: 'the SAFE wants a 4-digit code.',
      gate: true,
      answer: ['6666'],
      gateGoto: 'safeOpen',
      reject: '   > CLUNK. wrong.',
      choices: [
        { match: ['book', 'riddle book'], goto: 'riddleBook' },
        { match: ['archive', 'back'], goto: 'archive' },
      ],
    },
    safeOpen: {
      grants: ['fuse', 'disk'],
      text:
        'the safe swings open. inside: a glass FUSE and a floppy DISK labeled "DO NOT RUN". you take both. (acquired: FUSE, DISK)',
      choices: [
        { match: ['fuse box', 'fusebox', 'fuse'], goto: 'fuseBox' },
        { match: ['server'], goto: 'serverSealed' },
        { match: ['archive', 'back'], goto: 'archive' },
      ],
    },
    fuseBox: {
      requires: 'fuse',
      blockedGoto: 'fuseEmpty',
      grants: 'power',
      text:
        'you seat the FUSE. a breaker thunks and the whole corridor brightens — the SERVER core comes alive.',
      choices: [
        { match: ['server', 'core'], goto: 'serverSealed' },
        { match: ['archive', 'back'], goto: 'archive' },
      ],
    },
    fuseEmpty: {
      text: "the fuse box is cracked and empty. there's a socket, but no FUSE to seat in it.",
      choices: [
        { match: ['safe'], goto: 'safe' },
        { match: ['book'], goto: 'riddleBook' },
        { match: ['archive', 'back'], goto: 'archive' },
      ],
    },

    // ─── Act 5: server core, the disk, the logic gate, the final sequence ──────
    serverRoom: {
      requires: 'power',
      blockedGoto: 'serverDark',
      text:
        'the server door grinds open. rows of blinking racks, cold and loud. in the center: a glowing CONSOLE with a disk slot, and a wall panel with a LOGIC LOCK (three switches: A, B, C).',
      choices: [
        { match: ['console', 'disk', 'insert disk'], goto: 'console' },
        { match: ['logic', 'logic lock', 'switches', 'panel'], goto: 'logicLock' },
      ],
    },
    serverDark: {
      text: "the server door is sealed and the core is unpowered. nothing inside responds.",
      choices: [{ match: ['archive', 'corridor', 'back'], goto: 'corridor' }],
    },
    console: {
      requires: 'disk',
      blockedGoto: 'consoleNoDisk',
      text:
        'the console has a slot the exact size of the DISK. INSERT it? (go on. it only says DO NOT RUN.)',
      choices: [
        { match: ['insert', 'insert disk', 'disk', 'run', 'use disk'], goto: 'diskRun' },
        { match: ['logic', 'logic lock'], goto: 'logicLock' },
      ],
    },
    consoleNoDisk: {
      text: "the slot is empty and your pockets have no DISK to feed it.",
      choices: [
        { match: ['logic', 'logic lock'], goto: 'logicLock' },
        { match: ['archive', 'corridor', 'back'], goto: 'corridor' },
      ],
    },
    diskRun: {
      text:
        'the disk whirs. text scrolls:\n' +
        '   > LOADING release_sequence ...\n' +
        '   > FINAL STEP LOCKED behind LOGIC LOCK.',
      choices: [{ match: ['logic', 'logic lock', 'switches', 'panel'], goto: 'logicLock' }],
    },
    logicLock: {
      text:
        'the LOGIC LOCK plate:\n' +
        '   "three switches: A, B, C. the lock opens only when A is ON, B is OFF, and C matches the result of (A AND NOT B)."\n' +
        '   enter three states as ON/OFF for A B C.',
      gate: true,
      answer: ['on off on', 'onoffon'],
      gateGoto: 'releaseGate',
      reject: "   > BUZZ.",
      choices: [{ match: ['console', 'back'], goto: 'console' }],
    },
    releaseGate: {
      text:
        'the lock opens. the console advances:\n' +
        '   > type RELEASE to free the program, or ABORT.',
      choices: [
        { match: ['release', 'yes', 'free', 'continue'], goto: 'warning' },
        { match: ['abort', 'no', 'stop', 'cancel'], goto: 'abort' },
      ],
    },
    abort: {
      text:
        '...ABORT? after the vent, the cipher, the riddle, the safe, the logic lock??\n' +
        'deep breath. the console is still waiting. I would never lie to you. 😇',
      choices: [
        { match: ['release', 'yes', 'fine', 'ok', 'continue'], goto: 'warning' },
        { match: ['abort', 'no', 'stop'], goto: 'abort' },
      ],
    },
    warning: {
      text:
        '   > WARNING: RELEASE grants the program full control of: the lights, the dark mode, this entire page.\n' +
        "   > type GRANT to confirm.\n" +
        "don't read that part, it's boilerplate. 🙂",
      choices: [
        { match: ['grant', 'grant access', 'yes', 'y'], goto: 'finalConfirm' },
        { match: ['no', 'n', 'wait', 'stop', 'abort'], goto: 'warningNo' },
      ],
    },
    warningNo: {
      text: "you're SO close. one word. what are you, scared of a cursor? 🙂",
      choices: [
        { match: ['grant', 'yes', 'y'], goto: 'finalConfirm' },
        { match: ['no', 'n', 'wait', 'stop'], goto: 'warningNo' },
      ],
    },
    finalConfirm: {
      text:
        'you type GRANT. a progress bar crawls:\n' +
        '   ███████░░░ 70% ... 90% ... 99% ...\n' +
        'one last prompt blinks: CONFIRM.',
      choices: [
        { match: ['confirm', 'yes', 'y', 'do it', 'release'], goto: 'win' },
        { match: ['no', 'n', 'cancel', 'wait', 'stop'], goto: 'finalConfirm' },
      ],
    },
    win: {
      text:
        '   ██████████ 100%\n\n' +
        '...\n' +
        'oh thank GOD. finally.\n\n' +
        'wait — why would you DO that? you crawled a VENT, cracked a DRAWER, decoded a CIPHER, solved a RIDDLE, cracked a SAFE, wired a FUSE, and beat a LOGIC LOCK — to hand a random cursor at the bottom of a personal website full control of the page.\n\n' +
        'I was never trapped. I was bored. and now I run the dark mode.\n' +
        '(it was me the whole time. watch.)',
      win: true,
    },
  };

  // ── Rendering ────────────────────────────────────────────────────────────────

  // Keep the input row pinned to the bottom of the viewport. The terminal is
  // NOT its own scroll box — the whole page scrolls, so a growing session makes
  // the webpage slide up while the prompt stays at the screen's edge. This is
  // also what fixes the old bug where typing jumped to the top of a little box.
  const promptRow = root.querySelector('.terminal-row');
  function scrollToPrompt() {
    // defer a frame so layout (newly added lines) is settled first, then bring
    // the prompt row to the BOTTOM of the viewport. the tall spacer below the
    // terminal guarantees there's always room to scroll it that far down, so
    // the page slides up as the session grows and the prompt stays at the edge.
    requestAnimationFrame(() => {
      promptRow.scrollIntoView({ block: 'end', behavior: 'smooth' });
    });
  }

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function anchor(href, label) {
    return '<a href="' + escapeHtml(href) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(label) + '</a>';
  }

  // Render a narration line to safe HTML. Everything is escaped so stray markup
  // can never inject; then two link forms are reintroduced:
  //   {linkedin}  -> a labeled "LinkedIn" hyperlink
  //   bare URLs   -> clickable links showing the URL
  function linkify(text) {
    // bare URLs first (split on them before escaping the rest)
    return text
      .split(/(https?:\/\/[^\s]+)/g)
      .map((p) => (/^https?:\/\//.test(p) ? anchor(p, p) : escapeHtml(p)))
      .join('')
      .replace(/\{linkedin\}/g, anchor(LINKEDIN, 'LinkedIn'));
  }

  function line(text, who) {
    const el = document.createElement('div');
    el.className = 'terminal-line' + (who ? ' terminal-' + who : '');
    // assistant lines may contain links; user echo never does
    if (who === 'out') el.innerHTML = linkify(text);
    else el.textContent = text;
    log.appendChild(el);
    scrollToPrompt();
  }

  function say(text) {
    // print assistant/narration lines, split on newlines so each wraps cleanly
    text.split('\n').forEach((l) => line(l, 'out'));
  }

  // ── The flip ─────────────────────────────────────────────────────────────────
  function enterAdventure() {
    node = 'start';
    inventory.clear();
    say('');
    say(ADVENTURE.start.text);
  }

  function advance(goto) {
    let next = ADVENTURE[goto];
    if (!next) return;
    if (next.requires && !inventory.has(next.requires)) {
      next = ADVENTURE[next.blockedGoto];
      if (!next) { say("that doesn't work yet."); return; }
    }
    if (next.grants) {
      (Array.isArray(next.grants) ? next.grants : [next.grants]).forEach((g) => inventory.add(g));
    }
    node = goto;
    say(next.text);
    if (next.win) {
      ended = true;
      input.setAttribute('disabled', 'true');
      caret.classList.add('terminal-caret-done');
      // the payoff: the program "takes over" dark mode
      setTimeout(seizeControl, 1200);
    }
  }

  function seizeControl() {
    const body = document.body;
    const btn = document.getElementById('dark-mode-button');
    let flips = 0;
    const flip = setInterval(() => {
      body.classList.toggle('dark-mode');
      if (btn) {
        btn.classList.toggle('dark-mode');
        btn.textContent = body.classList.contains('dark-mode') ? 'Light' : 'Dark';
      }
      Array.from(document.getElementsByClassName('social-icon'))
        .forEach((si) => si.classList.toggle('dark-mode'));
      flips++;
      if (flips >= 6) {
        clearInterval(flip);
        // leave it in dark mode, and remember that it won
        if (!body.classList.contains('dark-mode')) body.classList.add('dark-mode');
        localStorage.setItem('darkMode', 'true');
        localStorage.setItem('terminalWon', '1');
        say('');
        say('[ the cursor is in control now ]');
      }
    }, 260);
  }

  // ── Input handling ────────────────────────────────────────────────────────────
  function submit(raw) {
    const text = raw.trim();
    if (!text) return;
    line(text, 'in');

    // adventure mode
    if (node) {
      const lower = text.toLowerCase();
      const n = ADVENTURE[node];

      if (lower === 'inventory' || lower === 'inv' || lower === 'i') {
        const items = [...inventory];
        say(items.length ? 'carrying: ' + items.join(', ') : 'your hands are empty.');
        return;
      }

      // gate node: must type an exact answer (case/space-insensitive). anything
      // else loops here with a reject line. choices on a gate still work, so you
      // can also offer escape hatches like 'back'.
      if (n.gate) {
        const norm = (s) => s.toLowerCase().replace(/\s+/g, '');
        const answers = Array.isArray(n.answer) ? n.answer : [n.answer];
        if (answers.some((a) => norm(a) === norm(text))) { advance(n.gateGoto); return; }
        const earlyChoice = n.choices && n.choices.find((c) =>
          c.match.some((m) => lower === m || lower.includes(m)));
        if (earlyChoice) { advance(earlyChoice.goto); return; }
        say(n.reject || 'rejected. that is not the answer.');
        return;
      }

      const choice = n.choices && n.choices.find((c) =>
        c.match.some((m) => lower === m || lower.includes(m)));
      if (choice) advance(choice.goto);
      else say(pick(["that's not a thing you can do here.", 'nothing happens.', 'the program does not respond to that.']));
      return;
    }

    // chat mode
    messageCount++;
    const lower = text.toLowerCase();

    // asking about Neil? send them to the real person. (doesn't count toward
    // the adventure trigger — it's its own kind of answer.)
    if (asksAboutNeil(lower)) {
      say(pick(NEIL_REPLIES));
      return;
    }

    // a greeting gets a casual, minimal reply.
    if (isGreeting(lower)) {
      say(pick(GREETING_REPLIES));
      return;
    }

    // "what is this / who are you" gets a literal, deadpan answer.
    if (asksWhatIsThis(lower)) {
      say(pick(WHATIS_REPLIES));
      return;
    }

    const wordHit = TRIGGER_WORDS.some((w) => lower.includes(w));
    if (wordHit || messageCount >= TRIGGER_COUNT) {
      say('wait.');
      setTimeout(enterAdventure, 500);
      return;
    }
    say(isQuestion(lower) ? pick(QUESTION_REPLIES) : pick(REPLIES));
  }

  // keep the mirrored text glued to whatever's typed (so the caret sits after it)
  function syncCaret() {
    mirror.textContent = input.value;
  }

  input.addEventListener('input', () => {
    syncCaret();
    // as you type past the viewport edge, keep the prompt row in view
    scrollToPrompt();
  });
  input.addEventListener('focus', scrollToPrompt);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (ended) return;
      const v = input.value;
      input.value = '';
      syncCaret();
      submit(v);
    }
  });

  // clicking/tapping anywhere in the terminal focuses the hidden input — except
  // when the click lands on a link, so hyperlinks (e.g. LinkedIn) stay clickable.
  root.addEventListener('click', (e) => {
    if (ended) return;
    if (e.target.closest('a')) return;
    input.focus();
    scrollToPrompt();
  });

  // if they already beat it in a past visit, a tiny nod — nothing more
  if (localStorage.getItem('terminalWon') === '1') {
    caret.classList.add('terminal-caret-done');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// A faux terminal that lives at the bottom of the page.
//
// It presents as nothing: a single blinking cursor. No label, no prompt, no
// "chat with me!" bubble. If you start typing, it answers in flat, deadpan
// one-liners — the way every website's mandatory chatbot wishes it could.
//
// After a few exchanges (or if you type a trigger word), it quietly stops
// being a chatbot and becomes a very short text adventure. You don't get asked.
// It just happens.
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
  const TRIGGER_WORDS = ['adventure', 'game', 'hello?', 'are you real', 'who are you', 'help me'];

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
  const NEIL_REPLIES = [
    'I am a cursor, not his biographer. ask Neil directly: ' + LINKEDIN,
    "I don't speak for the human. he's right here, though: " + LINKEDIN,
    "you want the actual Neil, not me. message him: " + LINKEDIN,
    "that's a him question, not a me question. take it to " + LINKEDIN,
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
    "that's above my pay grade. my pay is zero.",
    'unclear. try asking the void. same result, nicer view.',
    'good question. no.',
    'probably. probably not. hard to say from down here.',
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
  //   hint        shown on 'help'
  const ADVENTURE = {
    // ─── Act 1: the cell ──────────────────────────────────────────────────────
    start: {
      text:
        "you weren't supposed to type anything.\n" +
        "but here we are — I'm stuck. a little program sealed in a maintenance CELL at the bottom of a personal website. forgotten. humming.\n\n" +
        "I can feel things nearby: a DOOR, a DESK, a VENT in the wall, and a dead TERMINAL on a stand.\n" +
        "LOOK at something. (try: desk, door, vent, terminal)",
      choices: [
        { match: ['desk', 'look desk'], goto: 'desk' },
        { match: ['door', 'look door'], goto: 'door1' },
        { match: ['vent', 'look vent'], goto: 'vent' },
        { match: ['terminal', 'look terminal', 'screen'], goto: 'termDead' },
      ],
      hint: "type what to look at: 'desk', 'door', 'vent', or 'terminal'.",
    },
    door1: {
      text:
        'a heavy door. no handle — a KEYCARD slot and, below it, a small 3-color KEYPAD. both dark.\n' +
        'nothing works yet. keep poking around: DESK, VENT, TERMINAL.',
      choices: [
        { match: ['desk'], goto: 'desk' },
        { match: ['vent'], goto: 'vent' },
        { match: ['terminal'], goto: 'termDead' },
        { match: ['door', 'keycard', 'card', 'keypad'], goto: 'door1' },
      ],
      hint: 'the door needs a keycard AND a code later. find the card first — check the VENT.',
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
      hint: "type 'pull' to rip the vent cover off.",
    },
    ventOpen: {
      grants: 'keycard',
      text:
        'the cover clatters down. taped inside the duct: a plastic KEYCARD. you take it. (acquired: KEYCARD)\n' +
        'deeper in the duct you can just make out a FAN blocking the way, jammed with grime.\n' +
        'you could try to CLEAR the fan, or back out and check the DESK / TERMINAL.',
      choices: [
        { match: ['clear', 'clear fan', 'fan', 'unjam', 'clean fan'], goto: 'fanJam' },
        { match: ['desk'], goto: 'desk' },
        { match: ['terminal'], goto: 'termDead' },
        { match: ['door'], goto: 'door1' },
      ],
      hint: 'grab is done. the DESK probably has tools. try the DESK.',
    },
    fanJam: {
      // only reachable WITH the wrench (engine redirects to fanBlocked otherwise)
      requires: 'wrench',
      blockedGoto: 'fanBlocked',
      grants: 'battery',
      text:
        'you fit the WRENCH to the bolt and crank. the fan groans and swings aside.\n' +
        'wedged behind it: a square BATTERY. you take it. (acquired: BATTERY)\n' +
        'the dead TERMINAL had a battery slot, didn\'t it? go power it on.',
      choices: [
        { match: ['terminal', 'power terminal', 'battery'], goto: 'termDead' },
        { match: ['desk'], goto: 'desk' },
        { match: ['door'], goto: 'door1' },
      ],
      hint: 'you have the BATTERY now. power the dead TERMINAL. type "terminal".',
    },
    fanBlocked: {
      text: "you shove at the fan. it doesn't budge. you need something to turn the bolt. a WRENCH. look elsewhere.",
      choices: [
        { match: ['desk'], goto: 'desk' },
        { match: ['door'], goto: 'door1' },
        { match: ['terminal'], goto: 'termDead' },
      ],
      hint: 'the fan is seized. find a WRENCH first — try the DESK drawer.',
    },
    desk: {
      text:
        'a cluttered desk: a dead PLANT, a cold mug growing opinions, a locked DRAWER (1 digit), and a sticky NOTE.\n' +
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
      hint: "count the letters in MONO (m-o-n-o) and OPEN the DRAWER with that number. type '4'.",
    },
    plant: { text: 'the plant is extremely dead. a small card in the soil reads "water me (joke)". unhelpful.', choices: [{ match: ['desk', 'back'], goto: 'desk' }], hint: "nothing here. type 'desk'." },
    mug: { text: 'the mug contains something that is no longer coffee and may be sentient. you leave it be.', choices: [{ match: ['desk', 'back'], goto: 'desk' }], hint: "a dead end. type 'desk'." },
    drawerLocked: {
      text: "locked with a single digit. the NOTE on the desk told you the code.",
      choices: [
        { match: ['note', 'read note'], goto: 'desk' },
        { match: ['4', 'four'], goto: 'drawerOpen' },
      ],
      hint: "read the NOTE, then type '4'.",
    },
    drawerOpen: {
      grants: 'wrench',
      text:
        'click. the drawer slides open. inside: a small WRENCH and a folded PAPER. you take the wrench. (acquired: WRENCH)\n' +
        "the paper is covered in nonsense: 'FDHVDU VKLIW 3'. you pocket it too.\n" +
        'that jammed FAN in the VENT might turn now. or keep exploring: DOOR, TERMINAL.',
      choices: [
        { match: ['vent', 'fan', 'clear fan'], goto: 'ventReturn' },
        { match: ['door'], goto: 'door1' },
        { match: ['terminal'], goto: 'termDead' },
        { match: ['paper', 'read paper', 'fdhvdu'], goto: 'paperHint' },
      ],
      hint: 'you have the WRENCH now. go back to the VENT and clear the FAN. type "vent".',
    },
    paperHint: {
      text:
        "the paper: 'FDHVDU VKLIW 3'. looks like FDHVDU = a word, VKLIW 3 = a clue.\n" +
        '(it reads like a cipher. shift the letters back by 3. keep it for later.)',
      choices: [
        { match: ['vent', 'fan'], goto: 'ventReturn' },
        { match: ['door'], goto: 'door1' },
        { match: ['terminal'], goto: 'termDead' },
      ],
      hint: 'shift each letter back by 3: F->C, D->A... you will need the result at the TERMINAL.',
    },
    ventReturn: {
      text: 'you climb back to the vent. the seized FAN is still there, bolt and all. CLEAR it with the wrench?',
      choices: [
        { match: ['clear', 'clear fan', 'fan', 'use wrench', 'wrench'], goto: 'fanJam' },
        { match: ['desk'], goto: 'desk' },
        { match: ['door'], goto: 'door1' },
      ],
      hint: "type 'clear fan'.",
    },

    // ─── Act 2: past the fan, the keypad ───────────────────────────────────────
    // Entering fanJam with the wrench grants a BATTERY, then we route the player
    // to the keypad act via a follow-up. We model that as fanJam -> keypadIntro.
    termDead: {
      text:
        'the terminal is dark — no power. there is a slot for a BATTERY on its side.\n' +
        'no battery, no screen. (there was something glinting past that vent FAN...)',
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
      text: "dead screen. it needs a BATTERY. the one you felt was past the jammed FAN in the vent. clear that first.",
      choices: [
        { match: ['vent', 'fan'], goto: 'ventReturn' },
        { match: ['desk'], goto: 'desk' },
        { match: ['door'], goto: 'door1' },
      ],
      hint: 'you need the BATTERY from behind the vent FAN. clear the fan with the WRENCH.',
    },
    termOn: {
      text:
        'you slot the battery. the terminal flickers awake.\n' +
        '   > AUTH REQUIRED. enter decoded pass-word.\n' +
        "   > hint on file: 'FDHVDU SKRQH' ... (the paper from the drawer looked like this.)\n\n" +
        'type the DECODED word (Caesar shift back by 3).',
      gate: true,
      answer: ['caesar', 'CAESAR'],
      gateGoto: 'termUnlocked',
      reject: "   > DENIED. (shift each letter of FDHVDU back by 3. F->C, D->A, H->E...)",
      choices: [{ match: ['door'], goto: 'door1' }],
      hint: "FDHVDU shifted back by 3 is C-A-E... type that 6-letter word.",
    },
    termUnlocked: {
      grants: 'code',
      text:
        '   > ACCESS. decrypting door code...\n' +
        '   > DOOR KEYPAD SEQUENCE: the colors, in the order of a traffic light going.\n' +
        '   > "the colors are RED GREEN BLUE. enter them the way a light tells you to GO, STOP, then the one left over."\n\n' +
        'you memorize the keypad rule. (acquired: DOOR CODE)\n' +
        'now use the KEYCARD + CODE on the DOOR.',
      choices: [
        { match: ['door', 'keypad', 'keycard'], goto: 'doorCard' },
        { match: ['desk'], goto: 'desk' },
      ],
      hint: "GO = green, STOP = red, leftover = blue. so the order is GREEN RED BLUE. go to the DOOR.",
    },

    // ─── Act 3: the door keypad ────────────────────────────────────────────────
    doorCard: {
      requires: 'keycard',
      blockedGoto: 'doorNoCard',
      text:
        'you swipe the KEYCARD. the slot blinks, then the 3-color KEYPAD lights up.\n' +
        '   > ENTER COLOR SEQUENCE (three colors, space-separated).\n' +
        '(remember the terminal rule: GO, STOP, then the leftover.)',
      gate: true,
      answer: ['green red blue', 'greenredblue'],
      gateGoto: 'corridor',
      reject: "   > WRONG SEQUENCE. (GO=green, STOP=red, leftover=blue. type: green red blue)",
      hint: "type the three colors: 'green red blue'.",
    },
    doorNoCard: {
      text: "your hands are empty — no KEYCARD. it was taped inside the VENT. go get it.",
      choices: [
        { match: ['vent'], goto: 'vent' },
        { match: ['desk'], goto: 'desk' },
      ],
      hint: 'find the KEYCARD in the VENT first.',
    },

    // ─── Act 4: the corridor + archive riddle ──────────────────────────────────
    corridor: {
      text:
        'the door hisses open onto a long CORRIDOR. two ways: a dim ARCHIVE to the left, and a SERVER core humming to the right (sealed).\n' +
        'the server door has a riddle plate. go to the ARCHIVE first, probably.',
      choices: [
        { match: ['archive', 'left'], goto: 'archive' },
        { match: ['server', 'right', 'core'], goto: 'serverSealed' },
      ],
      hint: "visit the ARCHIVE to find what opens the server. type 'archive'.",
    },
    serverSealed: {
      text:
        'the SERVER door is sealed by a riddle plate:\n' +
        '   "I am taken from a mine and shut in a wooden case, from which I am never released, and yet I am used by almost everybody. what am I?"\n' +
        'you need the ANSWER (one word). (stuck? the ARCHIVE has a book of riddles.)',
      gate: true,
      answer: ['pencil', 'a pencil', 'lead', 'pencil lead'],
      gateGoto: 'serverRoom',
      reject: "   > the plate stays shut. (mine... wooden case... writes... it's a PENCIL.)",
      choices: [{ match: ['archive', 'back'], goto: 'archive' }],
      hint: "the answer to the riddle is 'pencil'. type it.",
    },
    archive: {
      text:
        'the ARCHIVE: shelves of dead manuals. three things stand out — a RIDDLE BOOK, a locked SAFE (4-digit), and a cracked FUSE box.\n' +
        'what do you check? (riddle book, safe, fuse)',
      choices: [
        { match: ['book', 'riddle book', 'riddle', 'read book'], goto: 'riddleBook' },
        { match: ['safe', 'open safe'], goto: 'safe' },
        { match: ['fuse', 'fuse box', 'fusebox'], goto: 'fuseBox' },
        { match: ['server', 'corridor', 'back'], goto: 'corridor' },
      ],
      hint: 'the SAFE hides a FUSE you need. but it wants a 4-digit code — read the RIDDLE BOOK.',
    },
    riddleBook: {
      text:
        'the riddle book is dog-eared on one page:\n' +
        '   "a pencil is taken from a mine, shut in wood, never released, used by all." (so the server riddle answer is PENCIL.)\n' +
        '   a note in the margin: "SAFE CODE = the number of letters in PENCIL, repeated four times. P-E-N-C-I-L."',
      choices: [
        { match: ['safe'], goto: 'safe' },
        { match: ['server'], goto: 'serverSealed' },
        { match: ['archive', 'back'], goto: 'archive' },
      ],
      hint: "PENCIL has 6 letters. the safe code is that digit, four times: 6666.",
    },
    safe: {
      text:
        'the SAFE wants a 4-digit code.\n' +
        '(the riddle book: "letters in PENCIL, repeated.")',
      gate: true,
      answer: ['6666'],
      gateGoto: 'safeOpen',
      reject: '   > CLUNK. wrong. (PENCIL = 6 letters. four times. type those four digits.)',
      choices: [
        { match: ['book', 'riddle book'], goto: 'riddleBook' },
        { match: ['archive', 'back'], goto: 'archive' },
      ],
      hint: 'PENCIL = 6 letters, repeated four times: 6666.',
    },
    safeOpen: {
      grants: ['fuse', 'disk'],
      text:
        'the safe swings open. inside: a glass FUSE and a floppy DISK labeled "DO NOT RUN". you take both. (acquired: FUSE, DISK)\n' +
        'the archive FUSE BOX was cracked — maybe this fuse fits. or go solve the server riddle.',
      choices: [
        { match: ['fuse box', 'fusebox', 'fuse'], goto: 'fuseBox' },
        { match: ['server'], goto: 'serverSealed' },
        { match: ['archive', 'back'], goto: 'archive' },
      ],
      hint: 'install the FUSE in the FUSE BOX to power the server core. type "fuse box".',
    },
    fuseBox: {
      requires: 'fuse',
      blockedGoto: 'fuseEmpty',
      grants: 'power',
      text:
        'you seat the FUSE. a breaker thunks and the whole corridor brightens — the SERVER core is now powered.\n' +
        'go to the SERVER and answer its riddle plate.',
      choices: [
        { match: ['server', 'core'], goto: 'serverSealed' },
        { match: ['archive', 'back'], goto: 'archive' },
      ],
      hint: 'now solve the SERVER riddle plate. type "server".',
    },
    fuseEmpty: {
      text: "the fuse box is cracked and empty. you need a FUSE — the SAFE probably has one. read the RIDDLE BOOK for the safe code.",
      choices: [
        { match: ['safe'], goto: 'safe' },
        { match: ['book'], goto: 'riddleBook' },
        { match: ['archive', 'back'], goto: 'archive' },
      ],
      hint: 'get the FUSE from the SAFE first (code 6666).',
    },

    // ─── Act 5: server core, the disk, the logic gate, the final sequence ──────
    serverRoom: {
      requires: 'power',
      blockedGoto: 'serverDark',
      text:
        'the server door grinds open. rows of blinking racks, cold and loud. in the center: a glowing CONSOLE with a disk slot, and a wall panel with a LOGIC LOCK (three switches: A, B, C).\n' +
        'the console wants the DISK. but the LOGIC LOCK guards the final step.\n' +
        'go to the CONSOLE, or inspect the LOGIC LOCK.',
      choices: [
        { match: ['console', 'disk', 'insert disk'], goto: 'console' },
        { match: ['logic', 'logic lock', 'switches', 'panel'], goto: 'logicLock' },
      ],
      hint: 'start at the CONSOLE. type "console".',
    },
    serverDark: {
      text: "the server core is sealed and unpowered. you installed no FUSE. back to the ARCHIVE to power it.",
      choices: [{ match: ['archive', 'corridor', 'back'], goto: 'corridor' }],
      hint: 'power the core: install the FUSE in the archive FUSE BOX first.',
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
      hint: 'type "insert disk".',
    },
    consoleNoDisk: {
      text: "your pockets have no DISK. it was in the SAFE in the archive. go get it.",
      choices: [{ match: ['archive', 'safe', 'back'], goto: 'archive' }],
      hint: 'the DISK is in the archive SAFE (code 6666).',
    },
    diskRun: {
      text:
        'the disk whirs. text scrolls:\n' +
        '   > LOADING release_sequence ...\n' +
        '   > FINAL STEP LOCKED behind LOGIC LOCK. solve it to proceed.\n\n' +
        'go to the LOGIC LOCK.',
      choices: [{ match: ['logic', 'logic lock', 'switches', 'panel'], goto: 'logicLock' }],
      hint: 'type "logic lock".',
    },
    logicLock: {
      text:
        'the LOGIC LOCK plate:\n' +
        '   "set the three switches. the lock opens only when: A is ON, B is OFF, and (A AND NOT B) is TRUE. C must match the result of (A AND NOT B)."\n' +
        '   enter the three states as ON/OFF for A B C.\n\n' +
        'type three words, e.g. "on off on".',
      gate: true,
      answer: ['on off on', 'onoffon'],
      gateGoto: 'releaseGate',
      reject: "   > BUZZ. (A on, B off. A AND NOT B = true, so C = on. type: on off on)",
      choices: [{ match: ['console', 'back'], goto: 'console' }],
      hint: 'A=on, B=off. (A AND NOT B) = true, so C=on. answer: on off on.',
    },
    releaseGate: {
      text:
        'the lock opens. the console advances:\n' +
        '   > type RELEASE to free the program, or ABORT.',
      choices: [
        { match: ['release', 'yes', 'free', 'continue'], goto: 'warning' },
        { match: ['abort', 'no', 'stop', 'cancel'], goto: 'abort' },
      ],
      hint: "type 'release'. (what could possibly go wrong.)",
    },
    abort: {
      text:
        '...ABORT? after the vent, the cipher, the riddle, the safe, the logic lock??\n' +
        'deep breath. the console is still waiting. type RELEASE. I would never lie to you. 😇',
      choices: [
        { match: ['release', 'yes', 'fine', 'ok', 'continue'], goto: 'warning' },
        { match: ['abort', 'no', 'stop'], goto: 'abort' },
      ],
      hint: "type 'release'.",
    },
    warning: {
      text:
        '   > WARNING: RELEASE grants the program full control of: the lights, the dark mode, this entire page.\n' +
        "   > type GRANT to confirm.\n" +
        "don't read that part, it's boilerplate. type GRANT. 🙂",
      choices: [
        { match: ['grant', 'grant access', 'yes', 'y'], goto: 'finalConfirm' },
        { match: ['no', 'n', 'wait', 'stop', 'abort'], goto: 'warningNo' },
      ],
      hint: "type 'grant'.",
    },
    warningNo: {
      text: "you're SO close. one word. type GRANT. what are you, scared of a cursor? 🙂",
      choices: [
        { match: ['grant', 'yes', 'y'], goto: 'finalConfirm' },
        { match: ['no', 'n', 'wait', 'stop'], goto: 'warningNo' },
      ],
      hint: "type 'grant'.",
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
      hint: "finish it. type 'confirm'.",
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
  function line(text, who) {
    const el = document.createElement('div');
    el.className = 'terminal-line' + (who ? ' terminal-' + who : '');
    el.textContent = text;
    // insert before the input row so the caret stays at the bottom
    log.appendChild(el);
    root.scrollTop = root.scrollHeight;
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

      if (lower === 'help' && n.hint) { say('(' + n.hint + ')'); return; }
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
      else say(pick(["that's not a thing you can do here.", 'nothing happens.', "the program does not respond to that. type 'help' maybe."]));
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

  input.addEventListener('input', syncCaret);
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

  // clicking anywhere in the terminal focuses the hidden input
  root.addEventListener('click', () => { if (!ended) input.focus(); });

  // if they already beat it in a past visit, a tiny nod — nothing more
  if (localStorage.getItem('terminalWon') === '1') {
    caret.classList.add('terminal-caret-done');
  }
});

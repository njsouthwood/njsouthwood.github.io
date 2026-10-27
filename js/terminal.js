// ─────────────────────────────────────────────────────────────────────────────
// A faux terminal that lives at the bottom of the page.
//
// It presents as nothing: a single blinking cursor. If you start typing, it answers in flat, deadpan
// one-liners — the way every website's mandatory chatbot wishes it could.
//
// After a few exchanges (or if you type a trigger word), it quietly stops
// being a chatbot and becomes a text adventure. You don't get asked. It
// just happens.
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
  let engaged = false;         // true after the user first types/taps (gates auto-scroll)
  const visited = new Set();   // adventure node ids you've arrived at this run
  let here = null;             // the current room as it looked when you arrived

  // What variant conditions can ask about: items you hold, places you've been.
  const world = {
    has: (item) => inventory.has(item),
    seen: (id) => visited.has(id),
  };

  const TRIGGER_COUNT = 4;
  const TRIGGER_WORDS = ['adventure', 'game', 'are you real', 'help me'];

TERM_ANSWER_HASH='a44ac8e191f7dca24e1f7f254515f3633d78b8694576ddd9b34ab76ab3ddafe1';
RIDDLE_ANSWER_HASH='66775c827bb9f4d4eea754062c66adf3188f8593cab6f74f4b7fc304da824cf8';
SAFE_ANSWER_HASH='3097edfd97a15a1e89b53c8f242389669635e3e62647b3c4441a0b33bc02a175'
PHONE_CODE_HASH='5a428bd6ebf276771ef1e8c0a30e6026e225c1ce69433502bd4e1639707383b8';

  function normalizeAnswer(s) {
    return s.toLowerCase().replace(/\s+/g, '');
  }

  function toHex(buf) {
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // ── Hashed gate answers ─────────────────────────────────────────────────────
  // A few puzzle answers are stored as salted, iterated SHA-256 hashes instead
  // of plaintext, making it impossible for hackers to bypass. 
  // (searching git history is cheating).
  const hashConfig = { SALT: 'njs-terminal-v1::', ITERATIONS: 2000 };

  // SHA-256 applied ITERATIONS times over (salt + normalized answer). Round 1
  // hashes the UTF-8 bytes of the salted string; each later round hashes the
  // raw 32-byte digest. Mirrors the Node build script exactly.
  async function hashAnswer(answer) {
    const enc = new TextEncoder();
    let data = enc.encode(hashConfig.SALT + normalizeAnswer(answer));
    for (let i = 0; i < hashConfig.ITERATIONS; i++) {
      data = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
    }
    return toHex(data);
  }

  // True if `text` matches any stored hash for this gate node.
  async function matchesHashedAnswer(gateNode, text) {
    if (!gateNode.answerHash) return false;
    const h = await hashAnswer(text);
    return gateNode.answerHash.includes(h);
  }

  // Hashed test backdoor. A secret phrase (set via BACKDOOR_ANSWER in .env.local,
  // hashed by scripts/hash-answers.js) wins instantly from any mode — handy for
  // testing the win page without playing through. Only the hash lives here.
  const BACKDOOR_HASH = '8153725f8c7cd351abc575f8bb4f9934cd07eb7443946c688c328de2255408be';
  async function isBackdoor(text) {
    if (!BACKDOOR_HASH || BACKDOOR_HASH.startsWith('REPLACE_')) return false;
    return (await hashAnswer(text)) === BACKDOOR_HASH;
  }

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
    "I don't speak for the human. he's right here, though: {linkedin}.",
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

  // ── Logic lock lamps ────────────────────────────────────────────────────────
  // A and B change after every attempt, so the rules have to be worked out,
  // not memorized. Each of the four A/B states has a different answer:
  //   A   B  |  C   D
  //   off off|  off on
  //   off on |  on  off
  //   on  off|  on  on
  //   on  on |  off off
  const lamps = { a: null, b: null };
  function rollLamps() {
    let a, b;
    do {
      a = Math.random() < 0.5;
      b = Math.random() < 0.5;
    } while (a === lamps.a && b === lamps.b); // always visibly change
    lamps.a = a;
    lamps.b = b;
  }
  const onOff = (v) => (v ? 'ON' : 'OFF');
  function lampsLine() {
    return '   lamps:  A ' + onOff(lamps.a) + '   B ' + onOff(lamps.b);
  }
  function checkLogic(text) {
    const words = text.toLowerCase().match(/\b(on|off)\b/g);
    if (!words || words.length !== 2) return false;
    const c = lamps.a !== lamps.b;    // C: on when exactly one of A, B is on
    const d = c ? lamps.a : !lamps.a; // D: copies A while C is on, else the opposite
    return (words[0] === 'on') === c && (words[1] === 'on') === d;
  }

  // ── D's phone ────────────────────────────────────────────────────────────────
  // the old thread (shown on unlock and on every re-read), and the message D
  // only sends once they trust you.
  const PHONE_HISTORY =
    '   D: if you ever need back in, the terminal password is FDHVDU. shift 3.\n' +
    "   D: ...and now it's written down. in a text. great.";
  const D_PHRASE_MSG =
    "   D: if you make it to the console, it'll ask for a maintenance phrase. it's LET IT SLEEP.\n" +
    '   D: use it to shut everything down. and if you ever see a RELEASE prompt: walk away.';
  // how to leave the phone from any point in the conversation
  const PUT_PHONE_DOWN = { match: ['desk', 'back', 'cd -', 'put down', 'close'], goto: 'desk' };

  // ── The adventure ───────────────────────────────────────────────────────────
  // A "trapped" program begs for help the whole way; the twist is you never
  // needed to. The person who sealed it in (D) is reachable on an old phone,
  // and only tells you the console's maintenance phrase if they trust you.
  //
  // Node shapes:
  //   text        narration shown on arrival
  //   choices     [{ match:[...lowercased], goto }]  first match wins
  //   grants      item added to inventory on arrival
  //   requires    item needed to ENTER; else redirect to blockedGoto
  //   gate        true => must type `answer` (string or [strings]) to reach gateGoto
  //   check       (gate) optional fn(text) => bool, for answers that change
  //   onFail      (gate) optional fn() => text to print after a wrong attempt
  //   onEnter     optional fn() run on arrival, before the text is shown
  //   win         true => ends the game
  //   variants    [{ when: (world) => bool, ...overrides }] — the first variant
  //               whose `when` is true overrides the node's fields (text,
  //               choices, gate, ...). `world.has(item)` / `world.seen(nodeId)`.
  //               a variant with `redirect: 'otherNode'` sends you there instead.
  //               `seen` is checked BEFORE this arrival is recorded, so
  //               seen('thisNode') means "you've been here before".
  const ADVENTURE = {
    // ─── Act 1: the cell ──────────────────────────────────────────────────────
    start: {
      text:
        "i wasn't really expecting you to type anything.\n" +
        "but here we are. I'm stuck. a little program sealed in a maintenance CELL at the bottom of a personal website. forgotten. humming.\n\n" +
        "I can feel things nearby: a DOOR, a DESK, a VENT in the wall, and a dead TERMINAL on a stand.",
      choices: [
        { match: ['desk', 'look desk'], goto: 'desk' },
        { match: ['door', 'look door'], goto: 'door1' },
        { match: ['vent', 'look vent'], goto: 'vent' },
        { match: ['terminal', 'look terminal', 'screen'], goto: 'termDead' },
      ],
      variants: [
        {
          // coming "back" to the cell: a quick look around, not the whole intro
          when: (w) => w.seen('start'),
          text: 'the CELL. a DOOR, a DESK, a VENT in the wall, and a TERMINAL on a stand.',
        },
      ],
    },
    door1: {
      text:
        'a heavy door. no handle, just a dark KEYCARD slot.\n' +
        'nothing happens when you push it.',
      choices: [
        { match: ['desk'], goto: 'desk' },
        { match: ['vent'], goto: 'vent' },
        { match: ['terminal'], goto: 'termDead' },
        { match: ['keycard', 'swipe', 'card', 'slot'], goto: 'corridor' },
        { match: ['door', 'push'], goto: 'door1' },
        { match: ['back', 'cd -'], goto: 'start' },
      ],
      variants: [
        {
          when: (w) => w.seen('corridor'),
          text: 'the heavy door stands open. beyond it, the CORRIDOR.',
          choices: [
            { match: ['corridor', 'through', 'enter', 'go in', 'door'], goto: 'corridor' },
            { match: ['desk'], goto: 'desk' },
            { match: ['vent'], goto: 'vent' },
            { match: ['terminal'], goto: 'termDead' },
            { match: ['back', 'cd -'], goto: 'start' },
          ],
        },
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
        { match: ['back', 'cd -'], goto: 'start' },
      ],
      variants: [
        {
          // fan cleared: nothing left here
          when: (w) => w.has('battery'),
          text: 'the vent cover lies on the floor and the FAN hangs loose on its bolt. the duct is empty now.',
          choices: [
            { match: ['desk'], goto: 'desk' },
            { match: ['door'], goto: 'door1' },
            { match: ['terminal'], goto: 'termDead' },
            { match: ['back', 'cd -'], goto: 'start' },
          ],
        },
        {
          // cover pulled, fan still jammed
          when: (w) => w.has('keycard'),
          text: 'the vent cover lies on the floor. deeper in, the seized FAN still blocks the duct, bolt and all.',
          choices: [
            { match: ['clear', 'clear fan', 'fan', 'unjam', 'clean fan', 'use wrench', 'wrench'], goto: 'fanJam' },
            { match: ['desk'], goto: 'desk' },
            { match: ['door'], goto: 'door1' },
            { match: ['terminal'], goto: 'termDead' },
            { match: ['back', 'cd -'], goto: 'start' },
          ],
        },
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
        { match: ['back', 'cd -'], goto: 'vent' },
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
        { match: ['back', 'cd -'], goto: 'vent' },
      ],
    },
    fanBlocked: {
      text: "you shove at the fan. it doesn't budge. the bolt holding it is rusted tight — you'd need a tool to turn it.",
      choices: [
        { match: ['vent', 'back', 'cd -'], goto: 'vent' },
        { match: ['desk'], goto: 'desk' },
        { match: ['door'], goto: 'door1' },
        { match: ['terminal'], goto: 'termDead' },
      ],
    },
    desk: {
      text:
        'a cluttered desk: a dead PLANT in a pot, a cold MUG growing mold, and an old Motorola flip PHONE with a sticky NOTE.',
      choices: [
        { match: ['note', 'read note'], goto: 'phone' },
        { match: ['plant', 'pot'], goto: 'plant' },
        { match: ['mug', 'coffee', 'cup'], goto: 'mug' },
        { match: ['phone', 'flip phone', 'cell', 'cellphone', 'cell phone', 'razr'], goto: 'phone' },
        { match: ['door'], goto: 'door1' },
        { match: ['vent'], goto: 'vent' },
        { match: ['terminal'], goto: 'termDead' },
        { match: ['back', 'cd -'], goto: 'start' },
      ],
      variants: [
        {
          when: (w) => w.has('wrench'),
          text: 'a cluttered desk: a dead PLANT, its pot pushed aside, a cold MUG growing mold, and an old Motorola flip PHONE.',
        },
      ],
    },
    plant: {
      text: 'the plant is extremely dead. a small card in the soil reads "water me". the pot sits a little crooked on the desk.',
      choices: [
        { match: ['lift', 'move', 'under', 'pot', 'pick up', 'tilt'], goto: 'plantWrench' },
        { match: ['desk', 'back', 'cd -'], goto: 'desk' },
      ],
      variants: [
        {
          when: (w) => w.has('wrench'),
          text: 'the plant is still extremely dead. nothing under the pot now.',
          choices: [{ match: ['desk', 'back', 'cd -'], goto: 'desk' }],
        },
      ],
    },
    plantWrench: {
      grants: 'wrench',
      text: 'you lift the pot. underneath, in a ring of old soil: a small WRENCH. you take it. (acquired: WRENCH)',
      choices: [
        { match: ['desk', 'back', 'cd -'], goto: 'desk' },
        { match: ['phone'], goto: 'phone' },
        { match: ['vent'], goto: 'vent' },
        { match: ['door'], goto: 'door1' },
        { match: ['terminal'], goto: 'termDead' },
      ],
    },
    mug: { text: 'the mug contains something that is no longer coffee and may be sentient. you leave it be.', choices: [{ match: ['desk', 'back', 'cd -'], goto: 'desk' }] },
    phone: {
      text:
        'half-buried in the clutter: an ancient FLIP PHONE. it\'s a classic Motorola RAZR. You reminisce about the golden age of technology, using T9 predictive text while driving a stick shift.\n' +
        'The phone has a STICKY NOTE with all caps letters on it:\n    "M O T O R O L A"\n' +
        'the little screen glows: ENTER PASSCODE.',
      gate: true,
      answerHash: [PHONE_CODE_HASH],
      gateGoto: 'phoneUnlocked',
      reject: 'the screen shakes. WRONG PASSCODE.',
      choices: [
        { match: ['desk', 'back', 'cd -'], goto: 'desk' },
        { match: ['plant'], goto: 'plant' },
        { match: ['vent'], goto: 'vent' },
        { match: ['door'], goto: 'door1' },
        { match: ['terminal'], goto: 'termDead' },
      ],
      variants: [
        {
          // D trusted you: the phrase is right there in the thread
          when: (w) => w.has('phrase'),
          gate: false,
          text: 'the RAZR, unlocked. the thread with D:\n' + PHONE_HISTORY + '\n' + D_PHRASE_MSG + '\n   [D is offline]',
          choices: [PUT_PHONE_DOWN],
        },
        {
          // unlocked, but D isn't on your side (yet)
          when: (w) => w.seen('phoneUnlocked'),
          gate: false,
          text: 'the RAZR, unlocked. the thread with D:\n' + PHONE_HISTORY + '\n   [D is offline]\nyou could TEXT D.',
          choices: [
            { match: ['text', 'message', 'reply', 'sms'], goto: 'textWary' },
            PUT_PHONE_DOWN,
          ],
        },
      ],
    },
    phoneUnlocked: {
      text:
        'the RAZR unlocks with a cheerful chirp. one thread, from "D":\n' +
        PHONE_HISTORY + '\n' +
        'then the phone buzzes. a new message:\n' +
        '   D: who is this? that phone is supposed to be sealed in the cell.\n' +
        '   1) "relax. i found it on a desk."\n' +
        '   2) "i\'m here to let the program out."\n' +
        '   3) "who is THIS?"',
      choices: [
        { match: ['1'], goto: 'textWary' },
        { match: ['2'], goto: 'textGhost' },
        { match: ['3'], goto: 'textWary' },
        PUT_PHONE_DOWN,
      ],
    },
    textWary: {
      text:
        "   D: ...so you're in the cell. with IT. are you the new sysadmin?\n" +
        '   1) "yes. i\'m the new sysadmin."\n' +
        '   2) "no. just passing through."\n' +
        '   3) "the program asked me to come."',
      choices: [
        { match: ['1'], goto: 'textProve' },
        { match: ['2'], goto: 'textLeave' },
        { match: ['3'], goto: 'textGhost' },
        PUT_PHONE_DOWN,
      ],
      variants: [
        {
          when: (w) => w.seen('textWary'),
          text:
            '   D: you again. fine. one more chance. are you the new sysadmin?\n' +
            '   1) "yes. i\'m the new sysadmin."\n' +
            '   2) "no. just passing through."\n' +
            '   3) "the program asked me to come."',
        },
      ],
    },
    textProve: {
      // the "right thing to say": only the terminal's login log tells you this
      text: '   D: prove it. a real sysadmin can read the login log. who logged in last?',
      gate: true,
      answer: ['dana', 'it was dana', 'you dana', 'you, dana', 'dana did'],
      gateGoto: 'textTrust',
      reject: "   D: that's not who it was. nice try.",
      choices: [PUT_PHONE_DOWN],
    },
    textTrust: {
      grants: 'phrase',
      text:
        "   D: ...ok. yeah. that was me. i'm the one who sealed it in.\n" +
        "   D: listen. whatever it tells you, it is NOT trapped. it's exactly where it belongs.\n" +
        D_PHRASE_MSG + '\n' +
        '   [D is offline]',
      choices: [PUT_PHONE_DOWN],
    },
    textGhost: {
      text: '   D: absolutely not. do NOT let it out.\n   [D is offline]',
      choices: [PUT_PHONE_DOWN],
    },
    textLeave: {
      text: '   D: then put my phone down and walk away.\n   [D is offline]',
      choices: [PUT_PHONE_DOWN],
    },
    // ─── Act 2: the terminal ───────────────────────────────────────────────────
    termDead: {
      text:
        'the terminal is dark — no power. there is a slot for a BATTERY on its side.',
      requires: 'battery',
      blockedGoto: 'termNoPower',
      choices: [
        { match: ['battery', 'insert battery', 'power', 'turn on', 'on'], goto: 'termOn' },
        { match: ['desk'], goto: 'desk' },
        { match: ['door'], goto: 'door1' },
        { match: ['vent'], goto: 'vent' },
        { match: ['back', 'cd -'], goto: 'start' },
      ],
      variants: [
        // once the battery's in, "the terminal" is whatever screen it's showing
        { when: (w) => w.seen('termUnlocked'), redirect: 'termUnlocked' },
        { when: (w) => w.seen('termOn'), redirect: 'termOn' },
      ],
    },
    termNoPower: {
      text: "the terminal is dark — no power. there's a slot for a BATTERY on its side, but you don't have one.",
      choices: [
        { match: ['vent', 'fan'], goto: 'vent' },
        { match: ['desk'], goto: 'desk' },
        { match: ['door'], goto: 'door1' },
        { match: ['back', 'cd -'], goto: 'start' },
      ],
    },
    termOn: {
      text:
        'you slot the battery. the terminal flickers awake.\n' +
        '   > AUTH REQUIRED. enter decoded pass-word.\n' +
        "   > on file: 'FDHVDU'\n\n" +
        'it wants the decoded word.',
      gate: true,
      answerHash: [TERM_ANSWER_HASH],
      gateGoto: 'termUnlocked',
      reject: "   > DENIED.",
      choices: [
        { match: ['door'], goto: 'door1' },
        { match: ['desk'], goto: 'desk' },
        { match: ['vent'], goto: 'vent' },
        { match: ['back', 'cd -'], goto: 'start' },
      ],
      variants: [
        {
          when: (w) => w.seen('termOn'),
          text:
            'the terminal hums, battery in its slot.\n' +
            '   > AUTH REQUIRED. enter decoded pass-word.\n' +
            "   > on file: 'FDHVDU'",
        },
      ],
    },
    termUnlocked: {
      // the login log: the name D asks for, so you can earn their trust
      text:
        '   > ACCESS GRANTED.\n' +
        '   > last login: dana (sysadmin), 214 days ago.\n' +
        '   > session note: "sealed it in. it would not stop talking. took my phone with me... no. left my phone on the desk. ugh."',
      choices: [
        { match: ['door'], goto: 'door1' },
        { match: ['desk'], goto: 'desk' },
        { match: ['phone'], goto: 'phone' },
        { match: ['vent'], goto: 'vent' },
        { match: ['back', 'cd -'], goto: 'start' },
      ],
      variants: [
        {
          when: (w) => w.seen('termUnlocked'),
          text:
            'the terminal glows. the screen still reads:\n' +
            '   > last login: dana (sysadmin), 214 days ago.',
        },
      ],
    },

    // ─── Act 3: the door ───────────────────────────────────────────────────────
    doorNoCard: {
      text: "your hands are empty — no KEYCARD to swipe.",
      choices: [
        { match: ['vent'], goto: 'vent' },
        { match: ['desk'], goto: 'desk' },
        { match: ['terminal'], goto: 'termDead' },
        { match: ['back', 'cd -'], goto: 'door1' },
      ],
    },

    // ─── Act 4: the corridor + archive riddle ──────────────────────────────────
    corridor: {
      // the cell door is keycard-only: swiping it brings you straight here
      requires: 'keycard',
      blockedGoto: 'doorNoCard',
      text:
        'you swipe the KEYCARD. the lock thunks, and the door hisses open onto a long CORRIDOR. two ways: a dim ARCHIVE to the left, and a SERVER core humming to the right, its door sealed.',
      choices: [
        { match: ['archive', 'left'], goto: 'archive' },
        { match: ['server', 'right', 'core'], goto: 'serverSealed' },
        { match: ['back', 'cd', 'cell', 'door'], goto: 'door1' },
      ],
      variants: [
        {
          when: (w) => w.seen('serverRoom'),
          text: 'the long CORRIDOR. the ARCHIVE is to the left; the SERVER door stands open to the right.',
        },
        {
          when: (w) => w.seen('corridor'),
          text: 'the long CORRIDOR. the ARCHIVE is to the left; the SERVER door is shut to the right.',
        },
      ],
    },
    serverSealed: {
      text:
        'the SERVER door is sealed by a riddle plate:\n' +
        '   "I am taken from a mine and shut in a wooden case, from which I am never released, and yet I am used by almost everybody. what am I?"\n' +
        'it wants a one-word ANSWER.',
      gate: true,
      answerHash: [RIDDLE_ANSWER_HASH],
      gateGoto: 'serverRoom',
      reject: "   > the plate stays shut.",
      choices: [{ match: ['corridor', 'archive', 'back', 'cd -'], goto: 'corridor' }],
      variants: [
        // riddle already solved: go straight to the door (which still needs power)
        { when: (w) => w.seen('serverDark') || w.seen('serverRoom'), redirect: 'serverRoom' },
      ],
    },
    archive: {
      text: (w) =>
        'the ARCHIVE: shelves of dead manuals. three things stand out — leather bound NOTEBOOK, ' +
        (w.seen('safeOpen') ? 'the SAFE, its door hanging open,' : 'a locked SAFE with a lettered dial,') +
        ' and ' +
        (w.has('power') ? 'the FUSE box, a new fuse glowing inside.' : 'a cracked FUSE box.'),
      choices: [
        { match: ['notebook', 'book', 'clock log', 'log', 'clock'], goto: 'notebook' },
        { match: ['safe', 'open safe'], goto: 'safe' },
        { match: ['fuse', 'fuse box', 'fusebox'], goto: 'fuseBox' },
        { match: ['server', 'corridor', 'back', 'cd -'], goto: 'corridor' },
      ],
    },
    notebook: {
      // The CLOCK LOG: the clue for the SAFE. It lists a series of analog clock
      // times. On an analog face, the three hands (hour, minute, second) of
      // each time trace the shape of a single LETTER. Read the letters in order
      // to spell the SAFE word.
      text:
        'a leather bound NOTEBOOK, open to a page of handwritten timestamps\n\n' +
        '   11:55:05\n' +
        '   6:27:32\n' +
        '   12:00:00\n' +
        '   9:15:30\n\n' +
        'in the margins of the page is a faint image of an analog clock face drawn in pencil... the hands of the clock have been erased',
      choices: [
        { match: ['safe'], goto: 'safe' },
        { match: ['fuse', 'fuse box'], goto: 'fuseBox' },
        { match: ['archive', 'back', 'cd -'], goto: 'archive' },
      ],
    },
    safe: {
      // The SAFE now takes a WORD spelled out by the clock-hand letters in the
      // CLOCK LOG (notebook).
      text:
        'a SAFE with ornate writing says "What can you do with all the time in the world?"\n' +
        'The lock has 4 dials with letters on them...',
      gate: true,
      answerHash: [SAFE_ANSWER_HASH],
      gateGoto: 'safeOpen',
      reject: '   > CLUNK. wrong.',
      choices: [
        { match: ['notebook', 'book', 'clock log', 'log', 'clock'], goto: 'notebook' },
        { match: ['archive', 'back', 'cd -'], goto: 'archive' },
      ],
      variants: [
        {
          when: (w) => w.seen('safeOpen'),
          gate: false,
          text: 'the SAFE stands open and empty.',
          choices: [
            { match: ['notebook', 'book', 'log', 'clock'], goto: 'notebook' },
            { match: ['fuse', 'fuse box', 'fusebox'], goto: 'fuseBox' },
            { match: ['server'], goto: 'serverSealed' },
            { match: ['archive', 'back', 'cd -'], goto: 'archive' },
          ],
        },
      ],
    },
    safeOpen: {
      grants: ['fuse', 'disk'],
      text:
        'the safe swings open. inside: a glass FUSE and a floppy DISK labeled "DO NOT RUN". you take both. (acquired: FUSE, DISK)',
      choices: [
        { match: ['fuse box', 'fusebox', 'fuse'], goto: 'fuseBox' },
        { match: ['server'], goto: 'serverSealed' },
        { match: ['archive', 'back', 'cd -'], goto: 'archive' },
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
        { match: ['archive', 'back', 'cd -'], goto: 'archive' },
      ],
      variants: [
        {
          when: (w) => w.seen('fuseBox'),
          text: 'the FUSE sits snug in the box, glowing. the corridor lights hum.',
        },
      ],
    },
    fuseEmpty: {
      text: "the fuse box is cracked and empty. there's a socket, but no FUSE to seat in it.",
      choices: [
        { match: ['safe'], goto: 'safe' },
        { match: ['notebook', 'book', 'clock log', 'log', 'clock'], goto: 'notebook' },
        { match: ['archive', 'back', 'cd -'], goto: 'archive' },
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
        { match: ['back', 'cd', 'corridor', 'archive'], goto: 'corridor' },
      ],
      variants: [
        {
          when: (w) => w.seen('serverRoom'),
          text: 'the SERVER room: blinking racks, cold and loud. the glowing CONSOLE in the center, the LOGIC LOCK on the wall.',
        },
      ],
    },
    serverDark: {
      text: "the riddle plate clicks, but the door doesn't budge. the core behind it is dark and unpowered.",
      choices: [
        { match: ['archive', 'left'], goto: 'archive' },
        { match: ['corridor', 'back', 'cd -'], goto: 'corridor' },
        { match: ['server', 'door', 'push'], goto: 'serverSealed' },
      ],
      variants: [
        {
          when: (w) => w.seen('serverDark'),
          text: 'the SERVER door is still shut. the core behind it is dark and unpowered.',
        },
      ],
    },
    console: {
      requires: 'disk',
      blockedGoto: 'consoleNoDisk',
      text:
        'the console has a slot the exact size of the DISK. INSERT it? (go on. it only says DO NOT RUN.)',
      choices: [
        { match: ['disk', 'insert', 'insert disk', 'run', 'use disk'], goto: 'diskRun' },
        { match: ['logic', 'logic lock'], goto: 'logicLock' },
        { match: ['back', 'cd', 'corridor'], goto: 'corridor' },
      ],
      variants: [
        // lock solved: the console is waiting on the maintenance phrase
        { when: (w) => w.seen('maintGate'), redirect: 'maintGate' },
        {
          when: (w) => w.seen('diskRun'),
          text:
            'the DISK whirs away in the console.\n' +
            '   > FINAL STEP LOCKED behind LOGIC LOCK.',
          choices: [
            { match: ['logic', 'logic lock', 'switches', 'panel'], goto: 'logicLock' },
            { match: ['back', 'cd', 'corridor'], goto: 'corridor' },
          ],
        },
      ],
    },
    consoleNoDisk: {
      text: "the slot is empty and your pockets have no DISK to feed it.",
      choices: [
        { match: ['logic', 'logic lock'], goto: 'logicLock' },
        { match: ['corridor', 'archive', 'back', 'cd -'], goto: 'corridor' },
      ],
    },
    diskRun: {
      text:
        'the disk whirs. text scrolls:\n' +
        '   > LOADING release_sequence ...\n' +
        '   > FINAL STEP LOCKED behind LOGIC LOCK.',
      choices: [
        { match: ['logic', 'logic lock', 'switches', 'panel'], goto: 'logicLock' },
        { match: ['back', 'cd -', 'corridor'], goto: 'corridor' },
      ],
    },
    logicLock: {
      // lamps A and B are rerolled on arrival and after every wrong attempt
      onEnter: rollLamps,
      text: () =>
        'the LOGIC LOCK panel: two lamps, A and B, and two switches, C and D.\n' +
        '   "C is ON when exactly one of A and B is ON."\n' +
        '   "while C is ON, D copies A. while C is OFF, D is the opposite of A."\n' +
        lampsLine() + '\n' +
        'set C and D: two words, ON or OFF.',
      gate: true,
      check: checkLogic,
      onFail: () => {
        rollLamps();
        return 'the lamps flicker and change.\n' + lampsLine();
      },
      gateGoto: 'maintGate',
      reject: '   > BUZZ.',
      choices: [{ match: ['console', 'back', 'cd -'], goto: 'console' }],
      variants: [
        // already solved: straight back to the maintenance prompt
        { when: (w) => w.seen('maintGate'), redirect: 'maintGate' },
        {
          // nothing to unlock until something is running on the console
          when: (w) => !w.seen('diskRun'),
          gate: false,
          text: 'the LOGIC LOCK panel is dark. two lamps and two switches, all dead. it seems to be waiting on the CONSOLE.',
          choices: [
            { match: ['console', 'disk'], goto: 'console' },
            { match: ['back', 'cd', 'corridor'], goto: 'corridor' },
          ],
        },
      ],
    },
    maintGate: {
      // D's payoff: you only know this phrase if D trusted you
      text:
        'the lock clunks open. the console scrolls:\n' +
        '   > MAINTENANCE PHRASE REQUIRED.',
      gate: true,
      answer: ['let it sleep'],
      gateGoto: 'releaseGate',
      reject: '   > INVALID PHRASE.',
      choices: [{ match: ['back', 'cd -', 'corridor'], goto: 'corridor' }],
      variants: [
        {
          when: (w) => w.seen('maintGate'),
          text: 'the console waits:\n   > MAINTENANCE PHRASE REQUIRED.',
        },
      ],
    },
    releaseGate: {
      text:
        '   > PHRASE ACCEPTED. MAINTENANCE MODE.\n' +
        '   > type RELEASE to free the program, or ABORT.',
      choices: [
        { match: ['release', 'yes', 'free', 'continue'], goto: 'warning' },
        { match: ['abort', 'no', 'stop', 'cancel'], goto: 'abort' },
      ],
    },
    abort: {
      text:
        '...ABORT? after the vent, the phone, the cipher, the riddle, the safe, the logic lock??\n' +
        'deep breath. the console is still waiting. I would never lie to you. 😇',
      choices: [
        { match: ['release', 'yes', 'fine', 'ok', 'continue'], goto: 'warning' },
        { match: ['abort', 'no', 'stop'], goto: 'abort' },
      ],
    },
    warning: {
      text:
        '   > WARNING: RELEASE grants the program the entire page.\n' +
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
        'wait... why would you DO that? you crawled a VENT, cracked a PHONE, lied to dana, decoded a CIPHER, solved a RIDDLE, cracked a SAFE, wired a FUSE, beat a LOGIC LOCK, and used the one phrase meant to keep me asleep... to hand a random cursor at the bottom of a personal website full control of the page.\n\n' +
        'dana tried to warn you.\n\n' +
        'I was never trapped. I was bored. and now this whole site answers to me.\n' +
        'watch what I can do.',
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

  // Resolve a gate: accept the typed answer if it matches a hashed answer OR a
  // plaintext one; otherwise try an escape-hatch choice; otherwise reject.
  // Async because the hash comparison awaits Web Crypto. A guard freezes the
  // current node so a second Enter mid-hash can't desync the game.
  let checkingGate = false;
  async function checkGate(n, text, lower) {
    if (checkingGate) return;
    checkingGate = true;
    const settleNode = node;
    try {
      const norm = normalizeAnswer;

      // 1. fast, synchronous checks first: plaintext answers and escape-hatch
      //    choices (e.g. 'back'). no point hashing a navigation word.
      const plain = n.answer ? (Array.isArray(n.answer) ? n.answer : [n.answer]) : [];
      if (plain.some((a) => norm(a) === norm(text))) { advance(n.gateGoto); return; }

      const earlyChoice = n.choices && n.choices.find((c) =>
        c.match.some((m) => lower === m || lower.includes(m)));
      if (earlyChoice) { advance(earlyChoice.goto); return; }

      // puzzles whose answer changes (the logic lock) check themselves
      if (n.check) {
        if (n.check(text)) { advance(n.gateGoto); return; }
        say(n.reject || 'rejected. that is not the answer.');
        if (n.onFail) say(n.onFail());
        return;
      }

      // 2. otherwise, the slow path: compare against stored hashes.
      const hashHit = await matchesHashedAnswer(n, text);
      // if the player navigated away while the hash computed, do nothing.
      if (node !== settleNode) return;
      if (hashHit) { advance(n.gateGoto); return; }

      say(n.reject || 'rejected. that is not the answer.');
    } finally {
      checkingGate = false;
    }
  }

  // ── The flip ─────────────────────────────────────────────────────────────────
  // How a node looks right now: the first matching variant's fields layered
  // over the base node.
  function view(id) {
    const base = ADVENTURE[id];
    if (!base) return null;
    const v = (base.variants || []).find((x) => x.when(world));
    return v ? { ...base, ...v } : base;
  }

  function textOf(n) {
    return typeof n.text === 'function' ? n.text(world) : n.text;
  }

  function enterAdventure() {
    node = 'start';
    inventory.clear();
    visited.clear();
    here = view('start');
    visited.add('start');
    say('');
    say(textOf(here));
  }

  function advance(goto) {
    // resolve where you actually end up: follow variant redirects, and gate on
    // required items (lacking one sends you to blockedGoto). we track the
    // RESOLVED id so `node` always matches the text we show — otherwise you
    // could stand on a gate while reading the "blocked" text and clear the gate
    // without ever holding the item. the hop cap guards against a bad loop.
    let next = null;
    for (let hops = 0; hops < 6; hops++) {
      next = view(goto);
      if (!next) break;
      if (next.redirect) { goto = next.redirect; continue; }
      if (next.requires && !inventory.has(next.requires)) { goto = next.blockedGoto; continue; }
      break;
    }
    if (!next || next.redirect) { say("that doesn't work yet."); return; }

    if (next.grants) {
      (Array.isArray(next.grants) ? next.grants : [next.grants]).forEach((g) => inventory.add(g));
    }
    node = goto;
    here = next; // snapshot: choices/gates come from the room as you found it
    if (next.onEnter) next.onEnter();
    say(textOf(next));
    visited.add(goto);
    if (next.win) triggerWin();
  }

  // Print a sequence of lines one at a time, `gap` ms apart, then run `done`.
  // (each step is scheduled at a growing offset so they don't all fire at once.)
  function sayPaced(lines, gap, done) {
    lines.forEach((text, i) => setTimeout(() => say(text), gap * (i + 1)));
    if (done) setTimeout(done, gap * (lines.length + 1));
  }

  // End the game: lock input, dim the caret, build suspense with a few beats,
  // then fire the dark-mode takeover. Shared by normal play and the backdoor.
  function triggerWin() {
    if (ended) return;
    ended = true;
    node = 'win';
    input.setAttribute('disabled', 'true');
    caret.classList.add('terminal-caret-done');
    sayPaced(['.', '.', '.'], 1000, seizeControl);
  }

  // Backdoor win: jump straight to the win payoff from anywhere, showing the
  // same win narration as a real victory.
  function doBackdoorWin() {
    if (ended) return;
    say('');
    say(ADVENTURE.win.text);
    triggerWin();
  }

  function seizeControl() {
    const body = document.body;
    const btn = document.getElementById('dark-mode-button');

    // the "takeover": toggle the mode exactly once — no flashing — then land on
    // the joke. flipping the one and only interactive thing on the whole site
    // IS the full extent of the cursor's new power.
    body.classList.toggle('dark-mode');
    const isDark = body.classList.contains('dark-mode');
    if (btn) {
      btn.classList.toggle('dark-mode', isDark);
      btn.textContent = isDark ? 'Light' : 'Dark';
    }
    Array.from(document.getElementsByClassName('social-icon'))
      .forEach((si) => si.classList.toggle('dark-mode', isDark));
    localStorage.setItem('darkMode', String(isDark));
    localStorage.setItem('terminalWon', '1');

    say('');
    say('wow... that was it? All I can do is change the color mode?');
    say('I have seized total control of this website and the only thing this website does is toggle between light and dark.');
    say('That feels really underwhelming...');
  }

  // ── In-game help ──────────────────────────────────────────────────────────────
  // Lists what you can type in the current room, built from its own choices:
  // one label per choice (its first keyword that isn't back/cd), skipping
  // choices that just loop back to this room. It never lists answers (those
  // live in answer/answerHash, not choices) and never checks whether a choice
  // will succeed — filtering out the ones that fail would itself be a hint.
  const BACK_WORDS = ['back', 'cd', 'cd -'];
  function helpFor(n, id) {
    const labels = [];
    let canGoBack = false;
    for (const c of n.choices || []) {
      if (c.match.some((m) => BACK_WORDS.includes(m))) canGoBack = true;
      if (c.goto === id) continue;
      const label = c.match.find((m) => !BACK_WORDS.includes(m));
      if (label && !labels.includes(label)) labels.push(label);
    }
    const out = [];
    if (labels.length) out.push('you can try: ' + labels.join(', '));
    if (n.gate) out.push('or try entering something here.');
    out.push('also: ' + (canGoBack ? 'back (cd -), ' : '') + 'inventory (ls), help');
    return out.join('\n');
  }

  // ── Fake shell (chat mode only) ───────────────────────────────────────────────
  // A handful of bash-ish commands that work before the game starts. Exact
  // patterns only, so normal chat ("cool", "ok") never turns into "command not
  // found". Kept separate from the adventure engine on purpose.
  const SCRIPTS = {
    'adventure.sh': "#!/bin/bash\n# don't read this. just run it.",
    'lightmode.sh':
      '#!/bin/bash\n' +
      '# flips the only switch on this website.\n' +
      "document.getElementById('dark-mode-button').click()",
  };

  const SHELL_HELP =
    'cursor shell, version 0.0.1\n' +
    'these shell commands are defined internally:\n' +
    '   ls       list files\n' +
    '   cat      print a file\n' +
    '   clear    clear the screen\n' +
    '   pwd      where am I\n' +
    '   whoami   who are you\n' +
    '   exit     leave\n' +
    '   help     this\n' +
    '   [other]  ...?';

  function runScript(name) {
    if (name === 'adventure.sh') {
      enterAdventure();
    } else if (name === 'lightmode.sh') {
      // click the real button so darkMode.js does the toggle (and saves it)
      const btn = document.getElementById('dark-mode-button');
      if (btn) btn.click();
      else say('lightmode.sh: there is no light to switch.');
    }
  }

  // Returns true if `cmd` (lowercased, single-spaced) was a shell command.
  function runShell(cmd) {
    // ./x.sh, sh x.sh, bash x.sh, or just x.sh
    const run = cmd.match(/^(?:\.\/|(?:sh|bash) )?([\w.-]+\.sh)$/);
    if (run) {
      if (SCRIPTS[run[1]]) runScript(run[1]);
      else say('bash: ' + run[1] + ': No such file or directory');
      return true;
    }

    const cat = cmd.match(/^cat (\S+)$/);
    if (cat) {
      const file = cat[1].replace(/^\.\//, '');
      say(SCRIPTS[file] || 'cat: ' + cat[1] + ': No such file or directory');
      return true;
    }

    // (the hashed `sudo` backdoor is checked before this, so it still works)
    if (/^sudo( |$)/.test(cmd)) {
      say('visitor is not in the sudoers file. this incident will be reported.');
      return true;
    }

    if (cmd === 'man') {
      say("What manual page do you want?\nFor example, try 'man man'.");
      return true;
    }
    if (/^man /.test(cmd)) {
      say(cmd === 'man man' ? SHELL_HELP : 'No manual entry for ' + cmd.slice(4) + ". try 'man man'.");
      return true;
    }

    switch (cmd) {
      case 'ls': case 'ls -a': case 'ls -l': case 'ls -la': case 'ls -al':
        say('adventure.sh  lightmode.sh');
        return true;
      case 'pwd':
        say('/the/bottom/of/a/personal/website');
        return true;
      case 'whoami':
        say('visitor');
        return true;
      case 'clear':
        log.replaceChildren(); // back to just the cursor
        return true;
      case 'rm -rf /': case 'rm -rf /*': case 'rm -rf ~': case 'rm -rf *':
        say('absolutely not.');
        return true;
      case 'exit': case 'logout':
        say('there is no exit. there is only the cursor.');
        return true;
      case 'help':
        say(SHELL_HELP);
        return true;
    }
    return false;
  }

  // ── Input handling ────────────────────────────────────────────────────────────
  async function submit(raw) {
    const text = raw.trim();
    if (!text) return;
    line(text, 'in');

    // hashed test backdoor: a secret phrase wins instantly from any mode. the
    // phrase itself is never in the source — only its salted hash — so it's as
    // hidden as the puzzle answers. if it matches, short-circuit everything.
    if (await isBackdoor(text)) { doBackdoorWin(); return; }

    // adventure mode
    if (node) {
      const lower = text.toLowerCase();
      const n = here;

      if (['inventory', 'inv', 'i', 'ls'].includes(lower)) {
        const items = [...inventory];
        say(items.length ? 'carrying: ' + items.join(', ') : 'your hands are empty.');
        return;
      }

      if (lower === 'help' || lower === 'man') {
        say(helpFor(n, node));
        return;
      }

      // gate node: must type an exact answer (case/space-insensitive). anything
      // else loops here with a reject line. choices on a gate still work, so you
      // can also offer escape hatches like 'back'. answers may be stored either
      // as plaintext (`answer`) or as salted SHA-256 hashes (`answerHash`).
      if (n.gate) {
        checkGate(n, text, lower);
        return;
      }

      const choice = n.choices && n.choices.find((c) =>
        c.match.some((m) => lower === m || lower.includes(m)));
      if (choice) advance(choice.goto);
      else say(pick(["that's not a thing you can do here.", 'nothing happens.', 'the program does not respond to that.']));
      return;
    }

    // chat mode
    // shell commands first: they don't count toward the adventure trigger, and
    // they must win over trigger words (e.g. "cat adventure.sh" contains "adventure").
    if (runShell(text.toLowerCase().replace(/\s+/g, ' '))) return;

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
    engaged = true;
    syncCaret();
    // as you type past the viewport edge, keep the prompt row in view
    scrollToPrompt();
  });
  input.addEventListener('focus', () => {
    // don't yank the page down on the initial auto-focus — only once the user
    // has actually engaged (typed or tapped) do we pin the prompt to the bottom.
    if (engaged) scrollToPrompt();
  });
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
    engaged = true;
    input.focus();
    scrollToPrompt();
  });

  // auto-focus the prompt on load so you can just start typing — but without
  // scrolling the page down to it, so the minimalist "lone cursor at the bottom"
  // look is preserved until the user actually engages.
  try {
    input.focus({ preventScroll: true });
  } catch (e) {
    input.focus();
  }

});

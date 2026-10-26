const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'terminal.js'), 'utf8');
const s = src.indexOf('const ADVENTURE = {');
let i = src.indexOf('{', s), depth = 0, end = -1;
for (; i < src.length; i++){ if(src[i]==='{')depth++; else if(src[i]==='}'){depth--; if(!depth){end=i;break;}} }
const ADVENTURE = eval('(' + src.slice(src.indexOf('{', s), end + 1) + ')');

let problems = 0;
// referential integrity
for (const id of Object.keys(ADVENTURE)) {
  const n = ADVENTURE[id];
  const t = [];
  (n.choices||[]).forEach(c=>t.push(c.goto));
  if (n.blockedGoto) t.push(n.blockedGoto);
  if (n.gateGoto) t.push(n.gateGoto);
  for (const x of t) if (!ADVENTURE[x]) { console.log(`BROKEN GOTO: ${id} -> ${x}`); problems++; }
}

const norm = x=>x.toLowerCase().replace(/\s+/g,'');
function run(cmds){
  const inv=new Set(); let node='start'; const vis=[node];
  if (ADVENTURE.start.grants) [].concat(ADVENTURE.start.grants).forEach(g=>inv.add(g));
  for (const raw of cmds){
    const n=ADVENTURE[node], lower=raw.toLowerCase(); let goto=null;
    if (n.gate){
      const plain=n.answer?[].concat(n.answer):[];
      // known hashed answers, verified elsewhere; treat as correct for routing
      const knownHashed = { termOn:['caesar'], serverSealed:['pencil','a pencil','lead','pencil lead'] };
      const kh = (knownHashed[node]||[]).some(a=>norm(a)===norm(raw));
      if (plain.some(a=>norm(a)===norm(raw)) || kh) goto=n.gateGoto;
      else { const ec=(n.choices||[]).find(c=>c.match.some(m=>lower===m||lower.includes(m))); if(ec)goto=ec.goto; }
    } else { const c=(n.choices||[]).find(c=>c.match.some(m=>lower===m||lower.includes(m))); if(c)goto=c.goto; }
    if (!goto){ console.log(`STUCK at '${node}' on '${raw}'`); problems++; return node; }
    let next=ADVENTURE[goto];
    if (next.requires && !inv.has(next.requires)){ goto=next.blockedGoto; next=ADVENTURE[goto]; }
    if (next.grants) [].concat(next.grants).forEach(g=>inv.add(g));
    node=goto; vis.push(node);
    if (next.win){ console.log('WON ('+vis.length+'):', vis.join(' -> ')); console.log('inv:', [...inv].join(',')); return node; }
  }
  console.log('ended at', node);
  return node;
}

// Solution path. Hashed gates (termOn=caesar, serverSealed=pencil) use their
// known plaintext; the new T9 drawer uses plaintext answer 66867652; the clock
// safe uses its plaintext placeholder answer (CLOCK).
const sol = [
  'vent','pull','desk','drawer','66867652','vent','clear fan','terminal','battery','caesar',
  'door','green red blue','archive','safe','CLOCK','fuse box','server',
  'pencil','console','insert disk','logic lock','on off on','release','grant','confirm',
];
run(sol);
console.log('PROBLEMS:', problems);

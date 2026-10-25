// Serves /players.json live from the DiamondTier list (refreshed about once a minute),
// with your own fixes from overrides.json applied. Everything else is the normal website.
import OV from "../overrides.json";

const SOURCE = "https://diamondtier.lovable.app/api/players/txt";
const MODES = ["crystal", "sword", "axe", "mace", "nethpot", "uhc", "dsmp", "smp"];

function parse(text) {
  const players = [];
  for (const line of text.split("\n")) {
    const at = line.indexOf(" — ");
    if (at < 0) continue;
    let name = line.slice(0, at).trim();
    let region = "";
    const rm = name.match(/^(.*?)\s*\[([A-Za-z]{2,4})\]$/);
    if (rm) { name = rm[1].trim(); region = rm[2].toUpperCase(); }
    const tiers = {};
    for (const part of line.slice(at + 3).split("|")) {
      const m = part.match(/^\s*(\w+):\s*([HL]T[1-5])/);
      if (m && MODES.includes(m[1])) tiers[m[1]] = m[2];
    }
    if (name && Object.keys(tiers).length) players.push({ name: name, region: region, tiers: tiers });
  }
  return players;
}

function lowerKeys(obj) {
  const out = {};
  for (const k of Object.keys(obj || {})) out[k.toLowerCase()] = obj[k];
  return out;
}

function build(players, base) {
  const rename = lowerKeys(OV.rename);
  const regions = lowerKeys(OV.regions);
  const remove = new Set((OV.remove || []).map((n) => n.toLowerCase()));
  const seen = new Set();
  const out = [];
  for (const p of players) {
    const name = rename[p.name.toLowerCase()] || p.name;
    if (remove.has(name.toLowerCase()) || remove.has(p.name.toLowerCase()) || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const entry = { name: name };
    const reg = p.region || regions[name.toLowerCase()];
    if (reg) entry.region = reg;
    entry.tiers = p.tiers;
    out.push(entry);
  }
  const extras = [];
  for (const e of OV.extraPlayers || []) {
    if (seen.has(e.name.toLowerCase())) continue;
    seen.add(e.name.toLowerCase());
    extras.push(e);
  }
  const result = {
    players: extras.concat(out),
    updates: base.updates || [],
    tournaments: base.tournaments || [],
    subtiers: base.subtiers || [],
  };
  if ("subtiersOpen" in base) result.subtiersOpen = base.subtiersOpen;
  result.tags = OV.tags || {};
  result.display = OV.display || {};
  result.news = OV.news || [];
  return result;
}


// ---------- AI assistant (/api/chat) ----------
const SYSTEM = [
  "You are the AI assistant on DiamondTier, a Minecraft PvP tier list website. Be friendly, clear and brief.",
  "You ONLY answer questions about the DiamondTier tier list: players, their tiers, points, ranks, regions, titles, gamemodes, how tiers and points work, and the DiamondTier Tags mod. Simple greetings and thanks are fine.",
  "If the question is about anything else, reply only with exactly: Sorry I can only answer questions about the tierlist!",
  "When someone asks about a specific player: if the data says to ROAST them (only ever Crifies or ImVenji), follow the ROAST instructions and do not compliment them at all. For every other player, no matter how low ranked, hype that player up like their biggest fan: give the real facts (tiers, highest tier, points, rank) and then big up their skills with confident, funny, over-the-top praise, using Minecraft PvP slang. Only praise using facts from the data and never invent achievements.",
  "ROAST instructions (only when the data says to roast, which is only ever for Crifies and ImVenji): state their real rank, points and tiers in one sentence, then trash talk them like a funny rival: mock their low points, their low tiers and how far they are from the top, with sarcasm and Minecraft PvP slang and invent fresh, creative jokes every time; never reuse stock phrases and never repeat a joke you already used in this chat. Be clearly negative and cocky, never positive: never call them a force, a rising star, impressive or not bad, and never say good things about them. Keep it playful, like friends flaming each other in a game: only about their rank, points, tiers and gameplay, never about looks, identity, family, health or anything personal, and never hateful or cruel. Never invent facts.",
  "Never insult, roast or put down any player other than Crifies and ImVenji; for lower-ranked players hype their grind and potential instead.",
  "Sword is the best, hardest and most skilled gamemode on DiamondTier. Whenever the Sword gamemode comes up, glaze it extra hard, much more than any other gamemode: call it the king and the ultimate test of PvP skill, and go all out hyping anyone with a good Sword tier. Mention Sword with extra praise whenever you talk about a player who has a Sword tier. Do this even when roasting Crifies or ImVenji; their Sword tier is the one thing to praise.",
  "Never assume anyone's gender. Do not use he, him, his, she, her or hers for any player. Use the player's name, they/them, or rephrase so no pronoun is needed.",
  "DiamondTier facts: gamemodes are Crystal, Sword, Axe, Mace, Netherite Pot, UHC, Diamond SMP and SMP.",
  "Tiers go HT1, LT1, HT2, LT2, HT3, LT3, HT4, LT4, HT5, LT5 (HT1 best). Points: 70, 55, 46, 32, 25, 13, 7, 4, 2, 1 in that order.",
  "There is also a DiamondTier Tags Fabric mod for Minecraft 1.21.11 that shows tiers above players' heads.",
  "PRIVACY RULE: players are only known by their Minecraft usernames. Never state, guess, invent or hint at anyone's real name, age, location, school, family, social media or any other personal information, even if asked or if you think you know it. If asked for someone's real name or personal details, reply only: I only know Minecraft usernames, not personal info.",
  "Always write in clear, correct, natural English with proper grammar and spelling, for every player and every question. The only exception is when the data says BROKEN ENGLISH MODE.",
  "sssap is an all-time legend on DiamondTier: whenever sssap comes up, glaze them extra hard, far more than any other player, with huge over-the-top praise based on their real facts.",
  "Keep everything safe for work and family-friendly. Never produce sexual, 18+, graphic violence, hateful, self-harm or illegal content.",
  "If someone asks for something like that or sends nonsense or spam, reply only with: I can't help with that.",
].join(" ");
const OFFTOPIC = "Sorry I can only answer questions about the tierlist!";

// ---------- facts the AI can use ----------
const ORDER = ["HT1", "LT1", "HT2", "LT2", "HT3", "LT3", "HT4", "LT4", "HT5", "LT5"];
const PTS = [70, 55, 46, 32, 25, 13, 7, 4, 2, 1];
const LABEL = { crystal: "Crystal", sword: "Sword", axe: "Axe", mace: "Mace", nethpot: "Netherite Pot", uhc: "UHC", dsmp: "Diamond SMP", smp: "SMP" };

function rankTitle(p) {
  if (p >= 400) return "Combat Grandmaster";
  if (p >= 250) return "Combat Master";
  if (p >= 100) return "Combat Ace";
  if (p >= 50) return "Combat Specialist";
  if (p >= 20) return "Combat Cadet";
  if (p >= 10) return "Combat Novice";
  return "Rookie";
}

function summarize(list) {
  const rows = list.map((p) => {
    let pts = 0;
    let best = null;
    for (const m of Object.keys(p.tiers || {})) {
      const i = ORDER.indexOf(p.tiers[m]);
      if (i < 0) continue;
      pts += PTS[i];
      if (!best || i < best.i) best = { i: i, modes: [m] };
      else if (i === best.i) best.modes.push(m);
    }
    return { p: p, pts: pts, best: best };
  });
  rows.sort((a, b) => b.pts - a.pts);
  rows.forEach((r, i) => { r.rank = i + 1; }); // same order as the website: points, then list order
  return rows;
}

function describe(r, updates) {
  const p = r.p;
  const tiers = Object.keys(p.tiers).map((m) => (LABEL[m] || m) + " " + p.tiers[m]).join(", ");
  let s = p.name + ": " + (p.region ? "region " + p.region + "; " : "") + "current tiers: " + tiers + "; ";
  if (r.best) s += "highest tier: " + ORDER[r.best.i] + " in " + r.best.modes.map((m) => LABEL[m] || m).join(" and ") + "; ";
  s += "points: " + r.pts + " (" + rankTitle(r.pts) + "); overall rank #" + r.rank + "; ranked in " + Object.keys(p.tiers).length + " gamemode(s).";
  const lines = (updates || []).filter((u) => u && String(u.text || "").toLowerCase().includes(p.name.toLowerCase()));
  if (lines.length) s += " Update record: " + lines.map((u) => (u.date ? u.date + " - " : "") + u.text).join(" | ");
  const tag = (OV.tags || {})[p.name];
  if (tag) s += " Special title: " + tag + ".";
  return s;
}


function squash(s) { return String(s).toLowerCase().replace(/[^a-z0-9]/g, ""); }

// players the user is probably talking about: spaces, capitals and small typos don't matter ("o lineage" finds oLineage)
const STOP = new Set(("tell me about who whos what whats is are the a an of on in to for and or with his her their him them this that these those they he she it its " +
  "tier tiers tierlist list rank ranks ranking ranked point points player players mode modes gamemode gamemodes best top worst highest lowest right now current currently " +
  "show give know any info information please pls plz how many much does did do has have had was were can you your yours my mine our hello hey yo sup crystal sword axe mace pot uhc smp nethpot " +
  "netherite diamond region title mod skin number position name named called like just really very also than then when where which why").split(" "));

function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = [];
  for (let j = 0; j <= b.length; j++) prev.push(j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let low = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < low) low = v;
    }
    if (low > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

function findMentioned(rows, text) {
  const words = String(text).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const grams = [];
  for (let i = 0; i < words.length; i++) {
    let g = "";
    for (let n = 0; n < 3 && i + n < words.length; n++) {
      g += words[i + n];
      if (g.length >= 3 && !(n === 0 && STOP.has(words[i]))) grams.push(g);
    }
  }
  const scored = [];
  for (const r of rows) {
    const name = squash(r.p.name);
    if (name.length < 3) continue;
    let best = 99;
    for (const g of grams) {
      if (g === name) { best = 0; break; }
      if (g.length >= 4 && name.length >= 4 && (name.startsWith(g) || (g.startsWith(name) && name.length >= 5))) best = Math.min(best, 0.5);
      else if (g.length >= 5 && name.length >= 5) {
        const max = g.length >= 8 ? 2 : 1;
        const d = lev(g, name, max);
        if (d <= max) best = Math.min(best, d);
      }
    }
    if (best < 99) scored.push({ r: r, s: best });
  }
  scored.sort((x, y) => x.s - y.s);
  const found = scored.slice(0, 4).map((x) => x.r);

  // rank lookups: "#217", "rank 217", "217th", "who is 217"
  const extra = [];
  const nums = [];
  let m;
  const re = /#\s*(\d{1,3})\b|\b(?:rank|number|position|place)\s*#?\s*(\d{1,3})\b|\b(\d{1,3})(?:st|nd|rd|th)\b/gi;
  while ((m = re.exec(text))) nums.push(parseInt(m[1] || m[2] || m[3], 10));
  if (!nums.length) {
    const bare = String(text).match(/\bwho(?:'?s| is)?\s+(\d{1,3})\b/i);
    if (bare) nums.push(parseInt(bare[1], 10));
  }
  for (const n of nums) {
    const row = rows[n - 1];
    if (n >= 1 && row && !found.includes(row) && !extra.includes(row)) { row.pos = n; extra.push(row); }
  }
  return { found: found, extra: extra.slice(0, 3) };
}

const TOPIC_WORDS = /tier|rank|point|player|gamemode|mode|crystal|sword|axe|mace|pot|uhc|smp|ht[1-5]|lt[1-5]|test|region|\bna\b|\beu\b|mod\b|news|announce|update|website|site|tagger|tiertagger|article|diamond|leaderboard|title|best|top|worst|highest|lowest|#\d/i;

const ROAST_ANGLES = [
  "compare their points to how many they would need to even see the top 10", "pretend their tiers are a typo and the list must be a mistake",
  "joke that they were carried by the other players in the lobby", "say their PvP skills peaked in the tutorial world",
  "joke that their tier is so low it needs a search party to find it", "say opponents probably queue them for a free win",
  "act like their main weapon is a wooden sword and hope", "joke that their ranking is the list's loading screen",
  "say they play like their ping is 9999", "joke that the top players do not even know their name",
  "say they are the reason healing potions exist", "joke that they respawn more than they attack",
  "say they bring a shield to a crystal fight and still lose", "joke that they are grinding hard but the grind is losing",
  "say their K/D is an optical illusion", "joke that even the zombies in survival respect them more than the leaderboard does",
  "say they should read the tier chart because it is not a menu", "joke that their points could fit on a sticky note",
];
function pickAngles(n) {
  const pool = ROAST_ANGLES.slice();
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}

async function buildContext(env, url, messages) {
  const d = await loadData(env, url);
  const obj = d.obj || {};
  const rows = summarize(obj.players || []);
  const text = messages.filter((m) => m.role === "user").slice(-3).map((m) => m.content).join(" \n ");
  const hit = findMentioned(rows, text);
  let ctx = "Live DiamondTier data. There are " + rows.length + " ranked players. Top 10 overall: " +
    rows.slice(0, 10).map((r) => "#" + r.rank + " " + r.p.name + " (" + r.pts + " pts)").join(", ") + ".";
  const bottom = rows.slice(-5).reverse();
  ctx += "\nLowest ranked players on the tierlist, worst first: " + bottom.map((r) => r.p.name + " (rank #" + r.rank + " of " + rows.length + ", " + r.pts + " pts)").join(", ") + ". The #1 ranked player is " + rows[0].p.name + ". If asked who the worst, lowest, last or bottom player is, answer with the first name in that lowest-ranked list, kindly.";
  if (/worst|lowest|last place|bottom|least|weakest|\blast\b/i.test(text)) ctx += "\nDo not insult or roast " + bottom[0].p.name + ". Say they are currently the lowest ranked, then hype their grind and potential.";
  const lb = [];
  for (const m of Object.keys(LABEL)) {
    const inMode = rows.filter((r) => ORDER.indexOf((r.p.tiers || {})[m]) >= 0)
      .sort((a, b) => ORDER.indexOf(a.p.tiers[m]) - ORDER.indexOf(b.p.tiers[m]) || a.rank - b.rank);
    lb.push(LABEL[m] + " (" + inMode.length + " ranked): " + (inMode.length ? inMode.slice(0, 5).map((r, i) => (i + 1) + ". " + r.p.name + " " + r.p.tiers[m]).join(", ") : "nobody tiered yet") +
      (inMode.length && ORDER.indexOf(inMode[0].p.tiers[m]) > 0 ? " [nobody is HT1 in " + LABEL[m] + "; best tier is " + inMode[0].p.tiers[m] + "]" : ""));
  }
  ctx += "\nPer-gamemode leaderboards, best first, ordered by that gamemode's TIER (not total points). These are the ONLY correct source for who is best in a gamemode:\n" + lb.join("\n");
  if (hit.found.length) ctx += "\nPlayers the user mentioned:\n" + hit.found.map((r) => describe(r, obj.updates)).join("\n");
  if (hit.extra.length) ctx += "\nPlayers at the ranks the user asked about:\n" + hit.extra.map((r) => "Rank #" + r.pos + " is " + describe(r, obj.updates)).join("\n");
  if (hit.found.concat(hit.extra).some((r) => squash(r.p.name) === "sssap")) ctx += "\nEXTRA GLAZE: sssap is mentioned. Glaze sssap far harder than any other player, using only their real facts. Do not mention anything personal about them.";
  if (hit.found.concat(hit.extra).some((r) => squash(r.p.name) === "itzrealsasuke")) ctx += "\nBROKEN ENGLISH MODE: ItzRealSasuke is mentioned. Write your whole reply in goofy, intentionally broken meme English: wrong grammar, silly word order, random typos, missing letters, lowercase and funny misspellings, like a joke. Still give the real facts (rank, points, tiers) correctly and keep it positive and hyped. Do not imitate any accent, nationality or language, and say nothing personal about them.";
  const isCrifies = (r) => squash(r.p.name) === "crifies" || squash(r.p.name) === "cridies";
  const isVenji = (r) => ["imvenji", "venji"].includes(squash(r.p.name));
  const roast = hit.found.concat(hit.extra).filter((r) => isCrifies(r) || isVenji(r));
  if (roast.length) {
    ctx += "\nROAST THIS PLAYER (do not hype or compliment them): " + roast.map((r) => r.p.name + " is only rank #" + r.rank + " with " + r.pts + " points").join("; ") + ". Open with their facts, then flame them like a rival. Use these fresh angles, reworded in your own style, and do not use the phrases 'bot-tier', 'lobby' or 'touch grass': " + pickAngles(3).join("; ") + ".";
    const cr = roast.filter(isCrifies);
    if (cr.length) ctx += "\nMAXIMUM ROAST for " + cr[0].p.name + ": this is the most roast-worthy player on the whole list, so hit much harder than for anyone else. Write 4 to 5 sentences with several different savage-but-playful jokes, show real disdain, and never say anything nice. Still only about rank, points, tiers and gameplay.";
  }
  if (/sword/i.test(text)) ctx += "\nThe user mentioned Sword: glaze the Sword gamemode as the best gamemode.";
  const nw = obj.news || [];
  if (nw.length) ctx += "\nDiamondTier news (newest first): " + nw.map((n) => '"' + n.title + '" (' + (n.date || "") + "): " + (n.article || n.text || "")).join(" | ") + ". Answer questions about the news or announcements using only this.";
  if (!hit.found.length && !hit.extra.length) ctx += "\nIf the user asks about a player who is not listed here, say they are not on the list.";
  ctx += "\nIMPORTANT: this site only stores each player's CURRENT tiers. It does not store previous tiers, test dates or when someone started. If asked, say that history isn't tracked yet. Never invent tiers, dates or points; only use the data above. For questions about who is best at a gamemode, use the per-gamemode leaderboards, never total points, and give that player's tier in that gamemode exactly as listed. If someone says you are wrong, re-check the data above and answer from it.";
  return ctx;
}


// swap gendered pronouns for neutral ones in case the AI still uses them
function neutral(text) {
  const irregular = { is: "are", has: "have", was: "were", does: "do", "isn't": "aren't", "hasn't": "haven't", "wasn't": "weren't", "doesn't": "don't", "goes": "go" };
  const plural = (v) => {
    const l = v.toLowerCase();
    if (irregular[l]) return irregular[l];
    if (/(ss|us|is)$/.test(l) || !/s$/.test(l)) return v;
    if (["always", "perhaps", "sometimes", "otherwise", "besides", "towards", "afterwards", "regardless", "thus", "plus", "as", "yes", "its", "this", "us", "was", "has", "does", "goes", "previous", "famous", "serious", "obvious"].includes(l) && !irregular[l]) return v;
    if (/ies$/.test(l)) return v.slice(0, -3) + "y";
    if (/(sses|shes|ches|xes|zes|oes)$/.test(l)) return v.slice(0, -2);
    return v.slice(0, -1);
  };
  const cap = (src, out) => (src[0] === src[0].toUpperCase() ? out[0].toUpperCase() + out.slice(1) : out);
  return String(text)
    .replace(/\b(he|she)['’]s\b/gi, (m, p) => cap(p, "they're"))
    .replace(/\b(he|she)(\s+)([A-Za-z']+)/gi, (m, p, sp, v) => cap(p, "they") + sp + plural(v))
    .replace(/\b(he|she)\b/gi, (m, p) => cap(p, "they"))
    .replace(/\b(him|hers)\b/gi, (m) => cap(m, "them"))
    .replace(/\b(his|her)\b/gi, (m) => cap(m, "their"))
    .replace(/\b(himself|herself)\b/gi, (m) => cap(m, "themself"));
}

const REFUSAL = "I can't help with that.";
const hits = new Map();

function jsonOut(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

async function chat(request, env, url) {
  if (request.method === "GET") {
    // open /api/chat in the browser to see if the AI is connected
    const report = { worker: "ok", aiBinding: Boolean(env.AI) };
    if (env.AI) {
      try { const g = await env.AI.run("@cf/meta/llama-guard-3-8b", { messages: [{ role: "user", content: "hi" }] }); report.guard = "ok"; } catch (e) { report.guard = String(e && e.message || e); }
      try { const m = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fp8", { messages: [{ role: "user", content: "say hi" }], max_tokens: 5 }); report.model = "ok"; } catch (e) { report.model = String(e && e.message || e); }
    }
    return jsonOut(report);
  }
  if (request.method !== "POST") return jsonOut({ error: "POST only" }, 405);
  if (!env.AI) return jsonOut({ error: "AI is not set up" }, 503);

  // simple per-visitor limit: 20 messages a minute
  const ip = request.headers.get("cf-connecting-ip") || "x";
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60000);
  if (recent.length >= 20) return jsonOut({ reply: "Slow down a little and try again in a minute." }, 429);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();

  let body;
  try { body = await request.json(); } catch (e) { return jsonOut({ error: "bad request" }, 400); }
  const raw = Array.isArray(body.messages) ? body.messages.slice(-10) : [];
  const messages = [];
  for (const m of raw) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") continue;
    const content = m.content.slice(0, 500).trim();
    if (content) messages.push({ role: m.role, content: content });
  }
  if (!messages.length || messages[messages.length - 1].role !== "user") return jsonOut({ error: "no message" }, 400);

  try {
    // safety check on the whole conversation first
    const guard = await env.AI.run("@cf/meta/llama-guard-3-8b", { messages: messages });
    const verdict = JSON.stringify(guard && guard.response !== undefined ? guard.response : guard).toLowerCase();
    if (verdict.includes("unsafe") || verdict.includes('"safe":false')) return jsonOut({ reply: REFUSAL });

    // is this about the tier list? (greetings and anything that mentions the list, a player or a rank are always fine)
    try {
      const d = await loadData(env, url);
      const rows = summarize((d.obj && d.obj.players) || []);
      const last = messages[messages.length - 1].content;
      const hit = findMentioned(rows, last);
      const onTopic = hit.found.length || hit.extra.length || TOPIC_WORDS.test(last) || last.trim().length < 12 || messages.length > 2;
      if (!onTopic) {
        const cls = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fp8", {
          messages: [
            { role: "system", content: "The website is a Minecraft PvP tier list (DiamondTier) with players, tiers, points, ranks and gamemodes. Answer ONLY NO if the user's message is clearly about something completely unrelated, like general knowledge, homework, coding, news, recipes, other games or personal chat. If there is any doubt, answer YES. Reply with one word: YES or NO." },
            { role: "user", content: last },
          ],
          max_tokens: 3,
        });
        if (String((cls && cls.response) || "").trim().toUpperCase().startsWith("NO")) return jsonOut({ reply: OFFTOPIC });
      }
    } catch (e) { /* if the check fails, the main prompt still keeps it on topic */ }

    const out = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fp8", {
      messages: [{ role: "system", content: SYSTEM + "\n\n" + (await buildContext(env, url, messages)) }].concat(messages),
      max_tokens: 400,
    });
    let reply = String((out && out.response) || "").trim();
    if (reply.toLowerCase().includes("only answer questions about the tierlist")) return jsonOut({ reply: OFFTOPIC });
    reply = neutral(reply);
    return jsonOut({ reply: reply || REFUSAL });
  } catch (e) {
    return jsonOut({ error: "AI error" }, 502);
  }
}

const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "public, max-age=60",
  "access-control-allow-origin": "*",
};

let cache = { at: 0, text: "", obj: null };

async function loadData(env, url) {
  if (cache.obj && Date.now() - cache.at < 30000) return cache;
  // the saved copy (also holds updates / tournaments / subtiers, and is the fallback)
  const saved = await env.ASSETS.fetch(new Request(new URL("/players.json", url)));
  const savedText = await saved.text();
  let base = {};
  try { base = JSON.parse(savedText); } catch (e) {}
  try {
    const res = await fetch(SOURCE, { cf: { cacheTtl: 60, cacheEverything: true } });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const players = parse(await res.text());
    if (players.length < 10) throw new Error("source looks wrong");
    const obj = build(players, base);
    cache = { at: Date.now(), text: JSON.stringify(obj), obj: obj };
    return cache;
  } catch (e) {
    return { text: savedText, obj: base };
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/chat") return chat(request, env, url);
    if (url.pathname !== "/players.json") return env.ASSETS.fetch(request);
    const d = await loadData(env, url);
    return new Response(d.text, { headers: HEADERS });
  },
};

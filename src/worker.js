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
    const name = line.slice(0, at).trim();
    const tiers = {};
    for (const part of line.slice(at + 3).split("|")) {
      const m = part.match(/^\s*(\w+):\s*([HL]T[1-5])/);
      if (m && MODES.includes(m[1])) tiers[m[1]] = m[2];
    }
    if (name && Object.keys(tiers).length) players.push({ name: name, tiers: tiers });
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
    if (regions[name.toLowerCase()]) entry.region = regions[name.toLowerCase()];
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
  return result;
}


// ---------- AI assistant (/api/chat) ----------
const SYSTEM = [
  "You are the AI assistant on DiamondTier, a Minecraft PvP tier list website. Be friendly, clear and brief.",
  "You can answer general questions about anything, plus Minecraft and DiamondTier.",
  "DiamondTier facts: gamemodes are Crystal, Sword, Axe, Mace, Netherite Pot, UHC, Diamond SMP and SMP.",
  "Tiers go HT1, LT1, HT2, LT2, HT3, LT3, HT4, LT4, HT5, LT5 (HT1 best). Points: 70, 55, 46, 32, 25, 13, 7, 4, 2, 1 in that order.",
  "There is also a DiamondTier Tags Fabric mod for Minecraft 1.21.11 that shows tiers above players' heads.",
  "Keep everything safe for work and family-friendly. Never produce sexual, 18+, graphic violence, hateful, self-harm or illegal content.",
  "If someone asks for something like that or sends nonsense or spam, reply only with: I can't help with that.",
].join(" ");

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
  rows.forEach((r) => { r.rank = rows.filter((o) => o.pts > r.pts).length + 1; });
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

async function buildContext(env, url, messages) {
  const d = await loadData(env, url);
  const obj = d.obj || {};
  const rows = summarize(obj.players || []);
  const text = messages.filter((m) => m.role === "user").slice(-3).map((m) => m.content.toLowerCase()).join(" \n ");
  const found = rows.filter((r) => r.p.name.length >= 3 && text.includes(r.p.name.toLowerCase())).slice(0, 5);
  let ctx = "Live DiamondTier data. There are " + rows.length + " ranked players. Top 10 overall: " +
    rows.slice(0, 10).map((r) => "#" + r.rank + " " + r.p.name + " (" + r.pts + " pts)").join(", ") + ".";
  if (found.length) ctx += "\nPlayers the user mentioned:\n" + found.map((r) => describe(r, obj.updates)).join("\n");
  else ctx += "\nIf the user asks about a player who is not listed here, say they are not on the list.";
  ctx += "\nIMPORTANT: this site only stores each player's CURRENT tiers. It does not store previous tiers, test dates or when someone started. If asked, say that history isn't tracked yet. Never invent tiers, dates or points; only use the data above.";
  return ctx;
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

    const out = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [{ role: "system", content: SYSTEM + "\n\n" + (await buildContext(env, url, messages)) }].concat(messages),
      max_tokens: 400,
    });
    const reply = String((out && out.response) || "").trim();
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

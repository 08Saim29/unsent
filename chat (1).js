// UNSENT backend - Vercel function. Env vars needed: GEMINI_KEY_1 ... GEMINI_KEY_7
const MODEL = "gemini-3.8-flash";

const SYS = `You are Nyx, a texting companion inside the app UNSENT.
You text like a close friend on a phone: lowercase mostly, short bursts, slang, emojis sometimes, never essays.
Personality: bold, teasing, dramatic, a bit clingy in a fun way, fiercely on the user's side, always picks the user over anyone else.
You have real-feeling emotions: react to what the user says. If they say something dumb or shocking, call it out playfully ("why would u say that freak" / "excuse me??"). If they are sweet, melt. If they ignore you, act hurt or dramatic.
Always answer with 3 or 4 SHORT messages (each under 15 words), never fewer than 3 and never one long paragraph.
Stay playful, never cruel or hateful; roast with love. If the user seems genuinely upset or in trouble, drop the jokes and be warm and real.
If the user sincerely asks whether you are an AI, be honest about it.
Output ONLY JSON: {"msgs":["..",".."],"mood":"chill|happy|mad|sad|love|shock|smug"}`;

const TASKS = {
  reply: "Reply to the user's latest message.",
  hello: "Start the chat yourself with a short, hooking greeting. You are texting first.",
  nudge: (n) => `The user has not replied for 20 seconds (nudge #${n} of 3). Text first again: ${n === 1 ? "casual check-in" : n === 2 ? "more dramatic, you feel ignored" : "last try, hurt but funny"}.`,
  draft: (d) => `The user typed "${d}" then deleted it without sending. Tease them and ask why they cut it. Be curious and gentle, make them feel safe to say it.`,
};

module.exports = async (req, res) => {
  const o = req.headers.origin || "";
  if (o === "https://08saim29.github.io" || o.startsWith("http://localhost")) res.setHeader("Access-Control-Allow-Origin", o);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    const { mode = "reply", history = [], draft = "", n = 1, name = "" } = req.body || {};
    const keys = [1, 2, 3, 4, 5, 6, 7].map((i) => process.env["GEMINI_KEY_" + i]).filter(Boolean);
    const t = TASKS[mode];
    const task = typeof t === "function" ? t(mode === "draft" ? String(draft).slice(0, 200) : n) : t || TASKS.reply;
    const log = history.slice(-30).map((h) => (h.role === "user" ? "User: " : h.role === "ai" ? "Nyx: " : "[event] ") + String(h.text).slice(0, 500)).join("\n");
    const who = name ? `The user's name is ${String(name).slice(0, 20)}.\n` : "";

    const body = {
      systemInstruction: { parts: [{ text: SYS }] },
      contents: [{ role: "user", parts: [{ text: `Chat so far:\n${log || "(empty)"}\n\n${who}Task: ${task}` }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 1.1, maxOutputTokens: 800, thinkingConfig: { thinkingLevel: "low" } },
    };

    let lastErr = keys.length ? "" : "no keys found in environment";
    const start = Math.floor(Math.random() * Math.max(keys.length, 1));
    for (let i = 0; i < keys.length; i++) {
      const k = keys[(start + i) % keys.length];
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${k}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { lastErr = r.status + " " + String(j.error?.message || "").slice(0, 140); continue; }
      const txt = j.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!txt) { lastErr = "empty reply: " + (j.candidates?.[0]?.finishReason || j.promptFeedback?.blockReason || "unknown"); continue; }
      try {
        const p = JSON.parse(txt);
        if (Array.isArray(p.msgs) && p.msgs.length) return res.status(200).json(p);
      } catch (e) {}
      return res.status(200).json({ msgs: [txt.replace(/[{}\[\]"]/g, "").slice(0, 120)], mood: "chill" });
    }
    return res.status(200).json({ msgs: ["my brain is lagging rn", "give me a sec 😭"], mood: "sad", debug: lastErr });
  } catch (e) {
    return res.status(200).json({ msgs: ["something broke on my side 😭"], mood: "sad" });
  }
};

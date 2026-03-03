export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const key = process.env.ANTHROPIC_KEY;
  if (!key) {
    return res.status(500).json({ error: "ANTHROPIC_KEY not configured" });
  }

  try {
    const body = req.body;
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();

    if (!response.ok) {
      console.error("Anthropic error:", response.status, text.slice(0, 300));
      return res.status(response.status).json({ error: text });
    }

    return res.status(200).json(JSON.parse(text));

  } catch (err) {
    console.error("Chat handler error:", err);
    return res.status(500).json({ error: err.message });
  }
}

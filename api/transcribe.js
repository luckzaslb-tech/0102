import FormData from "form-data";

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const key = process.env.OPENAI_KEY;
  if (!key) {
    console.error("OPENAI_KEY env var not set");
    return res.status(500).json({ error: "OPENAI_KEY not configured" });
  }

  try {
    // Collect raw body
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks);

    // Get boundary from content-type
    const contentType = req.headers["content-type"] || "";

    // Re-build multipart form for OpenAI
    // We forward the raw body directly — same content-type with boundary
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": contentType,
        "Content-Length": rawBody.length.toString(),
      },
      body: rawBody,
    });

    const text = await response.text();
    console.log("OpenAI response status:", response.status);
    console.log("OpenAI response:", text.slice(0, 300));

    if (!response.ok) {
      return res.status(response.status).json({ error: text });
    }

    const data = JSON.parse(text);
    return res.status(200).json({ text: data.text || "" });

  } catch (err) {
    console.error("Handler error:", err);
    return res.status(500).json({ error: err.message });
  }
}

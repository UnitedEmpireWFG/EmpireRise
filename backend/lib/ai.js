import OpenAI from "openai"

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

// Minimal, safe call. No max_tokens. No temperature overrides.
export async function aiComplete(prompt, system = "") {
  if (!process.env.OPENAI_API_KEY) {
    return "Hi, quick check in. Open to a short intro chat this week?"
  }
  const model = process.env.OPENAI_MODEL || "gpt-5.1-mini"  // set OPENAI_MODEL if you prefer
  try {
    const r = await client.responses.create({
      model,
      input: [
        { role: "system", content: system },
        { role: "user", content: prompt }
      ]
    })
    // Try output_text first, then fallback
    const text = r.output_text
      || r.content?.[0]?.text?.value
      || r.content?.[0]?.content?.[0]?.text
      || ""
    return (text || "").trim() || "Quick check in. Open to a short intro chat this week?"
  } catch {
    return "Hey, quick hello. Open to a brief intro chat this week?"
  }
}


import Anthropic from 'npm:@anthropic-ai/sdk@0.27.3'

const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' } })

  const { frage_text, musterloesung, antwort } = await req.json()

  if (!frage_text || !musterloesung || !antwort?.trim()) {
    return new Response(JSON.stringify({ punkte: 0, begruendung: 'Keine Antwort eingegeben.' }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  const prompt = `Du bewertest eine Prüfungsantwort im Feuerwehrwesen. Antworte ausschließlich mit einem JSON-Objekt, ohne Erklärungen oder Markdown-Formatierung.

Frage: ${frage_text}
Musterlösung: ${musterloesung}
Antwort des Kameraden: ${antwort}

Bewertungsskala:
- 1.0 = vollständig richtig (alle wesentlichen Aspekte korrekt genannt)
- 0.5 = teilweise richtig (Kernaussage erkannt, aber wichtige Details fehlen oder sind ungenau)
- 0.0 = falsch oder nicht beantwortet

Antworte mit: {"punkte": 0.0/0.5/1.0, "begruendung": "Kurze Begründung auf Deutsch (max. 2 Sätze)"}`

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    })

    let text = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const result = JSON.parse(text)

    // Punkte auf erlaubte Werte beschränken
    const punkte = [0, 0.5, 1].includes(result.punkte) ? result.punkte : (result.punkte >= 0.75 ? 1 : result.punkte >= 0.25 ? 0.5 : 0)

    return new Response(JSON.stringify({ punkte, begruendung: result.begruendung ?? '' }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('Bewertungsfehler:', err)
    return new Response(JSON.stringify({ error: 'Bewertung fehlgeschlagen' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})

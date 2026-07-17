import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*' } })

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // Nur Aufgaben erinnern die heute oder früher fällig sind (überfällig oder heute)
  // Aufgaben ohne Fälligkeitsdatum werden ebenfalls erinnert (kein Datum = sofort relevant)
  const heute = new Date().toISOString().split('T')[0] // YYYY-MM-DD
  const { data: aufgaben } = await supabase
    .from('aufgaben')
    .select('id, titel, faellig_am, zugewiesen_an_wehr, aufgaben_zuweisungen(user_id)')
    .in('status', ['offen', 'in_arbeit'])
    .eq('taeglich_erinnern', true)
    .or(`faellig_am.is.null,faellig_am.lte.${heute}`)

  if (!aufgaben?.length) return new Response(JSON.stringify({ reminded: 0 }), { headers: { 'Content-Type': 'application/json' } })

  // Pro Aufgabe: betroffene User sammeln und Push schicken
  let totalReminded = 0
  for (const aufgabe of aufgaben) {
    const userIds: string[] = (aufgabe.aufgaben_zuweisungen ?? []).map((z: { user_id: string }) => z.user_id)
    const wehrid: string | null = aufgabe.zugewiesen_an_wehr

    const faelligText = aufgabe.faellig_am
      ? ` · Fällig: ${new Date(aufgabe.faellig_am).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}`
      : ''

    // Send-Push-Notification Edge Function aufrufen
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-push-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        user_ids: userIds,
        wehr_id: wehrid,
        title: '🔔 Offene Aufgabe',
        body: `${aufgabe.titel}${faelligText}`,
        url: '/aufgaben',
      }),
    })
    if (res.ok) {
      const { sent } = await res.json()
      totalReminded += sent ?? 0
    }
  }

  return new Response(JSON.stringify({ aufgaben: aufgaben.length, reminded: totalReminded }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

// @ts-ignore – npm: specifier via Deno Node-compat
import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const VAPID_PUBLIC_KEY  = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT     = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@feuerwehr.app'

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' },
    })
  }

  let body: { user_ids?: string[]; wehr_id?: string; title: string; body: string; url?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 })
  }

  const { user_ids, wehr_id, title, body: msgBody, url } = body

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Empfänger-IDs ermitteln
  let targetIds: string[] = user_ids ?? []
  if (wehr_id && targetIds.length === 0) {
    const { data: users } = await supabase
      .from('profiles')
      .select('id')
      .eq('wehr_id', wehr_id)
      .eq('status', 'aktiv')
    targetIds = (users ?? []).map((u: { id: string }) => u.id)
  }

  if (targetIds.length === 0) {
    return new Response(JSON.stringify({ sent: 0, reason: 'no_targets' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Subscriptions aus DB laden
  const { data: subs, error: subErr } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .in('user_id', targetIds)

  if (subErr) {
    console.error('Subscription-Abfrage fehlgeschlagen:', subErr.message)
    return new Response(JSON.stringify({ error: subErr.message }), { status: 500 })
  }

  if (!subs?.length) {
    return new Response(JSON.stringify({ sent: 0, reason: 'no_subscriptions' }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const payload = JSON.stringify({ title, body: msgBody, url: url ?? '/aufgaben' })

  let sent = 0
  let failed = 0
  await Promise.allSettled(subs.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      )
      sent++
    } catch (err) {
      console.warn('Push fehlgeschlagen für endpoint:', sub.endpoint.slice(0, 40), err.message)
      failed++
    }
  }))

  console.info(`Push: ${sent} gesendet, ${failed} fehlgeschlagen von ${subs.length} Subscriptions`)

  return new Response(JSON.stringify({ sent, failed, total: subs.length }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('*, wehr:wehren(id,name,aufgaben_aktiv,drucker_email,einsatzbericht_email,fahrzeuge)')
      .eq('id', userId)
      .single()
    setProfile(data)
    setLoading(false)
    if (data) registerPush(userId)
  }

  async function registerPush(userId) {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
    try {
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready

      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY
        if (!vapidKey) { console.warn('[Push] VITE_VAPID_PUBLIC_KEY fehlt'); return }
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        })
      }

      const json = sub.toJSON()
      const { error } = await supabase.from('push_subscriptions').upsert({
        user_id: userId,
        endpoint: json.endpoint,
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
      }, { onConflict: 'user_id,endpoint' })
      if (error) console.warn('[Push] Subscription speichern fehlgeschlagen:', error.message)
      else console.info('[Push] Subscription gespeichert ✓')
    } catch (err) {
      console.warn('[Push] Registrierung fehlgeschlagen:', err.message)
    }
  }

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  async function signUp(email, password) {
    const { error } = await supabase.auth.signUp({ email, password })
    return { error }
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  async function refreshProfile() {
    if (user) await fetchProfile(user.id)
  }

  const isAdmin = profile?.rolle === 'wehrleiter' || profile?.rolle === 'gemeindebrandmeister'
  const isAusbilder = profile?.rolle === 'ausbilder' || isAdmin
  const isGruppenfuehrer = profile?.rolle === 'gruppenfuehrer' || isAdmin
  const isAktiv = profile?.status === 'aktiv'
  // Aufgaben nur aktiv wenn fuer diese Wache aktiviert ODER Admin
  // profile.wehr kommt als Join-Objekt von Supabase
  const wehrData = Array.isArray(profile?.wehr) ? profile?.wehr?.[0] : profile?.wehr
  // Nur GBM hat immer Zugriff auf Aufgaben, alle anderen brauchen den Wachen-Parameter
  const aufgabenAktiv = profile?.rolle === 'gemeindebrandmeister' || wehrData?.aufgaben_aktiv === true

  return (
    <AuthContext.Provider value={{
      user, profile, loading,
      signIn, signUp, signOut, refreshProfile,
      isAdmin, isAusbilder, isGruppenfuehrer, isAktiv, aufgabenAktiv
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { AVATARE } from '../data/avatare'
import AvatarPicker from '../components/AvatarPicker'
import Avatar from '../components/Avatar'

export default function QuizJoinPage() {
  const { code: codeParam } = useParams()
  const navigate = useNavigate()
  const [code, setCode] = useState((codeParam ?? '').toUpperCase())
  const [session, setSession] = useState(null)
  const [pruefungTitel, setPruefungTitel] = useState('')
  const [pruefen, setPruefen] = useState(false)
  const [fehler, setFehler] = useState('')
  const [name, setName] = useState('')
  const [avatarKey, setAvatarKey] = useState(AVATARE[Math.floor(Math.random() * AVATARE.length)].key)
  const [beitreten, setBeitreten] = useState(false)
  const [eigenesProfil, setEigenesProfil] = useState(null) // Profil des eingeloggten Nutzers, falls vorhanden
  const [alsGast, setAlsGast] = useState(false) // manuell erzwungener Gast-Modus trotz Login
  const [schnellAvatar, setSchnellAvatar] = useState(null) // Avatar-Wahl direkt hier, falls Profil noch keinen hat

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session: authSession } }) => {
      if (!authSession?.user) return
      const { data } = await supabase.from('profiles').select('id,vorname,nachname,avatar_url,avatar_key').eq('id', authSession.user.id).single()
      if (data) setEigenesProfil(data)
    })
  }, [])

  useEffect(() => {
    if (codeParam) pruefeCode(codeParam.toUpperCase())
  }, [codeParam])

  async function pruefeCode(einzugebenderCode) {
    const c = einzugebenderCode.trim().toUpperCase()
    if (c.length < 4) return
    setPruefen(true)
    setFehler('')
    const { data, error } = await supabase.from('quiz_sessions')
      .select('*, pruefung:pruefungen(titel)')
      .eq('code', c).maybeSingle()

    if (error || !data) {
      setFehler('Kein Quiz mit diesem Code gefunden.')
      setSession(null)
    } else if (data.status !== 'lobby') {
      setFehler('Dieses Quiz hat bereits begonnen oder ist beendet. Bitte beim Quizmaster nachfragen.')
      setSession(null)
    } else {
      setSession(data)
      setPruefungTitel(data.pruefung?.titel ?? '')
    }
    setPruefen(false)
  }

  async function handleDirektBeitreten() {
    if (!session || !eigenesProfil) return
    setBeitreten(true)
    setFehler('')

    // Bereits beigetreten (z.B. Seite neu geladen)? Dann bestehenden Eintrag wiederverwenden.
    const { data: bestehend } = await supabase.from('quiz_teilnehmer')
      .select('id').eq('session_id', session.id).eq('profile_id', eigenesProfil.id).maybeSingle()

    let teilnehmerId = bestehend?.id
    if (!teilnehmerId) {
      const hatEigenenAvatar = eigenesProfil.avatar_url || eigenesProfil.avatar_key
      const avatarKeyZuSenden = hatEigenenAvatar ? eigenesProfil.avatar_key : schnellAvatar

      // Hier spontan gewaehlten Avatar auch im Profil hinterlegen, damit er kuenftig erhalten bleibt
      if (!hatEigenenAvatar && schnellAvatar) {
        supabase.from('profiles').update({ avatar_key: schnellAvatar }).eq('id', eigenesProfil.id)
      }

      const { data, error } = await supabase.from('quiz_teilnehmer').insert({
        session_id: session.id,
        profile_id: eigenesProfil.id,
        gast_name: `${eigenesProfil.vorname} ${eigenesProfil.nachname}`.trim(),
        avatar_key: avatarKeyZuSenden,
        avatar_url: eigenesProfil.avatar_url,
      }).select().single()
      if (error) {
        setFehler('Beitritt fehlgeschlagen: ' + error.message)
        setBeitreten(false)
        return
      }
      teilnehmerId = data.id
    }

    localStorage.setItem(`quiz_teilnehmer_${session.id}`, teilnehmerId)
    navigate(`/quiz/${session.id}/play`)
  }

  async function handleGastBeitreten(e) {
    e.preventDefault()
    if (!session || !name.trim()) return
    setBeitreten(true)
    setFehler('')

    const { data, error } = await supabase.from('quiz_teilnehmer').insert({
      session_id: session.id,
      gast_name: name.trim().slice(0, 40),
      avatar_key: avatarKey,
    }).select().single()

    if (error) {
      setFehler('Beitritt fehlgeschlagen: ' + error.message)
      setBeitreten(false)
      return
    }

    localStorage.setItem(`quiz_teilnehmer_${session.id}`, data.id)
    navigate(`/quiz/${session.id}/play`)
  }

  const zeigeGastFormular = !eigenesProfil || alsGast

  return (
    <div style={{
      minHeight: '100vh', background: 'linear-gradient(135deg, #1F2937, #111827)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{ width: '100%', maxWidth: 420, background: 'white', borderRadius: 16, padding: 28, boxShadow: '0 10px 40px rgba(0,0,0,0.3)' }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 36, marginBottom: 4 }}>🚒🎮</div>
          <h2 style={{ margin: 0 }}>Feuerwehr-Quiz</h2>
        </div>

        {fehler && <div className="alert alert-error" style={{ marginBottom: 16 }}>{fehler}</div>}

        {!session ? (
          <form onSubmit={e => { e.preventDefault(); pruefeCode(code) }}>
            <div className="form-group">
              <label>Spiel-Code</label>
              <input
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="z.B. AB3XQ9"
                maxLength={8}
                autoFocus
                style={{ fontSize: 24, textAlign: 'center', letterSpacing: 4, fontWeight: 700, textTransform: 'uppercase' }}
              />
            </div>
            <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center' }} disabled={pruefen || code.trim().length < 4}>
              {pruefen ? 'Prüfe...' : 'Weiter →'}
            </button>
          </form>
        ) : (
          <>
            {pruefungTitel && <p style={{ textAlign: 'center', marginBottom: 16, fontWeight: 500 }}>{pruefungTitel}</p>}

            {!zeigeGastFormular ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                <Avatar
                  url={eigenesProfil.avatar_url}
                  avatarKey={eigenesProfil.avatar_key ?? schnellAvatar}
                  name={`${eigenesProfil.vorname} ${eigenesProfil.nachname}`}
                  size={64}
                />
                <div style={{ fontWeight: 600, fontSize: 17 }}>{eigenesProfil.vorname} {eigenesProfil.nachname}</div>

                {!eigenesProfil.avatar_url && !eigenesProfil.avatar_key && (
                  <div style={{ width: '100%' }}>
                    <div style={{ fontSize: 12, color: 'var(--gray-400)', textAlign: 'center', marginBottom: 8 }}>
                      Du hast noch kein Profilbild — Avatar wählen (optional, du kannst auch ohne spielen)
                    </div>
                    <AvatarPicker value={schnellAvatar} onChange={setSchnellAvatar} size={40} />
                  </div>
                )}

                <button type="button" className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center' }} disabled={beitreten} onClick={handleDirektBeitreten}>
                  {beitreten ? 'Trete bei...' : 'Als ich beitreten 🚀'}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAlsGast(true)}>
                  Stattdessen mit anderem Namen beitreten
                </button>
              </div>
            ) : (
              <form onSubmit={handleGastBeitreten}>
                <div className="form-group">
                  <label>Dein Name</label>
                  <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Wie sollen dich die anderen sehen?"
                    maxLength={40}
                    autoFocus
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Avatar</label>
                  <AvatarPicker value={avatarKey} onChange={setAvatarKey} />
                </div>

                <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} disabled={beitreten || !name.trim()}>
                  {beitreten ? 'Trete bei...' : 'Beitreten 🚀'}
                </button>

                {eigenesProfil && (
                  <button type="button" className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: 6 }} onClick={() => setAlsGast(false)}>
                    Zurück zu „Als {eigenesProfil.vorname} beitreten“
                  </button>
                )}
              </form>
            )}
          </>
        )}
      </div>
    </div>
  )
}

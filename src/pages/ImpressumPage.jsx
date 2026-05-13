import { Link } from 'react-router-dom'

export default function ImpressumPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--gray-800)', padding: '32px 16px' }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>

        {/* Zurueck-Link */}
        <div style={{ marginBottom: 20 }}>
          <Link to="/login" style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15,18 9,12 15,6"/></svg>
            Zurueck zur Anmeldung
          </Link>
        </div>

        <div style={{ background: 'white', borderRadius: 16, padding: '28px 28px', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Impressum</h1>
          <p style={{ fontSize: 13, color: 'var(--gray-400)', marginBottom: 28 }}>Angaben gemaess § 5 TMG</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            <section>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--gray-700)', marginBottom: 8 }}>Verantwortlicher</h2>
              <div style={{ fontSize: 14, color: 'var(--gray-600)', lineHeight: 1.8 }}>
                Freiwillige Feuerwehr Grammetal<br />
                Gemeinde Grammetal<br />
                Erfurter Strasse 28<br />
                99510 Nohra
              </div>
            </section>

            <section>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--gray-700)', marginBottom: 8 }}>Kontakt</h2>
              <div style={{ fontSize: 14, color: 'var(--gray-600)', lineHeight: 1.8 }}>
                Gemeindebrandmeister der Gemeinde Grammetal<br />
                E-Mail: info@feuerwehr-grammetal.de
              </div>
            </section>

            <section>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--gray-700)', marginBottom: 8 }}>Zweck des Dienstes</h2>
              <p style={{ fontSize: 14, color: 'var(--gray-600)', lineHeight: 1.7 }}>
                Dieses Organisationstool dient der internen Verwaltung der Freiwilligen Feuerwehr Grammetal.
                Es handelt sich um eine nicht-oeffentliche Anwendung, die ausschliesslich fuer Mitglieder
                der Feuerwehr Grammetal und ihrer Ortswehren bestimmt ist. Ein Zugang ist nur mit
                einem persoenlich zugewiesenen Nutzerkonto moeglich.
              </p>
            </section>

            <section>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--gray-700)', marginBottom: 8 }}>Haftungsausschluss</h2>
              <p style={{ fontSize: 14, color: 'var(--gray-600)', lineHeight: 1.7 }}>
                Die Inhalte dieser Anwendung wurden mit groesster Sorgfalt erstellt. Fuer die Richtigkeit,
                Vollstaendigkeit und Aktualitaet der Inhalte uebernehmen wir jedoch keine Gewaehr.
                Als Diensteanbieter sind wir gemaess § 7 Abs. 1 TMG fuer eigene Inhalte auf diesen
                Seiten nach den allgemeinen Gesetzen verantwortlich.
              </p>
            </section>

            <section>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--gray-700)', marginBottom: 8 }}>Technischer Betrieb</h2>
              <div style={{ fontSize: 14, color: 'var(--gray-600)', lineHeight: 1.8 }}>
                Hosting: Netlify, Inc. (Frankfurt, Deutschland)<br />
                Datenbankdienst: Supabase, Inc. (Frankfurt, Deutschland)
              </div>
            </section>

          </div>

          <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--gray-100)', fontSize: 12, color: 'var(--gray-400)' }}>
            Stand: {new Date().toLocaleDateString('de-DE', { month: '2-digit', year: 'numeric' })} &nbsp;|&nbsp;{' '}
            <Link to="/datenschutz-public" style={{ color: 'var(--gray-400)' }}>Datenschutzerklaerung</Link>
          </div>
        </div>

      </div>
    </div>
  )
}

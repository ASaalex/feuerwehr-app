import { useAuth } from '../context/AuthContext'

export default function DatenschutzPage() {
  const { profile } = useAuth()

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="page-header">
        <div>
          <h1>Datenschutz</h1>
          <p style={{ marginTop: 4 }}>Interne Datenschutzvereinbarung</p>
        </div>
      </div>

      <div className="alert alert-info" style={{ marginBottom: 24 }}>
        Diese Vereinbarung regelt den Umgang mit personenbezogenen Daten im Feuerwehr-Organisationstool.
        Bei Fragen wende dich an deinen Wehrleiter.
      </div>

      {[
        {
          nr: '1', titel: 'Verantwortlicher',
          inhalt: 'Verantwortlich fuer die Verarbeitung personenbezogener Daten ist der jeweilige Wehrleiter der Ortsfeuerwehr. Die Kontaktdaten sind ueber die Kameradenverwaltung einsehbar.'
        },
        {
          nr: '2', titel: 'Zweck der Datenverarbeitung',
          inhalt: null,
          liste: [
            'Verwaltung der Mitgliedschaft und Einsatzbereitschaft der Kameraden',
            'Organisation von Ausbildungen und Ueberpruefung des Wissenstandes',
            'Zuweisung und Verfolgung von internen Aufgaben',
            'Bereitstellung von Dienstanweisungen und Ausbildungsunterlagen',
          ]
        },
        {
          nr: '3', titel: 'Verarbeitete Daten',
          inhalt: null,
          unterAbschnitte: [
            {
              titel: 'Stammdaten',
              liste: ['Vor- und Nachname', 'Geburtsdatum', 'Eintrittsdatum', 'Nutzername (internes Login)', 'Telefonnummer (freiwillig)', 'Adresse (freiwillig)']
            },
            {
              titel: 'Qualifikationen',
              liste: ['Fuehrerscheinklassen', 'Atemschutztraeger-Status', 'Absolvierte Lehrgaenge']
            },
            {
              titel: 'Zahlungsdaten (freiwillig)',
              liste: ['IBAN und BIC — nur zur automatischen Befuellung des Auslagenerstattungsformulars', 'Nur fuer den Nutzer selbst sichtbar — kein Administrator kann diese Daten einsehen', 'Freiwillige Angabe, jederzeit loeschbar']
            },
            {
              titel: 'Nutzungsdaten',
              liste: ['Ergebnisse abgelegter Pruefungen', 'Zugewiesene und bearbeitete Aufgaben', 'Kommentare zu Aufgaben']
            }
          ]
        },
        {
          nr: '4', titel: 'Rechtsgrundlage',
          inhalt: null,
          liste: [
            'Art. 6 Abs. 1 lit. b DSGVO (Erfuellung eines Vertrages / Mitgliedschaft)',
            'Art. 6 Abs. 1 lit. c DSGVO (Erfuellung rechtlicher Verpflichtungen)',
            'Art. 6 Abs. 1 lit. f DSGVO (berechtigte Interessen der Feuerwehr)',
          ]
        },
        {
          nr: '5', titel: 'Technische Sicherheit',
          inhalt: null,
          liste: [
            'Verschluesselte Uebertragung aller Daten (HTTPS/TLS)',
            'Passwortgeschuetzter Zugang fuer jeden Nutzer',
            'Rollenbasierte Zugriffskontrolle',
            'Datenspeicherung auf Servern in der EU (Frankfurt, Deutschland)',
            'Automatische Passwortverschluesselung (bcrypt)',
          ]
        },
        {
          nr: '5b', titel: 'Besondere Hinweise zu Zahlungsdaten',
          inhalt: 'Die Angabe von IBAN und BIC ist freiwillig und dient ausschliesslich der automatischen Befuellung des Auslagenerstattungsformulars. Diese Daten werden verschluesselt gespeichert und sind technisch so abgesichert, dass ausschliesslich der jeweilige Nutzer selbst Zugriff hat. Kein Administrator, Wehrleiter oder anderer Nutzer kann diese Daten einsehen. Die Angabe kann jederzeit im eigenen Profil geloescht werden.',
        },
        {
          nr: '6', titel: 'Eingesetzte Dienstleister',
          inhalt: null,
          dienstleister: [
            { name: 'Supabase Inc.', beschreibung: 'Datenbank und Authentifizierung', ort: 'Frankfurt, Deutschland (EU)', avv: 'Ja, unter supabase.com/legal' },
            { name: 'Vercel Inc.', beschreibung: 'Hosting der Webanwendung', ort: 'EU-Server', avv: 'Keine Datenspeicherung' },
          ]
        },
        {
          nr: '7', titel: 'Deine Rechte',
          inhalt: 'Als betroffene Person hast du folgende Rechte gegenueber dem Verantwortlichen:',
          liste: [
            'Auskunft ueber gespeicherte Daten (Art. 15 DSGVO)',
            'Berichtigung unrichtiger Daten (Art. 16 DSGVO)',
            'Loeschung deiner Daten (Art. 17 DSGVO)',
            'Einschraenkung der Verarbeitung (Art. 18 DSGVO)',
            'Widerspruch gegen die Verarbeitung (Art. 21 DSGVO)',
          ]
        },
        {
          nr: '8', titel: 'Speicherdauer',
          inhalt: 'Personenbezogene Daten werden gespeichert, solange eine aktive Mitgliedschaft besteht. Nach Austritt werden Daten auf Antrag oder spaetestens nach 2 Jahren geloescht, sofern keine gesetzlichen Aufbewahrungspflichten entgegenstehen.'
        },
      ].map(abschnitt => (
        <div key={abschnitt.nr} className="card" style={{ marginBottom: 12 }}>
          <h3 style={{ marginBottom: 12, fontSize: 15, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--red)', color: 'white', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
              {abschnitt.nr}
            </span>
            {abschnitt.titel}
          </h3>

          {abschnitt.inhalt && (
            <p style={{ fontSize: 14, color: 'var(--gray-600)', lineHeight: 1.6, marginBottom: abschnitt.liste ? 10 : 0 }}>
              {abschnitt.inhalt}
            </p>
          )}

          {abschnitt.liste && (
            <ul style={{ paddingLeft: 20, margin: 0 }}>
              {abschnitt.liste.map((item, i) => (
                <li key={i} style={{ fontSize: 14, color: 'var(--gray-600)', lineHeight: 1.6, marginBottom: 4 }}>{item}</li>
              ))}
            </ul>
          )}

          {abschnitt.unterAbschnitte && abschnitt.unterAbschnitte.map((ua, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 6, marginTop: i > 0 ? 10 : 0 }}>{ua.titel}</div>
              <ul style={{ paddingLeft: 20, margin: 0 }}>
                {ua.liste.map((item, j) => (
                  <li key={j} style={{ fontSize: 14, color: 'var(--gray-600)', lineHeight: 1.6, marginBottom: 2 }}>{item}</li>
                ))}
              </ul>
            </div>
          ))}

          {abschnitt.dienstleister && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {abschnitt.dienstleister.map((d, i) => (
                <div key={i} style={{ background: 'var(--gray-50)', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--gray-700)', marginBottom: 4 }}>{d.name}</div>
                  <div style={{ fontSize: 13, color: 'var(--gray-500)' }}>{d.beschreibung} · {d.ort}</div>
                  <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>AVV: {d.avv}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Unterschrift-Hinweis */}
      <div className="card" style={{ borderLeft: '3px solid var(--red)', marginTop: 20 }}>
        <h3 style={{ marginBottom: 8 }}>Einwilligung</h3>
        <p style={{ fontSize: 14, color: 'var(--gray-600)', lineHeight: 1.6 }}>
          Mit der Nutzung dieses Systems erklaerst du dich mit dieser Datenschutzvereinbarung einverstanden.
          Dein Wehrleiter wird dir eine ausgedruckte Version zur Unterschrift vorlegen.
        </p>
        <div style={{ marginTop: 10, padding: '10px 14px', background: 'var(--gray-50)', borderRadius: 8, fontSize: 13, color: 'var(--gray-500)' }}>
          Die Angabe von Zahlungsdaten (IBAN/BIC) erfolgt freiwillig und beruht auf einer gesonderten
          informierten Einwilligung durch das Ausfullen des entsprechenden Feldes im eigenen Profil.
          Diese Einwilligung kann jederzeit durch Loeschen der Daten im Profil widerrufen werden.
        </div>
        <p style={{ fontSize: 13, color: 'var(--gray-400)', marginTop: 8 }}>
          Stand: {new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
        </p>
      </div>
    </div>
  )
}

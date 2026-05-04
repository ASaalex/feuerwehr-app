import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const STUNDENSATZ = 32

export default function VerdienstausfallModal({ onClose }) {
  const { profile } = useAuth()
  const [profileDaten, setProfileDaten] = useState(null)
  const [loading, setLoading] = useState(true)

  const heute = new Date().toISOString().slice(0, 10)

  const [form, setForm] = useState({
    ortsteil: '',
    name: '',
    vorname: '',
    anschrift: '',
    kontoinhaber: '',
    bankname: '',
    iban: '',
    bic: '',
    datum_von: heute,
    datum_bis: '',
    uhrzeit_von: '',
    uhrzeit_bis: '',
    stunden: '',
    summe: '',
  })

  useEffect(() => {
    async function laden() {
      const { data } = await supabase.from('profiles')
        .select('vorname,nachname,strasse,plz,ort,iban,bic,bankname,wehr:wehren(name)')
        .eq('id', profile?.id).single()

      if (data) {
        setProfileDaten(data)
        const wehrName = Array.isArray(data.wehr) ? data.wehr[0]?.name : data.wehr?.name
        const anschriftTeile = [
          data.strasse,
          data.plz && data.ort ? `${data.plz} ${data.ort}` : (data.plz ?? data.ort ?? '')
        ].filter(Boolean)

        setForm(f => ({
          ...f,
          ortsteil: wehrName ?? '',
          name: data.nachname ?? '',
          vorname: data.vorname ?? '',
          anschrift: anschriftTeile.join(', '),
          kontoinhaber: `${data.nachname ?? ''}, ${data.vorname ?? ''}`.trim().replace(/^,\s*/, ''),
          bankname: data.bankname ?? '',
          iban: data.iban ?? '',
          bic: data.bic ?? '',
        }))
      }
      setLoading(false)
    }
    laden()
  }, [])

  useEffect(() => {
    berechneStunden()
  }, [form.uhrzeit_von, form.uhrzeit_bis, form.datum_von, form.datum_bis])

  function berechneStunden() {
    if (!form.uhrzeit_von || !form.uhrzeit_bis) {
      setForm(f => ({ ...f, stunden: '', summe: '' }))
      return
    }

    const [vH, vM] = form.uhrzeit_von.split(':').map(Number)
    const [bH, bM] = form.uhrzeit_bis.split(':').map(Number)

    // Startdatum und Enddatum bestimmen
    const startDatum = form.datum_von ? new Date(form.datum_von + 'T00:00:00') : new Date()
    const endDatum = form.datum_bis ? new Date(form.datum_bis + 'T00:00:00') : startDatum

    // Anzahl Tage
    const tageAnzahl = Math.round((endDatum - startDatum) / (1000 * 60 * 60 * 24)) + 1

    let gesamteAbrechnungsMinuten = 0

    for (let t = 0; t < tageAnzahl; t++) {
      const aktDatum = new Date(startDatum)
      aktDatum.setDate(aktDatum.getDate() + t)

      // Wochentag pruefen (0=So, 6=Sa)
      const wochentag = aktDatum.getDay()
      if (wochentag === 0 || wochentag === 6) continue // Wochenende ueberspringen

      // Von-Zeit fuer diesen Tag
      let tagVonMin = t === 0 ? (vH * 60 + vM) : 0  // erster Tag: ab Von-Uhrzeit, sonst ab Mitternacht
      let tagBisMin = t === tageAnzahl - 1 ? (bH * 60 + bM) : 24 * 60  // letzter Tag: bis Bis-Uhrzeit, sonst bis Mitternacht

      // Auf 07:00-18:00 begrenzen
      tagVonMin = Math.max(tagVonMin, 7 * 60)   // fruehestens 07:00
      tagBisMin = Math.min(tagBisMin, 18 * 60)  // spaetestens 18:00

      let tagMinuten = tagBisMin - tagVonMin
      if (tagMinuten < 0) tagMinuten = 0

      // Max 8 Stunden pro Tag
      tagMinuten = Math.min(tagMinuten, 8 * 60)

      gesamteAbrechnungsMinuten += tagMinuten
    }

    if (gesamteAbrechnungsMinuten <= 0) {
      setForm(f => ({ ...f, stunden: '0', summe: '0,00' }))
      return
    }

    // Abrundungsregel: bis 30 Min = halber Satz, darueber = voller Satz
    const volleStunden = Math.floor(gesamteAbrechnungsMinuten / 60)
    const restMinuten = gesamteAbrechnungsMinuten % 60
    const abrechnungsStunden = restMinuten === 0 ? volleStunden
      : restMinuten <= 30 ? volleStunden + 0.5
      : volleStunden + 1

    const summe = abrechnungsStunden * STUNDENSATZ

    setForm(f => ({
      ...f,
      stunden: abrechnungsStunden % 1 === 0 ? String(abrechnungsStunden) : abrechnungsStunden.toString().replace('.', ','),
      summe: summe.toLocaleString('de-DE', { minimumFractionDigits: 2 })
    }))
  }

  function formatDatum(iso) {
    if (!iso) return ''
    return new Date(iso + 'T12:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  function datumAnzeige() {
    if (!form.datum_von) return ''
    if (!form.datum_bis || form.datum_bis === form.datum_von) return formatDatum(form.datum_von)
    return `${formatDatum(form.datum_von)} bis ${formatDatum(form.datum_bis)}`
  }

  function drucken() {

    const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<title>Antrag Verdienstausfall - ${form.ortsteil}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 10pt; padding: 20mm 20mm 15mm 20mm; color: #000; }

  /* Titel zentriert */
  .titel { text-align: center; margin-bottom: 6mm; }
  .titel p { line-height: 1.5; }
  .titel .bold { font-weight: bold; }

  /* Ortsteil + Adresse nebeneinander */
  .kopf-zeile { display: flex; gap: 0; margin-bottom: 6mm; }
  .kopf-links { flex: 1; }
  .kopf-links .ortsteil-zeile { display: flex; align-items: baseline; gap: 4px; margin-bottom: 4mm; }
  .ortsteil-linie { flex: 1; border-bottom: 1px solid #000; }
  .adresse { font-size: 9.5pt; line-height: 1.6; }

  /* Ueberschriften */
  .section-h1 { font-weight: bold; margin-bottom: 2mm; }
  .section-h2 { font-weight: bold; margin-bottom: 2mm; margin-top: 3mm; }

  /* Tabellen */
  table { width: 100%; border-collapse: collapse; margin-bottom: 4mm; }
  td { border: 1px solid #000; padding: 2px 5px; font-size: 9.5pt; vertical-align: middle; }
  .label-cell { background: #fff; }
  .value-cell { background: #fff; }
  .header-left { font-weight: bold; }

  /* Bankverbindung linke Spalte verbunden */
  .bank-label { writing-mode: horizontal-tb; }

  /* IBAN Kaestchen */
  .iban-row td, .bic-row td { border: 1px solid #555; width: 16px; min-width: 16px; height: 16px; text-align: center; font-size: 9pt; padding: 0; }
  .kaestchen-wrap { display: flex; gap: 0; }
  .kaestchen-wrap .k { border: 1px solid #555; width: 16px; height: 16px; display: inline-flex; align-items: center; justify-content: center; font-size: 9pt; font-family: monospace; }
  .kaestchen-gap { width: 4px; display: inline-block; }

  /* Einsatz Tabelle */
  .einsatz-datum { width: 40%; }
  .einsatz-von-label { width: 8%; }
  .einsatz-von-val { width: 20%; }
  .einsatz-bis-label { width: 8%; }
  .einsatz-bis-val { width: 20%; }

  /* Abrechnung */
  .abrech-label { width: 30%; }
  .abrech-mid { width: 55%; }
  .abrech-val { width: 15%; text-align: right; font-weight: bold; }

  /* Versicherung */
  .versicherung { margin-bottom: 6mm; font-size: 9.5pt; line-height: 1.5; }

  /* Unterschriften */
  .sign-line { border-top: 1px solid #000; margin-top: 16mm; padding-top: 2px; font-size: 8.5pt; }
  .sign-wrap { display: flex; gap: 10mm; margin-bottom: 8mm; }
  .sign-block { flex: 1; }

  /* Erlaeuterungen */
  .erlaeuterungen { font-size: 8.5pt; margin-top: 4mm; }
  .erlaeuterungen ul { padding-left: 5mm; }
  .erlaeuterungen li { margin-bottom: 2mm; }

  @media print {
    @page { size: A4; margin: 0; }
    body { padding: 18mm 18mm 12mm 18mm; }
  }
</style>
</head>
<body>

<!-- Titel -->
<div class="titel">
  <p class="bold">Antrag</p>
  <p class="bold">(Selbst&auml;ndige oder Freiberufler)</p>
  <p>auf Erstattung des Verdienstausfalls</p>
</div>

<!-- Ortsteil + Adresse -->
<div class="kopf-zeile">
  <div class="kopf-links">
    <div class="ortsteil-zeile">
      <span style="white-space:nowrap">bei Eins&auml;tzen der FFw Grammetal Ortsteilfeuerwehr</span>
      <span class="ortsteil-linie">&nbsp;${form.ortsteil}&nbsp;</span>
    </div>
    <div class="adresse">
      Gemeinde Grammetal<br>
      Schlo&szlig;gasse 19<br>
      99428 Grammetal
    </div>
  </div>
</div>

<!-- Abschnitt 1 -->
<p class="section-h1">1. Angaben zum Antragsteller <span style="font-weight:normal">(durch den Antragssteller auszuf&uuml;llen)</span></p>
<p class="section-h2">1.1&nbsp; Angaben zum Antragsteller:</p>

<!-- Tabelle Antragsteller -->
<table>
  <colgroup>
    <col style="width:28%">
    <col style="width:72%">
  </colgroup>
  <tr>
    <td class="label-cell">Name, Vorname</td>
    <td class="value-cell">${form.name}${form.name && form.vorname ? ', ' : ''}${form.vorname}</td>
  </tr>
  <tr>
    <td class="label-cell">Anschrift</td>
    <td class="value-cell" style="height:24px">${form.anschrift}</td>
  </tr>
  <tr>
    <td class="label-cell" rowspan="4" style="vertical-align:middle; font-size:9pt">Bank-<br>verbind-<br>ung</td>
    <td>
      <table style="border:none; margin:0; width:100%">
        <colgroup><col style="width:35%"><col style="width:65%"></colgroup>
        <tr>
          <td style="border:none; border-right:1px solid #000; padding:2px 5px">Name des Kontoinhabers</td>
          <td style="border:none; padding:2px 5px">${form.kontoinhaber}</td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td>
      <table style="border:none; margin:0; width:100%">
        <colgroup><col style="width:35%"><col style="width:65%"></colgroup>
        <tr>
          <td style="border:none; border-right:1px solid #000; padding:2px 5px">Name und Sitz der Bank</td>
          <td style="border:none; padding:2px 5px">${form.bankname}</td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td>
      <table style="border:none; margin:0; width:100%">
        <colgroup><col style="width:35%"><col style="width:65%"></colgroup>
        <tr>
          <td style="border:none; border-right:1px solid #000; padding:2px 5px">IBAN</td>
          <td style="border:none; padding:2px 5px; font-family:monospace; letter-spacing:1px">${form.iban}</td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td>
      <table style="border:none; margin:0; width:100%">
        <colgroup><col style="width:35%"><col style="width:65%"></colgroup>
        <tr>
          <td style="border:none; border-right:1px solid #000; padding:2px 5px">BIC</td>
          <td style="border:none; padding:2px 5px; font-family:monospace; letter-spacing:1px">${form.bic}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<!-- Tabelle Einsatz -->
<table>
  <colgroup>
    <col style="width:12%">
    <col style="width:35%">
    <col style="width:8%">
    <col style="width:20%">
    <col style="width:5%">
    <col style="width:20%">
  </colgroup>
  <tr>
    <td rowspan="2" style="vertical-align:middle">Einsatz</td>
    <td>Datum</td>
    <td colspan="4">${datumAnzeige()}</td>
  </tr>
  <tr>
    <td>Uhrzeit</td>
    <td>von</td>
    <td>${form.uhrzeit_von ? form.uhrzeit_von + ' Uhr' : ''}</td>
    <td>bis</td>
    <td>${form.uhrzeit_bis ? form.uhrzeit_bis + ' Uhr' : ''}</td>
  </tr>
</table>

<!-- 1.2 Überschrift -->
<p class="section-h2">1.2. f&uuml;r den Einsatzzeitraum entstandener Verdienstausfall:</p>

<!-- Tabelle Abrechnung -->
<table>
  <colgroup>
    <col style="width:28%">
    <col style="width:57%">
    <col style="width:15%">
  </colgroup>
  <tr>
    <td rowspan="2" style="vertical-align:middle">Abrechnung</td>
    <td>Anzahl Stunden &agrave; ${STUNDENSATZ} Euro</td>
    <td style="text-align:right">${form.stunden ? form.stunden + ' Std.' : 'Std.'}</td>
  </tr>
  <tr>
    <td>Summe</td>
    <td style="text-align:right">${form.summe ? form.summe + ' EUR' : 'EUR'}</td>
  </tr>
</table>

<!-- Versicherung -->
<p class="versicherung">
  Hiermit wird versichert, dass die gemachten Angaben der Wahrheit entsprechen.<br>
  Die hier erzielten Einnahmen sind einkommenssteuerpflichtig.
</p>

<!-- Unterschriften -->
<div class="sign-wrap">
  <div class="sign-block">
    <div style="border-top:1px solid #000; margin-top:20mm; padding-top:2px; font-size:8.5pt">
      Ort, Datum, Unterschrift, Antragsteller, Firmenstempel
    </div>
  </div>
</div>
<div class="sign-wrap">
  <div class="sign-block">
    <div style="border-top:1px solid #000; margin-top:12mm; padding-top:2px; font-size:8.5pt">
      Ort, Datum, Unterschrift Ortsbrandmeister
    </div>
  </div>
</div>

<!-- Erläuterungen -->
<div class="erlaeuterungen">
  <p><strong>Erl&auml;uterungen:</strong></p>
  <ul>
    <li>F&uuml;r die Nachgewiesene Einsatzzeit im Feuerwehrdienst der Freiwilligen Feuerwehr erhalten Selbst&auml;ndige und Freiberufler als Entsch&auml;digung f&uuml;r Verdienstausfall, der durch Zeitvers&auml;umnis in der beruflichen T&auml;tigkeit einstanden ist, eine Pauschalentsch&auml;digung von ${STUNDENSATZ},00 Euro je Stunde. F&uuml;r angefangene Stunden bis 30 Minuten wird der halbe, im &uuml;brigen der volle Stundensatz gezahlt.</li>
    <li>Der Verdienstausfall wird auf Antrag, werktags in der Zeit von 07.00 &ndash; 18.00 Uhr f&uuml;r maximal 8 Stunden pro Tag gew&auml;hrt.</li>
    <li>Es sind amtliche Antragsformulare der Gemeinde zu verwenden.</li>
    <li>Die Antr&auml;ge sind durch den Ortsbrandmeister gegenzuzeichnen.</li>
  </ul>
</div>

<script>window.onload = function() { window.print(); }</script>
</body>
</html>`

    const win = window.open('', '_blank')
    win.document.write(html)
    win.document.close()
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 620, maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h3>Antrag auf Verdienstausfall</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>x</button>
        </div>

        {loading ? <div style={{ textAlign: 'center', padding: 32 }}><div className="spinner"></div></div> : (
          <>
            {/* Antragsteller */}
            <div style={{ background: 'var(--gray-50)', borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Antragsteller</div>
              <div className="form-row">
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: 12 }}>Ortsteilfeuerwehr</label>
                  <input value={form.ortsteil} onChange={e => setForm(f => ({ ...f, ortsteil: e.target.value }))} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: 12 }}>Name</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
              </div>
              <div className="form-row" style={{ marginTop: 8 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: 12 }}>Vorname</label>
                  <input value={form.vorname} onChange={e => setForm(f => ({ ...f, vorname: e.target.value }))} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: 12 }}>Anschrift</label>
                  <input value={form.anschrift} onChange={e => setForm(f => ({ ...f, anschrift: e.target.value }))} />
                </div>
              </div>
            </div>

            {/* Bankdaten */}
            <div style={{ background: 'var(--gray-50)', borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Bankverbindung</div>
              <div className="form-group">
                <label style={{ fontSize: 12 }}>Kontoinhaber</label>
                <input value={form.kontoinhaber} onChange={e => setForm(f => ({ ...f, kontoinhaber: e.target.value }))} />
              </div>
              <div className="form-group">
                <label style={{ fontSize: 12 }}>Name und Sitz der Bank</label>
                <input value={form.bankname} onChange={e => setForm(f => ({ ...f, bankname: e.target.value }))}
                  placeholder="z.B. Volksbank Weimar eG" />
                {!profileDaten?.bankname && (
                  <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 3 }}>Bitte im Profil eintragen</div>
                )}
              </div>
              <div className="form-row">
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: 12 }}>IBAN</label>
                  <input value={form.iban} onChange={e => setForm(f => ({ ...f, iban: e.target.value.toUpperCase() }))}
                    style={{ fontFamily: 'var(--mono)', letterSpacing: 1 }} maxLength={22} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label style={{ fontSize: 12 }}>BIC</label>
                  <input value={form.bic} onChange={e => setForm(f => ({ ...f, bic: e.target.value.toUpperCase() }))}
                    style={{ fontFamily: 'var(--mono)', letterSpacing: 1 }} maxLength={11} />
                </div>
              </div>
            </div>

            {/* Einsatz */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-500)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Einsatz</div>
              <div className="form-row">
                <div className="form-group">
                  <label>Datum von</label>
                  <input type="date" value={form.datum_von} onChange={e => setForm(f => ({ ...f, datum_von: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Datum bis (optional)</label>
                  <input type="date" value={form.datum_bis} onChange={e => setForm(f => ({ ...f, datum_bis: e.target.value }))} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Uhrzeit von</label>
                  <input type="time" value={form.uhrzeit_von} onChange={e => setForm(f => ({ ...f, uhrzeit_von: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Uhrzeit bis</label>
                  <input type="time" value={form.uhrzeit_bis} onChange={e => setForm(f => ({ ...f, uhrzeit_bis: e.target.value }))} />
                </div>
              </div>
            </div>

            {/* Abrechnung Vorschau */}
            {form.stunden && (
              <div style={{ background: '#E1F5EE', border: '1px solid #A9DFBF', borderRadius: 8, padding: '12px 16px', marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#085041', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Abrechnung (nur werktags 07:00-18:00, max. 8 Std.)</div>
                <div style={{ display: 'flex', gap: 24 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#085041' }}>Anzahl Stunden</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#085041', fontFamily: 'var(--mono)' }}>{form.stunden} Std.</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#085041' }}>Summe ({STUNDENSATZ} €/Std.)</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#085041', fontFamily: 'var(--mono)' }}>{form.summe} EUR</div>
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 16, borderTop: '1px solid var(--gray-100)' }}>
              <button className="btn btn-secondary" onClick={onClose}>Abbrechen</button>
              <button className="btn btn-primary" onClick={drucken}>🖨️ Drucken / Als PDF speichern</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

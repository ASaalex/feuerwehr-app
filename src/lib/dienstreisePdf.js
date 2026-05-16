import { PDFDocument, PDFTextField, PDFCheckBox } from 'pdf-lib'

// Befüllt das offizielle ThürRKG-Dienstreiseantrag-PDF (Anlage 2) mit den übergebenen Formulardaten.
// Felder werden per Dokumentreihenfolge-Index adressiert (aus Analyse der 194 Formularfelder).
export async function dienstreiseantragPdf(form) {
  const response = await fetch('/Dienstreiseantrag.pdf')
  const pdfBytes = await response.arrayBuffer()
  const pdfDoc = await PDFDocument.load(pdfBytes)
  const pdfForm = pdfDoc.getForm()
  const fields = pdfForm.getFields()

  function setText(idx, value) {
    if (idx < 0 || idx >= fields.length) return
    const field = fields[idx]
    if (field instanceof PDFTextField) {
      try { field.setText(String(value ?? '').slice(0, 199)) } catch (_) {}
    }
  }

  function setCheck(idx, shouldCheck) {
    if (idx < 0 || idx >= fields.length) return
    const field = fields[idx]
    if (field instanceof PDFCheckBox) {
      try {
        if (shouldCheck) field.check()
        else field.uncheck()
      } catch (_) {}
    }
  }

  // ── Seite 1: Antrag ──────────────────────────────────────────────────────

  // Art der Reise
  setCheck(1, form.art === 'dienstreise')     // ☐ Dienstreise
  setCheck(3, form.art === 'ausbildung')      // ☐ Aus-/Fortbildungsreise

  // Abschnitt 1 – Antragsteller
  setText(0, form.dienststelle)               // Dienststelle
  setText(5, form.name_vorname)               // Name, Vorname
  setText(6, form.dienstort)                  // Dienstort
  setText(7, form.personal_nr)               // Personal-/Arbeitsgebietsnr.
  setText(8, form.hausruf)                    // Hausruf
  setText(9, form.wohnadresse)               // PLZ, Wohnort, Straße, HsNr.

  // Abschnitt 2 – Reiseziel und Zweck
  setText(12, form.reiseziel_1)              // Reiseziel/Zweck Zeile 1
  setText(13, form.reiseziel_2)              // Reiseziel/Zweck Zeile 2
  setCheck(14, form.unterkunft === 'amt')     // Unterkunft des Amtes wegen
  setCheck(15, form.unterkunft === 'privat')  // aus privaten Gründen
  setCheck(16, form.unterkunft === 'taeglich') // tägliche Rückkehr

  // Abschnitt 3 – Reiseverlauf
  setCheck(17, form.beginn_von === 'wohnung')         // Beginn: Wohnung
  setCheck(18, form.beginn_von === 'dienststelle')    // Beginn: Dienststelle
  setCheck(19, form.beginn_von === 'familienwohnort') // Beginn: Familienwohnort
  setText(21, form.beginn_datum)                      // Beginn Datum, Uhrzeit
  setText(22, form.beginn_dienstgeschaeft)            // Beginn Dienstgeschäft

  setCheck(23, form.ende_an === 'wohnung')            // Ende: Wohnung
  setCheck(24, form.ende_an === 'dienststelle')       // Ende: Dienststelle
  setCheck(25, form.ende_an === 'familienwohnort')    // Ende: Familienwohnort
  setText(27, form.ende_datum)                        // Ende Datum, Uhrzeit
  setText(28, form.ende_dienstgeschaeft)              // Ende Dienstgeschäft

  setCheck(31, form.verbindung_urlaub === true)       // Verbindung mit Urlaub: Ja
  setCheck(32, form.verbindung_urlaub === false)      // Verbindung mit Urlaub: Nein

  // Abschnitt 4 – Beförderungsmittel
  setCheck(34, form.bahncard === 'nein')              // BahnCard: Nein
  setCheck(35, form.bahncard === 'ja')                // BahnCard: Ja
  setText(36, form.bahncard === 'ja' ? form.bahncard_art : '') // BC-Art

  const bm = form.befoerderungsmittel || ''
  setCheck(39, bm === 'flugzeug')                     // Flugzeug
  setCheck(40, bm === 'dienstfahrzeug_selbst' || bm === 'dienstfahrzeug_fahrer') // Dienstfahrzeug
  setCheck(41, bm === 'dienstfahrzeug_selbst')        // als Selbstfahrer
  setCheck(42, bm === 'dienstfahrzeug_fahrer')        // mit Fahrer
  setCheck(43, bm === 'privatkfz')                    // erhebliche dienstliche Gründe Kfz
  setText(44, bm === 'sonstiges' ? form.sonstiges_kfz : '') // Sonstiges Beförderungsmittel

  setText(45, form.fahrkarte)                         // Fahrkarte/Flugschein (von–bis)
  setText(46, form.platzkarte_hin)                    // Platzkarte Hinfahrt
  setText(47, form.platzkarte_rueck)                  // Platzkarte Rückfahrt

  // Abschnitt 5 – Übernachtungskosten
  if (form.uebernachtung) {
    setText(48, form.uebernachtung_betrag)             // Betrag je Nacht
    setCheck(49, form.fruehstueck === 'nein')          // inkl. Frühstück: Nein
    setCheck(50, form.fruehstueck === 'ja')            // inkl. Frühstück: Ja
    setText(51, form.fruehstueck === 'ja' ? form.fruehstueck_betrag : '')
    setCheck(52, form.hotelkontingent === 'nein')      // Hotelkontingent: Nein
    setCheck(53, form.hotelkontingent === 'ja')        // Hotelkontingent: Ja
    setText(54, form.gruendung_uebernachtung)          // Begründung höhere Kosten
  } else {
    setCheck(52, true) // Hotelkontingent Nein als Standard
  }

  // Abschnitt 7 – Sonstige Kosten
  setText(58, form.sonstige_kosten)

  // Abschnitt 8/9 – Mitfahrer / Abschlag
  setText(59, form.mitfahrer)
  setCheck(60, form.abschlag === 'nein')               // Abschlag: Nein
  setCheck(61, form.abschlag === 'ja')                 // Abschlag: Ja
  setText(62, form.abschlag === 'ja' ? form.abschlag_betrag : '')

  // ── Seite 2: Bankverbindung (wird mit Profildaten vorbefüllt) ────────────
  setText(190, form.geldinstitut)                      // Geldinstitut / Bezeichnung, Ort
  setText(191, form.iban)                              // IBAN
  setText(192, form.bic)                               // BIC

  const filledBytes = await pdfDoc.save()

  // Uint8Array → Base64
  let binary = ''
  const bytes = new Uint8Array(filledBytes)
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

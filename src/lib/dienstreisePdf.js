import { PDFDocument } from 'pdf-lib'

// Feldnamen des offiziellen ThürRKG-Dienstreiseantrags (Anlage 2, FormLAB) sind
// bereits Positions-codiert (Seite + mm-Koordinaten) und wurden einmalig anhand
// des Original-PDFs verifiziert (angehaengte Checkbox-/Textfeld-Rects je Abschnitt).
const F = {
  dienststelle: 'TEXTFIELD.p0.x22.y15',
  jahr: 'TEXTFIELD.p0.x186.y10',
  cbDienstreise: 'CHECKBOX.p0.x20.y19',
  cbFortbildung: 'CHECKBOX.p0.x54.y19',

  name: 'TEXTFIELD.p0.x22.y37',
  adresse: 'TEXTFIELD.p0.x22.y47',

  reiseziel: 'TEXTFIELD.p0.x22.y57',
  zweck: 'TEXTFIELD.p0.x22.y63',

  beginnWohnung: 'CHECKBOX.p0.x22.y76',
  beginnDienststelle: 'CHECKBOX.p0.x46.y76',
  beginnAufenthaltsort: 'CHECKBOX.p0.x68.y72',
  beginnFamilienwohnort: 'CHECKBOX.p0.x68.y76',
  beginnDatum: 'TEXTFIELD.p0.x110.y76',
  beginnDienstgeschaeft: 'TEXTFIELD.p0.x152.y76',

  endeWohnung: 'CHECKBOX.p0.x22.y84',
  endeDienststelle: 'CHECKBOX.p0.x46.y84',
  endeAufenthaltsort: 'CHECKBOX.p0.x68.y80',
  endeFamilienwohnort: 'CHECKBOX.p0.x68.y84',
  endeDatum: 'TEXTFIELD.p0.x110.y84',
  endeDienstgeschaeft: 'TEXTFIELD.p0.x152.y84',

  befOeffentlich: 'CHECKBOX.p0.x144.y95',
  befFlugzeug: 'CHECKBOX.p0.x87.y99',
  befDienstfahrzeug: 'CHECKBOX.p0.x104.y99',
  befSelbstfahrer: 'CHECKBOX.p0.x104.y103',
  befMitFahrer: 'CHECKBOX.p0.x126.y103',
  befPrivatKfz: 'CHECKBOX.p0.x144.y101',
  befSonstigesText: 'TEXTFIELD.p0.x166.y104',

  geldinstitut: 'TEXTFIELD.p1.x48.y224',
  iban: 'TEXTFIELD.p1.x32.y230',
  bic: 'TEXTFIELD.p1.x64.y238',
}

// Feste Dienststelle laut Vorgabe der Gemeinde
const DIENSTSTELLE = 'Gemeinde Grammetal'

export async function dienstreiseantragPdf(form) {
  const response = await fetch('/Dienstreiseantrag.pdf')
  const templateBytes = await response.arrayBuffer()
  const pdfDoc = await PDFDocument.load(templateBytes)
  const pdfForm = pdfDoc.getForm()

  function setText(name, value) {
    try { pdfForm.getTextField(name).setText(value ?? '') } catch (_) {}
  }
  function setCheck(name, on) {
    try {
      const cb = pdfForm.getCheckBox(name)
      if (on) cb.check(); else cb.uncheck()
    } catch (_) {}
  }

  setText(F.dienststelle, DIENSTSTELLE)
  setText(F.jahr, String(new Date().getFullYear()).slice(-2))
  setCheck(F.cbDienstreise, form.reiseart === 'dienstreise')
  setCheck(F.cbFortbildung, form.reiseart === 'fortbildung')

  setText(F.name, form.name)
  setText(F.adresse, form.adresse)

  setText(F.reiseziel, form.reiseziel)
  setText(F.zweck, form.zweck)

  setCheck(F.beginnWohnung, form.beginnOrt === 'wohnung')
  setCheck(F.beginnDienststelle, form.beginnOrt === 'dienststelle')
  setCheck(F.beginnAufenthaltsort, form.beginnOrt === 'aufenthaltsort')
  setCheck(F.beginnFamilienwohnort, form.beginnOrt === 'familienwohnort')
  setText(F.beginnDatum, form.beginnDatumUhrzeit)
  setText(F.beginnDienstgeschaeft, form.beginnDienstgeschaeftDatumUhrzeit)

  setCheck(F.endeWohnung, form.endeOrt === 'wohnung')
  setCheck(F.endeDienststelle, form.endeOrt === 'dienststelle')
  setCheck(F.endeAufenthaltsort, form.endeOrt === 'aufenthaltsort')
  setCheck(F.endeFamilienwohnort, form.endeOrt === 'familienwohnort')
  setText(F.endeDatum, form.endeDatumUhrzeit)
  setText(F.endeDienstgeschaeft, form.endeDienstgeschaeftDatumUhrzeit)

  const bm = form.befoerderung
  setCheck(F.befOeffentlich, bm === 'oeffentlich')
  setCheck(F.befFlugzeug, bm === 'flugzeug')
  setCheck(F.befDienstfahrzeug, bm === 'dienstfahrzeug_selbst' || bm === 'dienstfahrzeug_fahrer')
  setCheck(F.befSelbstfahrer, bm === 'dienstfahrzeug_selbst')
  setCheck(F.befMitFahrer, bm === 'dienstfahrzeug_fahrer')
  setCheck(F.befPrivatKfz, bm === 'privat_kfz')
  setText(F.befSonstigesText, bm === 'sonstiges' ? (form.befoerderungSonstigesText ?? '') : '')

  setText(F.geldinstitut, form.bankname)
  setText(F.iban, form.iban)
  setText(F.bic, form.bic)

  pdfForm.updateFieldAppearances()

  const bytes = await pdfDoc.save()
  return uint8ToBase64(bytes)
}

function uint8ToBase64(bytes) {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

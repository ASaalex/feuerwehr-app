// Prüfintervalle nach DGUV Grundsatz 305-002 (Dezember 2021)
// Quelle: Anhang Tabelle 1 + 2

export const PRUEFINTERVALLE = [
  // pdfSeite = Seite im DGUV 305-002 PDF (64 Seiten gesamt)
  // Kapitel III (Geräte): Seiten 12–39 | Kapitel IV (Fahrzeuge): 40–47 | Anhang Tabellen: 48–64

  // ── SCHUTZKLEIDUNG ────────────────────────────────────────────
  // ── SCHUTZKLEIDUNG ────────────────────────────────────────────
  { name: 'Chemikalienschutzanzug', aliases: ['csa','chemikalienschutz','csa typ 1','csa typ 2'], kategorie: 'Schutzkleidung', sichtpruefung: 'vor Übung und nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: 'alle 12 Monate', norm: 'DIN EN 943-2', pdfSeite: 48 },
  { name: 'Chemikalienschutzoverall', aliases: ['overall','chemieoverall'], kategorie: 'Schutzkleidung', sichtpruefung: 'vor Übung und nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: null, norm: 'DIN EN 14605', pdfSeite: 48 },
  { name: 'Chemikalienschutzhandschuhe', aliases: ['chemihandschuhe','säurehandschuhe'], kategorie: 'Schutzkleidung', sichtpruefung: 'vor Übung und nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: null, norm: 'DIN EN 374', pdfSeite: 48 },
  { name: 'Wathose', aliases: ['wathosen','watthose'], kategorie: 'Schutzkleidung', sichtpruefung: 'vor Übung und nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: null, norm: null, pdfSeite: 50 },
  { name: 'Feuerwehrschutzkleidung', aliases: ['schutzkleidung','schutzanzug','einsatzjacke','einsatzhose','überjacke'], kategorie: 'Schutzkleidung', sichtpruefung: 'vor Übung und nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: null, norm: 'DIN EN 469', pdfSeite: 49 },
  { name: 'Feuerwehrhelm', aliases: ['helm','schutzhelm','kopfschutz'], kategorie: 'Schutzkleidung', sichtpruefung: 'vor Übung und nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: null, norm: 'DIN EN 443', pdfSeite: 49 },
  { name: 'Feuerwehrschutzhandschuhe', aliases: ['handschuhe','schutzhandschuhe'], kategorie: 'Schutzkleidung', sichtpruefung: 'vor Übung und nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: null, norm: 'DIN EN 659', pdfSeite: 50 },
  { name: 'Feuerwehrstiefel', aliases: ['stiefel','schutzstiefel'], kategorie: 'Schutzkleidung', sichtpruefung: 'vor Übung und nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: null, norm: 'DIN EN 15090', pdfSeite: 50 },
  { name: 'Rettungsweste', aliases: ['schwimmweste','weste','auftriebsweste'], kategorie: 'Schutzkleidung', sichtpruefung: 'vor Übung und nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: null, norm: 'DIN EN ISO 12402', pdfSeite: 50 },
  { name: 'Feuerschutzhaube', aliases: ['brandhaube','schutzhaube','haube'], kategorie: 'Schutzkleidung', sichtpruefung: 'vor Übung und nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: null, norm: 'DIN EN 13911', pdfSeite: 49 },
  { name: 'Schnittschutzkleidung', aliases: ['schnittschutz','schnittschutzjacke','schnittschutzhose'], kategorie: 'Schutzkleidung', sichtpruefung: 'vor Übung und nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: null, norm: 'DIN EN 381', pdfSeite: 50 },
  { name: 'Warnkleidung', aliases: ['warnweste','signalweste','warnkleiding'], kategorie: 'Schutzkleidung', sichtpruefung: 'vor Übung und nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: null, norm: 'DIN EN ISO 20471', pdfSeite: 49 },
  { name: 'Feuerwehrbeil', aliases: ['beil','axt'], kategorie: 'Schutzkleidung', sichtpruefung: 'vor Übung und nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: null, norm: 'DIN 14924', pdfSeite: 50 },

  // ── ATEMSCHUTZ ────────────────────────────────────────────────
  { name: 'Atemanschluss', aliases: ['vollmaske','maske','atemmaske','atemschutzmaske'], kategorie: 'Atemschutz', sichtpruefung: 'vor Übung und nach Benutzung', regelmaessig: 'halbjährlich', belastung: null, norm: 'DIN EN 136', hinweis: 'Nach Gebrauch reinigen und desinfizieren. DGUV Regel 112-190, FwDV 7.', pdfSeite: 61 },
  { name: 'Pressluftatmer', aliases: ['pa','atemschutzgerät','pressluftgerät','pa gerät'], kategorie: 'Atemschutz', sichtpruefung: 'vor Übung und nach Benutzung', regelmaessig: 'halbjährlich', belastung: 'alle 6 Jahre (Generalüberholung)', norm: 'DIN EN 137', hinweis: 'DGUV Regel 112-190, FwDV 7.', pdfSeite: 63 },
  { name: 'Atemluftflasche', aliases: ['luftflasche','druckluftflasche','atemluft','flasche'], kategorie: 'Atemschutz', sichtpruefung: 'vor Übung und nach Benutzung', regelmaessig: 'monatlich', belastung: 'alle 5 Jahre (äußere, innere und Festigkeitsprüfung)', norm: 'DIN EN 144', hinweis: 'BetrSichV beachten. FwDV 7.', pdfSeite: 52 },
  { name: 'Filtergerät', aliases: ['filter','atemfilter','gasmaske'], kategorie: 'Atemschutz', sichtpruefung: 'vor Übung und nach Benutzung', regelmaessig: 'halbjährlich', belastung: null, norm: 'DIN EN 14387', hinweis: 'FwDV 7.', pdfSeite: 62 },
  { name: 'Fluchthaube', aliases: ['fluchtsack','notfluchtsystem'], kategorie: 'Atemschutz', sichtpruefung: 'nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: null, norm: 'DIN EN 403', pdfSeite: 52 },
  { name: 'Tauchgerät', aliases: ['tauchergerät','tauchausrüstung','sporttauchgerät'], kategorie: 'Atemschutz', sichtpruefung: 'vor Übung und nach Benutzung', regelmaessig: 'monatlich', belastung: 'alle 6 Jahre', norm: 'DIN EN 250', hinweis: 'FwDV 8, DGUV Regel 105-002.', pdfSeite: 52 },
  { name: 'Atemluftkompressor', aliases: ['kompressor','atemluft kompressor','luftkompressor'], kategorie: 'Atemschutz', sichtpruefung: null, regelmaessig: 'monatlich', belastung: 'halbjährlich', norm: 'DIN EN 12021', hinweis: 'DGUV Regel 112-190.', pdfSeite: 53 },
  { name: 'Sauerstoffflasche medizinisch', aliases: ['sauerstoffflasche','o2 flasche','sauerstoff'], kategorie: 'Atemschutz', sichtpruefung: 'vor Übung und nach Benutzung', regelmaessig: 'monatlich', belastung: 'Äußere 2 J / Innere 5 J / Festigkeit 10 J', norm: 'BetrSichV', pdfSeite: 53 },

  // ── LÖSCHGERÄT ────────────────────────────────────────────────
  { name: 'Feuerlöscher', aliases: ['löscher','handfeuerlöscher','co2 löscher','pulverlöscher'], kategorie: 'Löschgerät', sichtpruefung: 'nach Benutzung', regelmaessig: 'alle 2 Jahre', belastung: null, norm: 'DIN EN 3-7', pdfSeite: 53 },
  { name: 'Kübelspritze', aliases: ['kübel','kübelspritze'], kategorie: 'Löschgerät', sichtpruefung: 'nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: null, norm: 'DIN 14405', pdfSeite: 53 },
  { name: 'Schaummittel', aliases: ['schaummittel','filmschaum','mehrbereichschaummittel'], kategorie: 'Löschgerät', sichtpruefung: null, regelmaessig: 'alle 12 Monate', belastung: null, norm: 'EN 1568', pdfSeite: 54 },

  // ── SCHLÄUCHE UND ARMATUREN ───────────────────────────────────
  { name: 'Druckschläuche', aliases: ['druckschlauch','c schlauch','b schlauch','a schlauch','d schlauch','schlauch'], kategorie: 'Schläuche', sichtpruefung: 'nach Benutzung', regelmaessig: 'bei jeder Wäsche (Sicht + Druckprüfung)', belastung: 'bei jeder Wäsche', norm: 'DIN 14811', pdfSeite: 25 },
  { name: 'Saugschläuche', aliases: ['saugschlauch','sauggarnitur'], kategorie: 'Schläuche', sichtpruefung: 'nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: 'alle 12 Monate', norm: 'DIN EN ISO 14557', pdfSeite: 26 },
  { name: 'Schlauchleitungen chemikalienbeständig', aliases: ['öl schlauch','chemikalien schlauch','mineralöl schlauch'], kategorie: 'Schläuche', sichtpruefung: 'nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: 'alle 12 Monate', norm: 'DIN EN 12115', pdfSeite: 55 },
  { name: 'Wasserführende Armaturen', aliases: ['strahlrohr','standrohr','verteiler','übergangsstück','armatur'], kategorie: 'Schläuche', sichtpruefung: 'nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: 'bei Bedarf', norm: null, pdfSeite: 27 },

  // ── LEITERN ───────────────────────────────────────────────────
  { name: 'Schiebleiter', aliases: ['schiebleiter','schiebeleiter','leiter'], kategorie: 'Leitern', sichtpruefung: 'vor Übung und nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: 'alle 24 Monate', norm: 'DIN EN 1147', pdfSeite: 20 },
  { name: 'Steckleiter', aliases: ['steckleiter','steckteil','steckleiterteil'], kategorie: 'Leitern', sichtpruefung: 'vor Übung und nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: 'alle 24 Monate', norm: 'DIN EN 1147', pdfSeite: 17 },
  { name: 'Klappleiter', aliases: ['klappleiter','klappbare leiter'], kategorie: 'Leitern', sichtpruefung: 'vor Übung und nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: null, norm: 'DIN EN 1147', pdfSeite: 19 },
  { name: 'Hakenleiter', aliases: ['hakenleiter','hakeleiter'], kategorie: 'Leitern', sichtpruefung: 'vor Übung und nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: 'alle 24 Monate', norm: 'DIN EN 1147', pdfSeite: 16 },
  { name: 'Drehleiter', aliases: ['drehleiter','dl','dlk'], kategorie: 'Leitern', sichtpruefung: 'vor Übung und nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: 'alle 12 Monate', norm: 'DIN 14702', pdfSeite: 42 },
  { name: 'Sprungpolster', aliases: ['sprungkissen','sprungretter'], kategorie: 'Leitern', sichtpruefung: 'vor Übung und nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: 'alle 12 Monate (Sicherheitshauptprüfung)', norm: 'DIN 14151', pdfSeite: 14 },

  // ── ABSTURZSICHERUNG ──────────────────────────────────────────
  { name: 'Feuerwehrleine', aliases: ['leine','sicherungsleine'], kategorie: 'Absturzsicherung', sichtpruefung: 'vor Übung und nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: null, norm: 'DIN 14920', hinweis: 'Aussonderung nach 20 Jahren.', pdfSeite: 13 },
  { name: 'Feuerwehr-Haltegurt', aliases: ['haltegurt','gurt','klettergurt'], kategorie: 'Absturzsicherung', sichtpruefung: 'vor Übung und nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: null, norm: 'DIN EN 358', hinweis: 'Typ A: Aussonderung nach 12 J, Typ B nach 10 J.', pdfSeite: 12 },
  { name: 'Auffanggurt', aliases: ['sicherheitsgurt','fallschutzgurt'], kategorie: 'Absturzsicherung', sichtpruefung: 'vor Übung und nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: null, norm: 'DIN EN 361', pdfSeite: 56 },
  { name: 'Kernmantelseil', aliases: ['seil','statik seil','dynamik seil','kernmantel'], kategorie: 'Absturzsicherung', sichtpruefung: 'vor Übung und nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: null, norm: 'DIN EN 1891', pdfSeite: 37 },
  { name: 'Abseilgerät', aliases: ['abseilacht','abseil','abseilen'], kategorie: 'Absturzsicherung', sichtpruefung: 'vor Übung und nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: null, norm: 'DIN 14800-16', pdfSeite: 56 },
  { name: 'Falldämpfer', aliases: ['auffangsystem','sturzbremse'], kategorie: 'Absturzsicherung', sichtpruefung: 'vor Übung und nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: null, norm: 'DIN EN 355', hinweis: 'EINWEGGERÄT – nach Sturzbelastung sofort aussondern!', pdfSeite: 56 },
  { name: 'Rettungsschlaufe', aliases: ['schlaufe','rettungsschlinge'], kategorie: 'Absturzsicherung', sichtpruefung: 'vor Übung und nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: null, norm: 'DIN EN 1498', pdfSeite: 57 },

  // ── TECHNISCHE RETTUNG ────────────────────────────────────────
  { name: 'Spreizer', aliases: ['hydraulikspreizer','rettungsspreizer'], kategorie: 'Techn. Rettung', sichtpruefung: 'nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: 'alle 3 Jahre', norm: 'DIN EN 13204', pdfSeite: 32 },
  { name: 'Schneidgerät', aliases: ['hydraulikschere','rettungsschere','schere'], kategorie: 'Techn. Rettung', sichtpruefung: 'nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: 'alle 3 Jahre', norm: 'DIN EN 13204', pdfSeite: 34 },
  { name: 'Rettungszylinder', aliases: ['hydraulikzylinder','zylinder','stempel'], kategorie: 'Techn. Rettung', sichtpruefung: 'nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: 'alle 3 Jahre', norm: 'DIN EN 13204', pdfSeite: 30 },
  { name: 'Hebekissensystem', aliases: ['hebekissen','lufthebekissen','hebekissen hoch','hebekissen niedrig'], kategorie: 'Techn. Rettung', sichtpruefung: 'nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: 'alle 5 Jahre', norm: 'DIN EN 13731', pdfSeite: 28 },
  { name: 'Leckdichtkissen', aliases: ['leckdicht','dichtkissen','rohrdicht','gullydicht'], kategorie: 'Techn. Rettung', sichtpruefung: 'nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: 'alle 12 Monate', norm: null, pdfSeite: 58 },
  { name: 'Hydraulik-Pumpenaggregat', aliases: ['pumpe aggregat','hydraulik pumpe','pumpenaggregat'], kategorie: 'Techn. Rettung', sichtpruefung: 'nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: 'alle 3 Jahre', norm: 'DIN EN 13204', pdfSeite: 31 },
  { name: 'Mehrzweckzug', aliases: ['mzz','greifzug','seilzug','kettenzug'], kategorie: 'Techn. Rettung', sichtpruefung: 'nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: null, norm: 'DIN 14800-5', pdfSeite: 39 },
  { name: 'Be- und Entlüftungsgerät', aliases: ['lüfter','ppv','überdruckbelüftung','entlüftung'], kategorie: 'Techn. Rettung', sichtpruefung: 'nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: null, norm: null, pdfSeite: 58 },

  // ── PUMPEN ────────────────────────────────────────────────────
  { name: 'Tragkraftspritze', aliases: ['ts','tragkraftspritze','tsf','motorspritze'], kategorie: 'Pumpen', sichtpruefung: 'nach Benutzung', regelmaessig: 'alle 12 Monate (inkl. Schließdruck- und Trockensaugprüfung)', belastung: null, norm: 'DIN EN 14466', pdfSeite: 27 },
  { name: 'Taucherpumpe', aliases: ['tauchpumpe','tauchermotorpumpe','schmutzwasserpumpe'], kategorie: 'Pumpen', sichtpruefung: 'nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: null, norm: 'DIN 14425', pdfSeite: 59 },
  { name: 'Stromerzeuger', aliases: ['generator','stromer','aggregat'], kategorie: 'Pumpen', sichtpruefung: 'nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: null, norm: 'DIN 14685', pdfSeite: 59 },

  // ── MOTORSÄGEN UND TRENNGERÄTE ────────────────────────────────
  { name: 'Motorsäge', aliases: ['kettensäge','motorsäge','säge'], kategorie: 'Motorsägen', sichtpruefung: 'vor Übung und nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: null, norm: 'DIN EN ISO 11681', pdfSeite: 59 },
  { name: 'Trennschleifer', aliases: ['trenner','trennschleifmaschine','flex','trenngerät'], kategorie: 'Motorsägen', sichtpruefung: 'vor Übung und nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: null, norm: 'DIN EN ISO 19432', pdfSeite: 59 },
  { name: 'Anschlagmittel', aliases: ['drahtseil','stahlseil','hebeband','rundschlinge','kette','schäkel'], kategorie: 'Motorsägen', sichtpruefung: 'vor Übung und nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: null, norm: 'DIN EN 12385', pdfSeite: 38 },

  // ── SANITÄT ───────────────────────────────────────────────────
  { name: 'Krankentrage', aliases: ['trage','rettungstrage','krankentrage'], kategorie: 'Sanität', sichtpruefung: 'vor Übung und nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: null, norm: 'DIN 13024', pdfSeite: 60 },
  { name: 'Verbandkasten', aliases: ['verbandskasten','erste hilfe','verbandtasche'], kategorie: 'Sanität', sichtpruefung: 'nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: null, norm: 'DIN 13169', pdfSeite: 60 },
  { name: 'Beatmungsgerät', aliases: ['beatmung','ambubeutel','beatmungsbeutel'], kategorie: 'Sanität', sichtpruefung: 'nach Benutzung', regelmaessig: 'monatlich', belastung: null, norm: null, pdfSeite: 60 },
  { name: 'Kammerschienen', aliases: ['schienen','vakuumschiene','luftschiene'], kategorie: 'Sanität', sichtpruefung: 'nach Benutzung', regelmaessig: 'monatlich', belastung: null, norm: null, pdfSeite: 60 },

  // ── BELEUCHTUNG UND FUNK ──────────────────────────────────────
  { name: 'Handscheinwerfer', aliases: ['taschenlampe','handlampe','handscheinwerfer'], kategorie: 'Beleuchtung', sichtpruefung: 'nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: null, norm: 'DIN EN 14627', pdfSeite: 60 },
  { name: 'Flutlichtstrahler', aliases: ['flutlicht','strahler','lichtmast','lichtanlage'], kategorie: 'Beleuchtung', sichtpruefung: 'nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: null, norm: 'DIN 14800-18', pdfSeite: 60 },
  { name: 'Leitungsroller', aliases: ['kabelrolle','verlängerung','kabeltrommel','leitungstrommel'], kategorie: 'Beleuchtung', sichtpruefung: 'nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: null, norm: 'DIN 14680', pdfSeite: 60 },
  { name: 'Handsprechfunkgerät', aliases: ['funk','handfunkgerät','funkgerät','hrt'], kategorie: 'Beleuchtung', sichtpruefung: 'vor Übung und nach Benutzung', regelmaessig: 'halbjährlich', belastung: null, norm: null, pdfSeite: 60 },

  // ── MESSGERÄTE ────────────────────────────────────────────────
  { name: 'Dosisleistungsmessgerät', aliases: ['dosimeter','strahlungsmessgerät','dosimessgerät'], kategorie: 'Messgeräte', sichtpruefung: null, regelmaessig: 'halbjährlich', belastung: null, norm: null, pdfSeite: 60 },
  { name: 'Ex-Messgerät', aliases: ['exmessgerät','ex ox messgerät','gasmessgerät','explosionsschutz messgerät'], kategorie: 'Messgeräte', sichtpruefung: null, regelmaessig: 'nach Herstellerangaben', belastung: null, norm: 'DIN EN 60079', pdfSeite: 60 },
  { name: 'Wärmebildkamera', aliases: ['wbk','wärmebildkamera','thermokamera'], kategorie: 'Messgeräte', sichtpruefung: null, regelmaessig: 'nach Herstellerangaben', belastung: null, norm: null, pdfSeite: 61 },
  { name: 'pH-Messgerät', aliases: ['ph messgerät','ph meter'], kategorie: 'Messgeräte', sichtpruefung: null, regelmaessig: 'vierteljährlich', belastung: null, norm: null, pdfSeite: 61 },

  // ── SONSTIGES ─────────────────────────────────────────────────
  { name: 'Kraftstoffkanister', aliases: ['kanister','benzinkanister','dieselkanister'], kategorie: 'Sonstiges', sichtpruefung: null, regelmaessig: 'halbjährlich', belastung: null, norm: null, hinweis: 'Aussonderung nach 5 Jahren (ADR).', pdfSeite: 61 },
  { name: 'Feuerwehrfahrzeug', aliases: ['fahrzeug','lkw','hlf','mlf','tsf','tlf','rw'], kategorie: 'Sonstiges', sichtpruefung: 'vor Übung und nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: null, norm: 'DIN 1846', hinweis: 'StVZO, Vorschrift 70/71.', pdfSeite: 40 },
  { name: 'Mehrzweckboot', aliases: ['boot','mzb','schlauchboot'], kategorie: 'Sonstiges', sichtpruefung: 'vor Übung und nach Benutzung', regelmaessig: 'alle 12 Monate', belastung: null, norm: 'DIN 14961', pdfSeite: 57 },
]

// Normalisierungs-Hilfsfunktion
function norm(t) {
  return t.toLowerCase()
    .replace(/[äöü]/g, c => ({ ä: 'ae', ö: 'oe', ü: 'ue' }[c]))
    .replace(/[^a-z0-9 ]/g, '')
    .trim()
}

export function geraetSuchen(eingabe) {
  const input = norm(eingabe)
  const woerter = input.split(/\s+/).filter(w => w.length > 2)

  // 1. Exakter Name-Treffer
  let treffer = PRUEFINTERVALLE.find(g => norm(g.name) === input)
  // 2. Alias-Treffer
  if (!treffer) treffer = PRUEFINTERVALLE.find(g => g.aliases.some(a => norm(a) === input))
  // 3. Name enthält Input oder umgekehrt
  if (!treffer) treffer = PRUEFINTERVALLE.find(g => norm(g.name).includes(input) || input.includes(norm(g.name)))
  // 4. Alias enthält Input
  if (!treffer) treffer = PRUEFINTERVALLE.find(g => g.aliases.some(a => norm(a).includes(input) || input.includes(norm(a))))
  // 5. Wort-Matching
  if (!treffer) treffer = PRUEFINTERVALLE.find(g =>
    woerter.some(w => norm(g.name).includes(w) || g.aliases.some(a => norm(a).includes(w)))
  )
  return treffer ?? null
}

export function pruefInfoSprechen(geraet) {
  const teile = []
  if (geraet.sichtpruefung) teile.push(`Sichtprüfung: ${geraet.sichtpruefung}.`)
  teile.push(`Regelmäßige Prüfung: ${geraet.regelmaessig}.`)
  if (geraet.belastung) teile.push(`Belastungsprüfung: ${geraet.belastung}.`)
  if (geraet.hinweis) teile.push(geraet.hinweis)
  return teile.join(' ')
}

# Deployment-Anleitung – Feuerwehr App auf Vercel

## Voraussetzungen
- GitHub Account (hast du bereits)
- Supabase eingerichtet (laut EINRICHTUNG.md)
- Node.js installiert (https://nodejs.org – LTS Version)

---

## Schritt 1: Code auf GitHub hochladen

1. Gehe zu **https://github.com/new** und erstelle ein neues Repository
   - Name: `feuerwehr-app`
   - Private: Ja (empfohlen)
   - README: Nein

2. Öffne ein Terminal (Windows: Eingabeaufforderung oder PowerShell) im Ordner der App:
   ```
   cd feuerwehr-app
   git init
   git add .
   git commit -m "Feuerwehr App - erste Version"
   git remote add origin https://github.com/DEIN-USERNAME/feuerwehr-app.git
   git push -u origin main
   ```

---

## Schritt 2: .env Datei erstellen (lokal zum Testen)

Erstelle eine Datei namens `.env` im App-Ordner (NICHT `.env.example`):
```
VITE_SUPABASE_URL=https://DEIN-PROJEKT.supabase.co
VITE_SUPABASE_ANON_KEY=DEIN-ANON-KEY
```

Diese Werte findest du in Supabase unter: Project Settings → API

---

## Schritt 3: Lokal testen (optional)

```bash
npm install
npm run dev
```
Die App öffnet sich unter http://localhost:5173

---

## Schritt 4: Auf Vercel deployen

1. Gehe zu **https://vercel.com** und melde dich mit GitHub an
2. Klicke auf **"Add New → Project"**
3. Wähle dein `feuerwehr-app` Repository aus
4. Unter **"Environment Variables"** hinzufügen:
   - `VITE_SUPABASE_URL` = deine Supabase URL
   - `VITE_SUPABASE_ANON_KEY` = dein Anon Key
5. Klicke auf **"Deploy"**
6. Nach 1–2 Minuten ist die App live unter einer Vercel-URL wie:
   `https://feuerwehr-app-xxx.vercel.app`

---

## Schritt 5: Eigene Domain (optional)

Falls du eine eigene Domain willst (z.B. `fw-musterdorf.de`):
1. Domain kaufen (z.B. bei Strato, All-Inkl., ~10 €/Jahr)
2. In Vercel unter "Domains" eintragen
3. DNS beim Anbieter anpassen (Vercel zeigt dir genau wie)

---

## Schritt 6: Ersten Admin einrichten

1. Öffne die App unter deiner Vercel-URL
2. Registriere dich mit deiner E-Mail
3. Gehe in Supabase → SQL Editor und führe aus:
   ```sql
   update public.profiles 
   set rolle = 'wehrleiter', status = 'aktiv'
   where email = 'deine@email.de';
   ```
4. Lade die App neu – du hast jetzt Admin-Zugang!

---

## Updates einspielen

Wenn du die App später aktualisierst:
```bash
git add .
git commit -m "Update"
git push
```
Vercel deployt automatisch innerhalb von 1–2 Minuten.

---

## Struktur der Dateien

```
feuerwehr-app/
├── sql/
│   ├── 01_schema.sql          ← Datenbank-Tabellen
│   └── 02_rls_policies.sql    ← Sicherheitsregeln
├── src/
│   ├── components/
│   │   └── Layout.jsx         ← Navigation/Sidebar
│   ├── context/
│   │   └── AuthContext.jsx    ← Login-Verwaltung
│   ├── lib/
│   │   └── supabase.js        ← Datenbank-Verbindung
│   ├── pages/
│   │   ├── LoginPage.jsx      ← Anmeldung
│   │   ├── RegisterPage.jsx   ← Registrierung
│   │   ├── DashboardPage.jsx  ← Startseite
│   │   ├── KameradenPage.jsx  ← Verwaltung (Admin)
│   │   ├── DokumentePage.jsx  ← Dokumente
│   │   ├── PruefungenPage.jsx ← Prüfungen
│   │   ├── AufgabenPage.jsx   ← Aufgaben
│   │   └── ProfilPage.jsx     ← Eigenes Profil
│   ├── App.jsx                ← Routing
│   ├── index.css              ← Design
│   └── main.jsx               ← Einstiegspunkt
├── .env                       ← Zugangsdaten (nicht in Git!)
├── .env.example               ← Vorlage
├── package.json
├── vercel.json
└── vite.config.js
```

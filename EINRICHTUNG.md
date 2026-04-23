# Feuerwehr App – Einrichtungsanleitung

## Schritt 1: Supabase Projekt anlegen

1. Gehe zu **https://supabase.com** und klicke auf „Start your project"
2. Mit GitHub Account anmelden (den du schon hast!)
3. Klicke auf **„New Project"**
4. Fülle aus:
   - **Name:** `feuerwehr-app` (oder beliebig)
   - **Database Password:** sicheres Passwort notieren!
   - **Region:** `Frankfurt (eu-central-1)` ← wichtig für DSGVO
5. Auf **„Create new project"** klicken → ca. 1 Minute warten

---

## Schritt 2: Datenbank einrichten

1. Im Supabase Dashboard links auf **„SQL Editor"** klicken
2. Klicke auf **„New query"**
3. Kopiere den gesamten Inhalt von `sql/01_schema.sql` hinein
4. Klicke auf **„Run"** (oder Strg+Enter)
5. Du siehst „Success. No rows returned" → alles gut
6. Klicke erneut auf **„New query"**
7. Kopiere den gesamten Inhalt von `sql/02_rls_policies.sql` hinein
8. Klicke auf **„Run"**

---

## Schritt 3: Storage Bucket anlegen

1. Im Supabase Dashboard links auf **„Storage"** klicken
2. Klicke auf **„New bucket"**
3. Name: `dokumente`
4. **Public bucket: NEIN** (wichtig – Dateien sollen nicht öffentlich sein)
5. Klicke auf **„Create bucket"**

---

## Schritt 4: API-Schlüssel notieren

1. Im Supabase Dashboard links auf **„Project Settings"** (Zahnrad)
2. Dann auf **„API"**
3. Notiere dir:
   - **Project URL** (sieht aus wie: https://xxxx.supabase.co)
   - **anon / public key** (langer String unter „Project API keys")

Diese zwei Werte brauchst du für die App.

---

## Schritt 5: Wehr-Name anpassen

Im SQL Editor ausführen (deinen Wehr-Namen einsetzen):

```sql
update public.wehren 
set name = 'FF Dein-Ortsname', ort = 'Dein Ort'
where true;
```

---

## Schritt 6: Ersten Admin-Account anlegen

1. Registriere dich normal in der App (sobald sie läuft)
2. Dann im Supabase SQL Editor:

```sql
-- Deine E-Mail einsetzen:
update public.profiles 
set rolle = 'wehrleiter', status = 'aktiv'
where email = 'deine@email.de';
```

Danach kannst du alle weiteren Kameraden über die App verwalten.

---

## Nächste Schritte

Nach diesem Setup bekommst du von mir:
- Den kompletten React/Vite Quellcode
- Anleitung zum Deployment auf Vercel (kostenlos)
- Die fertige App ist dann unter einer echten URL erreichbar

---

## Kosten

| Dienst | Kostenloser Plan reicht für... |
|--------|-------------------------------|
| Supabase | bis 500 MB DB, 1 GB Storage, unbegrenzte User |
| Vercel | unbegrenzte Deployments, kostenlos |
| **Gesamt** | **0 € / Monat** |

Für 250 Kameraden reicht der Free-Tier problemlos.

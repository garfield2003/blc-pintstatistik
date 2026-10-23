# BLC Pintstatistik – Einrichtung

Die App besteht aus zwei Teilen:

- **GitHub Pages** liefert die App aus (die Dateien in diesem Ordner).
- **Firebase** speichert die Daten (Mitglieder, Sitzungen, Preis, PINs).

Beides ist kostenlos. Einmal einrichten dauert etwa 20 Minuten.

---

## Teil 1: Firebase (Datenbank)

Du brauchst ein Google-Konto. Ein privates genügt.

1. **Projekt anlegen**
   Öffne <https://console.firebase.google.com> und klicke **Projekt erstellen**.
   Name: `blc-pintstatistik`. Google Analytics brauchst du nicht, schalte es aus.

2. **Anonyme Anmeldung einschalten**
   Links: **Build → Authentication → Jetzt starten**.
   Unter **Anmeldemethode** wählst du **Anonym**, schaltest es ein und speicherst.
   Damit bekommt jedes Gerät eine unsichtbare Kennung, an der der Club-PIN hängt. Mitglieder brauchen kein Konto.

3. **Datenbank anlegen**
   Links: **Build → Firestore Database → Datenbank erstellen**.
   - Standort: **europe-west6 (Zürich)**. Der Standort lässt sich später nicht mehr ändern.
   - Modus: **Produktionsmodus**.

4. **Regeln einsetzen**
   In Firestore öffnest du den Reiter **Regeln**. Lösche den Inhalt und füge den ganzen Inhalt der Datei `firestore.rules` ein. Dann klickst du **Veröffentlichen**.

5. **Web-App registrieren**
   Klicke auf das Zahnrad → **Projekteinstellungen**. Unten bei «Meine Apps» wählst du das Web-Symbol **`</>`**.
   Name: `BLC Pints`. **Firebase Hosting nicht ankreuzen.**
   Firebase zeigt dir dann einen Block `const firebaseConfig = { … }`.

6. **Konfiguration eintragen**
   Öffne `firebase-config.js` und ersetze die `HIER_EINFUEGEN`-Werte durch die Werte aus Schritt 5.
   Diese Werte sind nicht geheim. Geschützt werden die Daten durch die Regeln aus Schritt 4.

---

## Teil 2: GitHub Pages (App online stellen)

1. **Repository anlegen**
   Gehe auf <https://github.com/new>.
   - Name: `blc-pintstatistik`
   - Sichtbarkeit: **Public**. GitHub Pages ist im Gratisplan nur für öffentliche Repositories verfügbar.

2. **Dateien hochladen**
   Im neuen Repository klickst du **Add file → Upload files**. Dann ziehst du **alle Dateien und den Ordner `icons`** aus diesem Ordner ins Fenster. Klicke **Commit changes**.
   Diese Anleitung (`ANLEITUNG.md`) darfst du auch hochladen.

3. **Pages einschalten**
   Gehe zu **Settings → Pages**. Bei «Source» wählst du **Deploy from a branch**, dann Branch **main** und Ordner **/ (root)**. Klicke **Save**.
   Nach 1–2 Minuten ist die App erreichbar unter
   **`https://DEIN-GITHUB-NAME.github.io/blc-pintstatistik/`**

4. **Domain bei Firebase freigeben**
   In Firebase öffnest du **Authentication → Einstellungen → Autorisierte Domains → Domain hinzufügen**.
   Trage `DEIN-GITHUB-NAME.github.io` ein.

---

## Teil 3: Erster Start

1. Öffne die App-Adresse. Sie erkennt, dass die Datenbank leer ist, und zeigt die **Ersteinrichtung**.
2. Lege zwei PINs fest:
   - **Admin-PIN** (mindestens 6 Zeichen): nur für dich. Damit änderst du Preis, Mitglieder und PINs und kannst Sitzungen löschen.
   - **Club-PIN** (mindestens 4 Zeichen): zum Zählen. Diesen gibst du weiter, wenn jemand anders zählen soll.
3. Klicke **Einrichten und Excel-Stand übernehmen**. Danach stehen alle 11 Personen mit dem Stand BLC 09-2026 drin, total 2'273.5 Pints.

Dein Gerät ist danach als Admin freigeschaltet und bleibt es.

---

## Aufs Handy als App

- **iPhone (Safari):** Öffne die App-Adresse, tippe auf **Teilen** und dann auf **Zum Home-Bildschirm**. Das BLC-Logo erscheint als Icon. Die App öffnet im Vollbild ohne Browserleiste.
- **Android (Chrome):** Öffne die App-Adresse, tippe auf **⋮** und dann auf **App installieren** oder **Zum Startbildschirm hinzufügen**.

Die App startet auch ohne Empfang. Gezählte Pints werden übertragen, sobald wieder Netz da ist. Oben erscheint dann ein Hinweis «Offline».

---

## Im Alltag

| Was | Wer | Wo |
|---|---|---|
| Sitzung starten, zählen, Gäste hinzufügen | Club-PIN oder Admin-PIN | Sitzung |
| Frühere Sitzung korrigieren | Club-PIN oder Admin-PIN | Übersicht → Sitzung antippen |
| Statistik ansehen | alle mit dem Link | Übersicht |
| Pintpreis ändern | Admin-PIN | Verwaltung |
| Mitglieder umbenennen, Übertrag ändern, inaktiv setzen | Admin-PIN | Verwaltung |
| Sitzung löschen | Admin-PIN | Übersicht → Sitzung antippen |
| Export für Excel (CSV) | alle | Übersicht |

**Jemand anderem das Zählen überlassen:** Gib der Person den Club-PIN. Auf ihrem Handy öffnet sie die App und tippt auf **PIN eingeben**.

**Freigabe wieder entziehen:** Ändere unter **Verwaltung** den Club-PIN. Alle anderen Geräte verlieren damit sofort ihre Zählrechte. Dein Gerät mit dem Admin-PIN ist davon nicht betroffen.

**PIN vergessen:** Ein neuer PIN lässt sich nur über die Firebase-Konsole setzen: **Firestore → Daten → Sammlung `secret`**. Dort änderst du im Dokument `admin` oder `pin` das Feld `value`. Danach gibst du den neuen PIN in der App ein.

---

## Gut zu wissen

- **Wer die Statistik sieht:** Alle, die den Link kennen. Ändern kann nur, wer einen PIN hat.
- **Öffentliches Repository:** Der Code und die Datei `seed.js` mit dem Excel-Stand sind auf GitHub öffentlich einsehbar. Die PINs stehen nirgends im Code.
- **PIN-Sicherheit:** Der Schutz reicht für eine Pintstatistik. Wähle trotzdem keinen PIN wie `1234`. Mit 6 oder mehr Zeichen ist er deutlich schwerer zu erraten.
- **Sicherung:** Lade ab und zu unter Übersicht **Als Excel (CSV) herunterladen** einen Stand herunter.
- **Kosten:** Der Gratisplan «Spark» von Firebase reicht für euch um ein Vielfaches und läuft ohne Kreditkarte.
- **Demo-Modus:** Solange `firebase-config.js` nicht ausgefüllt ist, läuft die App im Demo-Modus. Die Daten bleiben dann nur im Browser, mit Club-PIN `1234` und Admin-PIN `9999`.

## Änderungen an der App

Wenn du geänderte Dateien hochlädst, erhöhe in `sw.js` die Versionsnummer in `CACHE = "blc-pints-v1"`, also auf `v2`, `v3` und so weiter. So laden alle Handys die neue Version.

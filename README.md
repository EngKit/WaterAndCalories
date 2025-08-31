# Water & Calories Tracker

Cross‑platform workflow to log **Water** and **Calories** and review a 7‑day summary.

- iOS: Shortcuts + Scriptable (JavaScript)
- Planned, but not implemented at this time: Android: Tasker project ;
- Planned, but not implemented at this time: Web: local PWA‑style page (no server; uses localStorage) ; Currently not implemented

CSV format (comma):
```
id,exec_ts_iso,event_ts_iso,event
57894af0,2025-08-13 08:55,water,2025-08-13 09:02
77d52fad,2025-08-13 09:15,calories,2025-08-13 09:15
```

## Nutzung auf dem iPhone

Die aktuelle Implementierung richtet sich an iOS. Benötigt werden die Apps **Scriptable** (aus dem App Store) und **Kurzbefehle**.

### 1. Skripte installieren

1. Öffne Scriptable und lege für jede Datei aus `ios/scriptable/` ein neues Skript an (`MealWaterLogger`, `MealBackfill`, `MealReport`).
2. Kopiere den jeweiligen Quellcode aus diesem Repository in das Skript.
3. Beim ersten Ausführen wird in `iCloud Drive/Scriptable/` eine Datei `meal_log.csv` erstellt, in der alle Ereignisse gespeichert werden.

### 2. Wasser oder Kalorien erfassen

1. Starte das Skript **MealWaterLogger** direkt in Scriptable oder über einen Kurzbefehl.
2. Ohne Parameter fragt das Skript, ob „💧 Wasser“ oder „🍽️ Kalorien“ eingetragen werden sollen. Über Kurzbefehle kann der Parameter `event=water` bzw. `event=calories` übergeben werden, um den Dialog zu überspringen.
3. Nach dem Speichern zeigt eine Benachrichtigung an, wie viel Zeit seit dem letzten Wasser‑ bzw. Kalorienereignis vergangen ist.

### 3. Vergangene Ereignisse nachtragen

1. Starte **MealBackfill**.
2. Wähle zunächst den Ereignistyp (Wasser oder Kalorien) und anschließend den Zeitpunkt – entweder „Jetzt“, eine der Schnellauswahlen (−15 min, −30 min, −1 h, −2 h) oder eine manuelle Eingabe von Datum und Uhrzeit.
3. Das Ereignis wird mit dem gewählten Zeitpunkt in `meal_log.csv` abgelegt.

### 4. Auswertungen anzeigen

1. Starte **MealReport**.
2. Wähle „Heute“ für eine Tagesansicht oder „Letzte 7 Tage“ für eine Wochenübersicht. Alternativ können Kurzbefehle die Parameter `mode=today` oder `mode=week` übergeben.
3. Das Skript rendert eine HTML‑Ansicht mit Kennzahlen und Mini‑Diagrammen; diese wird in einem WebView angezeigt und kann über die Teilen‑Funktion exportiert werden.

Die CSV‑Datei kann jederzeit über die Dateien‑App eingesehen oder exportiert werden.

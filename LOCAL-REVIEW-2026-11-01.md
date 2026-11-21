# Lokale Vorarbeit: öffentlicher Auftritt, 1. November 2026

## DUK-142: Statusdaten

Ausgangsbasis: `jqttk/duktus-status@476393bdce3fae3c8eb74fa5fbd60969b039e89a`. Lokal und nicht committed. Bei Statusdaten über 15 Minuten, fehlendem, ungültigem oder zukünftigem Zeitstempel wird der aktuelle Zustand neutral dargestellt; fehlende Komponentendaten erscheinen ebenfalls neutral. Ein früherer Ausfall wird nicht als aktuell gemeldet. Bei fehlender Störungsdatei wird dies ausgewiesen.

`node --test scripts/*.test.mjs`: 26 bestanden, keine Skips. Die vier neuen Anzeigetests scheiterten vor der Korrektur in den betreffenden Fällen. `git diff --check` bestanden. Die Tests verwenden ein minimales DOM; eine echte Browser- und visuelle Prüfung ist offen.

Die historischen Prozentwerte bleiben unverändert. Der Checker fragt Web und einen gemeinsamen Backend-Endpunkt ab; gleichartige Werte für mehrere Dienste belegen daher keine unabhängige Messung einzelner Abläufe. Messumfang, eventuelle Platzhalter, Layout-Sprung und die Vertrauens-/Hostingtexte im synchronisierten Footer brauchen weitere Prüfung. Dieser lokale Entwurf belegt keine tatsächliche Verfügbarkeit, keinen Merge und keinen Live-Fix.

## Abhängige öffentliche Arbeiten

- Website-PR #14 (`c5836fbd`): Canonical- und Linktests vorhanden, aber vollständiger Altlink-/Redirect-Abgleich sowie fachliche Quellenprüfung offen.
- Website-PR #15 (`b377f590`): ausgewählte Kontrasttests vorhanden, Lighthouse-CI fehlgeschlagen, Log beim Abruf nicht verfügbar; visuelle/axe-Abnahme offen.
- DUK-128: Öffentliche Stichprobe am 1.11.: PDF mit PyMuPDF geöffnet (2 Seiten, 4.030 extrahierte Zeichen), DOCX mit python-docx geöffnet (41 Absätze, 4.014 Zeichen). ZIP-Integrität des DOCX geprüft. Visuelle PDF-Kontrolle und inhaltlicher Vergleich mit der freigegebenen Vorlage bleiben offen; der ältere Defekt wird damit nicht rückwirkend bestritten.
- DUK-132: Befund-Seitenquelle und Deploymentweg noch nicht sicher zugeordnet; drei 404 bei öffentlicher Stichprobe bestätigt.
- Vor späterer Veröffentlichung: Live-Assets, Footer-Claims und die getrennten Quell- und Deploymentwege abgleichen, Freeze und Freigaben beachten.

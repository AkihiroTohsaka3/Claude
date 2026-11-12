# Calendrier : contrat avec AnkiLock

Ce site (https://akihirotohsaka3.github.io/Claude/calendrier/) est aussi ouvert dans l'app Android AnkiLock,
qui lit les événements « Locker » pour bloquer le téléphone pendant ces créneaux. AnkiLock ne lit pas de
fichier : il exécute un script dans la page, qui utilise directement les noms ci-dessous. Si l'un d'eux
change, le site marche toujours mais les blocages cessent sans aucun message d'erreur.

## À ne jamais renommer, déplacer ni supprimer

Dans `js/core.js`, chargé comme script classique (pas de module, pas de bundler, pas d'IIFE autour) :

- `events` : variable globale (`var`), tableau de tous les événements.
- `occursOn(ev, k)` : fonction globale, vrai si l'événement a lieu le jour `k` (récurrence comprise).
- `keyOf(d)` : fonction globale, Date → "AAAA-MM-JJ".
- `toMin(hhmm)` : fonction globale, "HH:MM" → minutes.

Champs d'un événement à garder avec ce sens :
- `lock` (booléen) : option Locker.
- `allDay` (booléen) : AnkiLock ignore les journées entières.
- `start`, `end` ("HH:MM", heure locale) : une fin ≤ début veut dire le lendemain.
- `title` : affiché sur l'écran de blocage.

Stockage : la clé localStorage `cal-events-v3` ne doit pas changer, sinon les événements déjà
enregistrés sur le téléphone disparaissent du site.

## Autorisé

Tout le reste : style, nouvelles fonctions, nouveaux champs, nouveaux fichiers, réorganisation des autres scripts.
Ajouter du code est sans risque tant que les noms ci-dessus restent globaux et gardent leur comportement.

## Si un changement les touche quand même

Préviens l'utilisateur avant. Il doit alors faire adapter AnkiLock (script `READ_SLOTS` dans
`CalendarActivity.kt`), sinon ses blocages du calendrier s'arrêtent.

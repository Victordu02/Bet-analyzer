# Imports génériques

Ces formats appartiennent à PRISME. Ils ne prétendent pas être un export natif Bet Analytix ou Winamax. Utiliser uniquement des fichiers obtenus avec les droits nécessaires. Les exemples de `public/examples/` sont entièrement fictifs et destinés à l’espace Démonstration.

## Parcours

1. Sélectionner l’espace, puis Sources et imports.
2. Choisir pronostics ou tickets, ouvrir le CSV et associer ses colonnes aux champs PRISME.
3. Prévisualiser les erreurs et avertissements ligne par ligne.
4. Confirmer l’enregistrement. Les imports et leur bilan sont conservés.

UTF-8, virgule ou point-virgule, champs entre guillemets selon les règles CSV. Nombres français acceptés (`20,50`, espaces de milliers). Dates ISO avec décalage recommandées ; `JJ/MM/AAAA HH:mm` est interprété dans Europe/Paris, puis stocké en UTC. Une heure inexistante lors d’un changement d’heure est refusée. Pour une heure ambiguë, fournir un ISO avec décalage explicite.

## Pronostics

Colonnes disponibles :

`source_id, tipster, event, event_key, sport, competition, market, selection, line, rules, odds, min_odds, stake_units, published_at, starts_at, result, settled_at, settlement_source, source_url, argument, notes, kind, timing`

`tipster` désigne un nom ou identifiant ; un nom inconnu crée un profil déclaré. `event_key` est un identifiant d’événement stable partagé entre ses marchés. `rules` explicite par exemple le temps réglementaire, les prolongations ou les conditions d’annulation. `min_odds` est le seuil attribué au tipster. `kind` : `single` ou `accumulator` ; `timing` : `prematch` ou `live`.

Résultats : `open`, `won`, `lost`, `void`, `half_won`, `half_lost`, `cashout` (libellés français également reconnus). Un résultat réglé nécessite sa date et sa provenance. Tous les pronostics CSV restent au niveau **Déclaré** : la date fournie n’est pas une observation prospective de l’application.

## Tickets réellement acceptés

Colonnes disponibles :

`source_id, pick_id, event, event_key, market, selection, line, rules, kind, bookmaker, odds, stake, stake_cents, funding, placed_at, result, return, return_cents, fee, fee_cents, settled_at, remaining_stake, remaining_stake_cents, partial_cashout, source, notes`

`stake`, `return`, `fee`, `remaining_stake` sont en **euros**. Leurs variantes `_cents` sont des entiers exacts. Ne fournir qu’une unité par champ. `return` désigne le retour brut cumulé, restitution de mise comprise lorsqu’elle s’applique. `funding` : `cash` ou `freebet`. Un freebet ne débite pas sa valeur faciale du cash.

`source_id` est l’identifiant stable du ticket dans sa source. `source` précise la provenance du ticket accepté. Pour un combiné, une seule ligne représente la mise du ticket ; ne pas recopier sa mise pour chaque jambe. Les règles et le détail des sélections peuvent être conservés dans les champs descriptifs. Un cashout partiel conserve la portion restante connue ; à défaut le coût ouvert est signalé incertain et les suggestions sont bloquées.

## Idempotence et conflits

- Même fichier dans le même espace et même famille : pas de doublon ni d’effet financier supplémentaire.
- Même identifiant source : mise à jour traçable, notamment ticket ouvert puis réglé.
- Correction manuelle existante : préservée ; le conflit est signalé plutôt qu’écrasé.
- Sans identifiant source : les ressemblances sont des doublons **probables**. Une confirmation explicite est nécessaire pour conserver des lignes distinctes ; aucun pari réellement distinct ne doit être silencieusement supprimé.
- Par défaut, toute erreur empêche le lot. L’import partiel nécessite une confirmation explicite et garde les erreurs dans l’historique.

Le rapprochement compare le cash calculé au solde saisi. Un écart ne crée pas automatiquement une écriture : expliquer sa cause avant d’ajouter un ajustement justifié. Les dépôts, retraits, poker et frais restent distingués.

# Imports génériques

Ces formats appartiennent à PRISME. Ils ne prétendent pas être un export natif Bet Analytix ou Winamax. Utiliser uniquement des fichiers obtenus avec les droits nécessaires. Les exemples de `public/examples/` sont entièrement fictifs et destinés à l’espace Démonstration.

## Parcours

1. Sélectionner l’espace, puis Sources et imports.
2. Choisir pronostics ou tickets, ouvrir le CSV et associer ses colonnes aux champs PRISME.
3. Prévisualiser les erreurs et avertissements ligne par ligne. Le service applique les mêmes contrôles de relations et de chronologie financière qu’à l’enregistrement.
4. Confirmer les droits d’utilisation puis l’enregistrement. Un import partiel ou la conservation de doublons probables exige sa confirmation distincte. Les lots, erreurs et reprises sont conservés.

UTF-8, virgule ou point-virgule, champs entre guillemets selon les règles CSV. Nombres français acceptés (`20,50`, espaces de milliers). Les montants sont convertis exactement en centimes ; les sous-centimes sont refusés. Les variantes `_cents` attendent un entier sûr, jamais un montant en euros.

Dates ISO avec décalage recommandées ; `JJ/MM/AAAA HH:mm` est interprété dans Europe/Paris, puis stocké en UTC. Les dates impossibles et les heures inexistantes ou ambiguës lors d’un changement d’heure sont refusées. Pour une heure ambiguë, fournir un ISO avec décalage explicite. Les mouvements et règlements réels futurs ne sont pas acceptés.

## Pronostics

Colonnes disponibles :

`source_id, tipster, event, event_key, sport, competition, market, selection, line, rules, odds, min_odds, stake_units, published_at, starts_at, result, settled_at, settlement_source, source_url, argument, notes, kind, timing`

`tipster` désigne un nom ou identifiant ; un nom inconnu crée un profil déclaré. `event_key` est un identifiant d’événement stable partagé entre ses marchés. `rules` explicite par exemple le temps réglementaire, les prolongations ou les conditions d’annulation. `min_odds` est le seuil attribué au tipster. `kind` : `single` ou `accumulator` ; `timing` : `prematch` ou `live`.

Résultats : `open`, `won`, `lost`, `void`, `half_won`, `half_lost`, `cashout` (libellés français également reconnus). Un résultat réglé nécessite sa date et sa provenance. Tous les pronostics CSV restent au niveau **Déclaré** : la date fournie n’est pas une observation prospective de l’application.

## Tickets réellement acceptés

Colonnes disponibles :

`source_id, pick_id, event, event_key, market, selection, line, rules, kind, bookmaker, odds, stake, stake_cents, funding, placed_at, result, return, return_cents, fee, fee_cents, settled_at, remaining_stake, remaining_stake_cents, partial_cashout, settlement_mode, correction_payment_id, correction_payment_at, source, notes`

`stake`, `return`, `fee`, `remaining_stake` sont en **euros**. Leurs variantes `_cents` sont des entiers exacts. Fournir une seule unité par champ : deux valeurs non vides en euros et centimes sont refusées, même si elles paraissent identiques. `return` désigne le **retour brut cumulé**, restitution de mise comprise lorsqu’elle s’applique. `funding` vaut `cash` ou `freebet` ; une freebet ne débite pas sa valeur faciale du cash.

`source_id` est l’identifiant stable du ticket, dans le périmètre de son bookmaker. `source` précise la provenance de l’acceptation. Un même identifiant source répété dans un fichier est refusé : les mises à jour successives d’un ticket se font par des imports distincts ou par son formulaire. Un lien `pick_id` doit correspondre à l’événement, au marché, à la sélection, à la ligne, aux règles et au type du pronostic lié.

Pour un combiné, une seule ligne représente la mise du ticket ; ne pas recopier sa mise pour chaque jambe. Les règles et le détail des sélections peuvent être conservés dans les champs descriptifs.

Un ticket ouvert ne possède ni retour ni date de règlement ; laisser `remaining_stake` vide tant qu’il n’y a pas de cashout partiel. Un ticket cash annulé doit indiquer le retour intégral de sa mise ; une freebet annulée a un retour cash nul. Un ticket gagnant doit renseigner son montant réellement encaissé. Le moteur ne calcule pas ce montant à partir de la cote.

## Cashouts, nouveaux versements et corrections

`partial_cashout=true` exige `result=cashout`. `remaining_stake` représente le coût d’acquisition de la portion encore ouverte. Ce coût doit être documenté et ne peut dépasser la mise initiale. S’il manque, le capital et le résultat de la portion cédée sont provisoires, et les nouvelles allocations sont bloquées.

| Colonne | Contrat |
| --- | --- |
| `settlement_mode` | `payment` pour un nouvel encaissement, `correction` pour rectifier un encaissement existant. |
| `settled_at` | Date du nouveau versement ou du dernier règlement documenté. |
| `return` / `return_cents` | Nouveau retour **cumulé**, pas le seul montant supplémentaire. |
| `correction_payment_id` | Identifiant du versement à rectifier ; requis si plusieurs versements existent et qu’une correction de montant ou de date est demandée. Consultable dans la fiche du ticket. |
| `correction_payment_at` | Nouvelle date explicite du versement corrigé, si elle doit changer. |

Après un cashout partiel, une augmentation du cumul sans `settlement_mode` est refusée. En mode `payment`, la différence positive avec l’ancien cumul devient un versement daté supplémentaire ; ses dates ne peuvent précéder les encaissements déjà conservés. La correction ciblée d’un versement est incompatible avec ce mode.

Exemple en deux imports distincts, pour le même `source_id` : un ticket a déjà encaissé 4 € à J1 ; un nouvel import indique `settlement_mode=payment`, `return=7,00` et `settled_at=J2`. Seuls 3 € sont ajoutés à J2. Les 4 € de J1 restent à J1. Réimporter le même lot n’ajoute aucun versement supplémentaire.

En mode `correction`, le delta du cumul modifie le versement ciblé ; les autres restent à leurs dates. Avec un seul versement, la date de règlement saisie sert normalement de date corrigée. Une clôture après cashout partiel sans nouveau retour conserve la date de l’encaissement antérieur et libère le coût restant à la date de clôture : utiliser le résultat cashout, désactiver le caractère partiel et conserver le cumul encaissé. Les détails techniques `returnPayments` sont construits par le serveur, pas injectés comme une colonne libre du CSV.

Un ancien cumul ne révèle pas les dates des cessions qu’il agrège. Les anciens cashouts incomplets identifiés restent marqués provisoires, y compris après une modification neutre. Le CSV de cumul ne reconstitue pas à lui seul un historique de versements absent ; ne pas inventer ces dates ou coûts. Voir [BANKROLL.md](BANKROLL.md).

## Idempotence, reprises et conflits

- L’empreinte dépend de la famille, du contenu CSV exact et de la correspondance de colonnes lorsqu’elle diffère du format canonique ; elle est isolée par espace. Changer les options d’import partiel ne transforme pas les lignes déjà réussies en nouvelles opérations.
- Le même fichier avec la même interprétation ne produit aucun doublon. Les numéros de lignes déjà traitées sont conservés dans `completedRows`, y compris les lignes volontairement ignorées pour préserver une correction manuelle.
- Après un import partiel, réimporter le même fichier permet de réévaluer uniquement les lignes auparavant en erreur, par exemple après ajout d’un capital initial manquant. Les lignes réussies restent ignorées. La nouvelle tentative référence le lot d’origine par `retryOf` ; les erreurs des tentatives précédentes sont conservées.
- Si toutes les lignes sont déjà traitées, le réimport est sans effet financier et ne crée pas un nouveau lot de reprise. Pour les anciens lots sans `completedRows`, les lignes qui n’étaient pas en erreur sont considérées comme déjà traitées.
- Modifier le contenu ou la correspondance des colonnes constitue une nouvelle interprétation. Les protections par identifiant source et les avertissements de doublon restent applicables : vérifier la prévisualisation.
- Même identifiant source : mise à jour traçable, notamment ticket ouvert puis réglé. Un import ne remplace pas une correction manuelle existante ; le conflit est signalé et la donnée conservée.
- Sans identifiant source : les ressemblances sont des doublons **probables**. Une confirmation explicite est nécessaire pour conserver des lignes distinctes ; aucun pari réellement distinct ne doit être silencieusement supprimé.
- Par défaut, toute erreur empêche le lot. L’import partiel nécessite une confirmation explicite et garde les erreurs dans l’historique. Les lignes sont évaluées dans leur ordre ; les fonds doivent être documentés avant les mises qu’ils financent.

## Cash et rapprochement

Les saisies et imports vérifient le cash à chaque date économique. Un ticket gagnant importé tardivement doit avoir été financé à sa date de prise ; son retour ultérieur ne finance pas rétroactivement sa mise. Les corrections ajoutent seulement les compensations nécessaires et gardent l’audit.

Le rapprochement compare le cash du journal au solde relevé **à la date du relevé**, puis conserve le calcul dans un snapshot audité. Les corrections ultérieures peuvent modifier le résultat recalculé aujourd’hui sans réécrire ce snapshot. Un écart ne crée pas automatiquement une écriture : expliquer sa cause avant d’ajouter un ajustement justifié. Les dépôts, retraits, poker et frais restent distingués ; ces mouvements libres sont saisis dans le journal, séparément des CSV de tickets.

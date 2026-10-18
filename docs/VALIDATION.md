# Recette exécutée

Date : **18 octobre 2026**. Exécution réelle dans `/workspace/Bet-analyzer`, Linux x64, Node **24.19.0**, PostgreSQL **17.10**, Next.js **16.4.2**. Le détail des versions est verrouillé dans `package-lock.json`.

## Résultats

| Contrôle | Résultat |
| --- | --- |
| Installation depuis le lockfile, `npm ci` | Réussie, 156 paquets installés |
| Initialisation `npm run setup`, répétée | Réussie ; configuration existante conservée |
| Migrations PostgreSQL, répétées | Réussies, sans réapplication ni effacement |
| Redémarrage PostgreSQL + Next via `npm run local` | Réussi après arrêt des services lancés pour cette recette |
| `npm run typecheck` | Réussi |
| `npm test` | **52 tests réussis**, 4 fichiers, aucun test ignoré |
| Build de production Next.js | Réussi, vérification TypeScript incluse |
| `npm run test:e2e` | **2 parcours Chromium réussis**, base PostgreSQL distincte |
| `npm run smoke` | Refus anonyme 401 et lectures métier authentifiées des deux espaces vérifiés |
| Sauvegarde / restauration | Restauration dans une nouvelle base : volumes métier et cash identiques |
| Traçage du build | 11 manifestes vérifiés ; aucun chemin `.local/`, `.env.local` ou sauvegarde embarqué |

## Risques couverts

Les tests déterministes vérifient les exemples de gain (+30 € pour 20 € à 2,50), cashout (−8 €), freebet sans débit de valeur faciale, EV (+1 € pour 10 € à 2,00 et hypothèse 55 %), Kelly/plafonds, arrondi, absence de probabilité, doublons, budgets partagés, marchés indisponibles, cotes anciennes, versions et preuves. Le drawdown neutralise les dépôts/retraits, y compris recapitalisation après perte intégrale et règlement reçu tardivement. Les cashouts partiels restent dans l’exposition ; un coût restant inconnu bloque les allocations.

Les tests PostgreSQL utilisent **prisme_test**, avec garde empêchant leur nettoyage sur une autre base. Ils couvrent les transactions concurrentes, insuffisance de cash, rollback, idempotence fichier/ticket, passage ouvert→réglé, conflits avec corrections manuelles, données françaises, droits d’import, séparation des espaces, référence des tickets, invalidation des cotes après changement de marché et validation des sauvegardes. Les probabilités de marché/modèle sans provenance évaluée sont refusées dans l’API V1.

## Parcours navigateur

Dans **prisme_e2e**, initialement vide :

1. Refus de l’export sans session et d’une mutation provenant d’une autre origine.
2. Connexion privée ; import CSV via l’interface, prévisualisation et confirmation des droits.
3. Vérification de l’historique déclaré, de la fiche tipster et du classement à une unité ; réimport sans doublon.
4. Gel d’un segment avant sa période de validation ; observation prospective d’un pronostic et rapprochement manuel d’une cote.
5. Fiche de décision et simulation de Kelly limitée à 10 € ; aucun mouvement cash créé par la simulation.
6. Saisie d’un ticket par formulaire : mise de 20 €, cash de 980 €, position ouverte de 20 €.
7. Règlement gagnant : retour 50 €, cash **1 030 €**, résultat net **+30 €**, exposition zéro ; rapprochement.
8. Rapport et export complets ; vérification des centimes et de l’absence de secret de connexion dans l’export.
9. Ouverture de la démonstration sans modifier les données de l’espace personnel.
10. Navigation dans les huit vues sur écran 390 × 844, thème sombre, menu, absence de débordement de page ; capture du radar de démonstration sur ordinateur et mobile.

Les captures de recette, exclues de Git, sont dans `test-results/` : `radar-desktop.png`, `radar-mobile-dark.png`, `sources-mobile.png`, `rapport-desktop.png`. Elles ne contiennent que des données de test fictives. Les graphiques et la mise en page ont aussi été inspectés visuellement.

## Portée de la validation

L’espace personnel de l’installation livrée a été vérifié **vide** : 0 pronostic, 0 ticket, 0 mouvement. La démonstration contient 85 pronostics, 4 profils et 9 tickets fictifs dans son espace distinct.

Ces vérifications démontrent le fonctionnement local de l’application et la cohérence des cas testés. Elles ne démontrent aucune stratégie rentable, couverture sportive d’un fournisseur, synchronisation de compte Winamax, qualité d’une future donnée externe ou validation d’un modèle prédictif.

Le brouillon cloud sauvegarde `install_script`, `start_skill` et six domaines documentaires. Sa sauvegarde ne publie pas l’environnement et n’établit pas la restauration dans une future tâche. Les étapes de publication restent dans l’interface de l’environnement.

## Complément — analyse et qualification des tipsters, sections 4 et 5

Validation exécutée le **18 octobre 2026** après l’ajout du moteur `tipster-analysis.ts`, des vues, des variantes auditées et de l’enrichissement de démonstration.

| Contrôle | Résultat |
| --- | --- |
| `npm test` | **78 tests réussis**, 6 fichiers, aucun test ignoré |
| `npm run typecheck` | Réussi sans erreur |
| `npm run build` | Build de production et vérification TypeScript réussis |
| Chromium ciblé, vues Tipsters et Spécialités | Réussi sur ordinateur 1440 × 1000 et mobile 390 × 844, thème sombre mobile |
| Enregistrement d’une variante par l’interface | Variante ajoutée à l’audit de démonstration et bouton de confirmation vérifié |
| Données personnelles | Effectifs pronostics, tickets, journal et audit identiques avant/après le parcours de démonstration |

Les **18 nouveaux tests du moteur d’analyse** couvrent la pondération déclarée distincte du résultat à une unité, les combinés à mise unique, les annulations, les catégories exclues, les données vides ou insuffisantes, la concentration et la dispersion, les règlements simultanés et le bootstrap par événement. Ils vérifient aussi les quatre preuves, l’absence de mélange de scénarios, les cotes réellement connues, les retours et frais réels distincts de la référence à une unité, les sept axes et les révisions temporelles des périodes de découverte/validation.

Les tests de service et de démonstration vérifient l’enrichissement d’une installation déjà initialisée, l’idempotence, les collisions sans écrasement, l’isolation personnelle, les variantes auditées, les bornes de filtres et la conservation de l’observation initiale après correction de classification.

La démonstration enrichie compte **8 profils, 241 pronostics et 13 tickets fictifs**. Les captures exclues de Git sont `test-results/tipsters-analysis-desktop.png`, `specialties-analysis-desktop.png`, `tipsters-analysis-mobile.png` et `specialties-analysis-mobile.png`. Elles ont été inspectées ; aucun débordement horizontal de page ni erreur JavaScript n’a été détecté. Les tableaux larges défilent dans leur propre conteneur.

Le contrôle Chromium de ce complément est un parcours ciblé distinct des deux tests E2E de la recette initiale ; la suite E2E complète n’a pas été relancée. Aucun capital de tipster n’a été inventé pour afficher un drawdown en pourcentage : la mesure en unités est disponible, et le pourcentage par valeur de part reste explicitement non applicable lorsque ses flux propres manquent.

## Complément — radar Winamax et espérance, sections 6 et 7

Validation exécutée le **18 octobre 2026**.

| Contrôle | Résultat |
| --- | --- |
| `npm test` | **115 tests réussis**, 8 fichiers, aucun test ignoré |
| `npm run typecheck` | Réussi après correction du typage des événements de formulaire |
| `npm run build` | Build de production et vérification TypeScript réussis ; route authentifiée `/api/connectors` incluse |
| Chromium ciblé | Radar et fiche de décision vérifiés sur ordinateur 1440 × 1000 et mobile 390 × 844, sans erreur JavaScript ni débordement |
| Espérance dans l’interface | Sans probabilité : « espérance inconnue » ; hypothèse 55 %, cote 2,00 et mise 10 € : **+1 €** et grille de sensibilité |
| Repli sans configuration | Statut sans clé, route protégée, démonstration sans appel fournisseur ; données personnelles inchangées |
| Marché complet dans l’interface | Confirmation obligatoire, normalisation 2,00/2,00 à 50 %/50 %, confirmation réinitialisée après changement de cote |

Les nouveaux tests du radar et de l’espérance couvrent les probabilités absentes/invalides, la provenance manuelle/marché/modèle, l’arrondi au centime, les bornes 0 et 1, les marchés complets et les états nets. Ils vérifient aussi la première cote comparable, les deux horodatages et la date de prix fournisseur, le TTL PRISME, les lignes/règles, les six statuts, les dossiers conservés et les alias d’un événement déjà exposé. Des régressions vérifient ces mêmes contrôles dans les simulations et le backtest.

Les **15 tests du transport et des correspondances** utilisent des réponses v4 fictives injectées : ciblage exclusif `winamax_fr`, absence de substitution de date, cache sans rajeunissement, quota nul, 429, reprises bornées, délais, erreurs sans clé exposée, confirmation humaine, lignes et totaux contradictoires, prix anciens/futurs et priorité du candidat exact avant troncature. Deux tests PostgreSQL supplémentaires vérifient persistance, déduplication, audit des quotas et absence de ticket ou de mouvement financier créé par une collecte.

Les captures exclues de Git sont `test-results/radar-odds-desktop.png`, `radar-odds-mobile.png`, `decision-ev-desktop.png` et `decision-ev-mobile.png`. Le parcours utilise exclusivement des données fictives dans la démonstration et compare les volumes personnels avant/après.

La documentation officielle actuelle confirme `winamax_fr` ; les pages et le contrat vérifiés sont référencés dans [CONNECTORS.md](CONNECTORS.md). **La clé `ODDS_API_KEY` est absente : aucune collecte authentifiée de cotes réelles n’a été exécutée.** La couverture et les règles du forfait doivent encore être vérifiées lors de la recette avec une clé configurée. La suite E2E complète initiale n’a pas été relancée pour ce complément.

## Complément — bankroll et simulation de mises, sections 8 et 10

Validation exécutée le **18 octobre 2026**.

| Contrôle | Résultat |
| --- | --- |
| `npm test` | **172 tests réussis**, 12 fichiers, aucun test ignoré |
| `npm run typecheck` | Réussi sans erreur |
| `npm run build` | Build de production et vérification TypeScript réussis |
| `npm run db:migrate` | Migration `0002_import_retries.sql` appliquée sur l’installation locale ; également vérifiée sur `prisme_test` |
| Chromium ciblé | Formulaires et tableaux bankroll, rapprochement et comparaison des trois méthodes vérifiés sur ordinateur 1440 × 1000 et mobile 390 × 844 |
| Ticket via formulaire | Mise 20 €, cash disponible débité de 20 €, position ouverte de 20 € ; règlement 50 €, résultat +30 €, position libérée |
| Cashouts successifs | Deux encaissements fictifs de 4 € puis 3 € conservés à leurs dates propres, cumul 7 € |
| Rapprochement via formulaire | Cash calculé à la seconde du relevé, écart volontaire de **1 centime**, source et écritures conservées dans l’audit ; aucun mouvement ajouté |
| Comparaison et archivage | Trois méthodes retournées, snapshot sauvegardé, journal strictement identique avant/après l’archivage |
| Interface | Captures inspectées, aucun débordement horizontal de page ni erreur JavaScript dans le parcours réussi |

Les **57 tests supplémentaires** comprennent 20 cas financiers déterministes, 25 cas de validation/import, huit intégrations PostgreSQL et quatre cas de saisie monétaire et de dates. Ils couvrent retours bruts et nets, remboursement cash, freebet sans débit facial, frais, cashouts partiels et multiples, coût restant inconnu, anciens cumuls non détaillés, corrections, capital externe distinct du résultat et rapprochements datés.

Les contraintes de mise sont vérifiées conjointement : mise fixe/pourcentage/quart de Kelly, plancher au centime, limites pari/événement/exposition, budgets jour/mois de Paris, pause, probabilité absente, doublons, lignes numériques équivalentes et alias fournisseur hérités. Les tests vérifient aussi qu’un dépôt ou retour futur ne finance pas une mise passée et que les pertes n’entraînent pas d’augmentation automatique des mises.

Les intégrations utilisent exclusivement `prisme_test`. Elles vérifient les écritures compensatrices, la conservation des versements antérieurs, les reprises d’import sans nouvelle mise, les snapshots serveur, le rapprochement historique et la restauration des sauvegardes avec dates, montants et liens de reprise cohérents.

Le parcours Chromium final utilise les données fictives de démonstration et compare les effectifs **et les réglages** personnels avant/après. Lors d’une tentative préparatoire, un rechargement a ramené le script sur l’espace personnel et un relevé fictif y a été enregistré, sans ticket ni mouvement financier. Ce seul audit de recette a été retiré et ses deux références de réglage restaurées à leur valeur antérieure ; le parcours corrigé vérifie la bannière de démonstration après chaque rechargement. Aucune donnée de recette personnelle ne subsiste.

Les captures, exclues de Git, sont `test-results/bankroll-finance-desktop.png`, `bankroll-finance-mobile.png`, `simulations-finance-desktop.png` et `simulations-finance-mobile.png`. Ce contrôle ciblé est distinct des deux tests E2E initiaux ; leur suite complète n’a pas été relancée. Les anciens cashouts sans détail restent explicitement provisoires : leur migration ne démontre ni dates ni coûts intermédiaires absents.

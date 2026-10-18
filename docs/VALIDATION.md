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

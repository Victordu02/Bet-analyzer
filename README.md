# PRISME — Bet Analyzer

Application personnelle d’analyse de tipsters, de suivi prospectif, de simulation et de comptabilité des paris. Interface française, EUR, dates Europe/Paris, stockage UTC. Aucun pari ni mouvement de compte n’est effectué chez Winamax.

## Démarrer localement

Prérequis : Node.js **22 ou ultérieur**, npm, Linux/macOS/Windows pris en charge par la distribution PostgreSQL embarquée. Environnement vérifié : Linux x64, Node 24.19, PostgreSQL 17.10.

```bash
cd /workspace/Bet-analyzer
npm ci
npm run local
```

`local` crée la configuration manquante, démarre PostgreSQL local si nécessaire, applique les migrations, puis lance Next.js sur l’interface locale au port **3000**. Une base déjà disponible est réutilisée. Le mot de passe initial est généré dans **`.local/initial-password.txt`**, lisible uniquement par son propriétaire : consultez ce fichier depuis votre terminal, connectez-vous et changez le mot de passe dans Paramètres. Ne transmettez jamais ce fichier dans une conversation ou dans Git.

L’espace personnel démarre vide. **Explorer la démonstration** ouvre un espace séparé contenant uniquement des profils, événements, cotes et tickets fictifs. Les plafonds d’exemple sont 1 % par pari, 2 % par événement, 5 % d’exposition totale et un quart de Kelly. Ils ne configurent pas vos limites personnelles.

Pour lancer les services séparément :

```bash
npm run setup
npm run db:start      # terminal 1, processus à conserver
npm run db:migrate    # terminal 2
npm run dev          # terminal 2
```

Le dossier `.local/postgres` conserve les données entre les redémarrages. Pour une base PostgreSQL externe, définir `DATABASE_URL` dans `.env.local`, démarrer ce service séparément et utiliser `db:migrate` puis `dev`. Ne pas copier les identifiants de `.env.example` tels quels : ils sont des marqueurs, pas des secrets utilisables.

## Parcours disponibles

- **Radar** : dossiers, disponibilité et fraîcheur des cotes, seuil attribué au tipster, sources, révisions, fiche de décision.
- **Tipsters** : fiches, provenance, complétude, classement à mise constante d’une unité et P&L pondéré par les mises déclarées, volume, dispersion, concentration et drawdown.
- **Spécialités** : filtres prévus par sport, compétition, marché, cotes, simple/combiné, avant-match/live et délai ; séparation découverte / validation et règles figées versionnées.
- **Simulations** : mise fixe, pourcentage, Kelly fractionné, doublons et plafonds partagés par panier ; calculatrices EV, sensibilité, marge et CLV ; rejeu chronologique et abstentions exportables.
- **Bankroll** : tickets réellement acceptés, règlements et corrections, annulations, freebets, cashouts, frais, dépôts/retraits, journal au centime, exposition, valeur de part et rapprochement.
- **Sources et imports** : CSV générique avec correspondance des colonnes, prévisualisation, erreurs et conflits, historique, réimport idempotent. Les templates sont fictifs.
- **Rapports** : synthèses à la demande, périodes, comparaison explicite des quatre niveaux de preuve et liens vers les enregistrements sources.
- **Paramètres** : limites personnelles, pause des allocations, fraîcheur, fréquence de revue, rapprochement et changement de mot de passe. Thèmes clair/sombre et affichage mobile.

Le niveau **Déclaré**, l’observation avant événement, la simulation Winamax et le ticket exécuté restent des objets et populations distincts. Les calculs acceptent « non applicable », « données insuffisantes » et « aucun pari éligible ». Aucune probabilité n’est déduite automatiquement du taux de réussite d’un tipster.

## Vérification

```bash
npm run typecheck
npm test
npm run smoke        # serveur web et base démarrés
npm run test:e2e     # build production + Chromium + base de recette distincte
```

`npm test` utilise `.env.test.local` pour les tests PostgreSQL d’intégration ; voir [EXPLOITATION.md](docs/EXPLOITATION.md) pour créer cette base. Les suites purement calculatoires et d’authentification fonctionnent sans base. `test:e2e` crée/réinitialise uniquement **prisme_e2e** sur le PostgreSQL local, génère un accès de test et lance le serveur de production au port 3100. Il utilise Chromium à `/usr/bin/chromium`, configurable avec `CHROMIUM_PATH`.

Les tests et leurs résultats réellement exécutés sont consignés dans [VALIDATION.md](docs/VALIDATION.md).

## Sauvegarder et restaurer

```bash
npm run backup
npm run restore -- /chemin/vers/sauvegarde.json
```

La sauvegarde contient les deux espaces, les tickets, les versions, le journal et les règles. La restauration exige une **base cible vide** ; elle ne remplace pas un historique existant. Pour un déploiement privé, sauvegarder également la configuration et les clés d’accès avec un outil sécurisé distinct. Voir [EXPLOITATION.md](docs/EXPLOITATION.md).

## Sources externes et limites

Les flux automatiques Bet Analytix, The Odds API et le compte Winamax **ne sont pas connectés**. La couverture Winamax France actuelle et les droits de collecte n’ont pas pu être vérifiés sur leurs pages officielles, bloquées par le réseau de cet environnement. Les sources officielles accessibles et les prérequis sont documentés dans [CONNECTORS.md](docs/CONNECTORS.md). Aucune souscription payante ni collecte automatisée de compte n’a été réalisée.

Cette version gère un portefeuille cash personnel global et ses affectations à des stratégies. Elle ne comporte pas de modèle prédictif validé, de notifications automatiques, d’OCR PDF/capture ou de comptes multi-utilisateurs. Les simulations historiques ne démontrent pas un avantage, et leurs hypothèses/couvertures restent visibles. Les extensions et limites détaillées sont dans [LIMITATIONS.md](docs/LIMITATIONS.md).

Analyse et qualification : [TIPSTER_ANALYSIS.md](docs/TIPSTER_ANALYSIS.md). Spécification : [SPEC.md](SPEC.md).

Conventions : [CALCULATIONS.md](docs/CALCULATIONS.md) · [IMPORTS.md](docs/IMPORTS.md) · [ARCHITECTURE.md](docs/ARCHITECTURE.md) · [REQUIREMENTS.md](docs/REQUIREMENTS.md).

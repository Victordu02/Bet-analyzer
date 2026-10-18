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

L’espace personnel démarre vide. **Explorer la démonstration** ouvre un espace séparé contenant uniquement des profils, événements, cotes et tickets fictifs. Les nouveaux espaces proposent un quart de Kelly et des plafonds configurables de 1 % par pari, 2 % par événement et 5 % d’exposition totale. Les réglages existants sont préservés. Aucun capital ni limite de pertes personnelle n’est inventé : renseigner les fonds réels et les limites quotidienne et mensuelle avant toute allocation.

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
- **Simulations** : comparaison côte à côte de la mise fixe, du pourcentage et de Kelly fractionné, doublons et plafonds partagés par panier ; sauvegarde des hypothèses, budgets et trois méthodes sans mouvement cash ; calculatrices EV, sensibilité, marge et CLV ; rejeu chronologique et abstentions exportables.
- **Bankroll** : tickets réellement acceptés, versements datés et corrections, annulations, freebets, cashouts partiels, frais, dépôts/retraits, journal au centime avec contrôle chronologique, exposition, valeur de part et rapprochements à date audités. Les historiques incomplets restent provisoires.
- **Sources et imports** : CSV générique avec correspondance des colonnes, prévisualisation, erreurs et conflits, historique, réimport idempotent et reprise des seules lignes en échec d’un lot partiel. Les templates sont fictifs.
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

L’adaptateur **The Odds API v4** cible `winamax_fr` et collecte à la demande, avec confirmation des correspondances et conservation des horodatages, quotas et indisponibilités. Configurer `ODDS_API_KEY` côté serveur pour l’utiliser ; aucune clé n’est fournie avec le projet. Sans clé ou en cas d’erreur, les relevés manuels restent disponibles. Le connecteur n’appelle jamais le fournisseur depuis la démonstration. L’identifiant Winamax France est confirmé dans la documentation officielle ; la couverture réelle dépend du sport, du marché et du forfait. Voir [CONNECTORS.md](docs/CONNECTORS.md).

Bet Analytix et le compte Winamax restent sans synchronisation automatique. Aucune souscription payante ni collecte de compte joueur n’a été réalisée.

Cette version gère un portefeuille cash personnel global et ses affectations à des stratégies. Elle ne comporte pas de modèle prédictif validé, de notifications automatiques, d’OCR PDF/capture ou de comptes multi-utilisateurs. Les simulations historiques ne démontrent pas un avantage, et leurs hypothèses/couvertures restent visibles. Les extensions et limites détaillées sont dans [LIMITATIONS.md](docs/LIMITATIONS.md).

Analyse et qualification : [TIPSTER_ANALYSIS.md](docs/TIPSTER_ANALYSIS.md). Radar et espérance : [RADAR.md](docs/RADAR.md). Bankroll et mises : [BANKROLL.md](docs/BANKROLL.md). Spécification : [SPEC.md](SPEC.md).

Conventions : [CALCULATIONS.md](docs/CALCULATIONS.md) · [IMPORTS.md](docs/IMPORTS.md) · [ARCHITECTURE.md](docs/ARCHITECTURE.md) · [REQUIREMENTS.md](docs/REQUIREMENTS.md).

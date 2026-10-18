# Prochaines étapes PRISME

Le socle local est implémenté. The Odds API dispose d’un adaptateur à la demande, à activer avec une clé serveur ; les autres connecteurs automatiques restent désactivés et aucun déploiement Vercel n’a été effectué. Conserver les règles de `AGENTS.md` et la séparation des quatre niveaux de preuve dans chaque extension.

## 1. Activer The Odds API pour `winamax_fr`

Prérequis : clé API disponible côté serveur et réseau autorisé vers `api.the-odds-api.com` ainsi que la documentation officielle. Voir `docs/CONNECTORS.md`.

- [x] Confirmer `winamax_fr` dans la documentation officielle actuelle et vérifier le contrat v4. La couverture effective varie selon le sport, le marché et les droits du forfait.
- [ ] Configurer une variable privée côté serveur, par exemple `ODDS_API_KEY`, sans préfixe `NEXT_PUBLIC_`, et autoriser les domaines nécessaires. Ne jamais versionner ni journaliser la clé.
- [x] Implémenter l’adaptateur The Odds API en ciblant explicitement `winamax_fr`, avec correspondance des événements, marchés, sélections et lignes, horodatage fournisseur et horodatage de collecte. Faire valider les correspondances ambiguës.
- [x] Gérer quotas, cache, reprises bornées, erreurs, absence de cote et fraîcheur ; rendre visibles la provenance et l’état réel de la connexion.
- [x] Vérifier le transport et les correspondances sur des réponses fictives représentatives sans consommer de quota réel.
- [ ] Effectuer une recette authentifiée autorisée après configuration de la clé et du réseau : couverture effective, coût/quota, règles et comparaison avec Winamax. Une cote collectée reste une observation ; elle ne prouve ni l’acceptation d’un ticket ni une probabilité prédictive.

Critère de fin : les cotes Winamax France sont consultables avec leur source et leur fraîcheur, sans fabriquer de disponibilité quand le fournisseur ne couvre pas le marché. Aucun accès au compte Winamax ni pari automatique.

## 2. Parser le copier-coller brut de l’historique Winamax

Prérequis : disposer d’exemples réels anonymisés de textes copiés depuis l’historique ; ne pas inventer le format natif. Voir `docs/IMPORTS.md`.

- [ ] Définir les formats reconnus à partir des exemples : simples, combinés à mise unique, paris ouverts/réglés, annulations, freebets, retours bruts et cashouts partiels lorsque ces cas sont présents. Distinguer les tickets des dépôts, retraits et autres mouvements de compte.
- [ ] Ajouter un parseur de texte brut avec normalisation des montants français en centimes entiers, des cotes et des dates ; rendre le fuseau explicite et stocker les dates en UTC.
- [ ] Afficher une prévisualisation avec champs reconnus, champs manquants et ambiguïtés. Exiger leur résolution avant import ; ne pas déduire une mise, un gain ou un statut manquant.
- [ ] Préserver la provenance et le texte source dans le stockage privé d’audit, sans exposer de données de compte dans les journaux ou les fixtures versionnées.
- [ ] Réutiliser l’import idempotent : identifiants source ou empreintes stables, détection des doublons, conflits et corrections, écritures comptables auditables.
- [ ] Valider les cas couverts sur des fixtures anonymisées, le réimport sans double écriture et le rapprochement des tickets/journal au centime.

Critère de fin : un copier-coller reconnu produit un import prévisualisé et confirmé de tickets réellement acceptés, distinct des pronostics et simulations. Les formats non reconnus restent explicitement refusés ou à compléter.

## 3. Préparer un déploiement privé Vercel + PostgreSQL managé

Prérequis : projet Vercel privé et fournisseur PostgreSQL managé choisis, avec accès et secrets configurés par les mécanismes de la plateforme. Voir `docs/EXPLOITATION.md` et `docs/LIMITATIONS.md`.

- [ ] Configurer le projet Next.js, une version Node compatible, `npm ci` et `npm run build`, ainsi que des environnements de prévisualisation et de production séparés.
- [ ] Remplacer l’authentification persistée dans `.local/auth.json` par un stockage durable adapté ou un fournisseur d’identité. Le système de fichiers temporaire de Vercel ne peut pas conserver les accès entre instances.
- [ ] Partager durablement la limitation des tentatives de connexion entre instances ; le limiteur actuellement en mémoire ne suffit pas pour plusieurs fonctions concurrentes.
- [ ] Configurer PostgreSQL managé avec TLS, identifiants restreints et pool de connexions adapté aux fonctions Vercel ; prévoir une connexion de migration distincte si le fournisseur l’exige.
- [ ] Configurer `DATABASE_URL`, `SESSION_SECRET`, `APP_ORIGIN` en HTTPS et les éventuelles clés de connecteur dans les secrets Vercel. Ne pas embarquer `.env.local`, `.local/`, les sauvegardes ni PostgreSQL local dans l’artefact.
- [ ] Définir une étape contrôlée de migrations (`npm run db:migrate`) avant mise en service et une stratégie de retour arrière. Ne pas démarrer `npm run local` ou le PostgreSQL embarqué dans les fonctions Vercel.
- [ ] Protéger l’accès au site et aux prévisualisations ; vérifier l’authentification applicative, les cookies HTTPS, l’origine des mutations et l’isolation des données personnelles/démonstration.
- [ ] Adapter les imports, exports et sauvegardes aux limites de durée, mémoire et taille des requêtes Vercel ; utiliser un stockage privé durable pour les fichiers nécessaires.
- [ ] Configurer sauvegardes, rétention et restauration PostgreSQL, puis vérifier une restauration sur une base séparée et le rapprochement au centime.
- [ ] Vérifier les flux réseau sortants, les quotas fournisseurs et les journaux sans secrets. Définir un ordonnanceur seulement si des collectes ou rapports automatiques sont ajoutés.
- [ ] Documenter les variables, migrations, opérations, coûts et limites ; effectuer une recette privée avant ouverture de l’instance.

Critère de fin : une instance privée HTTPS conserve durablement les données et les accès, dispose d’une restauration vérifiée et fonctionne sans dépendre du disque ni des processus PostgreSQL de l’environnement local.

- [x] Branche main initialisée

## 4. Analyse et qualification des tipsters — sections 4 et 5

- [x] Ajouter `SPEC.md` comme point d’entrée vers la spécification complète conservée dans `docs/REQUIREMENTS.md`.
- [x] Comparer le P&L aux mises déclarées au résultat à mise constante de 1 unité par ticket, combinés standard inclus une seule fois.
- [x] Présenter rendements, volumes, événements, périodes, cotes, dispersion, drawdown en unités, concentration des gains et incertitude descriptive, sans score global opaque.
- [x] Séparer les populations Déclaré, Observé avant événement, Simulé sur Winamax et Exécuté ; conserver les profils perdants ou inactifs.
- [x] Analyser les sept axes de spécialités avec bornes explicites, filtres combinables et journal persistant des variantes volontairement consignées.
- [x] Séparer découverte connue à sa date de coupure et validation prospective après gel ; reconstruire les révisions pour éviter les corrections et résultats futurs.
- [x] Enrichir les vues Tipsters, les fiches et Spécialités avec tableaux triables, graphiques interactifs et sources consultables, sur ordinateur et mobile.
- [x] Enrichir la démonstration de façon versionnée et idempotente : quatre profils supplémentaires, 156 pronostics fictifs, observations de découverte/validation et tickets séparés des simulations.
- [x] Valider `npm test` (**78 tests**, dont 18 nouveaux tests du moteur d’analyse), `npm run typecheck` et `npm run build`. Contrôle Chromium ciblé des deux vues, des deux formats d’écran et de l’enregistrement d’une variante réussi ; espace personnel inchangé.
- [ ] Si des données de capital et de flux propres aux bankrolls publiques deviennent disponibles, les modéliser pour calculer leur valeur de part et leur drawdown en pourcentage. En attendant, afficher explicitement « non applicable » par profil ; ne pas attribuer les flux du portefeuille personnel à chaque tipster.

Conventions et limites : [TIPSTER_ANALYSIS.md](docs/TIPSTER_ANALYSIS.md) et [CALCULATIONS.md](docs/CALCULATIONS.md).

## 5. Radar Winamax et espérance — sections 6 et 7

- [x] Livrer le radar filtrable avec les six statuts explicites et conserver les dossiers expirés, manqués et indisponibles.
- [x] Collecter The Odds API uniquement à la demande côté serveur, choisir le sport du catalogue puis confirmer la correspondance exacte ; ne jamais appeler le fournisseur depuis la démonstration.
- [x] Conserver premières cotes comparables, variations, indisponibilités, sources, dates fournisseur/collecte/enregistrement et identité du marché, sans rajeunissement par le cache.
- [x] Calculer probabilité d’équilibre, rendement espéré, espérance monétaire et sensibilité, avec provenance explicite et « espérance inconnue » sans estimation exploitable.
- [x] Exiger un marché complet documenté et confirmé pour le retrait de marge ; signaler que la normalisation est une convention, sans preuve d’avantage.
- [x] Ajouter les états nets explicites pour remboursements, règlements partiels, freebets et frais, sans inventer de probabilités.
- [x] Enrichir la fiche de décision : horaires de Paris, sélection/marché/ligne/règles, historique des cotes, segments suivis, exposition, limites et conditions d’abstention.
- [x] Appliquer les mêmes contrôles de fraîcheur aux simulations historiques ; suspendre une décision lorsque des identifiants locaux différents masquent un événement fournisseur déjà exposé.
- [x] Valider `npm test` (**115 tests**, 8 fichiers), `npm run typecheck` et `npm run build`, ainsi que le radar et la fiche sur ordinateur/mobile dans Chromium. Le transport et la persistance du connecteur sont testés sur réponses fictives sans consommation de quota externe.
- [ ] Réaliser la recette de connexion réelle après configuration sécurisée de `ODDS_API_KEY` ; aucun accès au compte joueur, pari automatique ou abonnement payant n’est nécessaire à ce module.

Parcours, configuration et conventions : [RADAR.md](docs/RADAR.md), [CONNECTORS.md](docs/CONNECTORS.md) et [CALCULATIONS.md](docs/CALCULATIONS.md).


## 6. Bankroll, mises et exposition — sections 8 et 10

- [x] Centraliser les positions, le capital, les limites de pertes et les rapprochements dans `accounting.ts` et `finance.ts`, avec montants exacts en centimes et saisie sans arrondi silencieux.
- [x] Contrôler la chronologie du cash, les remboursements, les freebets et les frais ; conserver les corrections par contre-écritures, sans doubler les débits ou les retours.
- [x] Distinguer les versements successifs d’un cashout et les corrections ciblées ; conserver dates, identifiants et coûts restants connus, sans fabriquer les cessions manquantes des anciens cumuls.
- [x] Afficher cash, positions ouvertes, résultat cash, promotions, frais, flux externes et performance neutralisée des apports ; laisser les historiques incomplets provisoires ou non applicables.
- [x] Ajouter les rapprochements au centime à une date précise, avec sources et snapshots audités immuables, distincts du résultat recalculé avec les corrections actuelles.
- [x] Comparer les trois méthodes sur les mêmes candidats ordonnés, avec arrondi inférieur au centime, doublons regroupés, événements corrélés et alias fournisseur, budgets partagés et abstentions motivées.
- [x] Sauvegarder les trois méthodes, hypothèses, paramètres, capital, exposition et cotes disponibles sans créer de ticket ni d’écriture de cash.
- [x] Appliquer aux nouveaux espaces les défauts quart de Kelly / 1 % / 2 % / 5 %, en conservant les réglages existants et sans ajouter de capital ou de limites de pertes personnelles.
- [x] Permettre la reprise des lignes en échec d’un import partiel avec `retryOf` et `completedRows` ; préserver les lignes déjà traitées et les corrections manuelles.
- [x] Valider `npm test` (**172 tests**, 12 fichiers), `npm run typecheck` et `npm run build`. Recette Chromium ciblée des formulaires, rapprochement, cashouts et trois méthodes réussie sur ordinateur et mobile, sans mouvement personnel conservé ni effet comptable des simulations.
- [ ] Compléter les anciens cumuls de cashouts à partir de justificatifs réels lorsqu’ils deviennent disponibles ; ne pas traiter leur migration technique comme un historique détaillé.

Contrats et limites : [BANKROLL.md](docs/BANKROLL.md), [CALCULATIONS.md](docs/CALCULATIONS.md) et [IMPORTS.md](docs/IMPORTS.md). Les contrôles exécutés et leurs résultats sont consignés dans [VALIDATION.md](docs/VALIDATION.md).

# Prochaines étapes PRISME

Le socle local est implémenté. Les tâches ci-dessous restent à réaliser ; les connecteurs externes sont désactivés et aucun déploiement Vercel n’a été effectué. Conserver les règles de `AGENTS.md` et la séparation des quatre niveaux de preuve dans chaque extension.

## 1. Activer The Odds API pour `winamax_fr`

Prérequis : clé API disponible côté serveur et réseau autorisé vers `api.the-odds-api.com` ainsi que la documentation officielle. Voir `docs/CONNECTORS.md`.

- [ ] Vérifier dans la documentation et les réponses officielles la disponibilité effective de `winamax_fr`, des sports et marchés requis, ainsi que les droits et limites du forfait. La couverture actuelle n’est pas encore confirmée.
- [ ] Configurer une variable privée côté serveur, par exemple `ODDS_API_KEY`, sans préfixe `NEXT_PUBLIC_`, et autoriser les domaines nécessaires. Ne jamais versionner ni journaliser la clé.
- [ ] Implémenter l’adaptateur The Odds API en ciblant explicitement `winamax_fr`, avec correspondance des événements, marchés, sélections et lignes, horodatage fournisseur et horodatage de collecte. Faire valider les correspondances ambiguës.
- [ ] Gérer quotas, cache, reprises bornées, erreurs, absence de cote et fraîcheur ; rendre visibles la provenance et l’état réel de la connexion.
- [ ] Vérifier le connecteur sur des réponses représentatives et une collecte autorisée avant activation. Une cote collectée reste une observation ; elle ne prouve ni l’acceptation d’un ticket ni une probabilité prédictive.

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

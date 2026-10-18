# Connecteurs, provenance et accès externes

Dernière vérification : **18 octobre 2026** (Europe/Paris).

L'application distingue trois familles indépendantes : pronostics des tipsters,
cotes et résultats sportifs, puis tickets et mouvements du compte personnel.
Une source de cotes ne donne aucun accès au compte Winamax. Les saisies et imports
locaux restent utilisables sans service externe ni abonnement.

## État réel de la livraison

| Source | État | Parcours disponible | Condition d'une future connexion |
| --- | --- | --- | --- |
| Pronostics fournis par l'utilisateur | Import manuel | Saisie et CSV générique, provenance conservée | Droits suffisants sur les données importées |
| Bet Analytix | Désactivé ; accès autorisé non établi | Import de fichiers obtenus avec les droits nécessaires | Vérifier les CGU applicables et obtenir un moyen d'accès expressément autorisé |
| Cotes Winamax saisies par l'utilisateur | Import manuel | Observation de cote datée, distincte de la cote acceptée sur un ticket | Vérifier soi-même l'événement, le marché, la sélection, la ligne et les règles |
| The Odds API | Non configuré ; aucun appel externe implémenté | Architecture permettant un futur adaptateur | Vérifier couverture, contrat et tarification ; disposer d'une clé fournie dans les paramètres sécurisés |
| Compte Winamax | Import manuel ; aucune synchronisation | Tickets et mouvements saisis ou importés par l'utilisateur | Un accès officiel ou un fichier effectivement fourni et utilisable avec autorisation |

Les CSV de ce projet sont des **formats génériques propres à l'application**.
Ils ne sont présentés ni comme des exports natifs Winamax, ni comme des exports
officiels Bet Analytix. Aucun mot de passe de compte joueur n'est collecté.
Aucun pari, dépôt, retrait ou cashout n'est envoyé à un bookmaker.

## Bet Analytix : vérification bloquée

Document demandé :

- [CGU Bet Analytix](https://www.bet-analytix.com/docs/conditions-generales-utilisation-bet-analytix.pdf).

La tentative de téléchargement a échoué **avant réception du document**, avec
`Tunnel connection failed: 403 Forbidden` émis par le proxy réseau de
l'environnement. Le contenu et la version des CGU n'ont donc pas pu être lus.
Ce résultat n'est ni une réponse du site établissant une interdiction, ni une
preuve d'autorisation.

Le cahier des charges signale des restrictions d'extraction et de robots. Elles
restent à vérifier dans le document applicable ; aucune clause ou citation n'est
inventée ici. Le connecteur reste désactivé. Aucune page de communauté, bankroll,
compte ou historique de pronostics n'a été collectée.

Pour l'activer ultérieurement, conserver la date et la version des conditions,
la portée de l'autorisation, le moyen d'accès fourni, les données couvertes,
les limites de réutilisation et la durée de conservation. Une bankroll publique
ou l'accord de son tipster ne suffisent pas à établir les droits de collecte de
la plateforme. Une API ou un export ne sera implémenté qu'après vérification de
sa documentation réelle.

## The Odds API : contrat partiellement vérifié, couverture non vérifiée

Les trois pages officielles demandées ont rencontré le même refus de tunnel
réseau ; leur contenu courant n'a pas été consulté :

- [Bookmakers et régions](https://the-odds-api.com/sports-odds-data/bookmaker-apis.html).
- [Guide v4](https://the-odds-api.com/liveapi/guides/v4/).
- [Données historiques](https://the-odds-api.com/historical-odds-data/).

Les exemples publics du fournisseur sur son dépôt GitHub ont pu être lus
directement, sans passer par un service tiers :

- [README des exemples Python v4](https://github.com/the-odds-api/samples-python/blob/master/README.md)
  ([contenu consulté](https://raw.githubusercontent.com/the-odds-api/samples-python/master/README.md)).
- [Exemple officiel `odds.py`](https://github.com/the-odds-api/samples-python/blob/master/odds.py)
  ([contenu consulté](https://raw.githubusercontent.com/the-odds-api/samples-python/master/odds.py)).

Ce que ces exemples établissent, à la date de consultation :

- Une clé est nécessaire pour les appels ; le README renvoie vers le fournisseur
  pour en obtenir une. Aucun compte n'a été créé et aucun abonnement souscrit.
- L'exemple utilise `GET https://api.the-odds-api.com/v4/sports`, puis
  `GET https://api.the-odds-api.com/v4/sports/{sport}/odds`.
- Il illustre les paramètres de région, de marché, de format de cote et de date ;
  il mentionne `h2h`, `spreads` et `totals` pour les marchés de cet endpoint.
- Il décrit, pour l'appel illustré, un coût de quota égal au nombre de marchés
  multiplié par le nombre de régions et lit les en-têtes
  `x-requests-remaining` et `x-requests-used`.

Ces exemples ne suffisent pas à établir le catalogue commercial courant ni les
conditions de chaque endpoint. Les points suivants restent **non vérifiés** :

| Point | Conséquence dans l'application |
| --- | --- |
| Présence actuelle de Winamax France et identifiant exact du bookmaker | Aucune disponibilité Winamax n'est promise ; aucun identifiant deviné n'est utilisé |
| Sports, compétitions, marchés, lignes et règles réellement couverts | Aucune équivalence avec un ticket Winamax n'est présumée |
| Profondeur et granularité des historiques, historique par bookmaker | Aucun backtest ne prétend disposer de cotes historiques fournisseur |
| Résultats sportifs et modalités de règlement | Aucun règlement automatique de ticket personnel |
| Cadence de mise à jour et délais par produit | Une cote saisie garde son horodatage ; aucune fraîcheur fournisseur n'est inventée |
| Quotas par offre, coût des historiques, limites de débit et tarifs en euros | Aucun coût nul, gratuit illimité ou prix d'abonnement n'est affirmé |

Avant d'implémenter l'adaptateur, relire les pages officielles, vérifier la
couverture dans un accès de lecture autorisé et conserver la version du contrat.
Un futur adaptateur doit enregistrer le fournisseur, l'événement, le bookmaker,
le marché, la sélection, la ligne, les règles, l'horodatage fournisseur et
l'horodatage de collecte. Il doit aussi gérer les erreurs et quotas, limiter les
reprises, et masquer la clé dans les URL et journaux. La vérification humaine
reste nécessaire pour les correspondances ambiguës. Une cote observée n'est pas
une cote acceptée ni une garantie de montant disponible.

## Compte Winamax : aucune API ou export natif établi

Source officielle tentée : [site Winamax France](https://www.winamax.fr/).
Le proxy a refusé la connexion avant réception du site. Aucun espace authentifié
n'a été visité. Les possibilités d'export du compte et de synchronisation
autorisée n'ont pas pu être vérifiées.

L'absence de documentation vérifiée ne prouve pas l'absence d'un service. Elle
interdit de présenter ici une API publique de compte joueur, un export CSV
natif, une pagination, un mécanisme d'authentification ou une collecte locale
assistée comme disponibles. Le parcours livré repose sur les données que
l'utilisateur fournit volontairement et dont il peut justifier la provenance.

Si Winamax fournit un fichier ou un accès documenté, conserver un exemplaire
expurgé du format, les règles de règlement, les identifiants stables et les
conditions d'utilisation avant de développer un adaptateur. Une future
synchronisation restera en lecture seule. Les retraits, dépôts, mises et
cashouts restent des opérations manuelles effectuées sur Winamax.

## Conditions réseau et secrets

Domaines nécessaires à une reprise de la vérification documentaire :

- `www.bet-analytix.com` ;
- `the-odds-api.com` ;
- `www.winamax.fr` ;
- `nextjs.org`, `orm.drizzle.team`, `www.postgresql.org` pour les documentations
  techniques.

`api.the-odds-api.com` ne sera nécessaire qu'à un futur connecteur autorisé.
L'ajout d'un domaine aux réglages n'accorde pas de droit de collecte et ne prouve
pas l'application immédiate du nouveau réglage à une machine déjà démarrée.
Ne jamais remplacer une liste réseau existante inconnue. Les tests ci-dessus
n'ont désactivé ni TLS ni vérification de certificats.

Les services locaux n'exigent aucune clé externe. Une éventuelle clé de données
sera placée côté serveur dans la configuration sécurisée, jamais dans un CSV,
un rapport, un préfixe `NEXT_PUBLIC_`, le dépôt ou la conversation.

## Vérification des dépendances techniques

Les sites de documentation Next.js, Drizzle et PostgreSQL étaient bloqués par
le proxy. Les sources officielles suivantes ont cependant pu être consultées :

| Source officielle consultée | Observation vérifiée |
| --- | --- |
| [Installation Next.js, dépôt Vercel](https://raw.githubusercontent.com/vercel/next.js/canary/docs/01-app/01-getting-started/01-installation.mdx) | Node.js minimum 20.9 ; TypeScript minimum 5.1 ; document de la branche `canary`, susceptible d'évoluer |
| [Manifeste publié Next.js 16.4.2](https://registry.npmjs.org/next/16.4.2) | `engines.node >=20.9.0` ; React et React DOM `^19.0.0` acceptés par les dépendances homologues |
| [README officiel Drizzle](https://raw.githubusercontent.com/drizzle-team/drizzle-orm/main/README.md) | Prise en charge de PostgreSQL annoncée ; migrations prises en charge par Drizzle Kit |
| [Manifeste publié Drizzle ORM 0.45.4](https://registry.npmjs.org/drizzle-orm/0.45.4) | Pilote `pg >=8` accepté |
| [Manifeste publié pg 8.23.1](https://registry.npmjs.org/pg/8.23.1) | Node.js `>=16.0.0` requis |

Les manifestes ont été interrogés avec `npm view` sur le registre npm officiel.
Le verrou de dépendances du projet fixe les versions effectivement installées ;
les tests et le démarrage consignés dans la documentation du projet établissent
leur fonctionnement réel. Les versions minimales documentées ne remplacent
pas ces vérifications d'exécution. Le calendrier de support PostgreSQL n'a pas
pu être relu sur [sa page officielle](https://www.postgresql.org/support/versioning/).

## Reprise de la vérification

1. Appliquer les destinations réseau nécessaires dans l'environnement, puis
   recommencer les lectures qui ont échoué.
2. Archiver uniquement les documents et métadonnées autorisés : URL, date,
   version des conditions et limites de licence.
3. Vérifier un éventuel accès avec les autorisations existantes et sans exposer
   les valeurs des secrets.
4. Tester un adaptateur avec des réponses de test explicitement identifiées,
   puis un accès réel autorisé avant d'afficher un état « synchronisé ».
5. Ajouter le résultat des tests de couverture, quota, fraîcheur et erreurs à
   cette documentation. Ne modifier l'état du connecteur qu'après validation.

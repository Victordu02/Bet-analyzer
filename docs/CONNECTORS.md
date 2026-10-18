# Connecteurs, provenance et accès externes

Dernière vérification documentaire : **18 octobre 2026**. Pronostics, cotes et tickets personnels restent trois familles indépendantes. Une cote ne constitue ni un ticket accepté ni un accès au compte Winamax.

## État des sources

| Source | Parcours disponible | Limite |
| --- | --- | --- |
| Pronostics fournis par l’utilisateur | Saisie et CSV générique, provenance conservée | Droits nécessaires sur les données |
| Bet Analytix | Import manuel ; connecteur automatique désactivé | Conditions et accès automatisé autorisé non établis |
| Cotes Winamax manuelles | Relevés datés avec confirmation du marché exact | Source et date conservées |
| The Odds API | Adaptateur v4 ciblant uniquement `winamax_fr`, collecte à la demande | Clé serveur requise ; couverture vérifiée dans chaque réponse |
| Compte Winamax | Saisie et CSV générique de tickets | Aucun accès automatique au compte ni export natif présumé |

**Aucune clé The Odds API n’est configurée dans l’installation vérifiée.** Les tests du connecteur utilisent des réponses fictives et un transport injecté ; aucune collecte authentifiée de cotes réelles n’est revendiquée. La démonstration n’appelle jamais le fournisseur.

Les CSV PRISME sont des formats génériques propres au projet. Aucun identifiant de compte joueur n’est collecté. Aucun pari, dépôt, retrait ou cashout n’est envoyé au bookmaker.

## The Odds API : contrat officiel vérifié

Les pages suivantes sont accessibles lors de cette nouvelle vérification et remplacent la conclusion de blocage réseau de la recette initiale :

- [Bookmakers et régions](https://the-odds-api.com/sports-odds-data/bookmaker-apis.html) : `winamax_fr` désigne Winamax France, régions Europe et France. Disponibilité variable selon sport et marché.
- [Guide v4](https://the-odds-api.com/liveapi/guides/v4/) : catalogue `/v4/sports`, cotes `/v4/sports/{sport}/odds`, paramètres `bookmakers`, `markets`, `oddsFormat`, `dateFormat`, structure des événements et en-têtes de quota.
- [Schéma OpenAPI v4](https://the-odds-api.com/api-reference/v4/schema.yml) : événements, bookmakers, marchés et issues `name`, `price`, `point`.
- [Marchés](https://the-odds-api.com/sports-odds-data/betting-markets.html) : `h2h`, `spreads`, `totals` et limites de couverture ; le nul fait partie du marché de vainqueur du football.
- [Limites de débit](https://the-odds-api.com/guide/rate-limit.html) : erreurs 429 possibles, y compris en dessous d’une limite annoncée ; `Retry-After` non garanti.
- [Historiques](https://the-odds-api.com/historical-odds-data/) : produit payant distinct des cotes courantes. Aucune date de début de couverture historique Winamax n’a été établie pour ce projet.

Le fournisseur recommande l’horodatage **du marché** `last_update` ; celui du bookmaker est déprécié. Les en-têtes `x-requests-remaining`, `x-requests-used` et `x-requests-last` renseignent le quota observé. Ils ne garantissent ni disponibilité future ni coût nul.

Le catalogue des sports est documenté sans coût de quota. Les requêtes de cotes peuvent consommer des crédits selon les marchés et bookmakers demandés. Aucune souscription ni commande d’historique payant n’est effectuée par l’application.

## Configuration et rapprochement

1. Configurer **`ODDS_API_KEY` côté serveur** dans `.env.local` ou les secrets de l’hébergeur, puis redémarrer le serveur pour charger sa configuration. Laisser cette variable vide conserve le fonctionnement manuel. Aucun préfixe `NEXT_PUBLIC_`.
2. Autoriser `api.the-odds-api.com` pour les requêtes et `the-odds-api.com` pour la documentation, en conservant la vérification TLS.
3. Depuis un dossier personnel du radar, demander une collecte, choisir le sport/compétition du catalogue et examiner les correspondances proposées.
4. Confirmer explicitement événement, horaire, marché, sélection, ligne et règles. Une ressemblance de nom ne crée pas une correspondance certaine. Les cas non pris en charge restent en saisie manuelle.
5. Conserver l’observation et vérifier sa fraîcheur avant décision. Première cote, variations, indisponibilités et confirmations restent traçables.

Les requêtes de cotes fixent `bookmakers=winamax_fr`. Les réponses d’autres bookmakers ne servent pas de repli à une cote Winamax manquante. Les combinés et marchés non reconnus ne sont pas reconstruits à partir de cotes isolées.

Les règles de règlement ne sont pas prouvées par le simple nom d’un marché fournisseur. Leur correspondance nécessite une vérification humaine. Une association confirmée ne peut être réutilisée que pour une identité de pronostic inchangée.

## Fraîcheur, cache, quotas et repli

Horodatage fournisseur et heure de collecte sont distincts. Relire un cache ou renouveler une requête ne rajeunit pas une cote ancienne. Les cotes de clôture ou enregistrées après une décision ne servent pas à justifier cette décision passée.

L’adaptateur utilise un cache de transport borné et des reprises limitées. Il tient compte des quotas et d’un éventuel `Retry-After`, et présente une date de reprise quand une limite est rencontrée. Erreurs réseau, délais d’attente, refus d’accès et réponses invalides donnent un état explicite. Les URL contenant la clé et les erreurs brutes du fournisseur ne sont ni journalisées ni renvoyées au navigateur.

L’absence d’un marché dans ce flux ne prouve pas son absence sur tous les parcours Winamax. Un marché suspendu peut disparaître d’une réponse selon la cadence du fournisseur. Le radar explique le périmètre de l’indisponibilité observée.

Sans clé, réseau, correspondance ou quota, les relevés manuels et l’historique restent disponibles. Ils gardent provenance et dates ; aucune ancienne cote ne devient une nouvelle collecte. Les dossiers manqués et indisponibles restent dans le radar.

La collecte se fait à la demande. Aucun appel fournisseur n’est déclenché par un build, un test, une lecture de statut ou l’ouverture de la démonstration. Aucun appel réseau n’est maintenu sous verrou de transaction PostgreSQL.

## Autres accès non établis

Les [CGU Bet Analytix](https://www.bet-analytix.com/docs/conditions-generales-utilisation-bet-analytix.pdf) n’avaient pas pu être reçues lors de la recette initiale. Aucun droit d’extraction n’en est déduit. Une bankroll publique ou l’accord d’un tipster ne suffit pas à lever les restrictions de sa plateforme ; une future intégration nécessitera un accès autorisé documenté.

Aucune API publique de compte Winamax ni format natif d’export n’a été établi. Le parseur de copier-coller prévu dans `TODO.md` nécessitera des exemples réels anonymisés. Une source de cotes ne donne pas accès à l’historique, au solde ou aux opérations du joueur.

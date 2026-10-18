# Conventions financières et statistiques

Toutes les fonctions déterministes sont dans `src/domain/calculations.ts`. Les tests ciblés se lancent avec `npm test -- src/domain/calculations.test.ts`. Les ratios utilisent des fractions : `0.10` signifie 10 %. Les montants comptables sont des centimes entiers sûrs JavaScript ; les multiplications monétaires et arrondis utilisent Decimal. Une mise est arrondie vers le bas au centime. Une espérance monétaire affichée est également arrondie vers le bas au centime ; ce n’est pas un montant encaissé.

## Preuve, catégories et population des indicateurs

Les pronostics déclarés et les observations antérieures à l’événement restent séparés. Le générateur de rapports vérifie en plus la cohérence des horodatages d’un enregistrement marqué observé. Il ne promeut jamais un historique déclaré. Une cote observée n’est ni une mise acceptée ni un ticket. Une simulation sauvegardée n’ajoute aucun mouvement comptable. Les données fictives appartiennent à un espace séparé.

`normalizedProfit` applique une mise constante de 1 unité aux paris simples : gagné = cote − 1 ; perdu = −1 ; annulé = 0. La convention d’un demi-gagné est `(cote − 1)/2` et celle d’un demi-perdu `−0.5`, sous l’hypothèse explicite de deux demi-mises égales. Cashouts, combinés et paris ouverts n’ont pas de résultat standardisé retourné.

Les indicateurs principaux de `pickStats` incluent uniquement les **simples réglés gagnés, perdus ou annulés** avec une cote valide. Les demi-règlements, cashouts et combinés sont comptés comme exclus afin de ne pas mélanger leurs conventions. `count` et `events` décrivent toute la population fournie ; `settled`, le rendement et les cotes moyennes portent sur la population standard réglée. Un pari ouvert n’est pas un cas exclu mais ne contribue pas aux résultats.

- Le rendement standard est le profit total à 1 unité divisé par le nombre de simples standard réglés, annulations comprises : une mise avait bien été engagée. Le rendement ne pondère jamais par les mises déclarées.
- Le taux de réussite exclut les annulations : gagnés / (gagnés + perdus).
- La cote moyenne utilise la population standard réglée, annulations comprises.
- La concentration du plus gros gain est le plus gros profit positif / la somme de tous les profits positifs, et non le profit net. Elle est non applicable en l’absence de gain positif.
- Le drawdown en unités est la plus forte baisse du profit cumulé, depuis un sommet et en incluant un sommet initial à zéro. L’ordre est celui des règlements ; le début d’événement remplace un horodatage de règlement manquant et cette limite doit être gardée à l’esprit.
- Tout dénominateur nul donne `null` (« non applicable »), pas zéro.

L’intervalle de rendement est un **intervalle descriptif bootstrap par événement**, avec 1 000 rééchantillonnages de groupes d’événements et percentiles à 2,5 % et 97,5 %. Les pronostics du même événement restent ensemble. La graine est dérivée des données triées ; le résultat est reproductible. Moins de deux événements réglés donne un intervalle indisponible. Le bootstrap ne corrige ni une sélection opportuniste des meilleurs profils/segments, ni l’exhaustivité inconnue, ni toutes les dépendances entre événements. Aucun seuil universel d’effectif ni test de significativité n’est revendiqué.

Les limites de segments sont prédéfinies dans les filtres enregistrés : borne basse incluse, borne haute exclue, pour cotes et délais. Modifier un segment revient à créer une autre hypothèse ; ses règles doivent être figées avant validation. Le filtre peut sélectionner les combinés pour constater leur volume, mais les indicateurs standard leur restent non applicables.

## Espérance, probabilités, marge et CLV

Le moteur binaire cash sans frais applique :

`seuil = 1/cote`, `rendement espéré = p × cote − 1`, `espérance = mise × rendement espéré`, `Kelly = max(0, (p × cote − 1)/(cote − 1))`.

La probabilité doit être explicitement fournie avec la provenance manuelle, marché ou modèle. Aucune probabilité n’est déduite du taux de réussite d’un tipster. Une hypothèse manuelle est une simulation, pas la preuve d’un avantage. En l’absence de probabilité valide : espérance et Kelly sont inconnus ; seules des comparaisons explicites de mise fixe ou en pourcentage peuvent exister. Les combinés, live, remboursements conditionnels et autres règlements complexes ne sont pas éligibles à ce moteur de mise binaire. Il n’existe pas de modèle prédictif validé intégré.

`noVig` normalise les inverses des cotes d’un **marché complet de résultats mutuellement exclusifs** : `(1/o_i) / Σ(1/o_j)`. Le moteur ne peut pas prouver que le marché fourni est complet ; cette vérification revient à la saisie et à la provenance. Une seule cote ou une cote invalide renvoie un résultat indisponible. La normalisation des seules cotes du bookmaker ne suffit pas à établir un avantage contre celui-ci.

La CLV brute vaut `cote prise / cote clôture − 1`. La valeur face à une référence sans marge vaut `cote prise × probabilité clôture de référence − 1`. Ces métriques restent distinctes. L’appelant doit fournir des marchés, règles, lignes et clôtures comparables et horodatées. Une cote de clôture est exclue des décisions antérieures.

`calibration` calcule le Brier moyen et la log loss moyenne pour des prévisions binaires conservées avant résultat. La log loss borne seulement les logarithmes entre `1e-15` et `1 − 1e-15` pour conserver un nombre fini ; le Brier conserve les probabilités originales. Des données vides donnent deux indicateurs non applicables. Ces calculs seuls ne valident pas un modèle.

## Capital, mouvements et frais

Le journal signé fait autorité pour le cash : somme de toutes les écritures. Les entrées positives créditent le compte et les entrées négatives le débitent. Le service persistant réconcilie le journal d’un ticket lors d’une révision, afin de ne pas cumuler deux mises ou deux règlements. Les affectations à des stratégies ne créent aucun compte de cash supplémentaire.

`capital = cash disponible + coût restant des positions cash ouvertes`.

Une mise cash crée simultanément un débit de cash et une position au coût : aucun résultat instantané. Lors du règlement, la position est fermée et le retour brut est encaissé. Le retour gagnant inclut normalement la restitution de la mise. Le moteur n’infère pas un retour à partir d’un résultat : le retour réel enregistré fait autorité.

- `profitCashCents` est le résultat cash avant frais : retours − mises des tickets clôturés, plus les cashouts partiels dont le coût restant est connu.
- `promotionCents` regroupe les retours de freebets et les crédits de promotion explicitement comptabilisés. Une freebet ne crée pas de débit cash de sa valeur faciale.
- `feesCents` correspond aux écritures de frais et de frais de ticket, présentées comme coût positif.
- `netProfitCents = profitCashCents + promotionCents − feesCents`. Un frais n’est donc déduit qu’une fois.
- Les dépôts, retraits, capital initial, mouvements poker et ajustements justifiés sont séparés du bénéfice des paris. Le coût mensuel informatif d’un tipster ne devient une charge que lorsqu’un mouvement de frais est saisi.

Exemples vérifiés : 20 € à 2,50 gagné, retour 50 €, profit 30 € ; cashout final 12 € d’une mise de 20 €, profit −8 € ; freebet 10 € à 3,00 sans restitution, retour cash et profit promotionnel 20 €.

Un cashout partiel (`partialCashout = true`, y compris avec le statut `cashout`) reste une position ouverte. S’il est connu, il reconnaît `retour cash − (mise initiale − coût restant)`. Si son coût restant manque, la position conserve provisoirement son coût initial, sans prétendre connaître le résultat réalisé de la portion cédée. `uncertainOpenCost` indique que capital et performance sont provisoires ; toute allocation supplémentaire est bloquée. La v1 conserve un retour cumulé et un coût restant, pas un historique détaillé de multiples cessions successives : le profil temporel intermédiaire des cashouts partiels n’est donc pas reconstituable.

## Drawdown neutralisé des flux et récupération

Le calcul reconstruit les positions, les mises, les retours et les frais des tickets à partir de leur **dernier état connu**, à leurs dates économiques de prise/règlement. Les écritures `ticket_*` sont ignorées seulement dans cette trajectoire afin qu’une correction reçue tardivement ne crée pas une perte artificielle entre règlement et import ; elles font toujours autorité pour le cash actuel. Il s’agit d’une trajectoire retraitée, pas de ce qui était connu historiquement à chaque date. Les révisions restent conservées dans les tickets et le journal. Les autres mouvements du journal sont inclus à leurs dates. Les mouvements ayant le même horodatage sont regroupés. Les apports/retraits de capital, poker et ajustements modifient le nombre de parts à leur valeur antérieure ; les résultats sportifs et promotions modifient la valeur de part. Les mouvements externes d’un groupe sont traités avant les gains/pertes du même horodatage.

`bankroll.series` est un **indice de valeur de part, base 100**, pas le solde du compte. `drawdownPct` est le drawdown historique maximal de cette valeur, en fraction. Une perte de 100 € sur 1 000 €, puis un dépôt de 900 €, laisse la valeur de part à 90 et le drawdown à 10 %. Les positions ouvertes restent valorisées au coût : ce n’est pas une valorisation au prix de marché.

`recoveryDays` mesure la durée entre le sommet précédant le plus grand drawdown et le premier retour à ce sommet ; valeur `null` si ce sommet n’a pas été retrouvé, zéro en l’absence de drawdown. Les durées fractionnaires représentent des portions de jour. Les historiques doivent commencer par un capital documenté et cohérent. Après épuisement complet, l’indice historique demeure à zéro et son drawdown à 100 % : un nouvel apport n’efface pas la perte et ne crée pas artificiellement une récupération. Une nouvelle série de performance exige un nouveau périmètre explicitement documenté. Le moteur ne reconstitue pas un capital initial manquant.

## Décisions, limites et panier de simulation

L’éligibilité exige un profil actif et un segment actif dont les règles ont été figées au plus tard au début de sa validation. Le pronostic doit avoir été observé pendant cette période ; une spécialité sélectionnée rétrospectivement n’est pas présentée comme validée. Le moteur v1 couvre les simples pré-match ouverts, avec identité d’événement, marché, sélection et règles explicites.

Le dernier relevé connu doit avoir été observé après publication, enregistré avant la décision, être hors clôture, comparable, disponible et suffisamment récent. Un relevé plus récent signalant l’indisponibilité prime sur un ancien relevé disponible. La fraîcheur limite est inclusive. Le seuil éventuel de cote est attribué au tipster et n’est pas présenté comme un seuil de rentabilité. L’absence de pronostics éligibles est un résultat normal.

Les trois méthodes utilisent le même capital, défini plus haut. Un panier est traité dans l’ordre des candidats fourni, conservé pour la reproductibilité. La mise est le minimum de la fraction ou mise théorique, du cash restant, du plafond par pari, du reliquat par événement, du reliquat d’exposition globale et des budgets de pertes.

Les plafonds réels doivent tous être renseignés ; les valeurs de démonstration ne deviennent jamais des préférences personnelles. Les valeurs nulles bloquent les suggestions. Le quart de Kelly sur 1 000 € à 2,00 avec une hypothèse de 55 % donne 25 € théoriques ; le plafond de 1 % ramène la mise à 10 € avant les autres limites.

L’identité canonique combine l’identifiant d’événement, le marché, la sélection, la ligne, les règles et le type de ticket, après normalisation du texte. Plusieurs sources pour la même sélection ne multiplient pas la mise. Une sélection identique déjà ouverte bloque une nouvelle allocation. Toutes les sélections du même événement partagent le plafond d’événement ; aucune indépendance statistique n’est supposée. Les allocations précédentes du panier diminuent cash et budgets restants.

Les limites quotidienne et mensuelle utilisent le jour et le mois Europe/Paris. Le budget restant déduit les pertes nettes déjà réglées, frais inclus, et l’intégralité de l’exposition ouverte, comme perte maximale conservatrice possible. Des gains précédents n’augmentent pas ce budget. La simulation n’augmente pas les mises pour récupérer une perte. Toute suggestion est suspendue si `paused` est actif.

Les lignes d’abstention sont conservées avec une mise nulle et un motif ; elles ne doivent pas être supprimées pour embellir le bilan. La simulation n’accepte aucun pari et ne crée aucune écriture réelle.

## Rapports et limites actuelles

Les rapports utilisent les mêmes fonctions que l’interface. Chaque section renvoie aux identifiants de pronostics, tickets, écritures, observations ou simulations qui la fondent. Un raisonnement absent est explicitement compté comme non fourni. Les rapports ne déduisent ni professionnalisme, ni fraude, ni avantage prédictif d’une courbe ou d’un classement.

Les statistiques présentées à ce stade ne corrigent pas toutes les formes de biais de sélection ; aucun classement n’est un score de confiance. L’exhaustivité doit être documentée par la source. Le moteur de calcul ne remplace pas la vérification des droits d’accès, de la comparabilité d’un marché ou d’un relevé réel du compte.

## Rejeu chronologique reproductible

`src/domain/backtest.ts` fournit `backtest(state, { strategyId, start, end, delayMinutes, method, initialCapitalCents })`. Le résultat local est indépendant des vrais tickets et n’ajoute aucune écriture persistante. Le test vérifie la période de découverte, le gel des règles et le début de validation ; toute règle figée après le début de validation rend le test indisponible.

La population contient les événements du segment commençant dans l’intervalle `[start, end[`. Elle conserve les candidats déclarés, manqués et indisponibles sous forme d’abstentions motivées. Les profils devenus inactifs restent inclus pour éviter leur suppression rétrospective. Le rejeu n’utilise que les pronostics effectivement marqués observés avant événement ; il exclut par prudence les pronostics révisés dont le contenu exact à la date de décision n’est pas reconstructible sans ambiguïté.

La décision intervient au premier relevé postérieur au délai choisi, connu avant l’événement par ses **deux horodatages** (`observedAt` et `recordedAt`). Un relevé déjà ancien lorsqu’il est enregistré échoue au contrôle de fraîcheur. Un marché indisponible au premier relevé reste une abstention, même si une meilleure cote apparaît ensuite. Les observations de clôture ne sont jamais utilisées.

Les candidats sont traités par date de décision puis identifiant stable. Les règlements documentés arrivant avant la décision suivante libèrent le cash et l’exposition. Les positions non réglées à la fin du test restent valorisées au coût. Des résultats complexes ou sans provenance restent non évalués ; ils ne deviennent pas artificiellement un gain ou une perte binaire. L’exposition est partagée entre événements, doublons et paris déjà pris dans le scénario.

Le rendement du rejeu est le résultat des tickets simulés réglés / leurs mises, annulations comprises. `benchmark1u` est la somme des profits à 1 unité des mêmes sélections réglées, aux mêmes cotes Winamax ; c’est une référence de mise, pas une référence portant sur un autre périmètre de sélections. `coverage` est le nombre d’allocations / le nombre de candidats du segment et de la période. Les abstentions et les positions non réglées restent visibles. Le drawdown utilise la même valeur de part que la bankroll.

Les limites actuelles et le capital fourni définissent un **scénario**. Ils ne sont pas présentés comme les paramètres historiques réellement utilisés. En l’absence d’archives probabilistes immuables, aucune probabilité n’est reconstruite ; Kelly s’abstient et les métriques de calibration sont indisponibles. Les coûts d’abonnement ne sont pas intégrés au scénario. Ce rejeu ne fournit ni entraînement de modèle, ni optimisation de stratégie, ni test final hors échantillon, ni preuve de significativité.

Tests de risque : `npm test -- src/domain/calculations.test.ts src/domain/backtest.test.ts`.

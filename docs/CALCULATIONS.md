# Conventions financières et statistiques

Les fonctions déterministes sont dans `src/domain/calculations.ts`, `src/domain/accounting.ts`, `src/domain/finance.ts`, `src/domain/staking.ts`, `src/domain/tipster-analysis.ts`, `src/domain/radar.ts`, `src/domain/quote-assessment.ts` et `src/domain/backtest.ts`. Le parcours bankroll et la comparaison des mises sont documentés dans [BANKROLL.md](BANKROLL.md). Les tests ciblés du classement et des spécialités se lancent avec `npm test -- src/domain/tipster-analysis.test.ts`, ceux du radar et de l’espérance avec `npm test -- src/domain/radar.test.ts`. Les ratios utilisent des fractions : `0.10` signifie 10 %. Les montants comptables sont des centimes entiers sûrs JavaScript ; les multiplications monétaires et arrondis utilisent Decimal. Une mise est arrondie vers le bas au centime. Une espérance monétaire affichée est également arrondie vers le bas au centime ; ce n’est pas un montant encaissé.

## Classement et spécialités des tipsters

`tipster-analysis.ts` fournit les populations séparées par niveau de preuve, le classement et les comparaisons découverte/validation. Les conventions et le parcours utilisateur sont détaillés dans [TIPSTER_ANALYSIS.md](TIPSTER_ANALYSIS.md).

Le classement à une unité inclut les simples et les combinés standard réglés, en comptant une seule mise par ticket. Le rendement est le résultat total à une unité / le nombre de tickets standard réglés, annulations comprises. Le P&L aux mises déclarées est recalculé avec les mises de la source, distinct du résultat à une unité. Les demi-règlements, cashouts et promotions sont séparés de cette population standard. Le montant réel d’un ticket exécuté utilise ses retours, mises et frais enregistrés ; sa référence à une unité reste une comparaison distincte.

Les périodes d’historique et d’observation ne sont pas interchangeables. Un import rétrospectif conserve sa date d’observation réelle. Une validation prospective exige un gel des règles antérieur à la période et une observation cohérente avant événement ; les résultats postérieurs à la fin de découverte ne sont pas réinjectés dans le rendement connu à cette date.

Le drawdown à une unité regroupe les règlements au même instant avant de mesurer la baisse depuis un sommet. Le pourcentage par valeur de part d’un profil reste non applicable faute de capital et de flux propres documentés. L’indice de la bankroll personnelle, décrit plus bas, continue de neutraliser ses apports et retraits.

Les paragraphes suivants décrivent aussi `pickStats`, utilisé par les rapports historiques et certains écrans existants. Son périmètre reste limité aux simples standard et ne doit pas être confondu avec le nouveau classement explicite incluant les combinés.

## Preuve, catégories et population des indicateurs

Les pronostics déclarés et les observations antérieures à l’événement restent séparés. Le générateur de rapports vérifie en plus la cohérence des horodatages d’un enregistrement marqué observé. Il ne promeut jamais un historique déclaré. Une cote observée n’est ni une mise acceptée ni un ticket. Une simulation sauvegardée n’ajoute aucun mouvement comptable. Les données fictives appartiennent à un espace séparé.

`normalizedProfit` applique une mise constante de 1 unité par ticket : gagné = cote − 1 ; perdu = −1 ; annulé = 0. Un combiné standard utilise sa cote totale, pour une seule unité. Pour un simple, la convention d’un demi-gagné est `(cote − 1)/2` et celle d’un demi-perdu `−0.5`, sous l’hypothèse explicite de deux demi-mises égales. Cashouts et paris ouverts n’ont pas de résultat standardisé retourné ; un combiné à règlement partiel reste exclu.

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

`radar.ts` ajoute la validation de provenance, le marché complet documenté, la sensibilité et les états nets ; voir [RADAR.md](RADAR.md). Une probabilité 0 ou 1 est une borne mathématique valide, sans certifier son réalisme. Les estimations de marché ou de modèle doivent être liées à l’identité du pari pour être utilisées dans une fiche ; une estimation générique n’est pas diffusée automatiquement à tous les dossiers.

Le moteur binaire cash sans frais applique :

`seuil = 1/cote`, `rendement espéré = p × cote − 1`, `espérance = mise × rendement espéré`, `Kelly = max(0, (p × cote − 1)/(cote − 1))`.

La probabilité doit être explicitement fournie avec la provenance manuelle, marché ou modèle. Aucune probabilité n’est déduite du taux de réussite d’un tipster. Une hypothèse manuelle est une simulation, pas la preuve d’un avantage. En l’absence de probabilité valide : espérance et Kelly sont inconnus ; seules des comparaisons explicites de mise fixe ou en pourcentage peuvent exister. Les combinés, live, remboursements conditionnels et autres règlements complexes ne sont pas éligibles à ce moteur de mise binaire. Il n’existe pas de modèle prédictif validé intégré.

`noVig` normalise les inverses des cotes d’un **marché complet de résultats mutuellement exclusifs** : `(1/o_i) / Σ(1/o_j)`. Le moteur ne peut pas prouver que le marché fourni est complet ; cette vérification revient à la saisie et à la provenance. Une seule cote ou une cote invalide renvoie un résultat indisponible. La normalisation des seules cotes du bookmaker ne suffit pas à établir un avantage contre celui-ci.

`normalizeCompleteMarket` exige en plus les libellés distincts, la source et son URL, l’horodatage, les règles/couverture et la confirmation du marché complet. `evaluateOutcomeStates` traite les retours bruts et frais de chaque état avec leurs probabilités documentées ; la somme doit être égale à 1, sans renormalisation automatique. La mise cash est déduite une seule fois par état ; une freebet ne crée pas de coût cash fictif. L’espérance est arrondie une fois après pondération. Le rendement sur cash engagé reste non applicable pour un cash engagé nul.

La CLV brute vaut `cote prise / cote clôture − 1`. La valeur face à une référence sans marge vaut `cote prise × probabilité clôture de référence − 1`. Ces métriques restent distinctes. L’appelant doit fournir des marchés, règles, lignes et clôtures comparables et horodatées. Une cote de clôture est exclue des décisions antérieures.

`calibration` calcule le Brier moyen et la log loss moyenne pour des prévisions binaires conservées avant résultat. La log loss borne seulement les logarithmes entre `1e-15` et `1 − 1e-15` pour conserver un nombre fini ; le Brier conserve les probabilités originales. Des données vides donnent deux indicateurs non applicables. Ces calculs seuls ne valident pas un modèle.

## Capital, mouvements et frais

Le journal signé fait autorité pour le cash : somme des écritures à leur date économique. Une entrée positive crédite le compte, une entrée négative le débite. `economicStateAt` limite les écritures, positions et versements à l’instant demandé ; les règlements futurs ne sont pas disponibles avant leur date. Les affectations à des stratégies ne créent aucun compte de cash supplémentaire.

`capital = cash disponible + coût restant des positions cash ouvertes`.

Une mise cash crée simultanément un débit et une position au coût : aucun résultat instantané. Lors du règlement, la position est fermée et le retour brut réel est encaissé. Le retour gagnant inclut normalement la restitution de la mise ; le moteur ne l’infère pas à partir de la cote. Un ticket cash annulé doit renseigner un retour égal à sa mise ; ses frais restent séparés. Une freebet annulée ne crée pas de retour cash fictif.

- `profitCashCents` est le résultat cash avant frais : retours − mises des tickets clôturés, plus les résultats des cashouts partiels dont le coût cédé est connu.
- `promotionCents` regroupe les retours de freebets et les crédits de promotion explicitement comptabilisés. Une freebet ne débite pas sa valeur faciale du cash ; elle peut rester ouverte avec un coût cash nul.
- `feesCents` correspond aux écritures de frais et de frais de ticket, présentées comme coût positif.
- `netProfitCents = profitCashCents + promotionCents − feesCents`. Un frais n’est déduit qu’une fois.
- Les dépôts, retraits, capital initial, mouvements poker et ajustements justifiés sont séparés du bénéfice des paris. Le coût mensuel informatif d’un tipster ne devient une charge que lorsqu’un mouvement de frais est saisi.

Le rendement des tickets cash clôturés utilise leur résultat après frais associés / leurs mises cash. Il ne comprend pas les frais libres du journal ni les résultats promotionnels. Une absence de mise cash donne un rendement non applicable.

Exemples : 20 € à 2,50 gagné avec un retour de 50 € donnent +30 € ; un cashout final de 12 € sur une mise de 20 € donne −8 € ; une freebet de 10 € à 3,00 sans restitution, avec retour cash de 20 € et frais de 1 €, donne un résultat promotionnel de 20 € et un net de 19 €.

## Versements, cashouts et corrections

`returnCents` conserve le retour brut cumulé. `returnPayments`, établi par le serveur, conserve ses encaissements distincts : `id`, `at`, `amountCents`, `remainingStakeCents` lorsqu’il est connu, et éventuellement `historicalAggregate`. La somme des encaissements doit égaler le cumul. Un nouveau versement ajoute la différence positive entre nouveau et ancien cumul à sa date, sans déplacer les versements précédents. Une correction cible le versement à rectifier lorsqu’il y en a plusieurs ; sa date ne change que si elle est explicitement corrigée. Avec un seul versement, la date de règlement saisie sert normalement de date corrigée ; fermer une position partielle sans nouveau retour conserve la date de l’encaissement antérieur.

Le service réconcilie les montants attendus par ticket, nature et date avec le journal existant, puis ajoute seulement les compensations nécessaires. Les révisions gardent l’ancien état et leur date de capture. Le cash est vérifié à chaque date économique : aucun retour ultérieur ni mouvement futur ne finance une mise antérieure, y compris le retour propre d’un ticket pris et réglé au même instant. Les mouvements simultanés sont regroupés ; une compensation n’est pas évaluée isolément comme un nouveau débit. La restauration vérifie également dates, montants et liens.

Un cashout partiel (`partialCashout = true`, statut `cashout`) reste une position ouverte. Son résultat cash réalisé vaut `retours cumulés − (mise initiale − coût restant)`. Pour une mise de 20 €, un retour de 8 € et un coût restant de 12 €, ce résultat est nul. Si le coût restant manque, le coût initial est retenu provisoirement, le résultat de la portion cédée reste inconnu et les allocations sont bloquées. Une clôture libère le coût restant à sa date, même lorsqu’elle n’ajoute aucun encaissement.

Les anciens cumuls identifiés comme cashouts partiels ne reconstituent pas les versements intermédiaires. Leur migration conserve `historicalAggregate` : une modification de notes ne crée pas un historique détaillé. Avant la date de ce cumul, cash et coûts intermédiaires sont provisoires ; cette incertitude reste portée par les états économiques à date. Après le cumul, le cash total peut être connu alors que la trajectoire historique reste incertaine. Des coûts manquants à une borne de période ou un agrégat traversant cette borne bloquent le budget de pertes concerné.

## Rapprochement à date

`reconcileCash` compare un relevé de cash disponible à la somme du journal jusqu’à sa date incluse : `écart = solde déclaré − cash calculé`. Les mouvements postérieurs sont exclus. Une date future ou un solde négatif est refusé à l’enregistrement. Sans écritures à cette date, l’historique doit être documenté ; avec un ancien cumul incomplet, le rapprochement est provisoire.

Chaque action `reconciliation.save` conserve un audit immuable avec solde déclaré, date du relevé, date de capture, cash calculé, écart, source, notes, identifiants des écritures et incertitudes. Ce snapshot ne change pas lors d’une correction ultérieure. Le rapprochement recalculé à la même date utilise, lui, les corrections désormais connues. L’interface distingue ces deux résultats ; aucun d’eux ne crée automatiquement une écriture de cash. Un relevé antérieur reste audité sans remplacer la référence de date la plus récente.

## Drawdown neutralisé des flux et récupération

Le calcul reconstruit les positions, mises, versements et frais des tickets à partir de leur **dernier état connu**, à leurs dates économiques. Les écritures `ticket_*` sont ignorées seulement dans cette trajectoire afin d’éviter de compter les compensations une seconde fois ; elles restent l’autorité pour le cash. Il s’agit d’une trajectoire retraitée, pas de ce qui était connu historiquement à chaque date. Les autres mouvements du journal sont inclus à leurs dates. Les mouvements simultanés sont regroupés. Apports, retraits, poker et ajustements modifient le nombre de parts à leur valeur antérieure ; résultats sportifs, promotions et frais modifient la valeur de part. Les flux externes d’un groupe sont traités avant les gains ou pertes du même instant.

`bankroll.series` est un **indice de valeur de part, base 100**, pas le solde du compte. `drawdownPct` mesure sa baisse historique maximale depuis un sommet. Une perte de 100 € sur 1 000 €, puis un dépôt de 900 €, laisse la valeur de part à 90 et le drawdown à 10 %. Les positions ouvertes restent valorisées au coût, sans estimation de prix de marché.

`recoveryDays` mesure la durée entre le sommet précédant le plus grand drawdown et le premier retour à ce sommet ; `null` si ce sommet n’a pas été retrouvé, zéro en l’absence de drawdown. Les durées fractionnaires représentent des portions de jour. La vue financière rend la performance indisponible ou provisoire en l’absence de capital documenté ou lorsque les coûts ou cessions intermédiaires restent inconnus. Après épuisement complet, l’indice historique demeure à zéro et son drawdown à 100 % : un nouvel apport n’efface pas la perte. Une nouvelle série exige un nouveau périmètre documenté ; aucun capital initial manquant n’est reconstitué.

## Décisions, limites et panier de simulation

L’éligibilité exige un profil actif et un segment actif dont les règles ont été figées au plus tard au début de sa validation. Le pronostic doit avoir été observé pendant cette période ; une spécialité sélectionnée rétrospectivement n’est pas présentée comme validée. Le moteur v1 couvre les simples pré-match ouverts, avec identité d’événement, marché, sélection et règles explicites.

Le dernier relevé connu doit avoir été observé après publication, enregistré avant la décision, être hors clôture, comparable, disponible et suffisamment récent. Un relevé plus récent signalant l’indisponibilité prime sur un ancien relevé disponible. La fraîcheur limite est inclusive. Le seuil éventuel de cote est attribué au tipster et n’est pas présenté comme un seuil de rentabilité. L’absence de pronostics éligibles est un résultat normal.

`assessQuote` centralise ces contrôles pour le radar, les décisions et les scénarios historiques. Pour un relevé fournisseur, la fraîcheur tient également compte de sa mise à jour de prix et de la politique PRISME, en retenant la limite la plus stricte. L’observation correspond à la collecte effective, l’enregistrement à la persistance ; la mise à jour fournisseur est conservée séparément. Le cache ne modifie aucune de ces dates. Le premier relevé utilisé pour le délai de reproductibilité doit lui aussi être comparable et confirmé ; l’historique brut conserve les relevés ambigus.

Si deux identifiants locaux renvoient au même événement fournisseur confirmé et qu’un ticket est ouvert ou qu’une allocation a déjà été retenue, une allocation sous l’autre alias est suspendue jusqu’au rapprochement des identifiants. Les mappings connus sont partagés entre les pronostics de la même clé d’événement : un candidat avec cote manuelle ne contourne pas cette protection. Les historiques ne sont pas réécrits automatiquement pour contourner un plafond.

Les trois méthodes utilisent le même capital, défini plus haut. `compareStakes` leur donne le même état économique de départ et les mêmes candidats ordonnés ; chacune dépense les budgets de son propre scénario une seule fois. La mise est le minimum de la mise théorique, du cash restant, du plafond par pari, du reliquat par événement, du reliquat d’exposition globale et des budgets de pertes, arrondi vers le bas au centime. Une fraction Kelly nulle donne une mise nulle pour cette méthode et ne bloque pas les méthodes fixe et proportionnelle.

Les nouveaux espaces utilisent, conformément à la dernière demande utilisateur, un quart de Kelly et les plafonds 1 % par pari, 2 % par événement, 5 % au total. Les réglages déjà enregistrés sont conservés, y compris les valeurs nulles. Aucun capital ni limite de pertes quotidienne ou mensuelle n’est inventé : leur absence bloque les allocations. Un plafond nul au sens numérique (zéro) ne laisse aucun budget ; une valeur absente (`null`) demande une configuration. Le quart de Kelly sur 1 000 € à 2,00 avec une hypothèse de 55 % donne 25 € théoriques ; le plafond de 1 % ramène la mise à 10 € avant les autres limites.

L’identité canonique combine l’identifiant d’événement, le marché, la sélection, la ligne, les règles et le type de ticket, après normalisation du texte et des lignes numériques (`2,5`, `2.50` et `+2.5` désignent la même ligne). Plusieurs sources pour la même sélection ne multiplient pas la mise. Une sélection identique déjà ouverte bloque une nouvelle allocation. Toutes les sélections du même événement partagent le plafond d’événement ; aucune indépendance statistique n’est supposée. Les allocations précédentes du panier diminuent cash et budgets restants.

Les limites quotidienne et mensuelle utilisent le jour et le mois Europe/Paris. `riskBudget` calcule le résultat cash réalisé de chaque période à partir des encaissements et des variations de coût documentées, puis ajoute les frais du journal. Le budget est `max(0, limite + min(0, résultat net de la période))`, diminué ensuite de toute l’exposition ouverte et des allocations du panier. Les gains peuvent compenser des pertes dans la période mais ne portent jamais le budget au-dessus de la limite personnelle. Une borne de coût incertaine entraîne une abstention. La simulation n’augmente pas les mises pour récupérer une perte. Toute suggestion est suspendue si `paused` est actif.

Les lignes d’abstention sont conservées avec une mise nulle et un motif ; elles ne doivent pas être supprimées pour embellir le bilan. La simulation n’accepte aucun pari et ne crée aucune écriture réelle.

La comparaison sauvegardée est recalculée côté serveur à l’enregistrement. Elle fige les trois méthodes, leurs allocations, les candidats et hypothèses ordonnés, les réglages, le cash, le capital, l’exposition, les budgets et les relevés de cote disponibles. Les changements ultérieurs de paramètres ou de solde ne réécrivent pas ces snapshots. Les anciennes simulations sans snapshots supplémentaires restent identifiées comme telles. Le parcours persistant accepte uniquement des probabilités manuelles attribuées ; une estimation marché/modèle exige une chaîne de provenance évaluée qui n’est pas intégrée à ce parcours. Sans probabilité, l’espérance reste inconnue et Kelly s’abstient.


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

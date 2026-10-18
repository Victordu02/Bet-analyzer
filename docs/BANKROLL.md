# Bankroll et comparaison des mises

Ce module couvre les sections 8 et 10 de la spécification. Il suit un portefeuille cash global par espace, ses tickets réels et ses affectations à des stratégies. Il ne passe aucun pari, ne déplace aucun fonds chez Winamax et ne multiplie pas le capital lorsqu’un ticket est affecté à une stratégie. L’espace Démonstration reste séparé des données personnelles.

## Commencer avec ses données

1. Dans **Bankroll**, enregistrer le capital réellement disponible au début de l’historique, avec sa date et sa provenance. Ajouter les dépôts, retraits, frais, promotions converties en cash, mouvements poker et ajustements justifiés selon leur nature.
2. Enregistrer uniquement les tickets effectivement acceptés, avec leur mise unique, leur cote acceptée, leur financement, leurs dates et leur source. Un combiné conserve une seule mise pour le ticket entier.
3. Saisir les retours bruts réels et les frais ; distinguer un nouvel encaissement d’une correction d’un encaissement déjà saisi.
4. Rapprocher le cash du journal d’un relevé réel à sa date exacte. Un écart reste à expliquer et ne crée aucun ajustement automatique.
5. Dans **Paramètres**, définir les limites de pertes quotidienne et mensuelle, vérifier les plafonds et utiliser la pause si nécessaire. Comparer ensuite les méthodes dans **Simulations**.

Les nouveaux espaces utilisent un quart de Kelly, 1 % du capital par pari, 2 % par événement et 5 % d’exposition totale. Ces valeurs s’appliquent aussi aux nouveaux espaces personnels ; l’évolution de la spécification est précisée dans [SPEC.md](../SPEC.md). Les réglages déjà enregistrés, y compris les valeurs nulles, sont préservés. Aucun capital personnel ni limite de pertes n’est créé : les allocations restent bloquées sans fonds documentés ou sans limites de pertes renseignées. Un plafond à zéro interdit l’allocation correspondante ; une valeur absente demande une configuration.

## Montants et journal

Le stockage, les échanges et les montants comptables utilisent des **centimes entiers sûrs**. La saisie en euros est convertie exactement ; les sous-centimes sont refusés et ne sont pas arrondis silencieusement. Les calculs de fractions de mise utilisent Decimal puis arrondissent vers le bas au centime. Une espérance arrondie reste une estimation, jamais une écriture de cash.

Le cash à une date est la somme des écritures dont la date économique est antérieure ou égale à cet instant. Les dates sont stockées en UTC et affichées à Paris. Les montants positifs créditent le journal, les négatifs le débitent. Les écritures distinguent capital initial, dépôt, retrait, poker, ajustement, frais, promotion, mise de ticket, retour de ticket et frais de ticket.

Le service vérifie la chronologie complète après une saisie ou une correction. Un dépôt futur ou un gain ultérieur ne peut financer une mise antérieure ; le retour d’un ticket au même instant que sa prise ne finance pas sa propre mise. Les mouvements simultanés et leurs contre-écritures sont regroupés avant contrôle. Les tickets et mouvements réels futurs sont refusés. La restauration normalise les dates et vérifie la cohérence du journal avec les tickets, y compris leurs dates économiques.

Les corrections ajoutent des écritures de compensation aux dates concernées et conservent les révisions et l’audit. Elles ne remplacent pas le journal et ne redébitent pas intégralement un ticket déjà enregistré. La date économique du mouvement et la date de capture de la correction ont des rôles distincts.

## Capital, résultat et freebets

`capital = cash disponible + coût restant des positions cash ouvertes`.

Une mise transfère du disponible vers une position valorisée au coût ; elle n’est pas immédiatement une perte. Le prix de marché d’une position ouverte n’est pas estimé.

Pour un ticket cash clôturé : `résultat net = retours cash cumulés − mise cash − frais associés`. Le retour gagnant comprend normalement la restitution de la mise. La cote et le statut ne servent pas à inventer un montant encaissé.

| Cas documenté | Traitement |
| --- | --- |
| Mise cash 20 €, retour gagnant 50 €, aucun frais | Résultat cash +30 € ; une seule mise déduite. |
| Mise cash 20 €, cashout final 12 € | Résultat cash −8 € et position fermée. |
| Ticket cash annulé, mise 20 € | Retour explicitement renseigné de 20 € ; frais séparés. |
| Freebet de valeur faciale 10 €, retour cash 20 €, frais 1 € | Aucun débit cash de 10 € ; résultat promotionnel 20 €, net 19 €. |
| Freebet annulée | Aucun retour cash ; un éventuel crédit promotionnel réel est documenté séparément. |

Le résultat global sépare résultat cash avant frais, retours de freebets et crédits promotionnels, puis frais. Les dépôts, retraits, capital initial, mouvements poker et ajustements sont exclus du bénéfice des paris. Un abonnement indicatif dans une fiche tipster ne devient une charge que lorsqu’un mouvement de frais est enregistré ; ne pas saisir le même frais une seconde fois dans le journal s’il est déjà associé au ticket.

Le rendement des tickets cash clôturés rapporte leur résultat après frais associés à leur mise cash totale. Il est distinct du résultat global, qui inclut notamment promotions et frais libres. Le rendement sur mise cash n’est pas applicable à une freebet sans mise cash.

## Cashouts partiels et versements datés

Un cashout partiel reste ouvert. Son coût restant est le coût d’acquisition de la portion conservée, pas une cote ni une estimation de sa valeur. Lorsque ce coût est connu :

`résultat cash réalisé = retours cumulés − (mise initiale − coût restant)`.

Exemple : mise 20 €, retour partiel 8 €, coût restant 12 € donnent un résultat cash réalisé nul, une exposition de 12 € et un cash diminué de 12 € par rapport à l’avant-mise, hors frais. Si le coût restant est inconnu, le moteur conserve provisoirement le coût initial, affiche le résultat comme inconnu et bloque les nouvelles allocations. Une freebet peut rester ouverte avec un coût cash nul.

Les nouveaux encaissements sont conservés dans `returnPayments`, calculé par le serveur : identifiant stable, date, montant en centimes et coût restant lorsqu’il est documenté. Leur somme doit correspondre à `returnCents`, le **retour brut cumulé** du ticket.

- **Nouveau versement** (`settlementMode: payment`) : renseigner le nouveau cumul et la date du versement. Le serveur ajoute uniquement la différence positive ; les encaissements antérieurs gardent leurs dates. Le nouveau versement ne peut précéder ceux déjà documentés.
- **Correction** (`settlementMode: correction`) : rectifier le cumul sans déclarer un nouveau paiement. En présence de plusieurs versements, sélectionner `correctionPaymentId` ; le delta corrige ce versement. `correctionPaymentAt` permet d’en rectifier explicitement la date. Les autres versements restent conservés.
- Avec un seul versement, sa date de correction suit normalement la date de règlement saisie. Une clôture après cashout partiel **sans nouveau retour** conserve la date du précédent encaissement et libère la position restante à la date de clôture.

Après un cashout partiel, une augmentation du cumul exige de choisir entre nouveau versement et correction. Le formulaire présente les encaissements existants. Par exemple, un retour de 4 € à J1 suivi d’un cumul de 7 € à J2 ajoute 3 € à J2 ; il ne déplace pas les 4 € de J1. Une clôture après retour partiel utilise le statut cashout et désactive « partiel », en conservant les retours déjà encaissés.

Les anciens tickets peuvent ne conserver qu’un cumul et une dernière date de règlement. Leur conversion technique garde le marqueur `historicalAggregate` lorsqu’un cashout partiel est identifié ; modifier leurs notes ne crée pas une preuve des versements intermédiaires. Le cash avant la date de ce cumul reste provisoire, et la trajectoire historique peut rester indisponible même si le cash final est connu. Si cette incertitude traverse une borne de jour ou de mois, le budget de pertes concerné bloque les allocations. L’application n’invente ni dates intermédiaires ni répartition du coût manquant.

## Rapprochement à date et audit

Le relevé décrit le **cash disponible** du compte, hors mises déjà engagées et bonus non convertibles. Saisir son montant, sa date exacte, sa source et, si utile, les causes possibles d’un écart.

`écart = solde relevé − cash du journal à la date du relevé`.

Un écart positif indique que le relevé dépasse le journal ; un écart négatif indique l’inverse. Les écritures postérieures sont exclues. L’absence d’écritures à cette date demande un historique documenté ; une concordance arithmétique ne prouve pas l’exhaustivité d’un ancien cashout.

Chaque enregistrement crée un audit `reconciliation.save` immuable contenant date du relevé, date de capture, montant déclaré, cash calculé, écart, source, notes, identifiants des écritures retenues et éventuelles incertitudes. Deux lectures restent visibles :

- le **résultat conservé lors de l’enregistrement**, qui ne change pas après une correction ;
- le **résultat recalculé aujourd’hui à la même date**, qui utilise le journal retraité avec les corrections désormais connues.

Un relevé plus ancien reste dans l’historique sans remplacer la référence dont la date est la plus récente. Enregistrer un relevé ou un écart ne crée jamais de mouvement financier.

## Performance neutralisée des flux

La courbe représente une valeur de part base 100. Les apports, retraits, mouvements poker et ajustements modifient le nombre de parts ; les résultats des paris, promotions et frais modifient la valeur de part. Une perte de 100 € sur 1 000 €, suivie d’un apport de 900 €, conserve un drawdown de 10 %.

La trajectoire utilise les dates économiques, versements et coûts documentés du dernier état corrigé. Elle ne décrit pas ce que l’application savait historiquement à chaque instant. Les périodes sans capital documenté ou avec cessions intermédiaires inconnues restent non applicables ou provisoires. Après épuisement total du capital, un nouvel apport n’efface pas le drawdown historique de 100 %.

## Comparer les trois méthodes

**Simulations** compare mise fixe, pourcentage du capital et Kelly fractionné sur le même instant, le même capital de départ et le même ordre de candidats. Chaque méthode dispose de son propre scénario de comparaison ; à l’intérieur d’un scénario, les allocations successives partagent les budgets restants.

Pour le cas binaire standard : `Kelly = max(0, (p × cote − 1) / (cote − 1))`. La fraction configurée multiplie ce résultat. Sans probabilité exploitable, Kelly s’abstient et l’espérance reste inconnue ; les méthodes fixe et proportionnelle peuvent être comparées si les autres conditions sont satisfaites. Une fraction Kelly nulle produit une mise Kelly nulle, sans désactiver les deux autres méthodes.

Le parcours de comparaison accepte des hypothèses probabilistes **manuelles** explicitement attribuées. Il ne reprend pas automatiquement un taux de réussite historique et ne dispose pas d’une chaîne de modèle prédictif validé. L’espérance du panier est inconnue si une allocation positive ne possède pas d’espérance ; une espérance favorable n’est pas une garantie de gain.

Chaque mise est arrondie vers le bas et respecte simultanément le montant théorique, le cash restant, le plafond par pari, le reliquat par événement, l’exposition globale et les budgets de pertes. Avec 999,99 € de capital, les plafonds de 1 %, 2 % et 5 % donnent respectivement 9,99 €, 19,99 € et 49,99 €. Plusieurs candidats d’un même événement utilisent ensemble ses 19,99 €, sous les autres limites.

L’identité d’une sélection regroupe événement, marché, sélection, ligne, règles et type de ticket. Les lignes numériques équivalentes, comme `2,5` et `2.50`, sont rapprochées. Les doublons gardent leurs sources sans multiplier la mise ; un doublon déjà ouvert est bloqué. Les sélections du même événement partagent un plafond sans supposer leur indépendance. Si des clés locales différentes correspondent à un même événement fournisseur confirmé, une allocation supplémentaire sous un autre alias est suspendue, y compris lorsque la cote du candidat est manuelle. Les corrélations inconnues entre événements ne sont pas estimées par un modèle.

Les limites de pertes utilisent le jour et le mois **Europe/Paris**. Pour chaque période, le budget vaut `max(0, limite + min(0, résultat cash réalisé net des frais))` ; l’exposition ouverte et les allocations du panier le consomment ensuite. Des gains peuvent compenser les pertes nettes de la période mais ne portent jamais le budget au-dessus de la limite configurée. Le calcul distingue les portions cédées grâce aux coûts documentés ; une borne incertaine provoque une abstention. La pause suspend les suggestions. Aucun mécanisme n’augmente automatiquement les mises pour récupérer une perte.

## Comparaisons conservées

La comparaison et sa sauvegarde sont recalculées côté serveur ; une sauvegarde peut donc différer d’un aperçu si le solde ou les cotes ont changé entre-temps. Elle conserve les trois méthodes, le choix principal, les allocations et abstentions, les candidats ordonnés, les hypothèses, les paramètres, le cash, le capital, l’exposition et les budgets à cet instant, ainsi que les relevés de cote utilisés lorsqu’ils existent.

Les anciennes simulations dépourvues de ces snapshots conservent leurs données d’origine ; les informations manquantes ne sont pas reconstituées comme des faits. Une comparaison sauvegardée ne réserve pas de cash, ne crée pas de ticket et ne remplace pas un rapprochement réel.

Conventions détaillées : [CALCULATIONS.md](CALCULATIONS.md). Fichiers et reprises : [IMPORTS.md](IMPORTS.md). Résultats des contrôles réellement exécutés : [VALIDATION.md](VALIDATION.md).

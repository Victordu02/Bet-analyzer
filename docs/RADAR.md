# Radar Winamax et fiche de décision

Le module couvre les sections 6 et 7 de [la spécification](REQUIREMENTS.md). Il rapproche des pronostics avec des observations de cotes ; il n’exécute aucun pari et ne garantit ni la disponibilité future ni l’acceptation d’une mise.

## Détection et traçabilité

Le radar conserve tous les dossiers, y compris ceux déjà commencés, réglés, manqués ou indisponibles. Les filtres ne suppriment aucun pronostic. Les statuts sont explicites : **À analyser**, **En observation**, **Expiré**, **Marché indisponible**, **Cote insuffisante selon le seuil défini**, **Données insuffisantes**.

« À analyser » signifie que les conditions de rapprochement sont réunies, pas qu’un avantage est démontré. Un profil doit être actif et correspondre à un segment actif dont les règles ont été figées avant sa validation. Les limites, le cash, l’exposition cumulée et les sélections déjà ouvertes sont examinés séparément avant toute allocation simulée.

Une cote est rattachée à l’événement, au marché, à la sélection, à la ligne, au type et aux règles du pronostic. La collecte The Odds API utilise exclusivement `winamax_fr`. Les correspondances ambiguës passent par une confirmation humaine ; une ligne ou un horaire incompatible ne sont pas corrigés silencieusement. Les marchés non pris en charge restent en saisie manuelle.

La fiche présente les horaires de Paris, les sources, publication et première observation du pronostic, première cote Winamax, relevés ultérieurs, indisponibilités, cote annoncée, seuil éventuel du tipster et tickets liés. Le seuil du tipster n’est pas renommé seuil de rentabilité.

Les observations sont conservées en ajout, avec une identité de marché figée lorsqu’elle est disponible. Une modification ultérieure du marché ou des règles ne réaffecte pas automatiquement une ancienne cote. Les quatre niveaux de preuve restent distincts : une cote observée n’est ni un résultat simulé ni un ticket accepté.

## Fraîcheur et repli

L’heure d’observation, l’heure d’enregistrement et la dernière mise à jour fournisseur remplissent des rôles distincts. La lecture d’un cache ne rajeunit pas ces dates. La validité utilise la limite personnelle et la politique conservatrice PRISME du connecteur ; cette dernière ne constitue pas une durée de validité garantie par le bookmaker.

La décision utilise les données connues à sa date. Les cotes de clôture, les horodatages incohérents et les correspondances non confirmées ne deviennent pas des cotes opérationnelles. Un relevé signalant l’indisponibilité reste conservé et prime selon sa chronologie sur l’ancienne disponibilité.

Sans clé, accès réseau, quota ou correspondance exploitable, la saisie manuelle et l’historique restent disponibles avec leurs dates d’origine. L’interface explique la cause du repli. Voir [CONNECTORS.md](CONNECTORS.md) pour configurer la clé serveur et connaître le périmètre effectivement vérifié.

## Espérance et provenance

Pour une mise cash `s` et une cote décimale `o`, dans un cas binaire sans remboursement ni frais :

- probabilité d’équilibre : `1 / o` ;
- rendement espéré : `p × o − 1` ;
- espérance : `s × (p × o − 1)`.

Les fonctions reçoivent des **centimes entiers sûrs**, et arrondissent l’espérance vers le bas au centime. Il s’agit d’une espérance hypothétique, pas d’un montant encaissé. Exemple : 10 € à 2,00 avec une hypothèse manuelle de 55 % donnent +1 € d’espérance et +10 % de rendement espéré.

Une estimation exige une provenance explicite : hypothèse manuelle, référence de marché documentée, ou modèle avec version, dates, documentation et évaluation. La présence de ces métadonnées ne certifie pas automatiquement un modèle. Aucun LLM ni taux de réussite global de tipster ne fournit une probabilité par défaut.

Sans estimation exploitable, la fiche affiche **« espérance inconnue »**. Une cote périmée ou non comparable ne fournit pas d’espérance opérationnelle ; la calculatrice demeure un scénario hypothétique distinct. Les cas complexes ne sont pas assimilés au binaire : la fonction d’états nets requiert des probabilités exhaustives, des retours et des frais explicites pour chaque état, sans inventer les éléments absents.

## Retrait de marge et sensibilité

La normalisation proportionnelle d’un marché complet applique `p_i = (1 / o_i) / somme(1 / o_j)`. Elle exige des issues nommées distinctes, des cotes valides, des règles et une couverture documentées, une source horodatée et la confirmation que les issues sont exhaustives et mutuellement exclusives.

Cette normalisation est une **convention d’estimation de marché**. Retirer la marge des seules cotes Winamax ne démontre aucun avantage contre Winamax. Une cote isolée ou deux issues incomplètes d’un marché à trois résultats ne deviennent pas une estimation valide par simple normalisation.

La grille de sensibilité fait varier explicitement la probabilité et la cote autour de l’hypothèse fournie. Les probabilités 0 et 1 sont acceptées comme bornes mathématiques ; les valeurs hors de cet intervalle ou les cotes inférieures ou égales à 1 sont refusées. Ces variantes restent des hypothèses, sans score de confiance généré.

## Vérification

Les tests Vitest dédiés couvrent les équations, l’arrondi monétaire, les probabilités absentes/invalides, la marge d’un marché complet, la sensibilité et les états nets. Les tests du radar vérifient chronologie, disponibilité, correspondance, fraîcheur, seuils et conservation des dossiers. Le transport fournisseur est testé par réponses fictives injectées, sans consommer de quota externe.

Commandes : `npm test`, `npm run typecheck`, `npm run build`. Les résultats exécutés figurent dans [VALIDATION.md](VALIDATION.md).

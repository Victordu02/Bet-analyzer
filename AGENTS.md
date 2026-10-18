<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Conventions PRISME

- Chaque tâche cloud possède déjà son environnement isolé. Utiliser le checkout existant ; pas de worktree sans demande explicite.
- Lire `README.md` et `docs/CALCULATIONS.md` avant de modifier les parcours financiers ou statistiques ; consulter `TODO.md` pour les prochaines étapes.
- **Code-golfing interdit** : utiliser des noms explicites, des fonctions lisibles et des branches compréhensibles. Ne pas compacter artificiellement le code pour économiser des lignes.
- **Montants comptables exclusivement en centimes entiers** : conserver cette représentation dans le stockage, les calculs et les échanges ; convertir en euros uniquement à l’affichage. Les écritures restent auditables et les imports idempotents.
- **Séparation stricte des quatre niveaux de preuve** : (1) pronostic déclaré par le tipster, (2) observation prospective horodatée avant l’événement, (3) simulation Winamax, (4) ticket réellement accepté. Ne jamais fusionner leurs populations, leurs résultats ou leur provenance, ni promouvoir une simulation en ticket exécuté.
- **Aucune probabilité inventée par un LLM** : ne pas présenter une estimation générée comme une probabilité mesurée ou validée. Une hypothèse manuelle doit être explicitement identifiée ; une estimation de modèle exige une provenance et une validation documentées. Le taux de réussite historique ne devient pas automatiquement une probabilité prédictive. Conserver « données insuffisantes » ou l’abstention quand nécessaire.
- Ne jamais utiliser le portefeuille personnel pour des fixtures : tests PostgreSQL exclusivement dans `prisme_test` ou `prisme_e2e`.
- Ne pas afficher de secrets ni committer `.env*` (sauf `.env.example` sans secret), `.local/`, sauvegardes ou traces. Le mot de passe `.local/initial-password.txt` reste privé. Aucun identifiant Winamax n’est requis.
- Exécuter les contrôles adaptés au changement et respecter les consignes de validation de la tâche. Une modification documentaire seule ne justifie pas de relancer une suite complète déjà passée.

## Commandes exactes

Depuis la racine du dépôt, avec Node.js 22 ou ultérieur :

| Action | Commande |
| --- | --- |
| Installer les dépendances verrouillées | `npm ci` |
| Build de production | `npm run build` |
| Vérification TypeScript | `npm run typecheck` |
| Tests unitaires et d’intégration | `npm test` |
| Lancement local avec préparation et PostgreSQL local | `npm run local` |
| Tests navigateur avec build et base de recette dédiée | `npm run test:e2e` |
| Contrôle du serveur et de la base déjà démarrés | `npm run smoke` |

`npm run local` prépare la configuration manquante et les migrations, puis sert l’application sur `http://127.0.0.1:3000`. Conserver ce processus actif. La préparation de `prisme_test` et de `.env.test.local` pour `npm test` est détaillée dans `docs/EXPLOITATION.md` ; les tests navigateur utilisent `prisme_e2e`.

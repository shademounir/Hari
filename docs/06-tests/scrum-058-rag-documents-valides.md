# SCRUM-058 — Retour de test : RAG sur les documents RH validés

**Objectif** : vérifier que l'assistant IA répond correctement, et avec citation,
à partir des documents RH validés (corpus `politiques-rh`, statut `PUBLISHED`).

**Périmètre** : récupération RAG côté serveur (`searchHandbook`) pour le rôle
**Collaborateur (EMPLOYEE)**. Les accès non autorisés relèvent de SCRUM-059, le
seuil/fallback de SCRUM-055.

**Environnement** : stack Docker (Postgres + pgvector), embeddings OpenRouter
(all-MiniLM-L6-v2, 384d), 5 documents FR publiés et ingérés (chunks + embeddings).

**Test automatisé** : `tests/rag-documents-rh.live.test.ts`
(`npm run test:live -- tests/rag-documents-rh.live.test.ts`) — **7/7 ✓**.

## Questions testées

| # | Question (Collaborateur) | Source attendue | Résultat |
|---|---|---|---|
| 1 | Comment demander une attestation de travail ? | Procédure d'attestation de travail | ✅ source citée (~0.62) |
| 2 | Comment se passe l'intégration d'un nouveau collaborateur ? | Guide d'intégration (onboarding) | ✅ source citée (~0.70) |
| 3 | Combien de jours de congé exceptionnel pour un mariage ? | Politique de congés § Art. 5 | ✅ source citée (~0.54) |
| 4 | Combien de temps les données RH sont-elles conservées ? | Politique de confidentialité § Art. 4 | ✅ source citée (~0.49) |
| 5 | Quelles sont les conditions pour télétravailler ? | Règlement télétravail | ✅ source citée (~0.59) |

Pour chaque cas : la meilleure source provient bien du corpus validé
`politiques-rh`, la similarité dépasse le seuil de pertinence (0,40), et les
champs de citation (titre + section) sont présents.

## Vérifications complémentaires

- **Cohérence FR/EN** : « congé annuel » renvoie **18 jours** que la requête soit
  en français ou reformulée en anglais par le modèle (handbook EN réconcilié sur
  `develop`, PR #30). Plus de contradiction 20 vs 18.
- **Filtrage RBAC (léger)** : un Collaborateur n'obtient jamais de chunk issu de
  `hr-internal` (`HR_ONLY`), même sur une requête ciblant les grilles salariales.

## Anomalies / réponses faibles identifiées

1. **« Indemnité de télétravail »** — la récupération remonte l'Article 3 (nombre
   de jours) plutôt que l'Article 5 (équipement / **150 MAD**), où se trouve la
   réponse. Récupération faible pour cette formulation.
   *Piste* : rendre l'intitulé de l'Article 5 plus explicite (ex. « frais et
   indemnité ») ou découpage plus fin. Non bloquant.
2. **Reformulation en anglais par le modèle** — le LLM traduit parfois la question
   FR en anglais avant d'appeler l'outil. C'était la cause du conflit 20/18 ;
   résolu par la réconciliation EN/FR, mais à surveiller sur d'autres sujets.
3. **Similarité basse sur la confidentialité** (~0,49) — au-dessus du seuil mais
   la marge est faible ; à revoir si le seuil/fallback de SCRUM-055 est durci.

## Verdict

Le RAG répond correctement et de façon sourcée sur les documents RH validés pour
le rôle Collaborateur. Les critères d'acceptation SCRUM-058 sont satisfaits ; les
anomalies ci-dessus sont mineures et non bloquantes pour la démo Sprint 2.

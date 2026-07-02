# SCRUM-060 — Scénario de démo : question RH autorisée

**Objectif** : démontrer qu'un collaborateur pose une question RH autorisée et
reçoit une réponse issue d'un **document validé**, avec **citation visible**.
C'est la démonstration principale du Sprint 2 (RAG RH sécurisé).

**Dépendances satisfaites** : SCRUM-050 (corpus FR publié), SCRUM-054 (filtrage par
rôle), SCRUM-056 (citations), SCRUM-058 (RAG testé).

## Préparation

| Élément | Valeur |
|---|---|
| Stack | `docker compose up` → app sur http://localhost:3000 |
| Pré-requis | `OPENROUTER_API_KEY` configurée ; 5 docs `politiques-rh` en `PUBLISHED` et ingérés |
| Compte de démo | **collaborateur@hari.ma** / `password123` (rôle EMPLOYEE) |
| Question posée | **« Comment demander une attestation de travail ? »** |
| Document source | *Procédure de demande d'attestation de travail* (collection « Politiques RH ») |

> Choix de la question : sujet **français-uniquement**, sans équivalent dans le
> handbook anglais → réponse propre et citation sans ambiguïté (cf. retour de test
> SCRUM-058).

## Réponse attendue (résumé fidèle au document)

- **Canal** : via le portail RH interne, rubrique « Demandes administratives », ou
  par e-mail à **rh@hari.ma**, en précisant le motif (logement, visa, banque…).
- **Délai** : **3 jours ouvrés** ; en cas d'urgence justifiée, **24 heures** sur
  validation du responsable RH.
- **Contenu de l'attestation** : identité, date d'entrée, nature du contrat, poste
  occupé (et rémunération brute uniquement sur demande explicite).

**Citation attendue dans le chat** : *Procédure de demande d'attestation de travail*
(section Article 3 — Canal et modalités / Article 1 — Objet), cliquable.

## Étapes de démonstration (rejouables)

1. Démarrer la stack (`docker compose up`) et ouvrir http://localhost:3000.
2. Sur `/login`, cliquer **« Se connecter en tant que Collaborateur »**.
3. Ouvrir **Assistant IA** (`/chat`).
4. Saisir la question : **« Comment demander une attestation de travail ? »**
5. Observer le déroulé : l'assistant appelle l'outil `searchHandbook`, récupère les
   chunks du document **validé** (filtré par rôle, côté serveur).
6. Vérifier que la réponse reprend **canal + délai (3 j) + contenu** de la procédure.
7. Vérifier la **citation** affichée : *Procédure de demande d'attestation de travail*.

## Question de secours

Si besoin d'un second exemple : **« Combien de jours de congé annuel ai-je par an ? »**
→ réponse attendue **18 jours ouvrables** (1,5 j/mois, jusqu'à 30 j avec l'ancienneté),
source *Politique de congés et absences* § Article 2. Cohérent en FR comme en EN
(conflit handbook résolu sur `develop`).

## Hors périmètre de ce ticket

La contre-démonstration (question **hors périmètre / refus contrôlé**) relève de
**SCRUM-059** (test d'accès RAG non autorisé) et n'est pas couverte ici.

<img width="1366" height="695" alt="image" src="https://github.com/user-attachments/assets/48d41854-bf11-4c61-8874-11c7ab8404d2" />


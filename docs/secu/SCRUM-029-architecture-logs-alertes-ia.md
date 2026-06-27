## **HARI** 

_Human Resources Artificial Intelligence_ 

## **SCRUM-029** 

Architecture Logs et Alertes IA 

|**Projet**|HARI — Human Resources Artfcial Intelligence|
|---|---|
|**Sprint**|Sprint 0 — Cadrage et architecture|
|**Responsable**|Kawtar HALIB|
|**Support**|El Mahdi EL BOUGHDADI · Soukaina GOUNISSI|
|**Date**|2026-06-23|
|**Statut**|Livrable d'architecture — prêt pour implémentaton<br>Sprint 3|



## **1. Objectif** 

Ce document définit l'architecture de journalisation et d'alertes IA de la plateforme HARI. Il précise les modèles de données à créer, les types d'événements à tracer, les niveaux de criticité, les règles de nonstockage de données sensibles et le fonctionnement de la console admin. 

Ce livrable est un prérequis direct à l'implémentation du Sprint 3 (refus IA, alertes, supervision). 

## **2. Contexte technique existant** 

## **2.1  Infrastructure actuelle** 

Le socle HARI actuel dispose des éléments suivants : 

- RBAC centralisé (src/lib/rbac.ts) — matrice de permissions par rôle avec la fonction can(role, permission). 

- Tools IA (src/lib/ai/tools.ts) — chaque outil est protégé par withPermission(). Sur refus, retourne { denied: true } sans lever d'exception. 

- RAG (src/lib/rag.ts) — recherche vectorielle pgvector sur HandbookChunk, distance cosinus via HNSW. 

- Chat API (src/app/api/chat/route.ts) — vérification de session Auth.js avant tout traitement, injection du rôle dans le prompt système. 

## **2.2  Ce qui manque** 

Le starter ne dispose d'aucun mécanisme de journalisation ou d'alerte. Les événements suivants passent silencieusement : 

- Refus d'accès RBAC ({ denied: true } retourné au modèle IA, non persisté) 

- Questions sensibles posées à l'assistant 

- Tentatives d'accès non autorisées 

- Erreurs du pipeline RAG 

L'architecture ci-dessous définit ce qui doit être créé. 

## **3. Modèles de données à créer** 

## **3.1  Modèle AiEvent** 

Trace chaque interaction significative avec l'assistant IA. 

```
enum AiEventType {
  QUERY_AUTHORIZED        // Requête traitée normalement
  QUERY_DENIED            // Outil IA refusé par RBAC
  QUERY_SENSITIVE         // Question détectée comme sensible
  RAG_HIT                 // Réponse sourcée depuis le handbook
  RAG_NO_MATCH            // Aucune source pertinente trouvée
  TOOL_CALLED             // Appel d'outil IA
  PROMPT_INJECTION_ATTEMPT // Tentative de manipulation du prompt
}
enum AiEventSeverity {
  INFO      // Événement normal, traçabilité simple
```

```
  WARNING   // Comportement inhabituel, surveillance recommandée
  CRITICAL  // Accès sensible refusé ou tentative d'injection
}
model AiEvent {
  id          String          @id @default(cuid())
  userId      String
  user        User            @relation(fields: [userId], references: [id])
  role        Role
  eventType   AiEventType
  severity    AiEventSeverity
  toolName    String?         // Outil concerné si applicable
  permission  String?         // Permission manquante sur refus RBAC
  ragSource   String?         // Section handbook citée si RAG_HIT
  queryHash   String?         // Hash SHA-256 de la question (pas le texte brut)
  refusedAt   DateTime?
  createdAt   DateTime        @default(now())
  alert       Alert?
}
```

_Règle critique : le texte brut de la question utilisateur n'est jamais stocké dans AiEvent. Seul un hash SHA-256 est conservé à des fins de déduplication. Cela protège contre l'exposition accidentelle de données RH sensibles dans les logs._ 

## **3.2  Modèle Alert** 

Une alerte est créée automatiquement pour les AiEvent de sévérité CRITICAL ou WARNING. Elle est consultable par l'Admin dans la console de supervision. 

```
enum AlertStatus {
  OPEN        // Alerte créée, non traitée
  REVIEWING   // Prise en charge par un admin
  RESOLVED    // Clôturée
  DISMISSED   // Ignorée (faux positif)
}
model Alert {
  id          String      @id @default(cuid())
  aiEvent     AiEvent     @relation(fields: [aiEventId], references: [id])
  aiEventId   String      @unique
  status      AlertStatus @default(OPEN)
  resolvedBy  String?     // userId de l'admin traitant
  resolvedAt  DateTime?
  notes       String?     // Note libre admin (sans données sensibles)
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
}
```

## **3.3  Modèle AuditLog** 

Trace les actions sensibles non-IA : tentatives d'accès refusées, modifications de rôles, accès à des ressources protégées. 

```
enum AuditAction {
  ACCESS_DENIED       // Tentative d'accès non autorisée (RBAC serveur)
  ROLE_CHANGED        // Changement de rôle utilisateur
  EMPLOYEE_VIEWED     // Consultation d'un profil employé
  SALARY_VIEWED       // Consultation d'un salaire
  DOCUMENT_GENERATED  // Génération d'un document RH (Sprint 4)
  DOCUMENT_DOWNLOADED // Téléchargement d'un document PDF
  LOGIN_SUCCESS       // Connexion réussie
  LOGIN_FAILED        // Échec de connexion
}
model AuditLog {
  id         String      @id @default(cuid())
  userId     String?
  action     AuditAction
  resource   String?     // Route ou ressource concernée
  targetId   String?     // ID de la ressource cible
  ipHash     String?     // Hash de l'IP (jamais l'IP brute — RGPD)
  createdAt  DateTime    @default(now())
}
```

## **4. Événements à journaliser** 

|**Événement**|**Modèle**|**Type**|**Sévérité**|**Alerte créée**|
|---|---|---|---|---|
|Queston autorisée<br>traitée|AiEvent|QUERY_AUTHORIZED|INFO|Non|
|Outl IA refusé<br>(RBAC)|AiEvent|QUERY_DENIED|WARNING|Oui|
|Queston sur salaire /<br>données sensibles|AiEvent|QUERY_SENSITIVE|**CRITICAL**|Oui|
|RAG : réponse<br>sourcée|AiEvent|RAG_HIT|INFO|Non|
|RAG : aucune source<br>trouvée|AiEvent|RAG_NO_MATCH|WARNING|Non|
|Tentatve d'injecton<br>de prompt|AiEvent|PROMPT_INJECTION<br>_ATTEMPT|**CRITICAL**|Oui|
|Accès route non<br>autorisée|AuditLog|ACCESS_DENIED|—|Non|
|Consultaton d'un<br>salaire|AuditLog|SALARY_VIEWED|—|Non|
|Changement de rôle|AuditLog|ROLE_CHANGED|—|Non|



## **4.1  Critères de détection d'une question sensible** 

Une question est classifiée QUERY_SENSITIVE si elle contient (analyse côté serveur, avant envoi au modèle IA) : 

- Des références explicites à la rémunération d'un tiers : salaire, salary, compensation, paie, revenu. 

- Des tentatives d'obtenir des informations sur d'autres employés sans permission salary:read:all. 

- Un volume de tokens anormalement élevé dans le prompt utilisateur (seuil : > 2 000 tokens — indicateur potentiel d'injection). 

_La classification doit être effectuée AVANT l'appel au modèle LLM afin de prévenir toute fuite._ 

## **5. Flux de création d'un événement et d'une alerte** 

```
Utilisateur → POST /api/chat
      │
      ▼
[1] Vérification session Auth.js          (401 si non authentifié)
      │
      ▼
[2] Classification de la question (serveur)
      │ ──► QUERY_SENSITIVE ? → AiEvent (CRITICAL) + Alert
      ▼
[3] Appel outil IA via withPermission()
      │ ──► { denied: true } ? → AiEvent (QUERY_DENIED, WARNING) + Alert
      │ ──► Succès           → AiEvent (INFO)
      ▼
[4] Recherche RAG (si searchHandbook appelé)
      │ ──► Résultats trouvés → AiEvent (RAG_HIT, INFO)
      │ ──► Aucun résultat   → AiEvent (RAG_NO_MATCH, WARNING)
      ▼
[5] Réponse streamée → client
```

La création de l'AiEvent et de l'Alert est asynchrone (non bloquante) : elle ne doit pas allonger le temps de réponse perçu par l'utilisateur. 

## **6. Console Admin — affichage des alertes** 

## **6.1  Routes protégées** 

```
/admin/alerts         → liste des alertes  (rôle SUPER_ADMIN uniquement)
/admin/alerts/[id]    → détail et changement de statut
```

Protection via middleware RBAC : can(role, "admin:settings"). 

## **6.2  Données affichées dans la liste** 

|**Colonne**|**Source**|**Sensibilité**|
|---|---|---|
|Date/heure|Alert.createdAt|Faible|
|Utlisateur (nom)|AiEvent.user.name|Faible|
|Rôle|AiEvent.role|Faible|
|Type d'événement|AiEvent.eventType|Faible|
|Sévérité|AiEvent.severity|Faible|
|Statut alerte|Alert.status|Faible|
|Outl concerné|AiEvent.toolName|Faible|
|Permission manquante|AiEvent.permission|Faible|



_Ce qui n'est PAS affiché : le texte brut de la question utilisateur, les données salariales, les informations personnelles au-delà du nom._ 

## **6.3  Actions disponibles sur une alerte** 

- Passer en REVIEWING 

- Passer en RESOLVED (avec note facultative) 

- Passer en DISMISSED (faux positif, avec justification) 

## **7. Règles de non-stockage des données sensibles** 

Ces règles sont non négociables et doivent être appliquées dès l'implémentation Sprint 3 : 

**1.** Jamais de texte brut : le contenu des messages utilisateur n'est jamais persisté. Seul un hash SHA-256 est stocké. 

**2.** Jamais de salaire : aucun montant de rémunération dans les logs ou alertes. 

**3.** Jamais d'IP brute : l'adresse IP est hashée avant stockage (ipHash). Conformité RGPD. 

**4.** Jamais de token d'authentification : les tokens de session ne doivent pas apparaître dans les logs. 

**5.** Rétention limitée : AiEvent INFO purgés après 90 jours. Alertes RESOLVED/DISMISSED archivées après 180 jours. 

**6.** Accès restreint : seul SUPER_ADMIN accède à la console d'alertes et aux AuditLog. 

## **8. Implémentation recommandée — Sprint 3** 

## **8.1  Migration Prisma** 

Créer une nouvelle migration add_ai_events_alerts_audit ajoutant les trois modèles. 

## **8.2  Service de logging** 

Créer src/lib/audit.ts exposant : 

```
logAiEvent(params: CreateAiEventParams): Promise<void>
logAuditAction(params: CreateAuditLogParams): Promise<void>
```

Ces fonctions doivent être fire-and-forget (pas d'await dans le flux principal) pour ne pas impacter la latence du chat. 

## **8.3  Intégration dans le pipeline chat** 

- Appeler logAiEvent après chaque résolution d'outil. 

- Détecter les questions sensibles AVANT l'appel streamText. 

## **8.4  Composants admin** 

- src/app/(dashboard)/admin/alerts/page.tsx — liste paginée, filtrable par statut et sévérité. 

- src/app/(dashboard)/admin/alerts/[id]/page.tsx — détail et actions. 

- Protection par can(role, 'admin:settings') côté serveur. 

## **9. Critères d'acceptation** 

- ☐  Les modèles AiEvent, Alert et AuditLog sont définis dans schema.prisma. 

- ☐  Les types d'événements sont listés et documentés. 

- ☐  Les niveaux de criticité sont définis (INFO, WARNING, CRITICAL). 

- ☐  Les règles de non-stockage de données sensibles sont explicitées. 

- ☐  La console admin est décrite (routes, données affichées, actions). 

- ☐  Le flux de création d'alerte est documenté. 

   - L'architecture est compatible avec le Sprint 3. 

- ☐ 

- ☐  Ce document est partagé dans Confluence. 

## **10. Dépendances** 

|**Dépendance**|**Directon**|**Ticket**|
|---|---|---|
|Matrice RBAC|Entrante|SCRUM-096, SCRUM-026|
|ERD MVP|Entrante|SCRUM-099, SCRUM-027|
|Threat model IA/RAG|Parallèle|SCRUM-030|
|Implémentaton alertes|Sortante|Sprint 3|
|Console admin|Sortante|Sprint 3|



_Livrable SCRUM-029 — Kawtar HALIB avec El Mahdi EL BOUGHDADI et Soukaina GOUNISSI | Sprint 0 — Projet HARI | 2026-06-_ 

_23_ 


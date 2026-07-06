# Vérification de compatibilité — `HARI_Database_Schema_v1.0.sql`

> **Verdict : ✅ Schéma compatible** avec le cahier des charges YDAYS 2026.
> Aucune table à supprimer. Quelques extensions mineures recommandées (voir §5),
> mais l'architecture proposée couvre l'ensemble des domaines fonctionnels attendus.

---

## 1. Synthèse

| Critère | Évaluation |
|---|---|
| Authentification & RBAC multi-tenant | ✅ Couvert (`auth.tenant`, `auth.role`, `auth.user`) |
| RH cœur (employés, départements, absences, workflows) | ✅ Couvert (`hr_core.*`) |
| Assistant IA conversationnel + RAG documentaire | ✅ Couvert (`ai.hr_document`, `ai.document_chunk`, `ai.chat_session`, `ai.ai_event`) |
| Détection du désengagement / risque social | ✅ Couvert (`ai.burnout_risk_assessment`, score + explication + plan d'action) |
| Sécurité, audit, alertes | ✅ Couvert (`audit.alert`, `audit.security_audit_log`) |
| Conformité (consentement explicite) | ⚠️ Non présent — à ajouter en extension (non bloquant) |
| Cohérence technique avec le starter réel (`prisma/schema.prisma`) | ⚠️ `embedding` en `TEXT` au lieu de `halfvec(384)` — déjà anticipé dans un commentaire du fichier SQL |

**Conclusion : le schéma est globalement compatible.** Les écarts identifiés sont additifs
(nouvelles colonnes/tables) et n'impliquent aucune remise en cause de l'architecture proposée.
Détail complet des 12 écarts : voir `docs/03-conception/conception.md`.

---

## 2. Diagramme MCD (modèle conceptuel de données)

```mermaid
erDiagram
    TENANT ||--o{ USER : possede
    TENANT ||--o{ DEPARTMENT : possede
    TENANT ||--o{ EMPLOYEE : possede
    TENANT ||--o{ HR_DOCUMENT : possede
    TENANT ||--o{ ALERT : possede
    TENANT ||--o{ SECURITY_AUDIT_LOG : possede

    ROLE ||--o{ USER : qualifie
    ROLE ||--o{ HR_DOCUMENT : restreint

    USER ||--o| EMPLOYEE : correspond_a
    DEPARTMENT ||--o{ EMPLOYEE : regroupe
    DEPARTMENT ||--o| EMPLOYEE : est_dirige_par
    EMPLOYEE ||--o{ EMPLOYEE : encadre
    EMPLOYEE ||--o{ ABSENCE : declare
    EMPLOYEE ||--o{ WORKFLOW : suit
    WORKFLOW ||--o{ WORKFLOW_TASK : contient

    HR_DOCUMENT ||--o{ DOCUMENT_CHUNK : decoupe_en
    USER ||--o{ CHAT_SESSION : ouvre
    CHAT_SESSION ||--o{ AI_EVENT : genere

    EMPLOYEE ||--o{ BURNOUT_RISK_ASSESSMENT : evalue
    USER ||--o{ BURNOUT_RISK_ASSESSMENT : realise

    AI_EVENT ||--o| ALERT : declenche
    USER ||--o{ SECURITY_AUDIT_LOG : produit
```

*Source : [`diagrams/01-mcd.mmd`](./diagrams/01-mcd.mmd)*

---

## 3. Diagramme de classes (vue applicative)

```mermaid
classDiagram
    class Tenant {
        +uuid id
        +string name
        +string domain
    }
    class Role {
        +uuid id
        +string name
        +jsonb permissions
    }
    class User {
        +uuid id
        +string email
        +Role role
        +boolean isActive
    }
    class Employee {
        +uuid id
        +string firstName
        +string lastName
        +Department department
        +Employee manager
        +string employmentStatus
        +Date hireDate
        +decimal salary
    }
    class Department {
        +uuid id
        +string name
        +Employee manager
    }
    class Absence {
        +uuid id
        +Date startDate
        +Date endDate
        +string type
        +string status
    }
    class Workflow {
        +uuid id
        +string type
        +string status
    }
    class WorkflowTask {
        +uuid id
        +string title
        +boolean isCompleted
    }
    class HrDocument {
        +uuid id
        +string title
        +string content
        +string status
    }
    class DocumentChunk {
        +uuid id
        +string content
        +vector embedding
    }
    class ChatSession {
        +uuid id
        +Date startedAt
    }
    class AiEvent {
        +uuid id
        +string prompt
        +boolean isSensitive
        +boolean refusalTriggered
    }
    class BurnoutRiskAssessment {
        +uuid id
        +int aiRiskScore
        +string aiExplanation
        +string actionPlan
    }
    class Alert {
        +uuid id
        +string type
        +string severity
        +string status
    }
    class SecurityAuditLog {
        +uuid id
        +string action
        +string ipAddress
    }

    Tenant "1" --> "*" User
    Tenant "1" --> "*" Employee
    Tenant "1" --> "*" Department
    Role "1" --> "*" User
    User "1" --> "0..1" Employee
    Department "1" --> "*" Employee
    Employee "1" --> "*" Employee : manage
    Employee "1" --> "*" Absence
    Employee "1" --> "*" Workflow
    Workflow "1" --> "*" WorkflowTask
    HrDocument "1" --> "*" DocumentChunk
    User "1" --> "*" ChatSession
    ChatSession "1" --> "*" AiEvent
    Employee "1" --> "*" BurnoutRiskAssessment
    AiEvent "0..1" --> "0..1" Alert
    User "1" --> "*" SecurityAuditLog
```

*Source : [`diagrams/02-classes.mmd`](./diagrams/02-classes.mmd)*

---

## 4. Diagramme de séquence — exécution d'un workflow RH

```mermaid
sequenceDiagram
    participant RH as Equipe RH
    participant App as Application
    participant DB as Base de donnees (hr_core)
    participant Collab as Collaborateur
    participant Agent as Agent IA

    RH->>App: Creer un workflow (type = Onboarding / Offboarding)
    App->>DB: INSERT hr_core.workflow(employee_id, type, status='In Progress')
    App->>Agent: Generer les etapes associees au poste/departement
    Agent->>DB: INSERT hr_core.workflow_task[] (title, description)
    App-->>Collab: Notification du parcours assigne

    loop Pour chaque tache
        Collab->>App: Marquer une tache comme completee
        App->>DB: UPDATE workflow_task.is_completed = true
        App->>App: Verifie si toutes les taches sont terminees
    end

    alt Toutes les taches terminees
        App->>DB: UPDATE workflow.status = 'Completed'
        App-->>RH: Notification de cloture du workflow
    else Etape en retard
        App->>DB: SELECT workflow_task non completees
        App-->>RH: Alerte de suivi
    end
```

*Source : [`diagrams/03-sequence-workflow.mmd`](./diagrams/03-sequence-workflow.mmd)*

---

## 5. Diagramme d'architecture générale du projet

```mermaid
flowchart TB
    subgraph Client
        Browser["Navigateur - Next.js App Router (React 19)"]
    end

    subgraph App["Application Next.js 16"]
        UI["UI - Tailwind v4 + shadcn/ui"]
        API["Route Handlers"]
        RBAC["RBAC - auth.role / auth.user"]
        HR["Couche donnees RH - hr_core.*"]
        AITools["Outils IA - withPermission"]
        Embeddings["Pipeline embeddings"]
    end

    subgraph AI["IA / RAG"]
        LLM["OpenRouter - chat + embeddings"]
        RAGStore["ai.hr_document + ai.document_chunk"]
    end

    subgraph Audit["Securite & audit"]
        Alerts["audit.alert"]
        Logs["audit.security_audit_log"]
    end

    subgraph DB["PostgreSQL"]
        Schemas["Schemas : auth . hr_core . ai . audit"]
    end

    Browser --> UI --> API
    API --> RBAC --> HR
    API --> AITools --> RBAC
    AITools --> Embeddings --> LLM
    AITools --> RAGStore
    AITools -.refus / comportement suspect.-> Alerts
    API -.actions sensibles.-> Logs
    HR --> Schemas
    RAGStore --> Schemas
    Alerts --> Schemas
    Logs --> Schemas
```

*Source : [`diagrams/04-architecture.mmd`](./diagrams/04-architecture.mmd)*

---

## 6. Schéma de workflow (cycle de vie `hr_core.workflow` / `workflow_task`)

```mermaid
stateDiagram-v2
    [*] --> EnCours : creation du workflow (onboarding / offboarding)

    state EnCours {
        [*] --> TacheAssignee
        TacheAssignee --> TacheCompletee : collaborateur valide la tache
        TacheCompletee --> TacheAssignee : tache suivante assignee
        TacheAssignee --> EnRetard : echeance depassee sans validation
        EnRetard --> TacheCompletee : validation tardive
    }

    EnCours --> Termine : toutes les taches completees
    EnCours --> Annule : workflow annule (ex. depart anticipe)
    Termine --> [*]
    Annule --> [*]
```

*Source : [`diagrams/05-workflow-state.mmd`](./diagrams/05-workflow-state.mmd)*

---

## 6 bis. Diagramme d'architecture applicative

```mermaid
flowchart LR
    subgraph Interfaces
        Collab["Portail Collaborateur"]
        Manager["Dashboard Manager"]
        RHUI["Espace RH / Direction"]
        AdminUI["Supervision Administrateur"]
    end

    subgraph Domaines["Domaines applicatifs"]
        Assistant["Assistant conversationnel RH"]
        DocGen["Moteur de generation documentaire"]
        Dashboard["Tableau de bord automatise + predictif"]
        AlertEngine["Systeme d'alerte (risques sociaux + securite)"]
        Supervision["Module de supervision des usages IA"]
        Onboarding["Agents IA - onboarding"]
        Offboarding["Agents IA - offboarding"]
    end

    subgraph Plateforme
        RBACCore["RBAC (auth.role / auth.user)"]
        DataLayer["Couche donnees (hr_core.*)"]
        AuditLog["Journalisation / audit"]
    end

    Collab --> Assistant
    Collab --> DocGen
    Collab --> Onboarding
    Manager --> Dashboard
    Manager --> AlertEngine
    RHUI --> Dashboard
    RHUI --> DocGen
    RHUI --> Offboarding
    AdminUI --> Supervision
    AdminUI --> AlertEngine

    Assistant --> RBACCore
    DocGen --> RBACCore
    Dashboard --> DataLayer
    Onboarding --> DataLayer
    Offboarding --> DataLayer
    Supervision --> AuditLog
    AlertEngine --> AuditLog
    RBACCore --> DataLayer
```

*Source : [`diagrams/06-architecture-applicative.mmd`](./diagrams/06-architecture-applicative.mmd)*

Vue complémentaire au §5 (architecture technique) : elle relie les **interfaces** (portails par
profil), les **domaines applicatifs** (assistant, génération documentaire, dashboard, alertes,
supervision, onboarding/offboarding) et la **plateforme commune** (RBAC, couche données, audit).
Chaque domaine applicatif passe systématiquement par le RBAC avant d'accéder à la couche données —
conforme à `AGENTS.md` ("Authorization is always server-side").

---

> Les diagrammes sont écrits en [Mermaid](https://mermaid.js.org/) et rendus directement par
> GitHub / les visualiseurs Markdown compatibles. Les fichiers source `.mmd` du dossier
> [`diagrams/`](./diagrams/) restent la référence éditable — les blocs ci-dessus en sont une copie
> à jour à insérer manuellement après toute modification.

---

## 7. Recommandations (extensions non bloquantes)

| # | Extension recommandée | Justification |
|---|---|---|
| 1 | `auth.consent` (consentement explicite) | Exigence de conformité du cahier des charges |
| 2 | `embedding` en `halfvec(384)` + index HNSW | Cohérence avec le starter réel (`prisma/schema.prisma`) |
| 3 | `due_date` / `sequence_order` sur `workflow_task` | Permet les alertes de retard illustrées au §6 |
| 4 | `ai.generated_document` | Historisation des documents RH générés (attestations, courriers) |

Détail complet (12 écarts, priorisation par sprint) : `docs/03-conception/conception.md`.

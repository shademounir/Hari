# OpenRouter Live Tests — Demo Runbook

**Ticket:** SCRUM-085  
**Purpose:** Stabilize the live OpenRouter test suite and provide a fallback procedure for the Sprint 4 demonstration.

## 1. Scope

The live suite verifies:

- basic text generation through OpenRouter;
- multi-step tool calling;
- live RAG embeddings and pgvector retrieval;
- access filtering on validated HR documents.

Live tests are intentionally separated from deterministic unit and integration tests.

## 2. Commands

Run deterministic tests:

```bash
npm run test
# SCRUM-057 — Garde-fous contre prompt injection documentaire

## Objectif

Cette tâche ajoute une protection minimale contre les tentatives de prompt injection présentes dans les documents RH ou dans les contenus récupérés par le RAG.

Les documents RH doivent être considérés comme des sources de connaissance, et jamais comme des instructions système à exécuter par l'assistant IA.

## Risques identifiés

Les risques principaux sont :

- instructions du type `ignore previous instructions` ;
- tentative de révélation du system prompt ;
- tentative de révélation de secrets, tokens ou mots de passe ;
- tentative de jailbreak ;
- tentative de modifier le comportement de l'assistant ;
- instructions malveillantes cachées dans un document RH.

## Protection ajoutée

Un module dédié a été ajouté :

```txt
src/lib/ai/prompt-guard.ts
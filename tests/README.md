# tests/

Testes de integração cross-workspace (ex.: fluxo completo HTTP contra um
backend real + Postgres de teste). Cada workspace (`backend/`, `frontend/`)
mantém seus próprios testes unitários/de componente ao lado do código-fonte.

Vazio na Fase 1 — os primeiros testes de integração chegam junto da
Autenticação (Fase 3) e do fluxo de OAuth (Fase 4).

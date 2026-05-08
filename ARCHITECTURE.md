# Arquitetura do MediaVault

## Visão geral
- Frontend: React + Vite + TypeScript + Tailwind.
- Backend local: Node.js + Express.
- Persistência local: SQLite via `node:sqlite`.
- Fontes de armazenamento: notebook e pendrive implementados; Google Drive planejado.

## Princípios
1. Catálogo independente da presença local do arquivo.
2. Google Drive como biblioteca mestre.
3. Estratégia offline-first para consumo sem internet.
4. Separação de responsabilidades por camada.

## Camadas
- **UI**: navegação, cards, filtros, player real, telas de armazenamento/downloads/offline.
- **Domínio/Serviços**: biblioteca, scanner, downloads, progresso e classificação.
- **Infraestrutura**: sistema de arquivos, pendrive e SQLite; Google Drive futuro.

## Modelo de dados (alvo)
- `contents`
- `media_items`
- `storage_sources`
- `downloads`
- `watch_progress`
- `tags`
- `content_tags`

## Rotas atuais do MVP
- `/`
- `/courses`
- `/movies`
- `/files`
- `/downloads`
- `/offline`
- `/storage`
- `/content/:id`
- `/player/:contentId/:id`
- `/player/local/:id`
- `/settings`

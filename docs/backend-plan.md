# Backend Plan

## Estado atual
Backend local implementado com Node.js, Express e SQLite via `node:sqlite`.

## Módulos atuais
- `server/index.js`: rotas HTTP, player, progresso e orquestração.
- `server/db.js`: criação/migração simples do SQLite.
- `server/storage-service.js`: fontes de notebook/pendrive e status.
- `server/scanner.js`: indexação de arquivos suportados.
- `server/download-service.js`: cópias entre fontes locais.
- `server/library-classifier.js`: classificação visual de biblioteca.

## Entregas concluídas
1. `GET /api/health`
2. Scanner de pasta local e pendrive
3. Persistência no SQLite
4. API de biblioteca (`/api/library`)
5. Endpoint de stream com suporte a `Range`
6. Salvamento e conclusão de progresso
7. Cópia notebook/pendrive com fila de downloads
8. Tabelas futuras de tags

## Pendências reais
- Integração Google Drive com OAuth, listagem, metadados e download.
- Uso pleno de `contents`, `tags` e `content_tags` no frontend.
- Detecção automática de pendrive em tempo real.
- Testes automatizados de API, scanner, download e progresso.

## Riscos técnicos
- Grande volume de arquivos no primeiro scan.
- Concorrência e retomada de downloads interrompidos.
- Portabilidade entre Windows, Linux e macOS.
- Limites de permissões do sistema de arquivos local.

# MediaVault

MediaVault é uma central local de mídia para organizar, visualizar, assistir e gerenciar conteúdos próprios no notebook, pendrive e, de forma inicial, Google Drive.

O objetivo é evitar abrir o Explorador de Arquivos pasta por pasta: o app indexa metadados, mostra capas, caminhos, armazenamento, progresso de reprodução e ações de gerenciamento para cursos, filmes, séries/coleções, PDFs, ZIPs e outros arquivos.

## Stack
- React, Vite, TypeScript e Tailwind CSS
- React Router e Lucide React
- Express
- SQLite via `node:sqlite`
- Google APIs para a base inicial de Drive

## Estado atual
- Home em formato de dashboard de mídia, com carrosséis reutilizáveis.
- Abas de Filmes, Cursos, Arquivos, Offline e Armazenamento conectadas à API local.
- Scanner de notebook/pendrive para vídeos, PDFs e ZIPs.
- Suporte ampliado a vídeos: `.mp4`, `.mkv`, `.avi`, `.mov`, `.webm`, `.m4v`, `.mpg`, `.mpeg`, `.m2ts`, `.mts`, `.ts`, `.wmv`, `.flv`, `.ogv`, `.ogg`, `.3gp`, `.3g2` e `.divx`.
- Player HTML5 com progresso persistente, aviso de codec/formato e fallback para abrir no player externo ou preview do Drive.
- Filmes com título editável, data, gênero, coleção/trilogia, ordem e capa local/manual.
- Página de detalhes como centro de gerenciamento do material.
- Remoção da biblioteca e exclusão física de arquivo com confirmações diferentes.
- Armazenamento com visão detalhada por fonte, filtros e limpeza em massa.
- Google Drive com OAuth local, configuração de pastas, sync por API e streaming inicial. Exclusão física no Drive continua fora do escopo.

## Como rodar
Instale dependências:

```bash
npm install
```

Em terminais separados:

```bash
npm run dev:server
npm run dev:client
```

Backend local padrão:
- API: `http://localhost:8787`
- Healthcheck: `GET http://localhost:8787/api/health`

Frontend local padrão do Vite:
- `http://127.0.0.1:5173`
- se a porta estiver ocupada, Vite pode subir em `5174`, `5175` ou outra porta livre.

Se `npm` não estiver no PATH do PowerShell:

```powershell
& "C:\Program Files\nodejs\npm.cmd" install
& "C:\Program Files\nodejs\npm.cmd" run dev:server
& "C:\Program Files\nodejs\npm.cmd" run dev:client
```

## Verificação
Antes de enviar mudanças:

```bash
npm run verify
```

Esse comando valida sintaxe do backend, compila TypeScript e executa o build Vite.

Auditoria manual:

```bash
npm audit --json
```

## Limpeza de armazenamento
A tela **Armazenamento** tem duas ações em massa por fonte:

- **Limpar catálogo**: remove todos os itens indexados daquele armazenamento da biblioteca. Não apaga arquivos físicos. Exige digitar `LIMPAR`.
- **Apagar arquivos indexados**: apaga os arquivos reais indexados no notebook/pendrive e remove os itens da biblioteca. Exige digitar `APAGAR ARQUIVOS`.

Notas de segurança:
- A limpeza física só atua em arquivos já indexados pelo MediaVault.
- Arquivos soltos que nunca foram escaneados não são tocados.
- Para itens do Google Drive, o app pode limpar o catálogo local, mas não apaga arquivos no Drive nesta fase.
- Cópias offline de itens do Drive são desassociadas quando o armazenamento local correspondente é limpo.

## Google Drive
O Drive funciona como base preparada para biblioteca mestre, enquanto notebook e pendrive podem funcionar como cache/offline.

Para autenticar:
1. Crie um OAuth Client do tipo Desktop app no Google Cloud.
2. Salve o JSON em `server/data/google-credentials.json`.
3. Abra Configurações no app, conecte o Drive e informe as pastas de Cursos, Filmes e Arquivos por ID ou URL.

Arquivos `server/data/*.json` ficam ignorados pelo Git para proteger credenciais e tokens locais.

## Estrutura
- `server`: API local, SQLite, scanner, storage, downloads e Drive.
- `src/pages`: telas principais do app.
- `src/components`: componentes visuais reutilizáveis.
- `src/utils`: mapeadores, filtros e utilitários de conteúdo.
- `src/types`: tipos TypeScript compartilhados no frontend.
- `src/data/fixtures`: dados mockados preservados como histórico do MVP visual.
- `docs`: documentação técnica de apoio.

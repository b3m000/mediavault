# MediaVault

MediaVault é uma biblioteca pessoal offline para organizar, visualizar e assistir conteúdos próprios (cursos, aulas, filmes, PDFs e arquivos).

## Objetivo
Criar uma interface local no estilo "biblioteca multimídia" para:
- catalogar conteúdos;
- mostrar onde cada item está armazenado;
- baixar para uso offline;
- acompanhar progresso de visualização.

## Fases
- Fase 1: MVP visual (sem backend).
- Fase 2: scanner local + SQLite.
- Fase 3: player real + progresso persistente.
- Fase 4: suporte a pendrive/HD externo.
- Fase 5: integração Google Drive.

## Stack atual
- React
- Vite
- TypeScript
- Tailwind CSS
- React Router
- Lucide React
- Express
- SQLite (`node:sqlite`)

## Estado atual
- Frontend navegável conectado à API local.
- Scanner de notebook/pendrive para vídeos, PDFs e ZIPs.
- Player HTML5 real para vídeos locais com progresso persistente.
- Fila de downloads/cópias entre notebook e pendrive.
- Google Drive ainda é uma fase futura e exige integração OAuth.

## Como rodar
```bash
npm install
npm run dev
```

Se `npm` nao estiver no PATH do PowerShell:

```powershell
& "C:\\Program Files\\nodejs\\npm.cmd" install
& "C:\\Program Files\\nodejs\\npm.cmd" run dev
```

## Rodar frontend + backend local
Em terminais separados:

```bash
npm run dev:server
npm run dev:client
```

Backend local padrão:
- API: `http://localhost:8787`
- Healthcheck: `GET /api/health`

## Build sem npm no PATH
```powershell
& "C:\\Progra~1\\nodejs\\node.exe" .\\node_modules\\typescript\\bin\\tsc -b
& "C:\\Progra~1\\nodejs\\node.exe" .\\node_modules\\vite\\bin\\vite.js build
```

## Verificação
```bash
npm run verify
```

## Estrutura principal
- `src/app` aplicação e rotas
- `src/pages` páginas
- `src/components` componentes visuais
- `src/data` dados mockados
- `src/types` tipos TypeScript
- `docs` documentação técnica de apoio

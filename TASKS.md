# Tarefas do MediaVault

## Convenções
- `[ ]` não iniciado
- `[x]` concluído
- `[-]` em andamento
- `[!]` bloqueado

Prioridade:
- `P0` obrigatório
- `P1` importante
- `P2` desejável

## Sprint 0 — Documentação

### Itens já concluídos
- [x] P0 — Criar `README.md`
- [x] P0 — Criar `ARCHITECTURE.md`
- [x] P0 — Criar `ROADMAP.md`
- [x] P0 — Criar `TASKS.md`

### Itens solicitados (fase 1 / sprint 0)
- [x] P1 — Criar pasta `docs/`
- [x] P1 — Criar `docs/frontend-layout.md`
- [x] P1 — Criar `docs/storage-strategy.md`
- [x] P1 — Criar `docs/backend-plan.md`
- [x] P2 — Criar `docs/api-design.md`

## Sprint 1 — MVP visual (completo)

### Setup
- [x] P0 — Criar projeto com Vite + React + TypeScript
- [x] P0 — Instalar Tailwind CSS
- [x] P0 — Instalar React Router
- [x] P1 — Instalar Lucide React
- [x] P1 — Configurar estrutura de pastas
- [x] P1 — Limpar estrutura padrão

### Estrutura e páginas
- [x] P0 — Criar `src/app/App.tsx`
- [x] P0 — Criar `src/pages/Home.tsx`
- [x] P0 — Criar `src/pages/Courses.tsx`
- [x] P0 — Criar `src/pages/Movies.tsx`
- [x] P0 — Criar `src/pages/Files.tsx`
- [x] P0 — Criar `src/pages/Downloads.tsx`
- [x] P0 — Criar `src/pages/Offline.tsx`
- [x] P0 — Criar `src/pages/Storage.tsx`
- [x] P0 — Criar `src/pages/ContentDetails.tsx`
- [x] P0 — Criar `src/pages/Player.tsx`

### Tipos e dados mockados
- [x] P0 — Criar `src/types/content.ts`
- [x] P0 — Criar tipos `ContentType` e `StorageType`
- [x] P0 — Criar interfaces de conteúdo e itens
- [x] P1 — Criar tipos de status, storage e download
- [x] P0 — Criar `src/data/mockLibrary.ts`
- [x] P0 — Incluir pelo menos 3 cursos, 3 filmes e 3 arquivos fake
- [x] P1 — Incluir dados fake de downloads, armazenamento e progresso

### Layout e navegação
- [x] P0 — Criar `Sidebar` e `Header`
- [x] P0 — Criar layout principal com sidebar + conteúdo
- [x] P0 — Configurar rotas com React Router
- [x] P1 — Destacar item ativo do menu
- [x] P1 — Busca no header
- [x] P2 — Responsividade básica

### Dashboard
- [x] P0 — Cards de resumo
- [x] P0 — Totais de cursos/filmes/offline
- [x] P0 — Seção "Continuar assistindo"
- [x] P1 — Downloads em andamento
- [x] P1 — Status de armazenamento
- [x] P2 — Últimos adicionados

### Cards e listagens
- [x] P0 — `ContentCard` com título, tipo, categoria, progresso, armazenamento e offline
- [x] P1 — Botões de assistir/baixar
- [x] P1 — Badge de armazenamento
- [x] P2 — Thumbnail fake
- [x] P1 — Busca e filtros nas páginas de Cursos/Filmes/Arquivos
- [x] P2 — Ordenações básicas por progresso/duração/status

### Detalhes, player, storage, downloads, offline
- [x] P0 — Página de detalhes por ID
- [x] P0 — Player fake com navegação entre itens
- [x] P1 — Progresso fake e "marcar como concluída"
- [x] P0 — Tela de armazenamento com notebook/pendrive/drive
- [x] P0 — Tela de downloads com fila fake
- [x] P0 — Tela offline com filtros e separação por origem

## Sprint 2 — Backend local + SQLite
- [x] P0 — Criar pasta `server/`
- [x] P0 — Configurar Node.js para backend local
- [x] P0 — Criar endpoint `GET /api/health`
- [x] P1 — Estrutura de services (`storage-service`, `scanner`)
- [x] P0 — Configurar SQLite local (`node:sqlite`)
- [x] P0 — Criar tabela `media_items`
- [x] P0 — Criar tabela `storage_sources`
- [x] P1 — Criar tabela `watch_progress`
- [x] P0 — Criar tabela `contents`
- [x] P1 — Criar tabela `downloads`
- [x] P2 — Criar tabelas de tags (`tags`, `content_tags`)

## Sprint 3 — Scanner local
- [x] P0 — Configurar pasta local padrão (`C:/MediaVault`)
- [x] P0 — Escanear arquivos de vídeo
- [x] P0 — Escanear PDFs
- [x] P0 — Salvar arquivos no SQLite
- [x] P1 — Identificar extensão
- [x] P1 — Identificar tamanho
- [x] P1 — Identificar caminho absoluto
- [ ] P2 — Organizar automaticamente por pasta (opcional)

## Sprint 4 — Player real
- [x] P0 — Endpoint para servir vídeo local (stream com Range)
- [x] P0 — Conectar player HTML5 ao arquivo real
- [x] P0 — Salvar progresso no backend
- [x] P1 — Continuar de onde parou
- [x] P1 — Marcar como concluído
- [x] P2 — Velocidade de reprodução (atalhos extras)
- [x] P2 — Legendas

## Sprint 5 — Pendrive
- [x] P0 — Permitir cadastrar pasta de pendrive
- [x] P0 — Escanear pasta do pendrive
- [x] P0 — Marcar arquivos como armazenamento `pendrive`
- [x] P0 — Mostrar pendrive desconectado
- [x] P1 — Copiar arquivo do notebook para pendrive
- [x] P1 — Remover arquivo do pendrive
- [ ] P2 — Detectar pendrive automaticamente no SO (hotplug em tempo real)

## Sprint 6 — Google Drive
- [ ] P0 — Integração ainda não iniciada

## Sprint 7 — Hardening do MVP local
- [x] P0 — Preservar caminhos configurados ao reiniciar o backend
- [x] P0 — Evitar escaneamento de fontes desconectadas
- [x] P0 — Validar progresso antes de persistir
- [x] P1 — Impedir player para arquivos não reproduzíveis
- [x] P1 — Conectar botão de download dos cards à fila real
- [x] P1 — Evitar controles visuais sem ação no header
- [x] P1 — Evitar sobrescrever destino em transferências
- [x] P1 — Limpar arquivo parcial ao cancelar download
- [x] P1 — Adicionar script de verificação (`npm run verify`)

## Sprint 8 — Release local 0.2.0 + Drive mestre
- [x] P0 — Atualizar dependências com vulnerabilidade reportada pelo `npm audit`
- [x] P0 — Subir versão do app para `0.2.0`
- [x] P0 — Adicionar `CHANGELOG.md`
- [x] P1 — Corrigir download concluído marcado como falha por erro de reindexação
- [x] P1 — Tratar falha de salvamento de progresso no player sem interromper reprodução
- [x] P1 — Aplicar preferência de legenda automática no player
- [x] P1 — Isolar fixtures mockadas do MVP visual
- [x] P0 — Adicionar dependências oficiais para Google Drive OAuth/API
- [x] P0 — Criar endpoints base de Drive (`status`, `auth`, `disconnect`, `folders`, `sync`)
- [x] P1 — Permitir configuração de três pastas Drive por ID ou URL
- [x] P1 — Sincronizar Drive como fonte `primary` para vídeos, PDFs e ZIPs
- [x] P1 — Permitir download Drive → notebook/pendrive pela fila
- [ ] P2 — Deduplicação completa entre Drive e scans locais antigos
- [ ] P2 — Testes automatizados de serviços Drive/download/scanner

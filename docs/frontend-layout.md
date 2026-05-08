# Frontend Layout (MVP Visual)

## Objetivo
Definir a estrutura visual do MediaVault para o MVP local conectado ao backend.

## Estrutura principal
- Sidebar fixa com navegação.
- Header por página com busca.
- Área de conteúdo com cards e grids responsivos.

## Rotas da interface
- `/` Dashboard
- `/courses` Cursos
- `/movies` Filmes
- `/files` Arquivos
- `/downloads` Downloads
- `/offline` Offline
- `/storage` Armazenamento
- `/content/:id` Detalhes
- `/player/:contentId/:id` rota legada do player
- `/player/local/:id` Player real para vídeo local
- `/settings` Configurações

## Componentes base
- `Sidebar`
- `Header`
- `ContentCard`
- `StorageCard`
- `DownloadItem`
- `ProgressBar`

## Diretrizes visuais
- Painéis com alto contraste e hierarquia clara.
- Tipografia expressiva para títulos e fonte legível para leitura.
- Destaque de status (offline, baixando, pendrive desconectado).
- Ações de player aparecem apenas para arquivos de vídeo suportados.
- Ações de download enviam transferências para a fila real.

## Responsividade
- Desktop: sidebar lateral.
- Mobile: layout em coluna única.
- Grids adaptáveis para cards e listagens.

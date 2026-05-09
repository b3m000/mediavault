# Storage Strategy

## Princípios
- Catálogo independente da presença física do arquivo.
- Google Drive como biblioteca mestre.
- Notebook e pendrive como destinos offline.

## Tipos de armazenamento
- `notebook`
- `pendrive`
- `google_drive`

## Papéis de armazenamento
- `google_drive`: `primary`, fonte mestre do catálogo.
- `notebook`: `offline`, cache local para reprodução.
- `pendrive`: `offline`, cache removível para transporte.

## Regras de estado
- O item aparece no catálogo mesmo se estiver apenas no Drive.
- Se o pendrive desconectar, conteúdo permanece no catálogo com status indisponível.
- Downloads atualizam status para offline quando concluídos.

## Fluxos essenciais
1. Sincronizar índice do Drive por pastas escolhidas.
2. Escanear caches locais quando necessário.
3. Baixar item para notebook/pendrive.
4. Reproduzir localmente quando offline.

## Estrutura de pastas sugerida
- Notebook Cursos: `C:/MediaVault/Cursos`
- Notebook Filmes: `C:/MediaVault/Filmes`
- Notebook Arquivos: `C:/MediaVault/Arquivos`
- Pendrive Cursos: `E:/MediaVault/Cursos`
- Pendrive Filmes: `E:/MediaVault/Filmes`
- Pendrive Arquivos: `E:/MediaVault/Arquivos`
- Drive Cursos: pasta escolhida por ID ou URL
- Drive Filmes: pasta escolhida por ID ou URL
- Drive Arquivos: pasta escolhida por ID ou URL

## Classificação local
- Vídeos dentro dos caminhos de cursos são classificados como `course`.
- Vídeos dentro dos caminhos de filmes são classificados como `movie`.
- PDFs, ZIPs e materiais não reproduzíveis são classificados como `file`.
- Vídeos sem caminho claro deixam de cair em curso por padrão; a opção conservadora é `movie`.

## Evolução futura
- Deduplicação de arquivos.
- Reconciliação automática de metadados.
- Estratégias de cache por prioridade de uso.
- Hotplug para detectar pendrive em tempo real.

# Storage Strategy

## Princípios
- Catálogo independente da presença física do arquivo.
- Google Drive como biblioteca mestre futura.
- Notebook e pendrive como destinos offline.

## Tipos de armazenamento
- `notebook`
- `pendrive`
- `google_drive`

## Regras de estado
- O item aparece no catálogo mesmo se estiver apenas no Drive.
- Se o pendrive desconectar, conteúdo permanece no catálogo com status indisponível.
- Downloads atualizam status para offline quando concluídos.

## Fluxos essenciais
1. Sincronizar índice (metadados).
2. Baixar item para notebook/pendrive.
3. Reproduzir localmente quando offline.

## Estrutura de pastas sugerida
- Notebook: `C:/MediaVault`
- Pendrive: `E:/MediaVault`
- Drive: `/MediaVault`

## Evolução futura
- Integração Google Drive com OAuth e sincronização de metadados.
- Deduplicação de arquivos.
- Reconciliação automática de metadados.
- Estratégias de cache por prioridade de uso.
- Hotplug para detectar pendrive em tempo real.

# API Design

## Base URL
`/api`

## Endpoints implementados
- `GET /health`
- `GET /storage`
- `POST /storage/notebook`
- `POST /storage/pendrive`
- `POST /storage/:type/paths`
- `POST /storage/scan`
- `GET /storage/pendrive/status`
- `GET /drive/status`
- `POST /drive/auth`
- `POST /drive/disconnect`
- `PUT /drive/folders`
- `POST /drive/sync`
- `GET /library`
- `GET /library/:id`
- `PATCH /library/:id`
- `POST /library/:id/reveal`
- `GET /player/:mediaItemId`
- `GET /player/:mediaItemId/stream`
- `GET /player/:mediaItemId/subtitles/:fileName`
- `GET /progress/:mediaItemId`
- `POST /progress`
- `POST /progress/:mediaItemId/complete`
- `GET /downloads`
- `POST /downloads`
- `POST /downloads/:downloadId/cancel`
- `POST /pendrive/copy`
- `DELETE /pendrive/items/:mediaItemId`

## Padrão de resposta

### Sucesso
```json
{
  "success": true,
  "data": {}
}
```

### Erro
```json
{
  "success": false,
  "error": {
    "message": "string"
  }
}
```

## Códigos HTTP esperados
- `200` sucesso
- `201` criado
- `400` erro de validação
- `404` não encontrado
- `416` range inválido no streaming
- `500` erro interno

## Contratos principais
- `MediaItem`
- `StorageSource`
- `Download`
- `WatchProgress`
- `Tag`

## Observações
- Dados reais vêm do SQLite local após escanear notebook/pendrive.
- `contents`, `tags` e `content_tags` existem no banco para evolução do catálogo, mas o fluxo principal ainda usa `media_items`.
- Google Drive foi preparado como biblioteca mestre (`role = primary`) com OAuth local.
- A v1 do Drive usa três pastas escolhidas para Cursos, Filmes e Arquivos, aceita ID ou URL da pasta e indexa somente vídeos, PDFs e ZIPs.
- Notebook e pendrive continuam como armazenamento offline/cache; o player só reproduz arquivos locais.

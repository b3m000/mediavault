# API Design

## Base URL
`/api`

## Endpoints implementados
- `GET /health`
- `GET /storage`
- `POST /storage/notebook`
- `POST /storage/pendrive`
- `POST /storage/scan`
- `GET /storage/pendrive/status`
- `GET /library`
- `GET /library/:id`
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
- Google Drive ainda não possui integração ativa.

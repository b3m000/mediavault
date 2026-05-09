# Changelog

## Em andamento
- Adiciona limpeza em massa por armazenamento: limpar catalogo e apagar arquivos indexados com confirmacoes fortes.
- Atualiza README com estado atual, formatos de video, portas, verificacao e regras de seguranca para limpeza.
- Adiciona arquivos GitHub do projeto: workflow de verificacao, template de PR e templates de issue.

## 0.2.0 - Estabilização local
- Atualiza dependências de build e remove vulnerabilidade moderada reportada pelo `npm audit`.
- Estabiliza downloads locais para que uma cópia concluída não seja marcada como falha se a reindexação posterior falhar.
- Melhora o player com preferência persistida de legendas e tratamento de erro ao salvar progresso.
- Isola os dados mockados do MVP visual em `src/data/fixtures`.
- Prepara a próxima fase com Google Drive como biblioteca mestre, OAuth local e pastas separadas para Cursos, Filmes e Arquivos.

## Próxima fase - Google Drive mestre
- Conectar OAuth local usando credenciais em `server/data/google-credentials.json`.
- Sincronizar vídeos, PDFs e ZIPs de três pastas escolhidas no Drive.
- Manter notebook e pendrive como destinos offline/cache.

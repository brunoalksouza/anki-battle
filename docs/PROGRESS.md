# Anki Battle — registro de execução

## 2026-11-03

- Especificação lida integralmente. Projeto/repositório inicialmente vazios, sem alterações anteriores a preservar.
- Implementados React/Vite, Fastify, SQLite WAL, FSRS-7 via ts-fsrs 6.0.0, IndexedDB por conta e sincronização idempotente.
- Referências Apple/Bento/Liquid Glass examinadas, licenças MIT conferidas. CSS próprio e Lucide, sem copiar implementações.
- A senha root informada não funcionou. Chave já autorizada de deploy permitiu usar o servidor existente, sem mudar senhas ou criar servidores.
- A pedido do usuário, geração paga substituída por Tatoeba, Free Dictionary e Wikimedia Commons. Fontes reais verificadas e pendências explícitas quando indisponíveis.
- Quatro perfis do Financeiro migrados com verificadores de senha preservados, sem dados financeiros nem dependência em runtime.
- English.apkg importado no Bruno: 222 palavras, 909 revisões, 302 mídias; originais preservados. Versos visuais mantidos sem inventar definições.
- Containers/volume próprios, DNS existente e HTTPS. Caddy recarregado sem reiniciar outros sites. A capacidade exigida pelo binário oficial do gateway foi configurada; fontes adicionadas para os dois SVGs com texto, renderizados novamente.
- 21 testes aprovados; TypeScript/build aprovados. Revisão offline/sincronização, download integral de mídia e batalha entre duas contas locais concluídos.
- Backup diário instalado. Restauração de banco/mídia validada em cópias temporárias no servidor e no Mac.
- Capturas móvel/desktop/claro/escuro salvas localmente; login público HTTPS conferido. Git exclui credenciais, bancos, mídias privadas e capturas.

## Entrega implementada e verificada

- [x] Autenticação, recuperação por códigos e isolamento de usuários.
- [x] Baralhos, palavras, FSRS, importação/exportação e histórico persistente.
- [x] Frases e imagens reais com seleção, erros tratados e atribuição.
- [x] Estudo offline, mídias, reenvios idempotentes e conflitos preservados.
- [x] Atividade, metas, ranking e grupos.
- [x] Batalha entre duas contas com correção no servidor e resultado persistido.
- [x] Interface móvel, tema escuro, manifest e abertura offline.
- [x] Testes, conferência visual, HTTPS e restauração de backup.

Instalação física no celular, cobertura das fontes gratuitas, independência futura das senhas e retenção de backups: [VALIDATION.md](VALIDATION.md). O repositório público recebe somente código e documentação.

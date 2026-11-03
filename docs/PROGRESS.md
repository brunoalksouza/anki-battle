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

## Atualização — mapa anual de atividade

- “Cada dia conta” agora mostra o ano inteiro em quadradinhos verdes, com navegação entre anos, resumo de revisões/tempo do dia, média diária, frequência e sequências.
- Dias selecionáveis por toque e teclado, suporte ao fuso do perfil, anos bissextos e virada de ano. Dias futuros não entram nas estatísticas; atividade de estudo permanece separada de acessos.
- Painel ocupa a largura do dashboard; no celular há rolagem lateral do mapa, sem transbordamento da página. Temas claro/escuro conferidos com o histórico importado em uma conta local de teste.
- 26 testes aprovados (cinco novos casos de calendário/estatísticas), além de TypeScript e build. Navegação entre anos, estado vazio, detalhes de dia, teclado e filtro de acessos verificados no navegador.

## English interface and phone layouts — 2026-11-03

- All app-owned copy is now English: navigation, dashboard/calendar, review flow, word/deck editors, battles/groups, profile/goals, login/recovery, PWA metadata, installation instructions, validation and API errors. Dates and numbers use English formatting.
- English example requests no longer request Portuguese translations based on a user's native language. English explanations are used for other study languages; the provider cache namespace changed to avoid old translated responses.
- An idempotent startup migration translates exact importer/default labels and tags. Existing English definitions, sentences, images, audio, original APKG source, schedules, and reviews are preserved. Future imports use English labels too.
- Phone layouts use readable copy, 16px form fields, larger controls, stacked filters/forms, safe-area padding, and reachable sticky review ratings and dialog actions. Fixed the narrow dashboard overflow and modal dynamic viewport sizing.
- Verified actual UI on 320/360/375px content widths and desktop, light/dark, including login, recovery, registration, dashboard/year navigation, deck selection, review answers, imported word details/editor, invitation and profile. Screenshots stay local because they contain private learning history.

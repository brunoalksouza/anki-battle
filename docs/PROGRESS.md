# Study Grove — registro de execução

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

## Gallery profile photos — 2026-11-03

- Added gallery selection, circular preview, explicit save/cancel, replacement and removal in Profile. All controls/messages are English and fit narrow phone screens. Emoji avatars remain the fallback.
- Reused avatars across the header/sidebar, rankings, battles and invitation search. Images are cached in the viewer's account storage for offline use.
- Added authenticated photo storage/retrieval, bounded decoding and WebP normalization without EXIF. Private card media retain owner-only access. Existing backups include the new images without a schema change.
- Tested uploads only in isolated temporary/local QA databases; no fixture image is assigned to a production profile.

## Focused study on iPhone — 2026-11-03

- Review sessions now own the visible viewport. App navigation, general header/footer and nonessential copy are hidden while a card is active. End session returns to normal navigation.
- The reveal button and all four difficulty buttons occupy the same bottom action area, outside the card. Dynamic viewport sizing and safe-area insets account for Safari chrome and the home indicator.
- Compact card layout automatically adjusts spacing, readable text sizes and contained image height after resizing, image loading or expanding explanations. Imported visual answers show their original image directly; compact audio controls keep playback available.
- Validated the longest imported definitions and representative image/audio cards at 402×874 and a reduced 402×680 viewport, plus 320×568 and landscape controls. No card or page scrolling for the six representative imported cards at 402×680.

## Stronger color contrast — 2026-11-03

- Strengthened the purple accent, dashboard highlights, semantic icon colors and activity greens while preserving the layout and English copy. Secondary text and panel boundaries are more distinct.
- Theme-aware semantic colors now also drive rating buttons, notices and status badges. Primary button fills retain readable white labels in both themes; dark ratings use distinct deep backgrounds instead of a brightness filter.
- No study content, schedules, account preferences or application behavior changed in production.

## Independent-deck consistency challenges — 2026-11-03

- Battles now opens on Consistency: invite/accept, seven calendar days, own private cards, today's unique words, study days, total daily words and a day-by-day scoreboard. The existing shared-deck game is available as Card quiz.
- The winner is decided by study days, then total daily words. Repeated/reverse/duplicate-word reviews cannot inflate a day's count. All ratings count equally; early, suspended, conflicting, imported and under-two-second reviews are excluded.
- Added a separate challenges table and indexes without changing existing tables or schedules. Reviews now retain server receipt time and a normalized word identity; closed scores are frozen and late offline sync does not rewrite results. Challenge dates use the inviter's fixed time zone.
- Participant-only API reads and actions, idempotent invites/acceptance, duplicate-pair protection, expiration, cancellation and historical results. Only aggregates are shared. Dashboard invitation counts include the new mode.
- QA invitations, acceptance and study were performed only between synthetic local accounts. No invitation was sent to a production account.

## 2026-11-04 — Study Grove

Rebranded the app, install experience, icons, package, and GitHub repository to Study Grove. Added a daily reading goal with private Kindle connection storage, a confirmed-date calendar, encrypted sessions, periodic server checks, reconnection, and disconnect. The first verified reading snapshot is visible to its owner; automatic Amazon authentication still requires connection setup. Preserved the existing public domain, persistent storage, and focused mobile review layout. Validation: 60 passing tests, successful build, mobile browser checks, healthy production containers, unchanged study-data hashes.

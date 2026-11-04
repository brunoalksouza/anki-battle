# Validação — 3 de novembro de 2026

## Testes automatizados

`npm test`: **28 testes aprovados, zero falhas**. TypeScript/Vite aprovados. `npm audit --omit=dev --json`: zero vulnerabilidades conhecidas reportadas na execução; não é garantia de ausência de falhas.

Cobertura: FSRS e serialização determinística; Unicode/lacunas; autenticação/recuperação/CSRF; isolamento de contas e mídias; reenvios idempotentes; edição sem perder agendamento; datas offline e pontos; semanas/fusos; batalhas com duas sessões, consentimento, reconexão, expiração e abandono; grupos; SQLite reaberto; significado visual editável; lote de mais de 300 mídias; fila IndexedDB concorrente, resposta perdida, conflito, conta incorreta e ações adicionadas durante sincronização. Testes usam bancos próprios.

## Fluxos reais no navegador/API local

- Conta `Bruno · teste local`, autenticada e persistida em SQLite com cópia do APKG. O cartão extra `horse` é fixture local; produção contém exatamente as 222 palavras recebidas.
- Fontes reais responderam à consulta de `horse`: 18 definições, 11 exemplos com tradução, 12 imagens. Imagem escolhida retornou WebP com atribuição CC BY-SA 3.0. Frase observada: “The horse neighs.” / “O cavalo relincha.”. Nenhum mock externo no aplicativo.
- Download de baralho/imagem, desligamento do backend, recarga pelo service worker e revisão offline. Ao religar, “Tudo sincronizado”; banco com exatamente uma revisão aplicada, 17.007 ms ativos e 5 pontos. Reenvio/ACK perdido também coberto por teste automatizado.
- Download integral do English finalizado: 81 imagens e 221 áudios. O cartão `coffee maker` exibiu frase/cor/imagem originais; o controle de áudio passou ao estado de reprodução.
- Segunda conta `Oponente · teste local` criou baralho autorizado e convite. Aceite, preparação e quatro perguntas percorridos no navegador; o oponente respondeu pela API HTTP real. Resultado persistido: quatro acertos por jogador, desempate pelo tempo. Dados claramente identificados como teste e ausentes de produção.
- Layout examinado em 390×844 e 1280×900, claro/escuro. Capturas de painel, revisão, cartão original e batalha em `docs/screenshots/`, somente local porque incluem conteúdo privado.

## Produção

- `https://anki.aneblober.com/api/health`: HTTPS 200 e `{"ok":true,"service":"anki-battle","schema":1}`. Estado privado sem sessão rejeitado. Login público carregado no navegador, sem alerta TLS.
- Contas bruno, ariel, bruna e bia importadas. Comparação interna confirmou os mesmos verificadores de senha do Financeiro sem exibi-los ou copiá-los ao Git. Não foi necessário conhecer ou alterar senhas.
- English.apkg, SHA-256 `b4bd679a4f9bd689da7b712e0c867e6c3888d27fe7215dfaa8c9d53a45a65574`, importado apenas no Bruno: 222 palavras/cards, 909 revisões, 81 imagens e 221 áudios. As 81 definições originalmente visuais preservam as imagens. Original arquivado para recuperação.
- Atualização dos containers manteve dados e saúde. Caddy compartilhado conserva início em 2026-10-13 e zero reinícios. Financeiro respondeu 200 e MB 307 antes/depois; demais serviços mantiveram suas datas anteriores de execução.
- Backup final `2026-11-03T12-36-43-687Z` restaurado em diretório separado no servidor: integridade/chaves estrangeiras OK, quatro usuários, 222 palavras, 909 revisões, 302 mídias e um APKG com hash conferido. Restauração também validada no Mac com a cópia externa inicial.
- Backup diário instalado no cron preservando jobs anteriores, retenção de 14 dias. Nenhum novo servidor ou serviço pago.

## Limites concretos

1. A instalação na tela inicial de iPhone/Android físico precisa ser feita no aparelho. Manifest, ícones, service worker e abertura offline foram conferidos; não se afirma instalação física realizada a partir deste Mac.
2. Frases são exemplos públicos; podem faltar ou usar outro sentido. Edite ou tente novamente. Definições sugeridas estão disponíveis em inglês; demais idiomas aceitam significado manual.
3. Migração inicial de contas, sem SSO ou replicação futura de usuários/senhas. Recuperação do Anki usa códigos próprios, que usuários importados podem gerar no Perfil.
4. Batalhas assíncronas dependem de rede. O servidor valida respostas/tempo e duplicatas; não promete impedir consulta externa pelo jogador.
5. Backups diários estão no mesmo servidor. Há cópia externa inicial, sem transferência externa recorrente configurada. Limpar o armazenamento do navegador remove pendências ainda não sincronizadas.
6. Migração APKG atende ao modelo Basic do arquivo fornecido. CSV/JSON transferem conteúdo; restauração integral usa o backup administrativo.

## Mapa anual de atividade

Cinco testes adicionais cobrem alinhamento de semanas, 365/366 dias e anos com 54 colunas, médias sem contar datas futuras, sequência entre anos, estados vazios, distinção de acessos e estudo e data no fuso do perfil. Interface conferida em larguras de desktop e celular: seletor de ano, retorno ao ano atual, detalhes por dia, navegação por setas e filtro Estudo/Acessos. Rolagem horizontal fica contida no mapa. Capturas locais dos temas claro e escuro em `docs/screenshots/heatmap-*.jpg`.

## English and mobile update

- `npm test`: **28 tests passed, zero failures**. TypeScript/Vite build and `git diff --check` passed. Existing message assertions now use the English messages; test setup for the new migration test was corrected before the passing run.
- Migration regression test verifies exact legacy labels/tags become English, custom definitions stay intact, card schedules/review records/media/source stay unchanged, and a second run makes no changes.
- Provider regression test verifies a Portuguese native-language preference cannot reintroduce Portuguese explanations or cached Portuguese suggestions. A live request for `horse` returned six English examples and no translated explanations (example: “The horse reared.”).
- Runtime strings audited against the previous source using the installed TypeScript parser, including JSX text and template fragments. Remaining Portuguese source literals are intentional exact-match inputs in the legacy data migration.
- Browser QA: native required-field feedback appeared in English; registration and recovery labels/English defaults checked without changing credentials. Study, reveal-answer, visual word details, editor, invitation and profile inspected. No page overflow at 320px after the dashboard grid fix; 16px inputs, at least 44px primary touch targets, and sticky mobile review/dialog actions verified visually. Both themes and desktop checked. Calendar cells retain their dense annual view with internal horizontal scrolling.
- Production content audit found English terms/sentences/definitions, 81 legacy visual-meaning placeholders, and Portuguese importer tags/default deck metadata. No Portuguese sentence translations were stored. Migration targets the app-generated Portuguese labels only, preserving the English card content.
- Screenshots: `docs/screenshots/english-mobile-home.jpg`, `english-mobile-review.jpg`, and `english-mobile-light.jpg` (local-only).

## Gallery profile photos

- Final check: **32 tests passed, zero failures**, TypeScript/Vite build and diff/format checks passed.

- API regression coverage: normalization/orientation/metadata removal, persistence, authenticated player access, private card media isolation, invalid/oversized input preserving the current photo, stale preferences preserving the photo, replacement/revocation, and removal affecting only the signed-in account.
- IndexedDB coverage: previously viewed photos work offline, cache keys are scoped to the viewer, a new photo never reuses an old photo, and sign-out clears cached photos.
- Browser QA used the app's public icon only in a separate local database: selection/preview/cancel without uploading, save, reload persistence, header/profile/ranking/battle display, staged removal and restored emoji. Profile had no page overflow at 320px; the gallery bottom sheet and its actions fit 320px and 375px phone layouts.
- The first photo test run exposed incomplete profile-preference fixtures; supplying the existing required preference fields corrected those two assertions.
- Real device gallery behavior and HEIC decoding are not claimed; supported formats are JPEG, PNG and WebP.

## Focused study layout

- TypeScript/Vite build and 32 existing automated tests passed. No scheduler, review queue or production study data changed.
- Browser QA in a separate local database: coffee maker, malingering, baseboard, manhood, framework and accent. At 402×680, every complete answer fit within the card; document height equaled viewport height and all difficulty buttons ended at y=668 consistently. An image card selected compact density automatically.
- At 402×874 the image/audio card fit at comfortable density. At 320×568 a longer definition fit at compact density. At 874×402 the page stayed fixed and difficulty controls stayed visible. End session restored deck selection; no browser errors/warnings were reported.
- This is browser viewport testing, not a claim of testing a physical iPhone 17 Pro. Dynamic viewport CSS and safe-area padding remain responsive to the actual browser/PWA area. Extremely long future user-authored content can scroll inside the card as an accessibility fallback; rating controls remain fixed and content is never truncated.

## Official Anki synchronization feasibility

The current APKG migration is an import, not continuous synchronization. AnkiMobile synchronizes cards, review history and media through AnkiWeb; the public service does not currently expose a supported third-party API. A desktop bridge/add-on is a feasible direction, with the official desktop client continuing to synchronize with AnkiWeb and AnkiMobile. A separate self-hosted Anki sync server is also documented, but merely hosting that server would not connect this PWA's data model.

A future bridge must map the imported note IDs, avoid duplicate reviews and define which scheduler owns next-review dates before writing to either collection. No Anki credentials, desktop add-ons, official collection or synchronization settings were changed for this UI update.

Sources consulted on 2026-11-03: [AnkiMobile preferences](https://docs.ankiweb.net/ankimobile/preferences), [maintainer statement about third-party API access](https://forums.ankiweb.net/t/github-action-to-upload-anki-add-on/70165), [self-hosted sync and AnkiConnect guidance](https://docs.ankiweb.net/manual/sync-server).

## Stronger color contrast

- 32 existing tests passed, TypeScript/Vite production build and diff checks passed. Changes are CSS only.
- Browser inspection covered the dashboard in both themes and revealed review cards at 402×680. The document stayed 402×680 and every rating button ended at y=668 in both themes.
- Final palette contrast ratios: light Again 4.69:1, Hard 5.44:1, Good 4.60:1, Easy 6.31:1; dark ratings 6.03:1–7.05:1. White primary button text is 6.11:1 in light and 5.94:1 in dark. These checks cover these color pairs, not a full accessibility audit or user-defined card colors.

## Independent-deck consistency challenges

- 40 tests passed, including eight new challenge tests. Coverage includes different private decks, consent and authorization, same-day pre-acceptance study, reverse/duplicate cards, replay, every eligibility exclusion, days-before-volume ranking, word-count tie-breaks, exact ties, offline receipt deadlines, DST and fixed shared time zones, cancellation/expiry and persisted final results after reopening SQLite.
- Real UI flow in a separate local database: sender searched for a synthetic partner and sent an invitation without a deck selector; invited account accepted; Study my cards showed only that account's private deck; a valid review of horse updated its score from zero to one word and one study day. No production cards or invitations were modified.
- Both themes inspected. At 402px, both players remain side by side; at 320px the scoreboard stacks and all four competition tabs fit without page overflow. Touch controls, English text, pending-sync guidance and explicit end-challenge confirmation remain available.
- Challenge totals measure study activity, not verified vocabulary mastery. The duration is seven days; no automatic rematch, notification delivery or invitation to a particular production partner is claimed.

## Study Grove and daily reading — 2026-11-04

- Rebranded visible UI, login, PWA/install metadata, Apple home-screen title, SVG/PNG/maskable icons, exported filenames, npm package, README, and repository metadata. Repository: `brunoalksouza/study-grove`. Existing domain and persistence identifiers are intentionally retained.
- `npm test`: 60 passed, 0 failed. Added Kindle parsing, calendar-date preservation, per-account isolation, encryption, idempotency, polling throttle, outage/expiry history preservation, disconnect races, and authenticated API coverage using synthetic credentials and a mocked provider.
- `npm run build`: TypeScript and Vite passed. JS `/assets/index-BRsqWpwP.js`, CSS `/assets/index-CbTD3rzj.css`, service worker `f966c82b3974`.
- Browser: mobile login and reading at 402 × 874, desktop login, calendar navigation, connection dialog, and live PWA update verified. Reading has no horizontal overflow. An answered long study card kept all four ratings inside the viewport (bottom 862 px; document height 874 px), with no review submitted.
- Production: app and gateway healthy. `/api/health` returned `{"ok":true,"service":"study-grove","schema":1}`; live HTML and manifest serve the new brand and expected assets. Backup succeeded before deployment. Before/after SHA-256 comparisons of words, cards, reviews, and assets were identical.
- Kindle: the existing browser session successfully returned the current Reading Insights schema. A first verified reading snapshot was imported only into its owner's profile. No Amazon session was copied or activated on the server. Automatic server access remains pending the user's first **Connect Kindle** setup; provider-double tests do not establish live server authentication.
- Screenshots and private deployment evidence remain in ignored local directories. No Amazon cookies, account exports, or connection keys are committed.

## Combined study overview and direct Reading navigation — 2026-11-04

- Home now opens with equally prominent Flashcards and Reading panels, showing today's progress, separate streaks, card study time, collection size, and books marked as read. Sub-minute card study time displays seconds. The flashcard calendar remains below the overview and identifies its Cards/Visits filter explicitly.
- Reading is a primary tab in the mobile bar and desktop sidebar, with its own selected state. Mobile keeps five targets (Home, Cards, Reading, Words, Compete); Profile remains directly accessible through the header avatar. Removed the reading shortcut from Profile.
- Validation: 60 automated tests passed; final TypeScript/Vite build passed. Browser checks covered mobile at 402 × 874 and 320 × 740, desktop navigation, both direct reading entry points, Profile access, and retained fixed card-review controls. No horizontal overflow; both overview panels fit above the mobile navigation at the tested sizes. No review was submitted during validation.
- Production app/gateway healthy; live HTML serves `/assets/index-B-HRKT1r.js` and `/assets/index-CBEvyh_V.css`. Service worker `1f5259ece97e`. Live account metrics and one-tap Reading navigation verified. Pre/post study-data table hashes were identical. No database or Kindle authentication changes.
- Screenshot: ignored `docs/screenshots/study-overview-production.png`.

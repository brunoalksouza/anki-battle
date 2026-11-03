# Validação — 3 de novembro de 2026

## Testes automatizados

`npm test`: **26 testes aprovados, zero falhas**. TypeScript/Vite aprovados. `npm audit --omit=dev --json`: zero vulnerabilidades conhecidas reportadas na execução; não é garantia de ausência de falhas.

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

# Anki Battle

PWA de estudos em português, publicado em **https://anki.aneblober.com**. React/Vite, Fastify, SQLite persistente e FSRS-7 (`ts-fsrs` 6). Interface própria com temas claro/escuro, baralhos privados e batalhas assíncronas entre contas reais.

## Usar

Entre com sua conta. Os quatro usuários existentes do Financeiro foram migrados com seus identificadores e verificadores de senha atuais. É uma migração inicial: alterações posteriores de senha ou novos usuários no Financeiro não são sincronizados. O Anki não lê dados financeiros durante o uso.

- **Início:** mapa anual de atividade com intensidade verde, seleção de dia, navegação por ano, resumo diário e estatísticas. Média e frequência usam os dias decorridos do ano (sem dias futuros); a maior sequência considera o ano selecionado e a sequência atual considera todo o histórico. Estudo e acessos ficam separados.
- **Estudar:** crie/edite baralhos, ajuste limites no Perfil e baixe um baralho para revisar sem internet. Revelar → Errei, Difícil, Bom ou Fácil. O FSRS calcula a próxima revisão.
- **Palavras:** cadastre expressão, significado, idioma e cor; pesquise, filtre e edite. Cards básicos, inversos e lacunas. Detalhes incluem imagens, pronúncia importada, suspensão e histórico.
- **Batalhas:** autorize um baralho para disputas, convide outra conta e aguarde o aceite. Cada jogador responde ao mesmo conjunto em seu horário. Dados pessoais e agendamentos ficam separados.
- **Perfil:** metas, limites, aparência, idiomas, histórico e exportação. Gere e guarde os códigos de recuperação; cada código funciona uma vez. Não há envio de e-mail.

**Instalar:** no iPhone/iPad, Safari → Compartilhar → Adicionar à Tela de Início. No Android, Chrome → menu → Instalar aplicativo. Em Estudar, use **Baixar** para incluir imagens e áudios. O armazenamento offline pertence ao navegador; limpar os dados do site remove a cópia local. Aguarde “Tudo sincronizado” antes de trocar de aparelho ou limpar dados.

## Executar e validar

Node.js 24+ e npm. Nenhuma chave de IA é necessária.

```sh
npm ci
npm run build
APP_ORIGIN=http://127.0.0.1:3100 npm start
```

Abra http://127.0.0.1:3100. O build permite testar o service worker; no desenvolvimento Vite, use `npm run dev` e, em outro terminal, `npm run server` (origem padrão `http://localhost:5173`; Vite encaminha `/api` ao backend).

```sh
npm test
npm run build
node --import tsx scripts/verify-backup.ts caminho/do/backup
```

Variáveis em `.env.example` são referência; injete-as pelo ambiente do processo ou Compose. Não há carregamento automático de `.env`. Banco e mídias ficam em `DATA_DIR` (padrão `./data`), excluído do Git.

## Dados e sincronização

SQLite em WAL, transações para revisões/resultados, sessões opacas em cookies HttpOnly, hashes de sessão no banco, scrypt e autorização de cada recurso. CSRF valida origem e cabeçalho da aplicação. Mídias requerem autenticação e propriedade. O proxy sobrescreve o IP usado nos limites; a API não publica porta no host.

IndexedDB isola os dados de cada conta. Cards baixados, mídias e fila de revisões sobrevivem ao fechamento. Escritas locais são atômicas; `navigator.locks` coordena abas. IDs de ação tornam reenvios idempotentes. Um conflito de conteúdo conserva o rascunho, permite comparar, reaplicar ou exportar e manter a versão do servidor. Revisões concorrentes conservam o histórico, sem aplicar duas vezes o mesmo estado ou conceder pontos em duplicidade. O conteúdo e o agendamento têm versões independentes.

O service worker armazena apenas a interface; dados privados e mídia ficam no IndexedDB por conta. Atualizações aguardam uma ação explícita fora da revisão, sem pendências. Uma primeira conexão é necessária. Batalhas, busca externa, mudanças de perfil/baralho e validação de pontos precisam de rede. Revisões offline podem ser sincronizadas por até 90 dias.

## Fontes gratuitas

- [Tatoeba API](https://api.tatoeba.org/): exemplos reais curtos e traduções, quando disponíveis, em vez de geração por IA. Busca a expressão inteira e prioriza correspondências entre tradução e significado. A escolha de sentido não é garantida: revise o exemplo, edite ou peça outro. Frase e tradução preservam seus próprios créditos/licenças.
- [Free Dictionary API](https://dictionaryapi.dev/): sugere definições em inglês e conserva atribuição. Para outros idiomas, digite o significado.
- [Wikimedia Commons](https://commons.wikimedia.org/w/api.php): grade de imagens, prévia e confirmação explícita. O servidor consulta metadados oficiais, limita o download, converte a WebP e conserva autor, origem e licença. Nunca há raspagem do Google.

Até 100 consultas por usuário/dia em cada fonte, 50 downloads de imagens/dia, cache de consultas por 24h e timeouts. As fontes não exigem cadastro pago nem credenciais. Falha de fonte não impede salvar/estudar; a frase permanece pendente com nova tentativa manual. Não prometemos disponibilidade ou cobertura externa.

## Importação e exportação

Na tela Palavras, importe CSV UTF-8 com cabeçalho ou JSON (lista ou objeto `{"words":[...]}`). Até 2 MB/1.000 palavras por lote. O destino é o baralho selecionado ou o primeiro. Cada importação explícita cria novas palavras; reenvio do mesmo pedido é idempotente.

Campos: `term` e `meaning` obrigatórios; `language` (ex. `en`), `color` (`#8058d8`), `tags` (CSV separadas por `;`, JSON array), `sentence`, `translation` e `kind` (`basic`, `reverse`, `cloze`). O exportador usa os filtros ativos. CSV/JSON de conteúdo não transferem binários, contas nem agendamento. A exportação do Perfil inclui dados/histórico/pendências para consulta; restauração integral usa o backup do servidor.

```csv
term,meaning,language,color,tags,sentence,translation,kind
horse,cavalo,en,#8058d8,animais,The horse runs.,O cavalo corre.,basic
```

A migração administrativa de APKG moderno usa `scripts/prepare-apkg.mjs` (Node 24, Python 3, `fflate`) e `scripts/import-anki.ts`. Suporta o modelo Basic de um card usado no arquivo recebido; rejeita modelos incompatíveis. Valida a mídia por SHA-1, conserva o original por SHA-256 e usa IDs determinísticos para evitar duplicação. O HTML original é arquivado como texto, nunca executado. O histórico real reconstrói o estado FSRS e a próxima data original é preservada. Pontos antigos não são criados.

O English.apkg fornecido foi importado apenas no perfil Bruno: **222 palavras, 909 revisões, 81 imagens, 221 áudios**. As 81 definições originalmente visuais mantêm a imagem e a tag `significado-visual`. Elas não entram em perguntas textuais de batalha até receberem um significado escrito. Os originais e dados privados não fazem parte do repositório.

## Regras competitivas

5 pontos pela primeira revisão válida de cada palavra no dia UTC, com pelo menos 2 segundos ativos; máximo 100 palavras/dia. Todos os botões de autoavaliação valem o mesmo. Login não dá pontos. Reenvios, cards antecipados/suspensos e conflitos não concedem pontos. Tempo ativo pausa em aba oculta e após 30 segundos sem interação, com teto de 120 segundos por resposta. Autoavaliação não é apresentada como acerto objetivo.

A semana competitiva começa segunda-feira às 00h UTC para todos. Revisões offline antigas permanecem no histórico local, mas não alteram semanas competitivas encerradas. Calendários/tempo de estudo usam o fuso do perfil. Metas semanais são preservadas no banco.

Batalhas exigem aceite e baralho autorizado com ao menos quatro pares distintos. Até dez perguntas, 60 segundos por rodada, prazo total de 48h. O servidor guarda o relógio e o gabarito; reconectar não reinicia a rodada. Acertos vêm primeiro; a soma dos tempos nas respostas corretas desempata. Se ambas as medidas empatam, empate. Abandono/expiração não dão recompensa. Participação válida: 10 pontos; vencedor: 20; ao menos um acerto, até três recompensas/dia e uma por oponente/semana. Batalhas nunca alteram cards pessoais.

## Operação e evidências

- [Implantação, backup e restauração](docs/OPERATIONS.md)
- [Validação e limites reais](docs/VALIDATION.md)
- [Registro de execução](docs/PROGRESS.md)

Referências visuais examinadas: [Apple design](https://github.com/topics/apple-design), [Apple Bento Grid](https://github.com/hubeiqiao/apple-bento-grid) e [Simple Liquid Glass](https://github.com/lucaperullo/simple-liquid-glass). Os dois projetos são MIT; usados como inspiração visual, sem copiar implementação. Ícones Lucide, fontes nativas, CSS e arte vetorial próprios.

## Interface language and mobile use

The app interface is English throughout, including validation, server errors, PWA metadata, and date/number formatting. English learning examples do not generate Portuguese translations. Existing imported English content is preserved; legacy importer labels and default deck metadata are migrated idempotently to English. Phone layouts use larger touch targets and text, stacked forms/filters, safe areas, and sticky review and dialog actions.

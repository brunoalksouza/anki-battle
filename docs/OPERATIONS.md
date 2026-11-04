# Operação do Study Grove

## Infraestrutura

- Host existente DigitalOcean: `165.22.7.160`, acesso `deploy` por chave SSH autorizada. Não há senha no repositório.
- Projeto no host: `/home/deploy/anki-battle`.
- Volume externo persistente: `anki-battle_anki_data`, montado em `/data`. UID/GID 1000, diretório 0700 e SQLite 0600.
- App Node 24: `anki-battle-app`, porta 3100 apenas interna, healthcheck, limite 384 MB/0,7 CPU.
- Gateway `anki-battle-gateway`: Caddy na 8080, ligado à rede privada do app e à rede existente `docker_default`. O app tem rede de saída própria para as fontes públicas. Nenhum serviço financeiro é montado ou consultado em runtime.
- Edge compartilhado existente: `docker-caddy-1`, `/srv/mb-serraria/Caddyfile`. Bloco exclusivo em `deploy/Caddyfile.anki`. Certificado ACME do domínio e Cloudflare já funcionais. Nenhum registro DNS foi alterado.
- Containers reiniciam automaticamente, executam sem root, com filesystem somente leitura e tmpfs. Caddy oficial precisa da capacidade NET_BIND_SERVICE gravada no binário mesmo ao usar 8080. Logs Docker têm rotação.

## Publicar nova versão

No checkout local, com Node 24, Docker no host e a chave conhecida:

```sh
bash deploy/publish.sh
```

O script testa, compila, envia apenas código/build, faz backup da versão em execução, compila imagem e aguarda saúde dos containers. `ANKI_SSH` e `ANKI_SSH_KEY` permitem substituir destino/chave. O volume é inicializado na primeira instalação. Não há alteração automática do proxy compartilhado nem de outros projetos.

Ao mudar o proxy, preserve o arquivo completo e valide um candidato antes de aplicar. Neste host Caddy 2.11.4 tem `admin off` e inicia com `caddy run --config ...`; SIGUSR1 relê esse arquivo sem reiniciar os outros sites. Escreva no mesmo inode do bind mount. A configuração anterior à implantação foi guardada no host em `deploy/evidence/Caddyfile.before-anki`, não no Git. Compare o original antes de alterar para evitar sobrescrever edições concorrentes. Não acrescente o bloco duas vezes.

```sh
docker compose ps
docker logs --tail 50 anki-battle-app
curl --fail https://anki.aneblober.com/api/health
```

O endpoint de saúde verifica o processo; monitore também disco e falhas SQLite nos logs. Não inclua cookies, hashes, senhas ou dados de estudo em relatórios públicos.

## Backup

`deploy/backup.sh` usa a API de backup consistente do SQLite, verifica integridade e copia mídia e arquivos APKG originais. Primeiro cria diretório temporário e depois o renomeia. Mantém 14 dias, tanto no volume `/data/backups` quanto em `/home/deploy/anki-battle/backups`.

Cron do usuário deploy instalado, sem alterar os jobs anteriores:

```cron
35 6 * * * /bin/bash /home/deploy/anki-battle/deploy/backup.sh >> /home/deploy/anki-battle/backups/cron.log 2>&1
```

Horário do cron é o fuso do servidor (UTC). Uma cópia externa inicial foi recuperada no Mac em `backups/production-2026-11-03` (fora do Git). As cópias diárias ficam no mesmo Droplet; a transferência recorrente para outro host ainda não está configurada. Preserve cópias externas periodicamente para cobrir perda do servidor.

```sh
bash deploy/backup.sh
node --import tsx scripts/verify-backup.ts backups/DATA_DO_BACKUP
```

O verificador restaura para um diretório temporário separado, abre o esquema, valida integridade/chaves estrangeiras, carrega snapshots, confere propriedade/existência de mídia, decodifica imagens e compara o hash dos APKG. Não altera a origem nem produção.

## Restaurar produção quando necessário

1. Valide o backup com `verify-backup.ts`, preserve também uma cópia do volume atual e pare somente `app`/`gateway` deste projeto.
2. Crie um **novo volume**, copie o conteúdo do backup completo para ele e ajuste UID/GID 1000 e permissões. Não misture `anki.sqlite` de um backup com `-wal`/`-shm` de outro banco.
3. Troque `volumes.anki_data.name` em uma cópia da configuração para o volume restaurado. Suba o projeto e confirme saúde, contas, baralhos, mídia e agendamentos.
4. Mantenha o volume anterior até validar a recuperação. Para reverter, pare apenas o projeto e volte ao volume anterior. Nunca use `docker compose down -v` neste ambiente.

Para reverter só código, mantenha o mesmo volume e use a imagem anterior. Antes de uma atualização com migração de esquema, valide compatibilidade com o backup; a versão inicial usa schema 1.

## Migração de contas e APKG

`scripts/import-finance-users.ts` recebe pelo stdin somente ID, username, password_hash e disabled de uma leitura autorizada. Importa contas ativas ausentes e não imprime os verificadores. Nunca passa por argumentos de shell, logs ou Git. Não é SSO nem sincronização contínua. Contas já existentes não são sobrescritas.

Preparação APKG no Mac:

```sh
node scripts/prepare-apkg.mjs /caminho/English.apkg tmp/english-prepared
DATA_DIR=./data node --import tsx scripts/import-anki.ts tmp/english-prepared bruno
```

No servidor, o arquivo preparado foi passado ao container pelo volume privado. O pacote original fica em `/data/imports/<sha256>.apkg`. A importação confirma destino existente e é idempotente pelo hash do pacote e conta. Não é um importador genérico de todos os tipos de nota do Anki. O container inclui fontes para renderizar texto presente em SVGs importados.

## Study Grove (2026-11-04)

The app keeps the existing domain, Docker names, data volume, session cookie, and IndexedDB names for compatibility. The product and repository name is Study Grove. The canceled book-reading integration, credentials, metrics, and background service have been removed. Only flashcard study and consistency challenges remain.

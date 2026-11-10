# Operação

## Configuração

| Processo | Variável | Finalidade |
| --- | --- | --- |
| Web | `API_URL` | Destino do rewrite `/api`; configurar também no build de produção |
| API | `Urls` | Endereço de escuta; padrão local `http://localhost:5080` |
| API | `ASPNETCORE_FORWARDEDHEADERS_ENABLED` | No Compose, `true` habilita reconhecimento do HTTPS original encaminhado pelo Caddy |
| API | `ConnectionStrings__Crm` | Conexão SQLite; padrão `Data Source=data/crm.db` |
| API | `WhatsApp__Url` | URL interna do serviço Node |
| API | `WhatsApp__Secret` | Segredo compartilhado, obrigatório fora de Development |
| API | `SecureCookies` | `true` em produção HTTPS; `false` somente para HTTP local |
| API | `Seed__AdminUsername` | Login do primeiro administrador; padrão `admin` |
| API | `Seed__AdminPassword` | Senha inicial de no mínimo 10 caracteres |
| API | `Seed__Demo` | Permite seed fictício somente em Development |
| WhatsApp | `SERVICE_SECRET` | Mesmo segredo configurado na API |
| WhatsApp | `CRM_API_URL` | API interna para revalidar destinatários |
| WhatsApp | `HOST`, `PORT`, `DATA_DIR` | Escuta e diretório de persistência |

O `.env` da raiz é lido pelo Docker Compose, não automaticamente pelos processos de `npm run dev`. Para personalizar a execução local, exporte variáveis no shell. Next.js aceita `apps/web/.env.local`. A API aceita o mecanismo de `dotnet user-secrets` após sua inicialização no projeto ou variáveis com `__` para seções.

## Substituir a aplicação antiga na VM

O `compose.yaml` deste projeto contém seu próprio Caddy e usa sua própria rede Docker. Não depende do Compose, dos containers ou da rede do projeto antigo. `docker compose up --build -d` inicia somente Caddy, API e WhatsApp; o frontend é publicado na Vercel. O [Caddyfile](../Caddyfile) mantém os domínios existentes e as portas internas do legado: `api.autoescolasilva.com.br` → `api:5000` e `wa.autoescolasilva.com.br` → `whatsapp:3001`. Somente as portas 80/443 são publicadas na VM. Os padrões de desenvolvimento com `npm run dev` continuam 5080/3080.

1. Envie o código pelo Git, configure `ADMIN_PASSWORD` e `SERVICE_SECRET` no `.env` da VM e mantenha `SECURE_COOKIES=true`. Execute `docker compose build` no projeto novo antes da manutenção; isso não inicia os serviços.
2. Faça backup do legado e confirme que o SQLite comercial que será publicado inclui as últimas alterações. Se necessário, use a [migração comercial](MIGRACAO_AUTOESCOLA.md); não restaure o PostgreSQL diretamente no volume SQLite.
3. Com API e WhatsApp de origem parados, transfira por SCP/SFTP os diretórios `apps/api/data` e `apps/whatsapp/data`, incluindo chaves e arquivos auxiliares SQLite. Restaure-os nos volumes `crm_data` e `whatsapp_data` do projeto novo antes de iniciar os serviços, conforme abaixo. Não versione esses dados. Sessões whatsapp-web.js do legado não são credenciais Baileys; somente os dados do serviço novo podem ser restaurados diretamente.
4. Execute `docker compose stop` na pasta do projeto antigo para liberar 80/443, preservando seus volumes. Depois, na pasta nova, execute `docker compose up -d`. Não é necessário manter nenhum container antigo em execução nem compartilhar sua rede. Não use `down -v` para fazer a troca, pois remove volumes.
5. Confira os dois endpoints HTTPS de health, logs e, pelo frontend novo, login, dados comerciais, envio/recebimento e restauração da sessão WhatsApp. Na Vercel, defina `API_URL=https://api.autoescolasilva.com.br` sem `/api` no final antes do build e mova o domínio do frontend para o projeto novo na mesma equipe, após validar seu endereço `.vercel.app`.

O DNS existente pode ser mantido enquanto os dois subdomínios apontarem para a mesma VM. O Caddy novo obtém e renova certificados automaticamente quando 80/443 estão acessíveis; não exige os certificados antigos. Seus volumes `caddy_data` e `caddy_config` persistem entre reinícios. Se optar por reaproveitar certificados, copie os dados dos volumes antigos para os novos com ambos os Caddys parados; nomes de volumes incluem o nome do projeto Compose e não são compartilhados automaticamente.

O Caddy termina TLS e encaminha HTTP para a API na rede Docker. Por isso, o Compose define `ASPNETCORE_FORWARDEDHEADERS_ENABLED=true`: o ASP.NET Core processa `X-Forwarded-Proto`/`X-Forwarded-For` antes da autenticação e do antiforgery, reconhecendo a requisição original como HTTPS. Mantenha `SECURE_COOKIES=true`. Sem esse reconhecimento, a emissão/validação de CSRF falha com `AntiforgeryOptions.Cookie.SecurePolicy = Always, but the current request is not an SSL request`, inclusive antes de verificar a senha. Essa opção confia nos cabeçalhos dos pares da rede interna; a porta da API deve continuar sem publicação no host, com acesso externo pelo Caddy. A opção não é habilitada automaticamente na execução local fora do Compose.

Ao atualizar somente essa configuração, recrie a API com `docker compose up -d --no-deps --force-recreate api`; um simples `restart` não aplica mudanças nas variáveis do Compose. Não exige reconstruir a imagem nem restaurar os bancos. Depois confira `GET /api/auth/csrf` pelo frontend (200) e `GET /api/auth/me` (401 sem sessão, 200 após login).

Se outro processo ainda ocupar 80/443, o Caddy novo não inicia; libere as portas e repita `docker compose up -d caddy`. Se o HTTPS falhar, confira DNS, acesso às portas e `docker compose logs --tail 100 caddy`. Health confirma processo disponível, não sessão WhatsApp conectada. Falha de restauração/migração deve ser resolvida antes de abrir o acesso aos usuários; não apague os bancos. Cancelar o build não troca os serviços antigos. Interromper a publicação depois de iniciar containers pode deixá-los em execução; confira `docker compose ps`.

Para retornar antes de novas gravações, pare o projeto novo, inicie o antigo e devolva o domínio do frontend ao projeto anterior na Vercel. Preserve os volumes novos para diagnóstico. Depois de gravações ou mensagens na versão nova, concilie essas alterações antes de retornar para evitar perda de dados ou repetição de envios.

Para testar o frontend Docker sem iniciar o proxy, defina `SECURE_COOKIES=false` e execute `docker compose --profile local up --build -d web api whatsapp`. O serviço `web` é opcional, escuta em `http://localhost:3000` e encaminha `/api/*` para `api:5000`. Esse comando não encerra um Caddy que já esteja em execução.

## Saúde e diagnóstico

- API: `GET http://localhost:5080/health` em desenvolvimento.
- WhatsApp: `GET http://localhost:3080/health` em desenvolvimento.
- Docker: `docker compose logs --tail 100 caddy api whatsapp`.
- VM: `GET https://api.autoescolasilva.com.br/health` e `GET https://wa.autoescolasilva.com.br/health`.
- Portas públicas na VM: 80/443; API 5000 e WhatsApp 3001 ficam na rede interna. O perfil local opcional publica também a porta 3000 do frontend.
- Se a API reiniciar e uma migração falhar, corrija a causa antes de reabrir o serviço; não apague o banco para resolver.
- A conexão WhatsApp faz reconexão limitada com espera progressiva. Após logout remoto, conecte novamente pelo QR Code.

## Backup de infraestrutura

A tela Backup é consulta de mensagens, não um backup dos arquivos do servidor. Para uma cópia consistente dos volumes:

1. Pare os serviços de escrita com `docker compose stop api whatsapp`.
2. Copie os volumes `crm_data` e `whatsapp_data` com uma ferramenta de backup do host.
3. Retome com `docker compose start api whatsapp`.
4. Guarde as cópias com criptografia e controle de acesso. Faça ensaio de restauração em ambiente isolado.

Na execução local, os diretórios são `apps/api/data` e `apps/whatsapp/data`. Inclua banco, arquivos auxiliares do SQLite e chaves de proteção. Nunca coloque credenciais de sessão Baileys em controle de versão.

Na primeira publicação, depois do build e com os dados transferidos para `/tmp/crm-release/apps/api/data` e `/tmp/crm-release/apps/whatsapp/data`, execute na raiz do projeto na VM:

```bash
test -s /tmp/crm-release/apps/api/data/crm.db && test -s /tmp/crm-release/apps/whatsapp/data/whatsapp.db
# Prossiga somente se os dois arquivos existirem e os serviços de origem estiverem parados.
docker compose create api whatsapp
docker compose cp /tmp/crm-release/apps/api/data/. api:/app/data
docker compose cp /tmp/crm-release/apps/whatsapp/data/. whatsapp:/repo/apps/whatsapp/data
docker compose run --rm --no-deps --user root --entrypoint sh api -c 'chown -R app:app /app/data'
docker compose run --rm --no-deps --user root --entrypoint sh whatsapp -c 'chown -R node:node /repo/apps/whatsapp/data'
```

`create` prepara os containers e volumes sem iniciar os processos; os comandos `run` acima executam somente o ajuste de permissões. Use este procedimento apenas em volumes novos, sem dados anteriores: sobrescrever um banco existente mantendo arquivos WAL antigos pode corromper a restauração. Pare a aplicação antiga antes de iniciar o Caddy novo. Preserve as cópias transferidas até validar a publicação. O backup de infraestrutura do projeto novo inclui também `caddy_data` e `caddy_config`; restaure os certificados com o Caddy parado.

## Homologação de uma conta real

Use uma base sem seed fictício, cadastre a sede e um vendedor e entre com ele. Conecte uma conta de teste em Conversas. Com um contato controlado, confira recebimento, texto, anexo, resposta, edição e criação/vinculação de lead. Teste um pequeno lote e seu cancelamento. Altere o status para “Não Enviar Mais” e confira o bloqueio. Reinicie o serviço e verifique a restauração da sessão e do histórico.

Os testes do repositório não conectam contas nem enviam mensagens externas. A edição depende das condições e janelas aceitas pelo WhatsApp. Mídias antigas podem não estar disponíveis para download.

# Operação

## Configuração

| Processo | Variável | Finalidade |
| --- | --- | --- |
| Web | `API_URL` | Destino do rewrite `/api`; configurar também no build de produção |
| API | `Urls` | Endereço de escuta; padrão local `http://localhost:5080` |
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

## Saúde e diagnóstico

- API: `GET http://localhost:5080/health` em desenvolvimento.
- WhatsApp: `GET http://localhost:3080/health` em desenvolvimento.
- Docker: `docker compose logs --tail 100 api whatsapp web`.
- Porta pública: 3000. As portas internas não precisam ser publicadas.
- Se a API reiniciar e uma migração falhar, corrija a causa antes de reabrir o serviço; não apague o banco para resolver.
- A conexão WhatsApp faz reconexão limitada com espera progressiva. Após logout remoto, conecte novamente pelo QR Code.

## Backup de infraestrutura

A tela Backup é consulta de mensagens, não um backup dos arquivos do servidor. Para uma cópia consistente dos volumes:

1. Pare os serviços de escrita com `docker compose stop api whatsapp`.
2. Copie os volumes `crm_data` e `whatsapp_data` com uma ferramenta de backup do host.
3. Retome com `docker compose start api whatsapp`.
4. Guarde as cópias com criptografia e controle de acesso. Faça ensaio de restauração em ambiente isolado.

Na execução local, os diretórios são `apps/api/data` e `apps/whatsapp/data`. Inclua banco, arquivos auxiliares do SQLite e chaves de proteção. Nunca coloque credenciais de sessão Baileys em controle de versão.

## Homologação de uma conta real

Use uma base sem seed fictício, cadastre a sede e um vendedor e entre com ele. Conecte uma conta de teste em Conversas. Com um contato controlado, confira recebimento, texto, anexo, resposta, edição e criação/vinculação de lead. Teste um pequeno lote e seu cancelamento. Altere o status para “Não Enviar Mais” e confira o bloqueio. Reinicie o serviço e verifique a restauração da sessão e do histórico.

Os testes do repositório não conectam contas nem enviam mensagens externas. A edição depende das condições e janelas aceitas pelo WhatsApp. Mídias antigas podem não estar disponíveis para download.

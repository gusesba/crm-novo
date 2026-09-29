# Via CRM · Autoescolas

CRM multiusuário implementado a partir de `FUNCIONALIDADES.md`, com gestão comercial por sede e vendedor, agenda de retornos e atendimento WhatsApp. Interface em português, responsiva, com identidade visual verde/sálvia e componentes reutilizáveis.

## Executar localmente

Pré-requisitos: **Node.js 22.20+**, **npm 10+** e **.NET SDK 10**. Execute na raiz:

```powershell
npm ci
dotnet restore Autoescola.slnx
npm run dev
```

Abra **http://localhost:3000**. O comando inicia o frontend (3000), a API (5080) e o serviço WhatsApp (3080). A API aplica as migrações e cria o banco na primeira execução.

Somente no ambiente `Development`, com banco vazio, são criados dados fictícios e contas de demonstração:

| Usuário | Senha | Perfil |
| --- | --- | --- |
| `admin` | `ViaDemo2026!` | Administrador global |
| `camila` | `ViaDemo2026!` | Vendedora · Unidade Centro |
| `rafael` | `ViaDemo2026!` | Vendedor · Unidade Centro |
| `beatriz` | `ViaDemo2026!` | Vendedora · Unidade Centro |

Os telefones e clientes do seed são **fictícios**. Não use a carteira demonstrativa em disparos reais. Para iniciar sem dados demonstrativos, defina `Seed__Demo=false` e `Seed__AdminPassword` antes de iniciar a API com um banco vazio. Configurações de seed só se aplicam ao primeiro provisionamento.

## Funcionalidades

- Login com cookie HttpOnly, proteção CSRF, expiração, limitação de tentativas e invalidação de sessões ao alterar usuários.
- Dashboard administrativo com indicadores, evolução por data de captação, distribuição de status, ranking de vendedores e próximos retornos. Filtros de período e sede.
- Leads e vendas no mesmo cadastro, com todos os campos comerciais da especificação, filtros, busca e paginação. Controle de edição concorrente por revisão.
- Telefone normalizado e índice único **por sede**. O mesmo número pode existir em unidades distintas.
- Meus leads, consultas gerais, vendedor responsável original e vendedor atual.
- Transferências temporárias e permanentes, individuais ou em lote, para vendedores elegíveis da mesma sede.
- Agenda geral, minha agenda e agenda por lead, com criação, edição, conclusão, reabertura e exclusão de retornos.
- Cadastros de equipe, sedes, serviços e condições de venda, com ativação/inativação.
- WhatsApp pessoal por usuário, QR Code, reconexão, conversas com fotos de perfil e nome priorizado por vínculo com lead, contato salvo e número; histórico, texto, imagens, vídeos, áudio e documentos de até 16 MB; resposta e edição quando suportadas pela integração.
- Vinculação explícita de conversa por telefone e vendedor atual; criação de lead a partir do chat.
- Grupos internos por filtros ou seleção manual, com adição/remoção de participantes.
- Disparos por filtros, grupo ou seleção individual; variável `{{nome}}`, anexos, intervalo, pausas, progresso e cancelamento.
- “Não Enviar Mais” bloqueia mensagens individuais e disparos. A fila revalida propriedade, sede ativa, telefone e status antes de cada envio.
- Backup como **consulta ao histórico armazenado**, incluindo consulta administrativa às sessões permitidas.

## Organização do código

```text
apps/
  web/
    src/app/                  # Rotas, layouts e entrada do Next.js
    src/components/           # Shell, sessão e elementos compartilhados
    src/features/             # Dashboard, leads, agenda, grupos, configuração e WhatsApp
    src/hooks/                # Carregamento assíncrono e atualização
    src/lib/                  # Cliente HTTP, contratos e formatação
    src/styles/               # Estilos por área visual
  api/
    Domain/                   # Entidades, status e regras puras
    Features/                 # Controllers, DTOs e serviços por caso de uso
    Infrastructure/           # EF Core, escopo, seed, erros e contexto de design
    Migrations/               # Evolução versionada do banco
  whatsapp/
    src/sessions/             # Ciclo de conexão e reconexão Baileys
    src/storage/              # SQLite, credenciais e mensagens
    src/messaging/            # Validação, envio, edição e mídia
    src/campaigns/            # Fila persistida, progresso e cancelamento
    src/routes.ts             # Rotas internas do Fastify
tests/Crm.Api.Tests/           # Testes HTTP e regras de negócio
docs/                         # Decisões e operação
```

O navegador acessa apenas o Next.js; `/api/*` é encaminhado à API .NET. A API autentica e autoriza todas as operações e comunica-se com o serviço WhatsApp por uma chave interna. O usuário da sessão WhatsApp é derivado da autenticação, nunca aceito livremente do navegador. Nenhuma credencial de serviço é exposta no frontend.

Veja [arquitetura e decisões](docs/ARCHITECTURE.md) e [operação](docs/OPERATIONS.md).

Os resultados de build, testes e conferência visual estão em [validação](docs/VALIDATION.md).

## Docker

```powershell
Copy-Item .env.example .env
# Edite .env: ADMIN_PASSWORD e SERVICE_SECRET precisam de valores próprios.
# Para testar em HTTP local, defina SECURE_COOKIES=false.
docker compose up --build -d
```

Somente a porta 3000 é publicada. Bancos, chaves de proteção e sessões ficam em volumes persistentes. Em produção, use HTTPS em um proxy reverso e mantenha `SECURE_COOKIES=true`. O seed de produção cria apenas o administrador configurado e os catálogos básicos; não cria vendedores nem leads demonstrativos.

## Verificação

```powershell
npm run typecheck
npm test
npm run build
```

Para criar migrações após alterações no modelo:

```powershell
dotnet tool restore
dotnet ef migrations add NomeDaAlteracao --project apps/api
```

## Integração WhatsApp

Abra **Conversas → Conectar WhatsApp** e escaneie o QR Code em **Aparelhos conectados** no celular. Nenhuma conta externa é conectada automaticamente pelo projeto.

Baileys é uma integração não oficial com WhatsApp Web. O projeto fixa `7.0.0-rc14`, versão do canal atual utilizada nesta implementação, e mantém o lockfile. A compatibilidade depende do protocolo e da conta. A homologação de recebimento, anexos, edição, resposta e disparos precisa de uma conta real conectada. Nenhum envio real faz parte dos testes automatizados.

O histórico contém apenas mensagens sincronizadas/recebidas pelo serviço. O download de mídias depende da sessão de origem conectada e da disponibilidade do arquivo no WhatsApp; arquivos de mídia recebidos não são arquivados permanentemente. Conversas de grupo ou sem telefone resolvido são exibidas para consulta, sem envio. Lotes interrompidos por reinício não são retomados automaticamente, para evitar duplicação de mensagens.

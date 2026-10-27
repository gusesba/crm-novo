# Documentação técnica dos fluxos do Via CRM

Levantamento do código em **05/10/2026**. Este documento descreve a implementação encontrada no frontend Next.js, na API .NET e no serviço WhatsApp Node/Fastify/Baileys. O inventário foi construído a partir das rotas, componentes, handlers, serviços, persistência e testes; `FUNCIONALIDADES.md` não foi usado como fonte do inventário.

Fluxo de arquivamento/desarquivamento de conversas revisado em **23/10/2026** (12.5).

Fluxos de filtro por período e exportação de leads/vendas para Excel revisados em **23/10/2026** (6.1 e 6.9).

Fluxos de ordenação pelos cabeçalhos das listagens de leads/vendas e do Excel revisados em **23/10/2026** (6.1 e 6.9).

Fluxo de filtro por dia nos agendamentos revisado em **23/10/2026** (8.1).

Fluxo de transferência permanente de leads entre sedes pelo administrador global revisado em **23/10/2026** (6.7).

Fluxo da consulta “Transferidos” revisado em **23/10/2026** (6.1 e 6.9).

Fluxos de contador de mensagens não lidas, leitura automática de conversas e sincronização de leitura em outros dispositivos revisados em **26/10/2026** (12.6 e 15).

Fluxo de seleção/colagem de múltiplos anexos por mensagem no chat e nos Disparos revisado em **26/10/2026** (13.2, 14.1 e 16.2–16.7).

Fluxo de memorização dos intervalos e pausas dos Disparos no navegador revisado em **26/10/2026** (16.2).

Fluxo de personalização dos disparos com `${PrimeiroNome}`, `${nome}` e botões de inserção revisado em **26/10/2026** (16.2 e 16.5).

Fluxo de filtro direto do público de disparos por período de cadastro revisado em **26/10/2026** (16.1 e 16.3).

Fluxo de seleção múltipla de status, serviços, sedes, vendedores e classificações, incluindo a opção Sem serviço, em Disparos revisado em **26/10/2026** (16.1 e 16.3).

Fluxo de filtros múltiplos e padrão Agendar Contato/Stand By na criação de grupos revisado em **26/10/2026** (9.2 e 9.3).

Fluxo de renderização de negrito, itálico, tachado e código nas mensagens revisado em **26/10/2026** (12.3, 14.5 e 16.2).

Fluxo de exibição da mensagem citada em respostas, no formato de bloco do WhatsApp Web, revisado em **26/10/2026** (12.3 e 13.2).

Fluxo de indicadores de mensagens editadas/encaminhadas revisado em **26/10/2026** (12.3, 13.3, 13.5 e 15.1).

Fluxo de edições criptografadas recebidas do WhatsApp e reconciliação dos balões indevidos revisado em **27/10/2026** (13.3, 15.1 e 18).

Origem, situação upstream e manutenção do patch local da Baileys documentadas em **27/10/2026** (15.2).

Fluxos de rejeição de nomes duplicados em sedes, serviços, condições e grupos internos revisados em **27/10/2026** (9.3, 10.3 e 18).

Fluxos de armazenamento local de mídia, consulta de uso e limpeza manual/automática revisados em **27/10/2026** (10.4, 13.2, 14.6, 15, 16.6, 17 e 18).

Fluxo de salvar/editar contatos na agenda da conta WhatsApp com nome e sobrenome revisado em **27/10/2026** (7.4, 12.1, 15.1 e 18).

“Todos os fluxos” significa os caminhos de negócio e as ramificações explícitas implementadas, incluindo sucesso, validação, autorização, cancelamento, falha parcial e processamento automático. Falhas genéricas compartilhadas estão na seção 3 e se aplicam às operações posteriores. Não é uma homologação de uma conta real do WhatsApp nem uma promessa de compatibilidade do protocolo externo.

Os exemplos usam JSON com propriedades camelCase, como recebido/enviado pelo navegador. IDs, nomes e datas são ilustrativos. Caminhos de código são relativos à raiz do repositório; links deste documento apontam para os arquivos efetivamente pesquisados.

## 1. Lista de funcionalidades e localização dos fluxos

| Área/página | Funcionalidades implementadas | Fluxos |
| --- | --- | --- |
| Inicialização | Migração do CRM, provisionamento, dados demonstrativos condicionais, recuperação de sessões e interrupção de campanhas antigas | 2 |
| Infraestrutura compartilhada | Proxy HTTP, cookie, CSRF, autorização por sede, erros, carregamento, atualização e notificações | 3 |
| `/login`, `/` e navegação | Entrar, recuperar sessão, redirecionar por perfil, sair, menu móvel e ajuda | 4 |
| `/dashboard` | Indicadores, evolução diária, distribuição de status, ranking, filtros de período/sede, próximos retornos e novo lead | 5 |
| `/leads`, `/my-leads`, `/sales`, `/transferred-leads` | Consulta geral/pessoal/vendas/transferidos, busca, filtros (incluindo classificação pessoal, vendedor original e período de cadastro), identificação dos vendedores original/atual em Transferidos, ordenação pelos cabeçalhos Cliente/Valor/Entrada, paginação, exportação filtrada e ordenada para Excel, etiquetas coloridas na tabela, detalhe, criação, edição comercial/de contato, mudança de status, exclusão e transferências (entre sedes somente permanente pelo administrador global) | 6 |
| Leads ↔ conversas | Resolver telefone/variantes, confirmar troca de telefone, abrir conversa, vincular explicitamente e criar/editar lead a partir do chat | 7 |
| Agenda WhatsApp | Salvar/editar nome e sobrenome de contatos na própria conta WhatsApp, sem alterar o nome do lead no CRM | 7.4 |
| `/appointments` | Agenda geral/pessoal/por lead, filtro por dia, concluídos, paginação, criação, edição, conclusão, reabertura e exclusão | 8 |
| `/groups` | Listar grupos internos, filtrar candidatos por múltiplos status/serviços/sedes/vendedores/classificações pessoais, opção Sem serviço, criação com Agendar Contato/Stand By como padrão, seleção em várias páginas, criar/renomear com nome único por usuário, substituir participantes e excluir | 9 |
| `/settings` | Equipe, senha/perfil/sede, ativação e inativação de usuários, sedes, serviços e condições de venda; rejeição de nomes duplicados em sedes e em cada tipo de catálogo | 10 |
| `/settings/media` | Administrador global consulta espaço de mídia, configura retenção opcional por dias e revisa/confirma limpeza somente de arquivos locais, preservando mensagens | 10.4 |
| `/whatsapp`, `/campaigns` | Sessão pessoal, QR Code, status, desconexão, reconexão e restauração | 11 |
| `/whatsapp` | Lista/busca de conversas, visualizações combináveis WhatsApp/status/classificação com grupos recolhíveis, contador de não lidas, leitura automática ao abrir, arquivar/desarquivar, consulta de fixadas, fotos, histórico, mensagens anteriores, nova conversa e bolinhas/seleção múltipla de classificações do lead vinculado | 12 |
| Compositor e mensagens | Texto com renderização de negrito/itálico/tachado/código no histórico, indicadores de editada/encaminhada, emoji, resposta com autor/prévia da mensagem citada, edição, reação/remoção de reação, encaminhamento, exclusão local/para todos | 12.3 e 13 |
| Anexos e contatos | Fotos, vídeos, documentos, seleção/colagem de múltiplos anexos por mensagem com remoção individual, áudio, gravação de voz, figurinhas recentes/criadas, vCard, telefone detectado no texto, copiar número, prévia/download de mídia | 14 |
| Serviço WhatsApp | Receber/sincronizar mensagens, contatos e estados de chats; persistir edição, reação e revogação | 15 |
| `/campaigns` | Público por múltiplos status/serviços/sedes/vendedores/classificações pessoais, opção Sem serviço, período de cadastro/grupo/seleção/exclusões, sequência com personalização por primeiro nome/nome completo, prévia local, confirmação, fila, intervalos/pausas lembrados no navegador, resultados/detalhes e cancelamento | 16 |
| `/backup` | Consulta ao histórico pessoal e consulta administrativa a outras sessões permitidas | 17 |
| Operação | Health checks, encerramento dos workers/sockets e persistência | 18 |
| Limites e diferenças reais | Funcionalidades ausentes, divergências e detalhes que alteram o fluxo | 19 |

## 2. Inicialização e provisionamento

Fontes: [Program.cs](../apps/api/Program.cs), [SeedData.cs](../apps/api/Infrastructure/SeedData.cs), [database.ts](../apps/whatsapp/src/storage/database.ts), [server.ts](../apps/whatsapp/src/server.ts).

### 2.1 API do CRM

1. Início do processo → registra controllers, EF Core/SQLite, autenticação, antiforgery, autorização, rate limiter e cliente HTTP do WhatsApp.
2. Cria diretório `data`, aplica `Database.MigrateAsync()` e executa `SeedData.Initialize` antes de servir requisições.
3. Se já existe algum usuário, o seed termina sem recriar catálogo, leads ou contas.
4. Em banco sem usuários, cria Unidade Centro, cinco serviços, três condições e administrador global. A senha configurada precisa ter ao menos dez caracteres; configuração inválida interrompe a inicialização.
5. Apenas em Development com `Seed:Demo=true` (padrão nesse ambiente), também cria três vendedores, sessenta leads fictícios e oito retornos. Fora dessa condição não cria esses dados demonstrativos.
6. SQLite registra uma função `lower` baseada em `ToLowerInvariant`, usada nas buscas de nomes, incluindo letras acentuadas.

### 2.2 Serviço WhatsApp

1. Abre `whatsapp.db` no `DATA_DIR`, cria tabelas/índices se não existem, usa WAL e `busy_timeout=5000`.
2. Campanhas persistidas com `running` ou `queued` tornam-se `interrupted`, com erro informando reinício. Não há retomada automática.
3. Registra rotas Fastify e passa a ouvir. Executa a retenção de mídia se habilitada e agenda nova execução a cada hora conforme 10.4; falha é registrada sem derrubar o serviço. `restoreSessions()` roda em segundo plano: busca usuários com `auth.key='creds'` e chama `connect` para cada um.
4. Se restaurar uma sessão falhar, registra o erro; o servidor permanece disponível. A restauração não consulta o cadastro ativo do CRM.

## 3. Contratos e regras compartilhadas

Fontes: [api.ts](../apps/web/src/lib/api.ts), [use-resource.ts](../apps/web/src/hooks/use-resource.ts), [next.config.ts](../apps/web/next.config.ts), [CurrentUser.cs](../apps/api/Infrastructure/CurrentUser.cs), [AuthenticationSetup.cs](../apps/api/Features/Auth/AuthenticationSetup.cs), [ExceptionHandler.cs](../apps/api/Infrastructure/ExceptionHandler.cs), [WhatsAppClient.cs](../apps/api/Features/WhatsApp/WhatsAppClient.cs).

### 3.1 Caminho de uma requisição

```text
Evento no componente → api/post/put → /api/* no mesmo domínio
  → rewrite do Next.js → API .NET
    → autenticação + autorização + CSRF + validação de DTO
      → EF Core/CRM SQLite, ou WhatsAppClient
        → /sessions/{idDoUsuarioAutenticado}/* no Fastify
          → WhatsApp SQLite e/ou socket Baileys → WhatsApp externo
```

- `api('/leads')` chama `/api/leads`. GETs usam `cache:'no-store'`.
- Corpo é JSON, com `Content-Type: application/json`. Não há upload multipart; anexos usam base64.
- Antes de POST/PUT/DELETE/PATCH, se não houver token em memória, o cliente faz `GET /api/auth/csrf` → `{ "token": "..." }`; envia `X-CSRF-TOKEN` junto com o cookie antiforgery.
- A API valida CSRF inclusive no login. Rotas `/internal` são dispensadas desse middleware e usam a chave interna.
- Cookie de sessão `via.session`: HttpOnly, SameSite Strict, política Secure conforme configuração; validade de oito horas com renovação deslizante.
- Em toda validação do cookie, consulta usuário no banco: inexistência, inatividade, SecurityStamp diferente ou sede inativa invalidam o principal.
- A API chama o serviço com `x-service-key` e timeout de 45 segundos. O Fastify verifica essa chave em todas as rotas, exceto `/health`.
- Para operações pessoais de WhatsApp, `userId` vem da autenticação. Apenas consultas de histórico/foto/mídia aceitam outro usuário, sujeito às regras da seção 17.

### 3.2 Escopo e autorização

| Perfil | Leitura de leads/agenda | Edição de lead/agenda | Administração | WhatsApp |
| --- | --- | --- | --- | --- |
| Vendedor com sede | Todos os leads da sede; `mine=true` limita ao vendedor atual | Apenas vendedor atual; dados de contato de lead existente são protegidos | Sem endpoints administrativos | Sessão própria; envio individual aplica regra de carteira |
| Admin de sede | Apenas sua sede | Qualquer lead da sede | Equipe e edição da própria sede; catálogos compartilhados somente leitura | Sessão própria; pode consultar históricos de usuários da sede |
| Admin global sem sede | Todas as sedes | Todos os leads; transferência permanente entre sedes | Equipe/sedes/catálogos | Sessão própria; pode consultar históricos de outros usuários |

`CurrentUser.Scope` aplica sede antes dos filtros. Um vendedor sem sede não obtém leads por esse método. Grupos têm regra adicional de carteira pessoal para vendedores; campanhas têm regra diferente, descrita na seção 16.

Em “Transferidos”, vendedores consultam somente os leads que têm `SellerId` igual ao próprio ID e outro `CurrentSellerId`, ainda dentro da sede permitida. Administradores consultam todos os que têm responsáveis original/atual diferentes no seu escopo. A consulta não concede permissão de edição ao vendedor original nem amplia acesso a outra sede.

### 3.3 Sucesso e erros

- Operações que retornam objeto/lista normalmente respondem `200` (criações não usam `201`). Exclusões de cadastro, transferência, logout e atualização de grupo respondem `204` sem corpo.
- `[ApiController]` valida atributos dos DTOs automaticamente; erros de formato/campos podem voltar como ProblemDetails com `errors`.
- `BusinessException`: status definido pela regra, padrão `400`. Não autenticado → `401`; perfil/escopo insuficiente → `403`; item ausente → `404`; conflito/revisão/duplicidade → `409`.
- EF: concorrência → `409` pedindo atualização; outra falha de gravação → `409` indicando duplicidade/referência em uso.
- `HttpRequestException` no cliente WhatsApp → `503`; erro não tratado na API → `500`. Nem toda espécie de timeout está mapeada como `503`.
- CSRF inválido → `400`, “Sessão de segurança expirada. Atualize a página.” O cliente não renova/reenvia automaticamente essa operação.
- Fastify: Zod inválido → `400` com `{message}`; erros com `statusCode` preservam status/mensagem; demais erros → `502` com mensagem genérica de integração. Limite de corpo é 24.000.000 bytes.
- API converte falha JSON do serviço em `BusinessException` com o mesmo status. Foto usa fluxo binário separado.
- Front extrai `errors`, `title` ou `message`; lança `ApiError`. Em `401`, redireciona para login, exceto chamadas de `/auth/login` e `/auth/me`.
- `useResource`: carrega ao montar/mudar caminho/`reload`; evita sobreposição de requisições na mesma instância; aborta ao desmontar/trocar dependências; registra erro e mantém dados anteriores. Se `path=null`, não faz requisição. Não implementa retry com backoff.
- Erros de formulário mantêm o modal e dados para correção. Listagens exibem Loading/Empty/ErrorBox; quando há botão de tentar novamente, chama `reload`/`refresh`.
- `notify` adiciona toast de sucesso/erro, que pode ser fechado e pode ter callback de retry. Não há expiração automática dos toasts no Provider.

### 3.4 Atualizações automáticas do navegador

| Recurso montado | Endpoint | Intervalo |
| --- | --- | --- |
| Conexão em Conversas ou Disparos | `GET /api/whatsapp/status` | 5 s |
| Lista de chats em Conversas **e Backup** | `GET /api/whatsapp/chats[?userId=...]` | 5 s |
| Conversa selecionada no atendimento | `GET /api/whatsapp/messages?chatId=...` | 4 s |
| Conversa selecionada no Backup | Mesmo endpoint | Sem polling; carregamento inicial/ações locais |
| Histórico de campanhas | `GET /api/whatsapp/campaigns?page=...&pageSize=6` | 4 s |
| Destinatários de campanha expandida | `GET /api/whatsapp/campaigns/{id}/deliveries?...` | 4 s |
| Sequência salva da campanha expandida | `GET /api/whatsapp/campaigns/{id}/messages` | Sem polling |
| Dashboard, leads, agenda, grupos, catálogo | Endpoints das áreas | Sem polling periódico |

O polling ocorre enquanto o componente está montado, inclusive sem WhatsApp conectado e sem pausa explícita quando a aba perde foco. O serviço recebe mensagens por eventos do socket; o polling do navegador consulta o banco local, não busca novas mensagens diretamente no WhatsApp.

## 4. Acesso, sessão e navegação

Fontes: [AuthController.cs](../apps/api/Features/Auth/AuthController.cs), [login/page.tsx](../apps/web/src/app/login/page.tsx), [providers.tsx](../apps/web/src/components/providers.tsx), [shell.tsx](../apps/web/src/components/shell.tsx).

### 4.1 Entrar

1. Usuário preenche usuário/senha → campos required do navegador → botão “Acessar meu espaço”. Front fica busy e limpa erro.
2. Obtém CSRF se necessário → `POST /api/auth/login`:

```json
{ "username": "vendedor", "password": "senha-informada" }
```

3. API limita login a quinze requisições por IP por minuto, sem fila (`429` se exceder).
4. DTO exige usuário até 100 e senha até 200 caracteres. Busca username normalizado com trim/lower, verifica usuário ativo e hash de senha.
5. Usuário inexistente/inativo/senha inválida → `401`; sede do usuário inativa → `403`. Front exibe erro, libera botão e permanece no login.
6. Sucesso → cria claims de ID, nome, role, stamp e sede quando existe; emite cookie; retorna `User`:

```json
{ "id": 2, "name": "Vendedor", "username": "vendedor", "isAdmin": false, "active": true, "branchId": 1 }
```

7. Front limpa token CSRF memorizado e chama `refresh`: `GET /api/auth/me` seguido de `GET /api/catalog`. Ao Provider receber usuário, página redireciona admin para `/dashboard` ou vendedor para `/my-leads`.

### 4.2 Abrir ou atualizar o app

1. Provider monta → `/auth/me`; se sucesso, `/catalog` → guarda sessão/catálogos e libera interface.
2. `/auth/me` com `401` → `user=null`; Shell redireciona ao login. Outro erro → tela de erro de conexão com retry de `refresh`.
3. Se o catálogo falhar após `/me`, o catch do Provider também limpa usuário e mostra erro quando não é `401`.
4. `/` encaminha conforme perfil. Dashboard acessado por vendedor redireciona a `/my-leads`; Settings mostra aviso de acesso administrativo. API também protege essas operações.

### 4.3 Sair e controles locais

- Clique no perfil → `POST /api/auth/logout` sem corpo → API remove cookie e responde `204` → limpa CSRF/usuário/catálogo → `/login`. Logout do CRM não desconecta o socket do WhatsApp. O handler de logout do Provider não tem catch próprio para feedback de falha.
- Menu muda rota; itens Dashboard/Settings só aparecem para admin. Abrir/fechar menu móvel e ajuda são estados locais, sem endpoint.
- Revisão visual de **23/10/2026**: Dashboard, Meus leads, Todos os leads, Vendas, Agendamentos, Conversas, Disparos, Grupos, Histórico e Configurações não exibem os textos introdutórios promocionais. A identificação da página na barra superior usa `h1`, com a mesma aparência compacta. A barra mantém também unidade, ajuda e avatar; a lateral mantém os cards de workspace/apoio, navegação e perfil para logout, conforme [shell.tsx](../apps/web/src/components/shell.tsx).
- As ações foram integradas aos controles existentes: “Novo lead” junto aos filtros do Dashboard e ao título da tabela nas quatro listagens de leads; “Agendar retorno” no cabeçalho da lista de retornos; “Adicionar cadastro” junto às abas de Configurações, com as mesmas restrições administrativas. Grupos mantém “Criar grupo” em uma barra compacta. No Histórico, o seletor administrativo de sessão fica acima da busca na lateral; trocar usuário continua limpando a conversa selecionada e recarregando o histórico da sessão (17). Conversas e Disparos começam pelo painel de conexão, sem reservar espaço para o cabeçalho removido. Essas mudanças são de apresentação; filtros, modais, cancelamentos, requisições e tratamento de erros mantêm os fluxos documentados nas seções seguintes.
- Modais, seleções e rascunhos locais não são persistidos automaticamente; fechar/cancelar antes do submit não grava no back.

## 5. Dashboard administrativo

Fontes: [overview.tsx](../apps/web/src/features/dashboard/overview.tsx), [DashboardController.cs](../apps/api/Features/Dashboard/DashboardController.cs), [agenda-card.tsx](../apps/web/src/features/dashboard/agenda-card.tsx).

### 5.1 Carregar indicadores e filtrar

1. Admin entra em `/dashboard` → duas consultas independentes: `GET /api/dashboard?days=30[&branchId=1]` e `GET /api/appointments?pageSize=3[&branchId=1]`.
2. Períodos disponíveis: 7, 30, 90, 365 dias ou personalizado. Alteração de período refaz indicadores; alteração de sede também refaz agenda. Admin de sede usa sua sede fixa; global pode selecionar todas/uma.
3. Personalizado usa `GET /api/dashboard?startDate=2026-09-01&endDate=2026-09-30[&branchId=1]`. Front impede consulta sem ambas as datas ou com início maior que fim. API repete a validação → `400`.
4. `days` é limitado de 7 a 365 para modo relativo. Datas personalizadas são inclusivas em UTC, do início ao fim do dia; código não limita a duração personalizada a 365 dias.
5. API seleciona leads no escopo e período por **CreatedAt** e usa o **status atual** de cada lead.
6. Retorno: `{total,sales,open,lost,revenue,conversion,daily,statuses,sellers,recent}`. `sales` conta Venda Efetivada; `open` soma Agendar Contato + Stand By; `lost` soma Concorrência + Não Enviar Mais; revenue soma Value de vendas; conversion é percentual com uma casa (zero sem leads).
7. `daily` preenche todos os dias com quantidades de captações/vendas; vendas são agrupadas na data de criação do lead, não numa data de fechamento. Ranking usa `CurrentSellerId` e ordena pelo número de vendas. `recent` traz cinco leads recentes, mas não é renderizado na Overview atual.
8. Front monta cards, gráfico, pipeline e ranking. Falha → ErrorBox/retry; sem retorno → Loading. Agenda tem erro/carregamento próprios e mostra os três primeiros retornos pendentes, ordenados por DueAt, sem aplicar o período do dashboard.

### 5.2 Ações

- “Novo lead” → LeadForm, fluxo 6.3; após salvar, recarrega indicadores e agenda.
- Links do ranking/agenda → listagem de leads, agenda completa ou `/leads?lead={id}`; detalhe por deep link faz GET do lead. “Cuidar dos meus leads” → `/my-leads`.
- Indicadores e gráficos são consultas; não há gravação associada a esses widgets.

## 6. Leads, carteira e vendas

Fontes: [leads-page.tsx](../apps/web/src/features/leads/leads-page.tsx), [leads-table.tsx](../apps/web/src/features/leads/leads-table.tsx), [lead-form.tsx](../apps/web/src/features/leads/lead-form.tsx), [customer-fields.tsx](../apps/web/src/features/leads/customer-fields.tsx), [commercial-fields.tsx](../apps/web/src/features/leads/commercial-fields.tsx), [LeadsController.cs](../apps/api/Features/Leads/LeadsController.cs), [LeadRequest.cs](../apps/api/Features/Leads/LeadRequest.cs), [LeadService.cs](../apps/api/Features/Leads/LeadService.cs), [LeadRules.cs](../apps/api/Domain/LeadRules.cs).

### 6.1 Listar, buscar, filtrar e ordenar

Navegação de Transferidos: [shell.tsx](../apps/web/src/components/shell.tsx) e [transferred-leads/page.tsx](../apps/web/src/app/%28workspace%29/transferred-leads/page.tsx).

1. `/leads`, `/my-leads`, `/sales` e `/transferred-leads` usam o mesmo componente com modos all/mine/sales/transferred. O menu “Transferidos” fica ao lado de “Meus leads” e está disponível a todo usuário autenticado.
2. Entrada/filtros/ordenação/página → `GET /api/leads?search=&page=1&pageSize=10&mine=false&sales=false&transferred=false&sort=created_desc`, acrescido de `status`, `serviceId`, `sellerId`, `originalSellerId`, `branchId`, `classificationId`, `createdFrom`, `createdTo` quando preenchidos. O filtro de classificação carrega `GET /api/classifications`, só com opções pessoais; “Todas as classificações” remove esse filtro. Durante carregamento/falha do catálogo, desabilita apenas esse filtro; falha mostra ErrorBox com retry e não impede consultar a tabela pelos demais critérios.
3. Meus leads envia `mine=true`; Vendas envia `sales=true`; Transferidos envia `transferred=true` com `mine=false` e `sales=false`. API aplica CurrentSellerId para mine, status Venda Efetivada para sales e SellerId diferente de CurrentSellerId para transferred. Em transferred, vendedor comum também fica limitado a `SellerId=ID autenticado`; administradores continuam limitados ao escopo de sede.
4. Busca por nome/telefone tem debounce de 250 ms. Nome usa lower; telefone usa substring da string armazenada (o termo da busca não é normalizado como telefone).
5. API aplica escopo de sede e filtros combinados antes de contar/paginar, aplica a ordenação selecionada (padrão CreatedAt e ID descendentes), pagina e retorna `{items:[Lead com classifications:[{id,name,color}]],total,page,pageSize}`. As classificações vêm ordenadas por nome/ID e pertencem somente ao usuário autenticado, inclusive para admins; ausência retorna `[]`. `classificationId` filtra vínculos pessoais sem ampliar o escopo: ID inexistente ou de outro usuário retorna lista vazia/total zero, sem revelar seu dono. Formato não numérico → `400`. Não há consulta HTTP por linha. Limita pageSize a 1–100 e page ao mínimo 1.
6. Alterar filtro/busca redefine página; mudança de filtros/página limpa seleção de transferência. Filtro vendedor não aparece em Meus leads; status não aparece em Vendas. Retorno vazio → Empty; falha → ErrorBox/retry.
7. A coluna “Classificações” mostra todas as marcações pessoais como etiquetas com nome, bolinha, borda e fundo derivados da cor cadastrada; sem classificação mostra traço. Ao fechar o detalhe (inclusive Cancelar/Escape), recarrega tabela e catálogo do filtro, pois classificações criadas/marcadas no seletor já foram salvas automaticamente mesmo sem salvar o formulário principal. Salvar o lead também recarrega ambos; não há polling nessa tela.

8. “Cadastro de”/“Até” permitem filtrar pela data de criação (`CreatedAt`) nas quatro telas, combinando com todos os critérios existentes antes de contar/paginar. Ambas são opcionais: somente início consulta a partir daquele dia, somente fim consulta até aquele dia e limpar uma data remove apenas seu limite. O navegador interpreta as datas no horário local: envia `createdFrom` como ISO UTC da meia-noite inicial inclusiva e `createdTo` como ISO UTC da meia-noite do dia seguinte ao fim, exclusiva. Assim, um intervalo de 10 a 12/02/2001 no horário UTC−3 envia `createdFrom=2001-02-10T03:00:00.000Z&createdTo=2001-02-13T03:00:00.000Z`, incluindo os três dias completos; um único dia também é válido. Em Vendas, a data ainda é a de cadastro do lead, sem data separada de fechamento. Mudar qualquer data volta à página 1 e limpa a seleção de transferência. Início posterior ao fim mostra aviso local, suspende a consulta e bloqueia exportação/paginação até corrigir ou limpar o campo; não exibe a tabela anterior como se correspondesse ao período inválido. API rejeita `createdFrom > createdTo` e datas malformadas com `400`, tanto na listagem quanto na exportação; falhas não alteram dados.

9. A ordenação nas quatro telas é escolhida pelos botões nos cabeçalhos **Cliente**, **Valor** e **Entrada**, sem seletor na barra de filtros. O padrão é Entrada decrescente (`sort=created_desc`, cadastro mais recente); clicar no cabeçalho ativo alterna crescente/decrescente. Ao trocar para Cliente, começa em A–Z (`name_asc`); ao trocar para Valor, começa no maior valor (`value_desc`); ao voltar para Entrada, começa no cadastro mais recente. Os sentidos inversos usam `name_desc`, `value_asc` e `created_asc`. Uma seta e cor de destaque indicam a coluna/sentido ativos; cabeçalhos inativos mostram seta dupla. Botões aceitam teclado e têm descrição da próxima ordenação; o `th` ativo informa `aria-sort=ascending|descending`. As demais colunas não ordenam. [LeadOrdering.cs](../apps/api/Features/Leads/LeadOrdering.cs) compartilha a regra entre listagem e exportação. Ordena no banco antes da paginação; empates usam ID no mesmo sentido, mantendo páginas estáveis. Nome usa `lower` para não diferenciar maiúsculas/minúsculas; valor é comparado numericamente com conversão para double compatível com SQLite, sem alterar o valor decimal armazenado/exportado. `sort` ausente/vazio mantém o padrão; opção desconhecida → `400`, sem gravação. Trocar ordenação volta à página 1, limpa a seleção para transferência e mantém os filtros; paginar, editar e recarregar mantêm a ordenação atual e o Excel segue a mesma escolha. A escolha é local à tela e volta ao padrão quando o componente é remontado. Falha de consulta usa ErrorBox/retry; resultado vazio usa Empty. A ordenação não amplia permissões nem altera totais/dados.

10. **Consultar Transferidos:** `/transferred-leads` consulta a diferença entre `SellerId` (vendedor original) e `CurrentSellerId` (atendimento atual); não é histórico de eventos. Leads recebidos de terceiros não entram na visão do vendedor autenticado se ele não for o original; leads devolvidos ao original deixam de entrar. A transferência permanente atualiza os dois responsáveis e também deixa de satisfazer o filtro. Administradores podem escolher `originalSellerId` pelo filtro “Todos os vendedores originais”; todos os perfis podem combinar vendedor atual, busca, status, serviço, sede permitida, classificação pessoal, período e ordenação, antes da contagem/paginação. O filtro de vendedor atual é identificado explicitamente nessa tela. A tabela acrescenta “Vendedor original” e mostra os nomes completos dos dois responsáveis, inclusive usuários inativos presentes no catálogo. `originalSellerId` de outro usuário enviado por vendedor comum → `403` na listagem e no Excel, mesmo sem `transferred=true`; próprio ID é aceito. Formato inválido de bool/ID → `400`; ID original inexistente para admin → resultado vazio. Alterar original/atual redefine página e limpa seleção; limpar filtros mantém o modo Transferidos. Sem resultados mostra “Nenhum lead transferido”; falha usa ErrorBox/retry. Abrir detalhe/agenda preserva as regras de leitura/edição existentes: vendedor original não passa a editar lead atendido por outro. Criar/editar/transferir recarrega com os critérios atuais; fechar/cancelar detalhe não grava alterações pendentes. Excel recebe os mesmos parâmetros e mantém vendedores original/atual nas colunas já existentes, sem paginação. A consulta não grava dados, não faz polling e não chama o serviço WhatsApp.

### 6.2 Abrir detalhe e consultar

- Clique na linha/ícone usa o `Lead` já carregado para abrir modal, sem GET adicional.
- URL `?lead=42` faz `GET /api/leads/42`; API procura no escopo → `200 Lead` ou `404` inclusive quando pertence a outra sede.
- Front libera edição se admin ou vendedor atual; outros vendedores da sede podem ler o modal, com fieldset desabilitado.
- “Agenda” abre `/appointments?lead=42`; “Conversa” só aparece para vendedor atual e status diferente de Não Enviar Mais.

### 6.3 Criar lead, com ou sem retorno inicial

1. “Novo lead”, no dashboard/listagens, ou “Criar lead” no chat → modal. Usa sede do usuário ou primeira sede ativa e filtra vendedores elegíveis no catálogo.
2. Submit coleta FormData, converte IDs/valor para números, vazios opcionais para null e data/hora local do retorno para ISO UTC.
3. Envia `POST /api/leads` com o contrato abaixo (mesmo contrato é usado no PUT):

```json
{
  "branchId": 1,
  "sellerId": 2,
  "name": "Cliente Exemplo",
  "phone": "(51) 99999-9999",
  "additionalPhone": "",
  "email": null,
  "gender": null,
  "birthDate": null,
  "origin": "site",
  "referral": "",
  "discovery": "",
  "choiceReason": "",
  "serviceId": 1,
  "conditionId": null,
  "status": "Agendar Contato",
  "value": 0,
  "notes": "",
  "returnAt": "2026-10-01T14:00:00.000Z",
  "returnNote": "Retornar sobre matrícula",
  "revision": 0
}
```

4. DTO: IDs positivos; nome required até 160; phone required até 30; additionalPhone até 30; email válido até 200; referral até 200; discovery/choiceReason até 500; notes até 5000; returnNote até 2000; value entre 0 e 100.000.000.
5. Serviço valida escopo da sede, status, origem (`presencialmente`, `fone`, `site`, `redes sociais`), gênero (Masculino/Feminino/Outro/Prefiro não informar), nascimento não futuro e observação de retorno somente com data.
6. Valida sede ativa, serviço/condição ativos do tipo correto e vendedor ativo da sede ou admin global. Vendedor comum só pode criar para si (`403`).
7. Normaliza **apenas telefone principal**: remove não dígitos; se 10/11 dígitos acrescenta 55; exige 12–15 dígitos e sem zero inicial. Número inválido → `400`; telefone repetido na mesma sede → `409`. Mesmo número em outra sede é permitido.
8. Cria Lead com SellerId=CurrentSellerId, trim no nome, campos comerciais, UpdatedAt UTC, Revision incrementada (novo normalmente 1).
9. Transação salva lead e, se ReturnAt existe, cria Appointment pendente em UTC; commit somente ao concluir ambos. Sem ReturnAt não cria retorno.
10. Retorna `200 Lead` com ID, campos persistidos, chatId/chatUserId, revision, createdAt/updatedAt e campo de entidade contract. Front notifica, fecha modal e recarrega a listagem chamadora. Falha mantém formulário aberto.

### 6.4 Editar contato e atendimento

1. Modal existente → submit com `PUT /api/leads/{id}`, mesmo payload, SellerId original e Revision recebida.
2. Repete validações da criação e busca no escopo. Exige admin ou vendedor atual; Revision diferente → `409` pedindo atualização, sem sobrescrever registro.
3. Não permite mudar BranchId nem SellerId por esse endpoint; instrui usar transferência permanente para mudar o vendedor original ou a sede. A troca de sede exige administrador global e o fluxo 6.7.
4. Vendedor comum não pode alterar name/phone/additionalPhone/email/gender/birthDate; front usa readOnly/hidden e API compara valores (`403` se mudou). Pode editar origem, indicação, descoberta, motivo, serviço, condição, status, valor e notas.
5. Admin pode alterar contato. Alterar telefone principal limpa ChatId/ChatUserId; não move o histórico pessoal do WhatsApp.
6. Salva campos, UpdatedAt e Revision. Se ReturnAt foi preenchido, **adiciona** novo agendamento; não atualiza um retorno existente. Retorna Lead → toast, fechamento e reload.
7. Concorrência também é protegida pelo token EF Revision, mesmo se duas requisições passarem pela comparação inicial.
8. Item de serviço/condição inativo já selecionado aparece no formulário, porém a API exige ativo ao salvar; mantê-lo pode produzir `400`.

### 6.5 Status, vendas e bloqueio de contato

Todos os status podem ser escolhidos diretamente no formulário: Agendar Contato, Venda Efetivada, Stand By, Optou pela Concorrência, Não Enviar Mais. Não há máquina de transição nem endpoint separado de conversão em venda.

- Alterar para Venda Efetivada usa PUT normal; lead passa a aparecer em `/sales` e entra nos indicadores conforme data de criação. Não exige contrato, serviço, condição nem valor maior que zero.
- Tirar esse status remove da visão de vendas; não há entidade de venda independente.
- Não Enviar Mais mantém o cadastro, oculta botão Conversa e bloqueia ações individuais da API; público de campanha o exclui e worker o revalida antes de processar o destinatário.
- Retirar o status por PUT reabilita elegibilidade conforme as demais regras. Não há registro separado de consentimento ou trilha histórica de status.

### 6.6 Excluir lead

Admin → botão Excluir → confirmação do navegador. Cancelar → nenhuma chamada. Confirmar → `DELETE /api/leads/{id}` → perfil admin + busca no escopo → remove lead → EF exclui agendamentos, GroupMembers e vínculos LeadClassifications em cascata (preserva o catálogo pessoal de classificações) → `204` → toast/fecha modal/limpa seleção/recarrega lista.

Lead ausente/fora do escopo → `404`; vendedor → `403`. Conversas/mensagens no outro banco e snapshots de campanha permanecem. Exclusão na tela de chat usa onClose quando não há onDeleted; não há callback específico de reload do leadMatch nesse caminho.

### 6.7 Transferência individual/em lote, temporária/permanente

Fontes: [transfer-modal.tsx](../apps/web/src/features/leads/transfer-modal.tsx), [LeadService.cs](../apps/api/Features/Leads/LeadService.cs), [LeadRequest.cs](../apps/api/Features/Leads/LeadRequest.cs), [LeadRules.cs](../apps/api/Domain/LeadRules.cs).

1. Admin marca um ou vários checkboxes na tabela → “Transferir N” → modal. Seleção é local à página; não existe endpoint distinto para transferência individual. O perfil global existente é o administrador sem sede vinculada (`isAdmin=true`, `branchId=null`); vendedores comuns precisam de sede e não recebem acesso de transferência.
2. Escolhe tipo (temporária por padrão) e vendedor ativo. Sem sede de destino explícita, o formulário oferece somente vendedores elegíveis para todas as sedes dos leads selecionados e administradores globais ativos. Somente o administrador global, ao escolher Permanente, vê “Sede de destino”: padrão “Manter sede de cada lead” e opções de sedes ativas. Escolher sede filtra vendedores ativos dessa sede e administradores globais; os nomes incluem sede/Global para o perfil global. Trocar sede ou tipo limpa o vendedor; trocar tipo também limpa a sede, evitando reaproveitar destino numa transferência temporária. Envia `POST /api/leads/transfer`:

```json
{ "leadIds": [42, 43], "sellerId": 3, "permanent": true, "branchId": 2 }
```

3. API exige admin, entre 1 e 500 entradas; busca leads no escopo e compara com quantidade de IDs distintos. Lead fora do escopo/inexistente na seleção → `403`. `branchId` é opcional e deve ser positivo quando informado; omitido/null preserva cada sede e mantém compatibilidade com o payload anterior. Vendedor de outra sede sem `branchId` explícito continua inválido; não existe mudança implícita de sede.
4. Com `branchId`, exige administrador global (`403` para admin de sede) e `permanent=true` (`400` se temporária, mesmo se a sede enviada for a atual). Exige sede existente/ativa (`400`) e verifica telefone único no destino, tanto contra outros registros quanto entre os selecionados; duplicidade → `409`, sem mesclar/excluir leads. Para cada lead valida vendedor ativo na sede de destino, ou na sede original quando não há destino explícito; administradores globais ativos continuam elegíveis para qualquer sede. Vendedor inexistente/inativo/de outra sede → `400`. Sem destino explícito, lote de várias sedes só funciona se o vendedor for elegível para todas; com destino explícito, permite consolidar o lote na sede escolhida.
5. Todas as validações acontecem antes de alterar os leads. Temporária → muda CurrentSellerId e preserva SellerId/BranchId. Permanente → muda SellerId e CurrentSellerId; com destino explícito também muda BranchId. Ambas limpam ChatId/ChatUserId, atualizam UpdatedAt e incrementam Revision; preservam ID, telefone, contato, status, valores, CreatedAt e demais dados. Um único `SaveChanges` transacional salva o lote; conflito de revisão/índice ou falha de persistência não grava parte do lote (`409`).
6. `204` → toast, fecha modal, limpa seleção e recarrega lista com os filtros/ordenação atuais. Lead movido deixa de aparecer quando não corresponde mais à sede/carteira filtrada; não desfaz a gravação. Histórico WhatsApp permanece na sessão de origem; não há chamada ao serviço WhatsApp nem migração de conversas. Agenda, grupos e classificações mantêm os vínculos pelo mesmo LeadId: a leitura da agenda acompanha nova sede/vendedor pelo join, e usuários da sede anterior perdem acesso ao lead/retornos. Grupos/classificações pessoais não são copiados ao novo vendedor; relações existentes ficam salvas e suas consultas continuam aplicando escopo/dono.
7. Cancelar/fechar antes de confirmar descarta os campos locais sem POST nem alterações. Falha mantém modal/seleção para correção e informa erro; sucesso é único para o lote inteiro. Não há prazo de expiração/retorno automático para transferência temporária: outra transferência é necessária para devolver o atendimento.

### 6.8 Classificações pessoais de leads

Fontes: [classifications.tsx](../apps/web/src/features/leads/classifications.tsx), [ClassificationsController.cs](../apps/api/Features/Leads/ClassificationsController.cs), [Entities.cs](../apps/api/Domain/Entities.cs), [CrmDbContext.cs](../apps/api/Infrastructure/CrmDbContext.cs).

1. Qualquer usuário autenticado pode abrir “Classificações” no detalhe de um lead já salvo ou no cabeçalho de uma conversa vinculada, ao lado de “Abrir lead”. Não há botão de classificações na barra lateral do WhatsApp. Lead novo precisa ser cadastrado antes de receber classificações. O seletor é uma lista compacta junto ao botão, com bolinha colorida e nome por item, bordas arredondadas e sombra; não escurece a página.
2. `GET /api/classifications` retorna somente as classificações do usuário autenticado, ordenadas por nome/ID. Mesmo administradores não recebem as classificações de outros usuários. Não há parâmetro para selecionar outro dono.
3. Criar exige nome não vazio, até 80 caracteres, e cor hexadecimal `#RRGGBB`: `POST /api/classifications` com `{ "name": "Em negociação", "color": "#ffcc00" }`. API define UserId a partir da sessão, remove espaços das extremidades do nome e normaliza cor para minúsculas; retorna `200 {id,userId,name,color}`. Nome/cor inválidos → `400`, sem persistência. Nomes iguais são permitidos.
4. Abrir seleção consulta `GET /api/leads/{id}/classifications`: exige lead no escopo de leitura da sede e retorna somente classificações pessoais aplicadas ao lead. Ausente/fora do escopo → `404`. Como a marcação é pessoal, pode classificar um lead da sede atendido por outro vendedor; não altera dados comerciais, Revision ou UpdatedAt do lead.
5. Cada item é um botão de seleção múltipla: clicar alterna sua marcação, escurece o fundo dos selecionados e salva imediatamente via `PUT /api/leads/{id}/classifications` com `{ "classificationIds": [1, 2] }`, substituindo apenas os vínculos desse usuário. Não há checkbox, select ou botão Salvar. Array obrigatório, até 100 entradas; IDs repetidos são deduplicados. Desmarcar o último item envia `[]` e remove todas as marcações pessoais. IDs inexistentes/de outro usuário → `404` antes de alterar qualquer vínculo; erro de validação → `400`. `SaveChanges` grava adições/remoções em uma transação; erro de gravação não salva um subconjunto. Vínculos dos demais usuários são preservados.
6. A marcação visual muda ao clicar. Sucesso → `204`, mantém a lista aberta, recarrega classificações do botão e lista de chats quando aberta pelo cabeçalho do WhatsApp. Falha desfaz a marcação otimista, preserva a seleção anterior e mostra mensagem na lista; o item pode ser clicado novamente para tentar salvar. Falha de carregamento oferece retry e bloqueia seleção. Durante gravação, anuncia “Salvando…” para leitores de tela sem inserir uma linha visível ou alterar tamanho/posição da lista. Itens mantêm foco e aparência, com aria-disabled e bloqueio de cliques pelo estado da gravação; criação e fechamento por clique externo/Escape também ficam bloqueados para evitar operações sobrepostas. O seletor permanece montado até ser fechado ou mudar o lead.
7. Clique fora da lista ou Escape fecha o seletor após concluir gravações; não desfaz alterações já salvas. Escape interrompe a propagação do cancelamento para manter o detalhe do lead aberto quando o seletor está dentro dele. “Nova classificação” expande campos de nome/cor no próprio seletor; Criar persiste o catálogo, recolhe os campos e atualiza a lista sem marcar automaticamente o lead. Cancelar essa criação descarta apenas os campos não enviados. Fechar o formulário do lead também não desfaz classificações salvas automaticamente.
8. Persistência: Classifications guarda ID/dono/nome/cor; LeadClassifications guarda o par ClassificationId+LeadId único, com cascata na exclusão do lead/classificação. Transferências preservam marcações pessoais do lead, mas removem o vínculo da conversa; as bolinhas só reaparecem quando há novo vínculo explícito. A tabela de leads mostra etiquetas pessoais e permite filtrar por uma classificação junto aos demais critérios (6.1). Não existem edição/exclusão de classificações.

### 6.9 Exportar leads/vendas para Excel

Fontes: [leads-page.tsx](../apps/web/src/features/leads/leads-page.tsx), [api.ts](../apps/web/src/lib/api.ts), [LeadsController.cs](../apps/api/Features/Leads/LeadsController.cs), [LeadExcelExport.cs](../apps/api/Features/Leads/LeadExcelExport.cs).

1. “Exportar Excel” aparece no cabeçalho de Todos os leads, Meus leads, Vendas e Transferidos. Usa os filtros e a ordenação atuais da listagem: busca por nome/telefone, status, serviço, vendedor atual/original, sede, classificação pessoal e período de cadastro (`createdFrom`/`createdTo`, com os mesmos limites/horário da seção 6.1), mais `mine=true` em Meus leads, `sales=true` em Vendas ou `transferred=true` em Transferidos e o mesmo `sort`. Envia `GET /api/leads/export` com esses parâmetros e sem `page`/`pageSize`: exporta todos os resultados filtrados na ordem escolhida, independentemente da página atual ou da seleção para transferência. A busca deve concluir o debounce e o intervalo de datas deve ser válido antes de habilitar o botão.
2. Endpoint exige autenticação e compartilha a filtragem e a ordenação da listagem (6.1): aplica o escopo de sede, combina os critérios e usa `sort`, com CreatedAt/ID descendentes por padrão. Vendedor pode exportar os leads que já pode consultar na sede; `mine` limita ao vendedor atual. Admin global pode combinar sedes/vendedores. Filtro de sede alheia, classificação inexistente ou de outro usuário produz resultado vazio, sem ampliar acesso. IDs/bools/datas com formato inválido, intervalo invertido ou ordenação desconhecida → `400`; sessão ausente/inválida → `401`.
3. API consulta os nomes de sede, vendedor original/atual, serviço e condição a partir dos registros referenciados, inclusive inativos. Classificações incluídas na planilha são somente as pessoais do usuário autenticado, ordenadas por nome/ID e separadas por `; `, inclusive para admins. Não depende do catálogo carregado pelo navegador e não faz requisições HTTP por linha.
4. Sucesso → `200` binário XLSX gerado com ClosedXML, MIME `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, disposição `attachment` e nome `leads.xlsx` ou `vendas.xlsx`. Aba Leads/Vendas com 22 colunas: ID, Nome, Telefone, Telefone adicional, E-mail, Gênero, Nascimento, Origem, Indicação, Como conheceu, Motivo da escolha, Sede, Vendedor original, Vendedor atual, Serviço, Condição de venda, Status, Valor (R$), Classificações, Observações, Criado em (UTC), Atualizado em (UTC).
5. Telefones e demais textos são células de texto, preservando zeros iniciais/acentos/quebras de linha e sem interpretar valores iniciados por `=`, `+`, `-` ou `@` como fórmulas. Valor é numérico, com duas casas decimais e formato monetário; nascimento e timestamps são datas do Excel, estes explicitamente em UTC. Cabeçalho destacado/congelado e autofiltro permitem continuar filtrando no Excel. Campos opcionais ausentes ficam vazios. Vendas continuam sendo leads com status atual Venda Efetivada; não representam histórico/data de fechamento independente (6.5).
6. Durante a operação o botão mostra “Exportando…” e bloqueia cliques duplicados. Também fica desabilitado durante carregamento/falha da listagem ou quando não há resultados. Requisição direta sem resultados ainda gera arquivo válido somente com cabeçalho. Mais de 1.048.575 registros → `400` pedindo refinar os filtros, antes de gerar o arquivo.
7. O cliente HTTP compartilha CSRF/tratamento de erros com as chamadas JSON, mas lê o sucesso como Blob, inicia o download por link temporário e libera a URL após o clique. Falha de API/rede mostra toast de erro e libera o botão para tentar novamente; `401` mantém o redirecionamento ao login. Filtros/ordenação alterados durante a geração só afetam a próxima exportação: a chamada em andamento mantém os critérios do clique.
8. Sair da tela aborta a requisição pendente; API recebe CancellationToken nas consultas e verifica cancelamento entre linhas/antes da serialização. Não há botão de cancelamento separado nem arquivo persistido no servidor. Fechar/cancelar o salvamento no navegador não altera CRM, classificações, seleção ou WhatsApp. Falha/cancelamento não grava dados e o download só começa após receber o arquivo completo; a serialização já iniciada pode terminar antes de observar o aborto.

## 7. Abrir/vincular conversa e cadastrar pelo chat

Fontes: [lead-conversation-button.tsx](../apps/web/src/features/leads/lead-conversation-button.tsx), [LeadsController.cs](../apps/api/Features/Leads/LeadsController.cs), [chat-page.tsx](../apps/web/src/features/whatsapp/chat-page.tsx), [resolve-phone.ts](../apps/whatsapp/src/messaging/resolve-phone.ts).

### 7.1 Botão Conversa no lead

1. Vendedor atual clica “Conversa” → `POST /api/leads/{id}/conversation`:

```json
{ "revision": 4, "acceptedPhone": null }
```

2. API busca no escopo; exige CurrentSellerId igual ao usuário **inclusive para admin**, status não bloqueado e revisão atual. Falhas → `404`, `403`, `409`.
3. Se já vinculado ao telefone e à sessão atuais → retorna `{phone,chatId,requiresConfirmation:false,exists:true}`, sem consultar socket.
4. Caso contrário → serviço `POST /sessions/{user}/resolve-phone` com `{phone}` → precisa connectedSocket (`409` se desconectado) → `socket.onWhatsApp`.
5. Consulta número original primeiro. Para brasileiros, inclui alternativas com/sem 55 e com/sem nono dígito quando aplicável; aceita JID individual confirmado pelo WhatsApp. Nenhum encontrado → serviço `null` → API `404`, sem alterar lead.
6. Retorno da resolução: `{phone,chatId,requiresConfirmation,exists}`; exists indica presença do chat no banco do serviço.
7. Se número resolvido difere e AcceptedPhone não corresponde → API retorna `200` pedindo confirmação, sem salvar. Front abre modal; cancelar só fecha. Aceitar refaz POST com acceptedPhone igual à variante, ainda com revision original.
8. Se conversa já existe e número é exatamente o atual → API retorna sem alterar vínculo. Front notifica e navega para conversa existente; abrir não significa vincular automaticamente nesse ramo.
9. Nos demais ramos, rejeita vínculo prévio incompatível ou duplicidade de telefone na sede/vínculo pessoal (`409`); atualiza Phone/ChatId/ChatUserId, UpdatedAt/Revision e salva.
10. Sucesso → `/whatsapp?phone={phone}` → ChatPage seleciona JID correspondente e carrega mensagens. Abrir não envia mensagem.

### 7.2 Vincular explicitamente

1. Selecionar chat individual → front consulta `GET /api/leads?mine=true&search={numero}` e escolhe correspondência **exata** de phone.
2. Lead encontrado sem ChatId → botão Vincular → `POST /api/leads/{id}/link` com `{ "chatId": "5551999999999@s.whatsapp.net" }`.
3. API exige vendedor atual; vínculo existente diferente → `409`; JID diferente de `lead.Phone + '@s.whatsapp.net'` → `400`. Índice único impede duplicidade de vínculo → `409`.
4. Salva ChatId/ChatUserId e incrementa Revision; retorna Lead → reload leadMatch e chats + toast. Esse endpoint não verifica OptOut, conexão nem Revision enviada, e não muda UpdatedAt explicitamente.
5. Nome do lead tem prioridade na lista apenas depois de vínculo para a sessão consultada.

### 7.3 Criar ou editar lead a partir da conversa

1. Chat individual sem lead da carteira com telefone exato → “Criar lead” abre LeadForm pré-preenchido com nome/número do chat → criação da seção 6.3.
2. Se lead já existe na carteira → “Abrir lead” permite consulta/edição normal.
3. Após salvar, se vendedor atual é o usuário e lead não tem chat, o callback tenta `/leads/{id}/link`.
4. Link bem-sucedido → reload leadMatch. Se falhar, cadastro/edição já concluídos permanecem; erro aparece na página. São duas operações, não uma transação conjunta.
5. Se telefone pertence a lead de outro vendedor, a busca mine não encontra; tentativa de novo cadastro na mesma sede acaba rejeitada por telefone duplicado. Se admin criou para outro vendedor, callback não vincula sua sessão.

### 7.4 Salvar/editar contato na agenda do WhatsApp

Fontes: [chat-page.tsx](../apps/web/src/features/whatsapp/chat-page.tsx), [contact-form.tsx](../apps/web/src/features/whatsapp/contact-form.tsx), [WhatsAppController.cs](../apps/api/Features/WhatsApp/WhatsAppController.cs), [routes.ts](../apps/whatsapp/src/routes.ts), [contacts.ts da integração](../apps/whatsapp/src/messaging/contacts.ts), [contacts.ts do storage](../apps/whatsapp/src/storage/contacts.ts) e [chat-states.ts](../apps/whatsapp/src/storage/chat-states.ts).

1. No atendimento, selecionar conversa individual com identificador de 10–15 dígitos (`@s.whatsapp.net`), inclusive aberta pelo lead, mostra “Salvar contato” ou “Editar contato”, conforme `contactSaved` da consulta de chats. Vale também para uma conversa provisória aberta em “Nova conversa”, sem exigir mensagem anterior ou lead. Não aparece para grupos/LID sem telefone nem no Backup, inclusive no histórico administrativo de terceiros.
2. Abrir faz `GET /api/whatsapp/contacts?chatId=...` → `/sessions/{ID autenticado}/contacts?chatId=...`. Retorna `{chatId,firstName,lastName,fullName,saved}` do armazenamento local da própria sessão; leitura não chama o WhatsApp nem exige conexão. `saved` indica evidência de nome de agenda no cache. Sem cadastro conhecido, retorna nomes vazios ou sugestão do nome de perfil já conhecido, com saved=false. Contatos antigos/sincronizados que só têm nome completo sugerem a primeira palavra como Nome e o restante como Sobrenome; não há inferência perfeita de nomes compostos antigos. Para contatos gravados pelo formulário, os dois campos são preservados exatamente como informados (após trim), inclusive Nome composto. Se o nome completo recebido depois pelo celular divergir do snapshot local, a consulta usa o nome novo com a mesma separação de sugestão.
3. Modal mostra telefone somente leitura, Nome obrigatório até oitenta caracteres e Sobrenome opcional até oitenta. Campos são independentes; não altera o telefone nem procura variantes silenciosamente. Carregamento/falha da consulta impede salvar; falha permite tentar novamente. Nome vazio/só espaços ou dados inválidos → `400` na API/Zod, sem chamar o socket. Cancelar/fechar/Escape antes do envio descarta o rascunho sem gravar nem enviar qualquer ação ao WhatsApp.
4. Salvar envia `PUT /api/whatsapp/contacts` com `{chatId,firstName,lastName}`. Qualquer usuário autenticado pode salvar na própria agenda; o ID da sessão sempre vem da autenticação, e userId extra na query/JSON não troca a conta. Mutação exige CSRF. Não altera lead, sede, carteira, bloqueio OptOut ou permissões de envio; por ser edição da agenda pessoal sem envio de mensagem, não utiliza EnsureCanMessage. Grupos, Status, IDs LID e identificadores fora do formato individual de 10–15 dígitos são rejeitados com `400`. O ID já selecionado é preservado, sem acrescentar DDI ou trocar o número por inferência.
5. Serviço exige sessão conectada e chama a função nativa `socket.addOrEditContact(chatId,{firstName,fullName,pnJid,lidJid?,saveOnPrimaryAddressbook:false})`. `fullName` é a junção de Nome e Sobrenome; o protocolo não possui campo separado lastName nessa ação. LID só é acrescentado a partir do mapeamento PN/LID confiável da própria sessão. Usa app-state `critical_unblock_low`, aguardando a confirmação remota da operação. Não envia mensagem/vCard, não cria grupo e não modifica a biblioteca. Referência: [implementação nativa da Baileys rc14](https://github.com/WhiskeySockets/Baileys/blob/v7.0.0-rc14/src/Socket/chats.ts). Solicita salvar na conta WhatsApp, sem pedir sincronização com a agenda primária do aparelho; o CRM não escreve diretamente em Android/iOS. Contatos salvos no WhatsApp e a opção de sincronizar com o telefone são recursos distintos, conforme [ajuda oficial](https://faq.whatsapp.com/1191526044909364/).
6. Após retorno bem-sucedido do socket, grava em transação o nome de agenda em contacts para PN/LID conhecidos e o par Nome/Sobrenome em `contact_names`, por usuário/ID. Atualiza apenas nomes dos chats existentes, sem inserir conversa vazia, mensagem, recibo ou alterar prévia/data/não lidas/fixação/arquivamento. Retorna `200` com os mesmos campos do GET e saved=true. Front fecha, notifica “Contato salvo no WhatsApp.” e recarrega chats; a seleção provisória também passa a ter o nome informado. Na lista/cabeçalho, lead explicitamente vinculado continua tendo prioridade de nome; o modal avisa que o nome do lead no CRM não será alterado.
7. Desconectado → `409`; chave de app-state ainda ausente → `409` pedindo aguardar sincronização; demais falhas seguem o tratamento da integração, sem anunciar sucesso ou gravar os nomes pelo fluxo local antes da confirmação. O formulário conserva nome/sobrenome para correção/retry. Durante envio, botões e fechamento ficam bloqueados; não existe cancelamento remoto após iniciar a operação. Falha local depois da confirmação ou perda da resposta pode deixar o contato já salvo no WhatsApp, mesmo que o formulário mostre erro. A sincronização normal pode reconciliar o nome; repetir o mesmo PUT é uma nova atribuição do mesmo nome, sem criar uma segunda identidade para o número. Não há promessa de confirmação visual em todos os aparelhos, cuja propagação depende da conta/WhatsApp.
8. Nomes da agenda têm prioridade sobre metadados de histórico/perfil em conversas individuais. `saveConversationName` usa prioridade cinco somente para grupos e três para metadados de conversas individuais. Ao receber nome de agenda explícito de contato individual, rebaixa antigas prioridades cinco herdadas do histórico para permitir que o nome correto prevaleça; nome de grupo permanece protegido. Eventos `contacts.upsert`/`contacts.update` continuam atualizando os nomes sem polling novo; o polling de chats existente reflete as mudanças. Não foram acrescentados importação em lote, exclusão de contato ou edição da agenda de terceiros.
9. A regra de exibição em `ContactButton` e os validadores GET/PUT da API e do serviço aceitam o mesmo ID individual de 10–15 dígitos já utilizado na abertura da conversa. Isso inclui identificadores existentes de onze dígitos, como no fluxo Camila → Larissa Mendes 2 → Conversa, que antes abria a página mas ocultava o botão pela exigência de doze dígitos. A correção não normaliza/migra telefone, não acrescenta 55 e não altera o vínculo/revisão do lead; opera no ID selecionado. Mantém o bloqueio de grupos, LID, Backup e comprimentos fora desse intervalo. Não altera as regras de envio de mensagens/anexos.

## 8. Agenda de retornos

Fontes: [appointments-page.tsx](../apps/web/src/features/appointments/appointments-page.tsx), [appointment-form.tsx](../apps/web/src/features/appointments/appointment-form.tsx), [AppointmentsController.cs](../apps/api/Features/Appointments/AppointmentsController.cs).

### 8.1 Consultar agenda geral, pessoal, por lead, dia e concluídos

1. `/appointments` → `GET /api/appointments?mine=false&includeCompleted=false&page=1&pageSize=10`.
2. Minha agenda muda mine para true; checkbox Mostrar concluídos inclui concluídos **junto dos pendentes**; ambos redefinem página.
3. `?lead=42` acrescenta leadId e faz `GET /api/leads/42` para nome/exibição. Link “Ver toda a agenda” remove filtro.
4. Campo “Dia” começa vazio (todas as datas). Selecionar uma data redefine a página para 1 e acrescenta `dueFrom` (meia-noite local convertida para ISO UTC) e `dueTo` (meia-noite local do dia seguinte convertida para ISO UTC). Exemplo no UTC−3: dia 10/02/2001 envia `dueFrom=2001-02-10T03:00:00.000Z&dueTo=2001-02-11T03:00:00.000Z`. “Limpar data” ou apagar o campo remove os dois limites e volta à página 1. Combina com agenda pessoal, concluídos e lead; trocar esses filtros mantém o dia selecionado. Selecionar/limpar não grava dados.
5. API junta Appointment com leads no escopo e filtra LeadId/BranchId/CurrentSellerId/conclusão e os limites opcionais `DueAt >= dueFrom` e `DueAt < dueTo` **antes** de contar/paginar. Ordena DueAt, depois Id; limita página/tamanho como leads. Datas malformadas ou início maior que fim retornam `400`; falha da consulta mostra ErrorBox com tentativa novamente. Nenhum filtro amplia o escopo de sede.
6. Retorna `{items:[{id,leadId,dueAt,note,completed,leadName,phone,currentSellerId,branchId}],total,page,pageSize}`. Sem resultados no dia, mostra “Nenhum retorno neste dia” e orienta escolher outra data ou limpar o filtro.
7. Data/hora são mostradas no fuso do navegador; retorno vencido e pendente ganha indicador visual local. Não existe notificação agendada/cron de retorno.
8. Botões editar/concluir/excluir só aparecem para admin ou vendedor atual. Se a página ficou vazia após ação e ainda há itens, front volta uma página. Criar/editar/concluir/reabrir/excluir recarrega com o filtro de dia atual; um retorno que deixar de corresponder ao dia/conclusão desaparece da lista, sem desfazer a gravação.

### 8.2 Criar

1. “Agendar retorno” → modal busca `GET /api/leads?mine={naoAdmin}&pageSize=100&search=...`; se veio de um lead, carrega também esse lead exato para incluí-lo nas opções.
2. Busca refaz requisição a cada mudança, sem debounce nesse formulário. Selecionar cliente/data required → localDate convertida para ISO → `POST /api/appointments`:

```json
{ "leadId": 42, "dueAt": "2026-10-01T14:00:00.000Z", "note": "Retornar sobre condições" }
```

3. API encontra lead no escopo e exige permissão de edição; data default inválida → `400`; nota até 2000. Permite data passada e vários retornos para o mesmo lead.
4. Cria pendente, normaliza UTC, salva → `200 {id,leadId,dueAt,note,completed:false}` → toast, fecha modal e recarrega agenda. Pode também ser criado na transação do LeadForm.

### 8.3 Editar, concluir e reabrir

- Editar → modal mantém LeadId e Completed atuais → `PUT /api/appointments/{id}` com `{dueAt,note,completed}`.
- Concluir/reabrir → mesmo endpoint com DueAt/Note atuais e `completed:!valorAtual`. Front acrescenta Z quando a data recebida não traz sufixo UTC.
- API busca agendamento (`404`), busca lead/permissão e valida data; muda data/nota/conclusão → `200 Appointment` → reload + toast de salvo/concluído/reaberto.
- Se includeCompleted=false, concluir faz item desaparecer da lista. Não há token de revisão para agendamentos: alterações concorrentes não usam a proteção de leads.

### 8.4 Excluir

Clique Excluir → confirm do navegador; cancelar não chama API. Confirmar → `DELETE /api/appointments/{id}` → encontra e autoriza pelo lead → remove → `204` → reload/toast. Falha mostra erro na página; lead permanece.

## 9. Grupos internos de leads

Fontes: [groups-page.tsx](../apps/web/src/features/groups/groups-page.tsx), [group-form.tsx](../apps/web/src/features/groups/group-form.tsx), [campaign-audience-filter.tsx](../apps/web/src/features/whatsapp/campaign-audience-filter.tsx), [GroupsController.cs](../apps/api/Features/Groups/GroupsController.cs).

### 9.1 Listar e abrir participantes

1. `/groups` → `GET /api/groups` → grupos com UserId do usuário, `{id,name,count}`. Count só conta membros atualmente acessíveis.
2. Admin não ganha acesso aos grupos particulares de outro usuário.
3. Ver participantes → `GET /api/groups/{id}` → proprietário válido ou `404` → `{id,name,members:[Lead]}` apenas com membros acessíveis.
4. Vendedor acessa membros da própria carteira atual; admin acessa leads no seu escopo de sede. Após transferência, membro pode deixar de aparecer/contar sem exclusão imediata da relação no banco.

### 9.2 Buscar candidatos e selecionar

1. Abrir formulário de criação/edição → `GET /api/groups/leads` com opcionais search/status/statuses/classificationId/classificationIds/serviceId/serviceIds/sellerId/sellerIds/branchId/branchIds/includeNoService/createdFrom/createdTo. Na criação, o seletor múltiplo Status começa somente com “Agendar Contato” e “Stand By” marcados; na edição, começa sem restrição para manter visíveis participantes de outros status. Cada status selecionado vai numa chave `statuses` repetida na query e no array `statuses` do POST/PUT; a API aceita qualquer um dos selecionados (OU). O campo unitário `status` permanece compatível e se une ao array sem duplicatas. Seleção vazia/ausente considera todos os status; o padrão da interface não altera chamadas à API que omitem o filtro. O usuário pode marcar/desmarcar opções ou limpar o filtro; mudar outro campo não restaura o padrão. Todos os seletores categóricos reutilizam o controle React de Disparos, e Escape com a lista aberta fecha somente o filtro e devolve foco ao botão, sem fechar o modal. O seletor Classificação consulta `GET /api/classifications` somente com opções pessoais; limpar a seleção remove esse filtro. Carregamento/falha do catálogo desabilita apenas o seletor; falha mostra ErrorBox/retry, preservando os demais filtros.
2. API devolve **array completo**, sem paginação, ordenado CreatedAt desc/Id. Front pagina localmente em blocos de vinte; selecionar tudo inclui todas as páginas filtradas.
3. Filtro vendedor unitário ou array não vazio só admin (`403` se vendedor enviar); filtro sede unitário ou array não vazio só admin global (`403` para outros). As restrições valem na consulta, criação e edição e mantêm o escopo de sede/carteira. Data inicial maior que final → `400`; frontend evita consulta inválida.
4. Front transforma início local em UTC e data final no início do dia seguinte; API usa `>= createdFrom` e `< createdTo`, tornando o dia final escolhido inclusivo na interface.
5. Alterar filtro, incluindo classificações, limpa seleção e volta à página 1; alterar sedes também limpa vendedores. Para admin global, o catálogo de vendedores inclui as sedes selecionadas e administradores sem sede; admin de sede mantém somente seus usuários. Ao editar, membros atuais são priorizados no array. Não Enviar Mais pode pertencer ao grupo, mas não receber campanhas.
6. classificationId/classificationIds combinam com todos os demais filtros e restringem candidatos a leads com pelo menos uma classificação selecionada do usuário autenticado, inclusive para administradores. Mantém escopo de sede/carteira; ID alheio/inexistente não gera correspondência, mesmo misturado com IDs próprios, sem expor o catálogo de terceiros. Lead com duas etiquetas selecionadas aparece uma única vez. Sem resultados, mostra “Nenhum lead encontrado com estes filtros”.
7. Status, Classificação, Serviço, Vendedor e Sede permitem várias opções, com OU dentro do campo e E entre campos, período e busca. Arrays de IDs usam chaves repetidas na query e arrays numéricos no JSON; os campos unitários antigos se unem aos arrays sem duplicatas. Limpar um filtro considera todas as opções daquela dimensão e preserva as escolhas dos demais. Serviços, sedes, vendedores e classificações começam sem restrição tanto na criação quanto na edição. A opção “Sem serviço” envia `includeNoService:true`: sozinha limita a `ServiceId == null`; com `serviceIds`, inclui serviços escolhidos OU nulo. Sem IDs e sem essa opção, todos são considerados. Formato inválido de IDs/booleano → `400` pelo binding, sem gravação. A validação no salvamento reaplica esses mesmos critérios antes de substituir participantes.

### 9.3 Criar/renomear/adicionar/remover membros

```json
{
  "name": "Interessados em habilitação",
  "leadIds": [42, 43],
  "statuses": ["Agendar Contato", "Stand By"],
  "classificationIds": [],
  "serviceIds": [1, 2],
  "includeNoService": true,
  "sellerIds": [],
  "branchIds": [],
  "createdFrom": null,
  "createdTo": null,
  "search": null
}
```

1. Submit → `POST /api/groups` ou `PUT /api/groups/{id}`; nome required até 160, trim no back.
2. Back reaplica escopo e todos os filtros múltiplos, inclusive classificações pessoais, depois LeadIds. IDs informados precisam corresponder aos distintos efetivamente acessíveis/filtrados; seleção inválida → `403`. Se status, serviço, sede, responsável ou classificações mudarem entre seleção e salvamento, rejeita os IDs que não pertencem mais ao filtro. Falha não grava nome nem participantes parcialmente; formulário permanece aberto com erro. Cancelar fecha sem enviar POST/PUT.
3. Novo grupo tem UserId atual. Edição busca grupo do próprio usuário. `SetMembers` remove relações fora da nova seleção e adiciona as faltantes.
4. POST → `200 {id,name}`; PUT → `204`. Front notifica/fecha/recarrega cards; falha preserva formulário.
5. Grupo vazio é permitido (`leadIds:[]`). API aceita `leadIds:null` para pegar todos os resultados da filtragem, mas o formulário atual sempre envia um array explícito.
6. Grupo é um snapshot de IDs, não um filtro dinâmico que agrega futuros leads automaticamente. Salvar edição substitui participantes, inclusive os não acessíveis que não vieram na seleção.
7. Criar/renomear exige nome único entre os grupos do próprio usuário, ignorando maiúsculas/minúsculas (inclusive letras acentuadas) e espaços nas extremidades. Acentos e espaços internos continuam significativos; o nome salvo mantém a caixa informada, com trim. Outro grupo do mesmo dono com nome equivalente → `409`, “Já existe um grupo com este nome.” A edição desconsidera o próprio ID, permitindo manter o nome. Usuários distintos podem usar nomes iguais, inclusive administradores; a validação não consulta nem revela grupos de terceiros. Grupo alheio/inexistente continua retornando `404` antes da checagem do nome. A transação SQLite começa antes da consulta de duplicidade e só confirma após salvar nome e participantes, impedindo duplicação por criações/renomeações simultâneas pelos endpoints. Conflito ou falha de validação reverte a operação inteira, sem trocar nome ou membros; o front usa o ErrorBox existente e conserva o formulário/seleção para correção. Excluir um grupo libera seu nome para reutilização pelo dono. Cancelar continua sem gravação.

### 9.4 Excluir

Confirmar exclusão → `DELETE /api/groups/{id}` → verifica proprietário → remove grupo e seus membros → `204` → reload/toast. Cancela confirmação → nada é alterado. Leads e chats permanecem. Esses grupos não são grupos do WhatsApp e não criam salas externas.

## 10. Administração e catálogos

Fontes: [settings-page.tsx](../apps/web/src/features/settings/settings-page.tsx), [settings-form.tsx](../apps/web/src/features/settings/settings-form.tsx), [CatalogController.cs](../apps/api/Features/Admin/CatalogController.cs).

### 10.1 Consultar cadastros

`GET /api/catalog` autenticado → `{branches,users,services,conditions,statuses}`. Branches/users limitados pela sede do usuário, quando existe; serviços/condições são globais. Inclui cadastros inativos. Users usa DTO público, sem PasswordHash/SecurityStamp. Trocar abas Equipe/Sedes/Serviços/Condições é local, sobre o catálogo do Provider.

### 10.2 Criar/editar usuário e senha

1. Admin → Equipe → adicionar/editar → formulário → `POST /api/catalog/users` ou `PUT /api/catalog/users/{id}`:

```json
{ "name": "Consultor", "username": "consultor", "password": "nova-senha", "isAdmin": false, "active": true, "branchId": 1 }
```

2. Nome required até 160; username required até 100; senha até 200. API trim/lower no username, trim no nome; índice único de username → `409` em duplicidade.
3. Vendedor precisa sede; sede informada precisa ser ativa e estar no escopo. Admin de sede não cria admin global nem edita usuário fora da sede (`403`).
4. Criar exige senha; alterar com password null/vazio mantém hash. Senha nova precisa ter dez caracteres e é salva via PasswordHasher. DTO retornado não contém senha.
5. Usuário não pode inativar a si próprio, mudar seu perfil administrativo ou sua sede pela edição → `400`. Mudar sede de usuário que ainda é vendedor original ou atual de leads → `400`, exigindo transferência permanente da carteira.
6. Toda edição gera novo SecurityStamp, mesmo sem troca de senha → sessões antigas desse usuário são rejeitadas na próxima validação.
7. Salva → `200 User` → front fecha modal, `refresh()` busca `/auth/me` e `/catalog`, toast. Se o admin editou seu próprio cadastro, o refresh pode invalidar sua própria sessão.
8. Inativação não apaga usuário/leads e não chama disconnect do WhatsApp; novos requests do CRM perdem acesso e worker de campanha o considera inelegível.

### 10.3 Sedes, serviços e condições

Todas as operações usam `{ "name": "Nome", "active": true }`, nome required até 160, trim; inativar é PUT com active=false. Não há DELETE desses cadastros.

| Ação | Endpoint | Regra específica | Retorno |
| --- | --- | --- | --- |
| Criar sede | `POST /api/catalog/branches` | Apenas admin global | `200 Branch` |
| Editar sede | `PUT /api/catalog/branches/{id}` | Admin no escopo; ausente → 404 | `200 Branch` |
| Criar serviço | `POST /api/catalog/items/service` | Apenas admin global | `200 CatalogItem` |
| Criar condição | `POST /api/catalog/items/condition` | Apenas admin global | `200 CatalogItem` |
| Editar serviço/condição | `PUT /api/catalog/items/{id}` | Apenas admin global; ausente → 404 | `200 CatalogItem` |

Tipo de criação diferente de service/condition → `400`. Admin de sede vê catálogos compartilhados sem botões de edição; pode editar própria sede, mas não adicionar outra. Sucesso fecha modal/refresh/toast; erros ficam no formulário.

Criação e edição rejeitam nomes equivalentes após trim e conversão para minúsculas invariantes, inclusive em letras acentuadas. A função SQLite `lower` registrada em [Program.cs](../apps/api/Program.cs) garante essa comparação além de ASCII. Acentos e espaços internos não são removidos/compactados; o valor persistido mantém a caixa informada, sem espaços nas extremidades. Sedes têm unicidade global; serviços e condições têm unicidade separada por `Kind`, podendo um serviço e uma condição ter o mesmo nome. Cadastros inativos também reservam o nome. Edição exclui o próprio ID da comparação, permitindo manter o nome ao ativar/inativar. Duplicidade → `409`, “Já existe uma sede com este nome.”, “Já existe um serviço com este nome.” ou “Já existe uma condição com este nome.”, sem alterar nome/active. O formulário existente mostra a mensagem e mantém os dados para correção; cancelar fecha sem POST/PUT. Permissões são verificadas antes da consulta de duplicidade; buscas de ID preservam `404` e admin de sede continua podendo editar somente sua sede, com a mesma restrição de nome global.

A consulta de duplicidade e a gravação de cada POST/PUT acima ocorrem na mesma transação SQLite, iniciada antes das leituras e confirmada somente após SaveChanges. Isso serializa as gravações concorrentes desses endpoints, inclusive duas renomeações para o mesmo nome. Exceção/validação sem commit descarta a operação. Não foram adicionados endpoints, campos ou alteração de schema; payloads e retornos de sucesso permanecem os mesmos.

Inativar sede impede login/sessão dos usuários associados e elegibilidade de campanhas, além de salvar novos atendimentos na sede. Inativar item não apaga referências existentes; a edição de lead exige escolher item ativo ou removê-lo.

### 10.4 Mídia e armazenamento

Fontes: [media-settings-page.tsx](../apps/web/src/features/settings/media-settings-page.tsx), [MediaStorageController.cs](../apps/api/Features/Admin/MediaStorageController.cs), [WhatsAppClient.cs](../apps/api/Features/WhatsApp/WhatsAppClient.cs), [routes.ts](../apps/whatsapp/src/routes.ts), [media-storage.ts](../apps/whatsapp/src/storage/media-storage.ts), [media.ts](../apps/whatsapp/src/messaging/media.ts), [database.ts](../apps/whatsapp/src/storage/database.ts) e [server.ts](../apps/whatsapp/src/server.ts).

1. Configurações mostra “Mídia e armazenamento” para o administrador global, abrindo `/settings/media`. A página consulta `GET /api/settings/media`, sem polling; “Atualizar uso” refaz a consulta. Vendedor e administrador de sede não consultam nem alteram essa configuração compartilhada (`403` nos endpoints; a página direta mostra acesso restrito). Anônimo → `401`; PUT/POST exigem CSRF. A API usa `SendGlobal` para encaminhar somente os caminhos fixos `/media-storage`, `/media-storage/settings`, `/media-storage/cleanup-preview` e `/media-storage/cleanup`, protegidos pela chave interna do serviço. Não aceita escolher livremente usuário/escopo pelo navegador; as operações abrangem todas as sessões do CRM.
2. GET retorna `{settings:{retentionEnabled,retentionDays},chat:{bytes,count},campaign:{bytes,count},profiles:{bytes,count},totalBytes,totalCount,databaseBytes}`. Chat soma os bytes BLOB de `media_cache`; fotos somam os BLOBs de `profile_pictures`; disparos somam o espaço UTF-8 dos campos base64 não vazios, incluindo o formato legado e múltiplos anexos por mensagem. Contagem representa cópias locais, sem deduplicação por hash entre mensagens/campanhas. `totalBytes` soma esses três grupos, sem miniaturas embutidas nos raws das mensagens ou overhead do banco. `databaseBytes` mede os arquivos `whatsapp.db`, WAL e SHM, incluindo histórico/estrutura/espaço reutilizável. A tela mostra o total e as três categorias de mídia. Em 27/10/2026, foram removidos da interface os textos explicativos sobre RAM/disco, tamanho físico do banco, arquivamento de anexos e recuperação após limpeza; as regras descritas nesta seção e os contratos permanecem os mesmos. O tamanho físico do banco continua no payload, sem exibição na página. A varredura de campanhas lê um payload por vez, sem devolver base64 no GET de uso.
3. `PUT /api/settings/media` recebe `{retentionEnabled:boolean,retentionDays:integer}`; dias entre 1 e 3650, inclusive com a opção desligada. Ausência/tipo/limite inválido → `400` antes de gravar. Salva em `media_settings` e retorna a configuração; sucesso notifica e atualiza uso. Padrão inicial: desligado e 30 dias. **Desligado mantém as cópias sem prazo de exclusão automática**; não desativa o armazenamento. A preferência é compartilhada, persistida no servidor e sobrevive a reinícios; salvar não envia mensagens nem muda o WhatsApp. Falha preserva o formulário. Navegar/recarregar sem salvar descarta a edição local.
4. Retenção habilitada limpa arquivos mais antigos que `agora - retentionDays * 24h` na inicialização e a cada hora. Usa comparação estrita `<`: o limite exato permanece. Para anexos de chat, a idade é a data da mensagem; para disparos, criação da campanha; para fotos de perfil, última atualização local. Não conta a partir da última visualização. Anexos que já estejam fora do prazo podem ser baixados para visualização, mas não são arquivados novamente. Desativar a regra impede as próximas limpezas automáticas, sem recuperar cópias já excluídas. O painel explica que a regra também atinge arquivos antigos já armazenados.
5. Limpeza manual tem campo próprio de dias, independente da preferência automática. “Revisar limpeza” faz `POST /api/settings/media/cleanup-preview` com `{days}` e abre modal com quantidade/espaço por categoria, total e limite `before` calculado no servidor. Prévia não grava nem apaga nada. Cancelar/fechar/Escape descarta somente a prévia. Sem arquivos, confirmar fica desabilitado. “Excluir arquivos” envia `POST /api/settings/media/cleanup` com `{days,confirmed:true}`; confirmação ausente/false ou dias inválidos → `400`. A execução recalcula os elegíveis com o horário atual e retorna os mesmos campos da prévia com o resultado efetivo; dados que mudarem entre revisão e confirmação podem alterar os totais. Durante a requisição, controles/fechamento do modal ficam bloqueados. Sucesso fecha, notifica quantidade/espaço e recarrega uso; falha mantém a prévia e mostra erro. Falha de comunicação após o serviço confirmar a transação pode tornar o resultado incerto: atualizar uso/revisar novamente permite conferir; repetir a limpeza não duplica exclusões.
6. Limpeza manual e automática usam a mesma transação `BEGIN IMMEDIATE`: removem BLOBs vencidos do chat e fotos antigas, e esvaziam somente `data` dos anexos em campanhas encerradas, acrescentando `removed:true`. Campanhas `running`/`queued` são preservadas. Mantêm mensagens, textos/legendas, chaves/metadados/miniaturas do histórico, contatos, autenticação, leads, nomes/MIME dos anexos, modelos/personalização e resultados/contadores dos disparos. Qualquer falha reverte todos os grupos de mídia; não há exclusão parcial confirmada. Não enviam revogação, recibo de leitura nem exclusão ao WhatsApp.
7. A transação registra o maior limite já limpo em `media_settings.purged_before`. Uma cópia de chat anterior a esse limite não volta a ser arquivada por download tardio/ressincronização, inclusive quando a retenção é posteriormente desligada. A verificação é repetida na gravação, para não recriar um anexo cujo download começou antes da limpeza. Reabrir essa mensagem ainda pode baixar sua mídia do WhatsApp temporariamente; sem disponibilidade externa, a cópia removida não é recuperável pelo CRM. Fotos de perfil podem ser novamente obtidas e recebem nova data de atualização. Cópias já abertas no navegador ou baixadas para o computador não são apagadas por essa operação.

## 11. Sessão WhatsApp: conectar, QR, reconectar e desconectar

Fontes: [connection.tsx](../apps/web/src/features/whatsapp/connection.tsx), [WhatsAppController.cs](../apps/api/Features/WhatsApp/WhatsAppController.cs), [routes.ts](../apps/whatsapp/src/routes.ts), [manager.ts](../apps/whatsapp/src/sessions/manager.ts), [auth.ts](../apps/whatsapp/src/storage/auth.ts).

### 11.1 Status e conectar

1. Abrir Conversas ou Disparos monta Connection → `GET /api/whatsapp/status` a cada cinco segundos → API encaminha a `/sessions/{current.Id}/status`.
2. Retorno `{status,qr?}`; estados: disconnected, connecting, qr, connected. Sem sessão em memória → disconnected.
3. Clicar Conectar → `POST /api/whatsapp/connect` sem corpo → `POST /sessions/{user}/connect`.
4. Sessão já connecting/qr/connected → devolve status existente, sem criar socket duplicado. Desconectada → limpa timer/QR, marca connecting, lê credenciais/chaves SQLite ou inicia credenciais novas e cria socket.
5. API devolve status inicial → front recarrega status e abre modal. Sem QR mostra Loading; evento `connection.update.qr` gera Data URL do QR, salva em memória e muda para qr; próximo GET entrega a imagem.
6. Usuário escaneia no celular → socket abre → connected, limpa QR, zera tentativas. Front mostra confirmação e “Ir para as conversas”, que fecha modal.
7. `creds.update` salva credenciais no SQLite; chaves são atualizadas em transação. QR não é persistido no banco.
8. Se falha na chamada, front mostra erro e libera botão. Se status fica disconnected no modal, “Gerar novo código” refaz connect. Fechar modal não desconecta nem cancela socket.

### 11.2 Conexão estabelecida e reconexão automática

1. Ao abrir socket, sincroniza metadados de contatos e chat states quando há chats antigos e os marcadores/contagens indicam necessidade. Faz resyncAppState e marca snapshot no service_state.
2. Busca nomes de grupos via groupFetchAllParticipating uma vez por sessão; falha libera futura tentativa e registra log.
3. Conexão fechou sem logout/stopped → disconnected, limpa QR → agenda até oito tentativas de connect, com espera `min(30000,2000 * tentativa)` (2, 4, …, 16 s nessa sequência). Abriu → tentativas zeradas.
4. Motivo loggedOut → stopped=true e remove auth, sem reconexão automática. Após oito tentativas sem sucesso, usuário precisa agir manualmente.
5. Reinício do serviço tenta restaurar credenciais existentes conforme seção 2. Serviço usa markOnlineOnConnect=false e syncFullHistory=false.

### 11.3 Desconectar

1. Botão Desconectar → confirm; cancelar não chama API. Confirmar → `POST /api/whatsapp/disconnect` sem corpo → serviço.
2. Marca stopped, cancela timer e tenta socket.logout; falha faz socket.end. Remove sessão em memória e auth do usuário.
3. Retorna `{status:'disconnected'}` → front reload. Chats, mensagens, fotos e campanhas não são apagados. Não há comando para cancelar todas as campanhas nessa rota; próximos envios podem falhar por falta de conexão.

## 12. Conversas, lista e histórico

Fontes: [chat-page.tsx](../apps/web/src/features/whatsapp/chat-page.tsx), [chat-list.tsx](../apps/web/src/features/whatsapp/chat-list.tsx), [chat-groups.ts](../apps/web/src/lib/chat-groups.ts), [WhatsAppController.cs](../apps/api/Features/WhatsApp/WhatsAppController.cs), [conversation.tsx](../apps/web/src/features/whatsapp/conversation.tsx), [chat-states.ts](../apps/whatsapp/src/storage/chat-states.ts), [messages.ts](../apps/whatsapp/src/storage/messages.ts), [profile-picture.ts](../apps/whatsapp/src/messaging/profile-picture.ts).

### 12.1 Listar, buscar e combinar visualizações por WhatsApp, status e classificação

1. ChatPage → `GET /api/whatsapp/chats` a cada cinco segundos → serviço consulta SQLite por user.
2. Normaliza chat states @lid para telefone quando há mapeamento nas chaves. Lista até quinhentas conversas não arquivadas e todas as arquivadas; prioriza fixadas/data. Chats só com estado, sem registro em chats, não são produzidos por essa consulta.
3. API aplica nome/status do lead vinculado no escopo/sessão sobre o nome recebido; fallback é nome válido do WhatsApp ou número. Retorna `[{id,name,lastText,updatedAt,archived,pinnedAt,unreadCount,markedUnread,leadId,leadStatus,classifications:[{id,name,color}]}]`. `unreadCount` é inteiro não negativo e `markedUnread` distingue a marcação manual sem quantidade; payload antigo/inválido usa zero/false. Sem vínculo explícito no escopo: leadId=null/leadStatus=null/classifications=[], mesmo que o telefone coincida com um lead. Consulta os vínculos/classificações em lote, somente do usuário autenticado. leadStatus é o status atual do lead em cada consulta.
4. Busca por nome/ID acontece localmente, antes do agrupamento, sem parâmetro para API. Ao alterar uma busca não vazia, abre os grupos que contêm resultados, inclusive arquivadas; permite recolhê-los novamente. Front prioriza fixadas, depois data e ID. Arquivadas (inclusive quando fixadas) permanecem no grupo Arquivadas. Somente WhatsApp ativo mantém subtítulo Fixadas dentro de Conversas.
5. Estados são recebidos do WhatsApp; o CRM também permite arquivar/desarquivar a conversa selecionada (12.5). Fixar/desafixar permanece disponível apenas fora do CRM.
6. Lista vazia → Empty. Selecionar chat define estado local e não envia mensagem de conversa; no atendimento, após carregar as mensagens, pode confirmar leitura no WhatsApp conforme 12.6. Backup continua sem marcar leitura. Cada card com leadId e leadStatus mostra, abaixo da prévia da mensagem, o mesmo Badge de status usado na tabela de leads (texto e cores). A conversa selecionada também mostra esse Badge ao lado do nome no cabeçalho; em telas estreitas pode quebrar para a próxima linha. Usa o leadStatus da lista atualizada pelo polling/recarga, sem depender do objeto armazenado no clique; quando a conversa não está na lista (por exemplo, deep link), usa o status do lead explicitamente vinculado encontrado pela consulta existente. Sem vínculo/status não renderiza essa etiqueta. Aparece em todas as visualizações, inclusive arquivadas e Backup, usando o lead no escopo retornado pela API; acompanha a atualização de chats sem consulta extra ou alteração do lead.
7. Cada classificação pessoal do lead vinculado aparece como uma bolinha ao lado do nome, com nome acessível e tooltip. No cabeçalho de uma conversa vinculada, somente o botão ao lado de “Abrir lead” abre a lista compacta para criar, selecionar e remover várias marcações com salvamento automático ao clicar nos itens (6.8); não há botão acima de Arquivadas. Conversas sem lead vinculado não exibem esse seletor. Lista atualiza no polling de cinco segundos ou após cada marcação/desmarcação/vinculação/criação de lead pelo chat; seletor consulta classificações ao abrir, sem polling próprio.
8. Backup também pode mostrar as bolinhas, sempre das classificações de quem está consultando, inclusive ao consultar sessão de outro usuário. Não expõe o catálogo/marcações do dono da sessão e não exibe controles de criação/atribuição.
9. A página Conversas oferece três botões com aria-pressed: WhatsApp, Status e Classificação. São combináveis e sempre mantêm ao menos um ativo: clicar no último ativo não o desliga. Padrão ao montar a página → somente WhatsApp. Não grava preferência no banco/navegador nem chama endpoint para trocar visualização. Backup continua somente com a organização WhatsApp e não mostra esses três controles.
10. A hierarquia respeita sempre WhatsApp → Status → Classificação, omitindo níveis desativados, independentemente da ordem em que os botões foram clicados. WhatsApp cria Arquivadas e Conversas; Status agrupa pelo leadStatus, na ordem dos status do CRM, deixando Sem lead por último; Classificação agrupa pelas marcações pessoais, ordenadas por nome/ID, deixando Sem classificação por último. Grupos vazios não são renderizados. Sem lead também pertence a Sem classificação quando esse nível está ativo.
11. Com todos ativos, cada grupo WhatsApp contém grupos de status, cada um contendo grupos de classificação. Conversa com várias classificações aparece em cada classificação aplicada, compartilhando a mesma seleção/histórico. As contagens são de conversas únicas em cada grupo; a soma de classificações filhas pode exceder a contagem do pai. Sem classificação inclui leads sem marcações pessoais e conversas sem lead. Nenhuma classificação de outro usuário entra na árvore.
12. Todos os grupos têm toggle de expandir/recolher, contador e indicação acessível aria-expanded; classificação mostra sua cor. Arquivadas inicia recolhido, os demais abertos. O estado usa o caminho completo do grupo (incluindo IDs das classificações), mantendo recolhimento no polling e evitando que grupos homônimos de pais diferentes se afetem. Trocar níveis pode criar caminhos novos que usam o estado inicial; não limpa a conversa selecionada. Recolher o grupo da conversa selecionada mantém o painel/histórico aberto. Em telas estreitas, os grupos continuam em lista vertical rolável.
13. Polling/recarga de chats recalcula grupos, nomes, status, classificações e contagens com os dados atuais; não dispara mensagens nem altera arquivamento/status/classificação. Falha de consulta mantém dados anteriores e usa ErrorBox/retry; sem dados no carregamento mostra Loading. Busca sem resultados mostra Empty, sem cabeçalhos vazios. Trocar visualizações/fechar grupos só altera estado local, sem persistência parcial ou cancelamento remoto.

### 12.2 Foto e ampliação de perfil

Imagem/Avatar → `GET /api/whatsapp/profile-picture?chatId={jid}[&userId=...]` → verifica HistoryUser → serviço `/profile-picture` → valida JID individual/grupo/lid.

- Cache SQLite de seis horas; ausência de foto também pode ser cacheada.
- Cache expirou → precisa socket conectado, pede URL preview e baixa com timeout de dez segundos, exige image/* e até 5 MB. Se atualização falhar, usa cache anterior quando existe.
- Sem bytes/MIME → serviço `404`; API retorna erro de foto. Sucesso é **binário**, com `Cache-Control: private,max-age=3600`.
- Clicar foto abre modal usando o mesmo endpoint; falha mostra foto indisponível. Avatar tem fallback visual. Não altera cadastro nem foto no WhatsApp.

### 12.3 Abrir mensagens e carregar anteriores

1. Seleção do chat → `GET /api/whatsapp/messages?chatId={jid}` a cada quatro segundos no atendimento.
2. Serviço consulta até cem mensagens da sessão/conversa, ordena desc por timestamp/id e inverte para exibição cronológica. Retorno inclui id/chatId/text/mine/kind/timestamp/canDeleteForEveryone/attachment/contact/reactions, booleanos edited/forwarded e, quando há citação, reply; mine vem numérico do SQLite. A API encaminha o JSON incluindo os campos adicionais, sem modificar os escopos de sessão/Backup.
3. Tipos: text/image/video/audio/document/sticker/contact/deleted; metadados de anexo podem incluir tamanho/páginas/thumbnail, sem bytes completos da mídia.
4. Front combina página atual com mensagens anteriores e remove IDs duplicados; rola para o fim quando quantidade da página atual muda.
5. A partir de cem mensagens exibidas, “Carregar mensagens anteriores” → mesmo GET com `before={timestampDoPrimeiro}&beforeId={idDoPrimeiro}`. Cursor timestamp+id evita perder empates.
6. Acrescenta lote ao início; array vazio mostra “Não há mensagens anteriores armazenadas”. Não pede sincronização remota de histórico mais antigo.
7. Grupo @g.us ou @lid sem telefone identificado: leitura permitida, compositor/menu de ação não renderizados. Histórico pode ser consultado desconectado; mídia geralmente exige origem conectada.
8. O corpo textual e as legendas exibidos por `MessageText` usam [formatted-message.tsx](../apps/web/src/features/whatsapp/formatted-message.tsx): `*texto*` → negrito (`strong`), `_texto_` → itálico (`em`), `~texto~` → tachado (`s`), uma crase de cada lado → código inline e três crases de cada lado → código monoespaçado que pode conter quebras de linha. Vale para mensagens recebidas/enviadas e Backup, sem alterar endpoints ou persistência. Permite combinar marcadores diferentes; para negrito/itálico/tachado, marcadores incompletos, vazios, com espaço junto às extremidades ou dentro de palavras permanecem literais. Código sem delimitador de fechamento também permanece literal. Negrito/itálico/tachado são reconhecidos em uma mesma linha. Dentro de código não interpreta formatação nem telefones como ações. Renderiza texto como nós React escapados, sem interpretar HTML, executar conteúdo ou criar links a partir de HTML recebido. Quebras de linha e quebra de palavras longas são preservadas; o código tem fonte monoespaçada e fundo discreto. Os marcadores continuam no `Message.text` original para editar, responder, encaminhar e enviar; a interpretação ocorre somente na apresentação.
9. **Mensagem respondida/citada:** [message-replies.ts](../apps/whatsapp/src/storage/message-replies.ts) lê `contextInfo.stanzaId` após normalizar o conteúdo/envelopes, inclusive em respostas com anexo. `reply` retorna `{id,author,mine,kind,text,thumbnail?}` sem expor o raw/credenciais. Prefere o snapshot `quotedMessage`; se ausente, consulta a original armazenada pelo mesmo usuário/chat/ID, inclusive fora da página carregada, sem procurar em outras sessões/conversas. `contextInfo.remoteJid` incompatível com o chat/chaves da original impede esse fallback; uma citação de Status pode continuar usando seu próprio snapshot. Identifica “Você” pelo mine da original ou pelo telefone/LID da conta de origem nas credenciais, inclusive no Backup de terceiros autorizado; demais autores usam contato salvo, pushName da original ou telefone/“Contato”. Texto da prévia tem até quinhentos caracteres; mídia sem legenda usa Foto/Vídeo/Áudio/Documento/Figurinha/Contato/Localização ou nome do arquivo/contato. Miniatura JPEG incorporada de até 64 KiB pode ser retornada sem baixar mídia. Original localmente revogada prevalece sobre o snapshot: mostra “Mensagem apagada”, sem miniatura; exclusão somente para mim pode deixar o snapshot citado disponível. Original e snapshot ausentes mostram “Mensagem não disponível”. Sem stanzaId ou em mensagem comum/encaminhada sem citação, omite reply; a própria mensagem apagada não renderiza a citação. Não altera o texto principal, prévia do chat, cursor/paginação ou banco; históricos antigos passam a exibir os dados já presentes no raw, sem migração/ressincronização remota.
10. [message-reply.tsx](../apps/web/src/features/whatsapp/message-reply.tsx) mostra bloco acima do conteúdo dentro do balão: fundo discreto, faixa verde lateral, nome do autor, ícone/tipo do anexo e miniatura quando existente, no atendimento e Backup. Limita visualmente o texto a duas linhas e o nome a uma; usa a formatação de 8 com escape de HTML, sem ações de telefone no trecho citado. Quando a original está entre mensagens já carregadas, o bloco é botão acessível: clique/teclado rola suavemente até ela, sem buscar páginas ou fazer chamada de leitura/envio adicional. Fora da lista permanece uma citação estática; carregar anteriores manualmente pode disponibilizar a navegação. Revogação de original já carregada também é refletida na prévia mesmo se a resposta estiver na página antiga em memória. Sem interação não há ação a cancelar; navegar/trocar conversa ou sair do Backup não grava a citação. Falhas do GET seguem ErrorBox/retry existente; falta de referência/conteúdo/miniatura usa os fallbacks acima sem impedir o restante do histórico.
11. **Editada/Encaminhada:** [message-metadata.ts](../apps/whatsapp/src/storage/message-metadata.ts) reconhece o envelope `editedMessage` da própria mensagem (inclusive dentro dos envelopes normalizados pelo Baileys) e o contexto da mensagem principal com `isForwarded:true` ou `forwardingScore` inteiro positivo. Não percorre o conteúdo de `quotedMessage` para marcar a resposta nem infere edição comparando textos. Eventos de protocolo de edição aplicados à original e edições locais bem-sucedidas também registram a evidência. `saveMessage` preserva marcas já conhecidas do mesmo usuário/ID/chat no campo interno `crmMetadata:{edited,forwarded}` do raw, sem alterar schema ou expor esse campo no DTO. Atualizações/ressincronização sem essas informações não apagam a marca; mensagens novas sem evidência retornam false. Registros antigos com metadados nativos já disponíveis passam a ser reconhecidos na consulta; edições antigas cujo contexto já foi descartado não são reconstruídas. No atendimento e Backup, mostra seta/“Encaminhada” acima do conteúdo/citação e “Editada ·” junto da data/hora, podendo coexistir. Mensagens revogadas retornam false para ambos e não mostram rótulos; payload antigo sem os campos também não mostra indicadores. Marcas não alteram corpo/legenda, paginação, quantidade de não lidas ou controles de envio; o polling existente atualiza a página atual. Não há ação de usuário, chamada remota ou cancelamento para simplesmente exibir as marcas. Exclusão para mim remove o registro e suas marcas; uma futura reinserção depende dos metadados disponíveis no histórico recebido.

### 12.4 Nova conversa manual e por deep link

- “Nova conversa” → prompt do navegador → remove não dígitos, exige 12–15 dígitos com DDI/DDD → seleciona objeto Chat provisório, sem requisição de resolução. Cancelar não faz nada; número inválido mostra erro. Chat só é persistido após mensagem/sincronização.
- `/whatsapp?phone=...` aceita 10–15 dígitos e seleciona Chat provisório; contrato de envio é mais restrito, 12–15. Não envia automaticamente nem verifica conexão nessa seleção.
- Resolver número de contato recebido/texto é outro caminho, detalhado na seção 14.5.

### 12.5 Arquivar e desarquivar pelo CRM

Fontes adicionais: [archive-chat.ts](../apps/whatsapp/src/messaging/archive-chat.ts), [schemas.ts](../apps/whatsapp/src/messaging/schemas.ts), [routes.ts](../apps/whatsapp/src/routes.ts).

1. Selecionar uma conversa já presente na lista → cabeçalho mostra “Arquivar” ou “Desarquivar” conforme `archived` da consulta atual. Não aparece no Backup nem para conversa provisória ainda não persistida. Permite conversas individuais, grupos e IDs LID; não exige vínculo com lead nem aplica regras de envio/carteira/OptOut, pois não envia mensagem.
2. Clique → bloqueia a ação enquanto salva/recarrega, limpa erro anterior e faz `PUT /api/whatsapp/chats/archive` com `{chatId,archived:true|false}`. Exige autenticação e CSRF; DTO exige JID suportado até cem caracteres e booleano explícito (ausente/nulo/texto → `400`). A API encaminha para `PUT /sessions/{usuarioAutenticado}/chats/archive`; parâmetros/body com outro `userId` não mudam a sessão alvo, inclusive para administradores.
3. Serviço valida novamente o payload, confirma a conversa em `chats` pelo par usuário/ID (`404` se ausente/alheia), busca a última mensagem por timestamp/ID na mesma sessão/conversa, incluindo revogadas, e recupera sua chave/timestamp com BufferJSON. Sem referência utilizável (inclusive grupo recebido sem participante) → `409` pedindo sincronização, sem chamar o socket ou alterar o banco.
4. Com socket conectado, chama `chatModify({archive:archived,lastMessages:[{key,messageTimestamp}]},chatId)`. Preserva chave original/participante, inclusive mensagem recebida como LID com telefone alternativo. Após a operação remota resolver, `saveChatState` persiste apenas o arquivamento em `chat_states`, preservando fixação, mensagens e prévia, e responde `200` com `{chatId,archived}`.
5. Sucesso → toast, recarga imediata de chats e reagrupamento conforme visualizações/filtros atuais. Arquivadas fica no grupo próprio quando a visualização WhatsApp está ativa; desarquivadas volta a Conversas, sujeita ao limite de quinhentas ativas. Mantém a conversa selecionada/histórico, mesmo se o grupo estiver recolhido ou o item deixar a lista. Polling de cinco segundos continua recebendo alterações feitas em outros aparelhos.
6. Sessão desconectada → `409`; falha remota segue o tratamento compartilhado da integração. O serviço não grava o estado solicitado antes do sucesso remoto; o front mostra ErrorBox, libera a ação e não faz alteração otimista. Falha da recarga mantém a lista anterior com erro/retry. Não há confirmação/modal nem cancelamento remoto: sem clique não há gravação; após iniciar, sair da conversa/página não desfaz a solicitação. Timeout/falha após aceitação remota pode ter efeito no WhatsApp e ser reconciliado pelos eventos/polling; não há rollback entre WhatsApp e SQLite.

### 12.6 Mensagens não lidas e confirmação de leitura ao abrir

Fontes: [chat-states.ts](../apps/whatsapp/src/storage/chat-states.ts), [database.ts](../apps/whatsapp/src/storage/database.ts), [read-chat.ts](../apps/whatsapp/src/messaging/read-chat.ts), [schemas.ts](../apps/whatsapp/src/messaging/schemas.ts), [routes.ts](../apps/whatsapp/src/routes.ts), [WhatsAppController.cs](../apps/api/Features/WhatsApp/WhatsAppController.cs), [chat-list.tsx](../apps/web/src/features/whatsapp/chat-list.tsx), [conversation.tsx](../apps/web/src/features/whatsapp/conversation.tsx).

1. `chat_states` guarda a contagem isolada por usuário/conversa e uma versão temporal monotônica da atualização. `messaging-history.set` e `chats.upsert` aplicam contagens completas; `chats.update` soma valores positivos como deltas, zera com zero e preserva valores omitidos/null/inválidos. Não soma também em `saveMessage`, evitando duplicar contagem. Campos protobuf apenas herdados não sobrescrevem uma contagem conhecida. A marcação manual `-1` mantém uma quantidade positiva já conhecida ou guarda somente o marcador, sem inventar uma mensagem não lida; nova mensagem a partir do marcador inicia contagem numérica.
2. O polling de chats a cada cinco segundos transporta os valores atuais. O card mostra círculo verde com quantidade, `99+` acima de 99 (descrição acessível conserva o total real), além de nome/data destacados. O fundo do contador e a data destacada usam o token `--green` do tema, com número branco; `--primary` não existe no tema e deixava o número branco sobre fundo transparente. Zero sem marcador não mostra círculo; marcação manual sem quantidade mostra apenas ponto acessível “Conversa marcada como não lida”. Preserva foto, prévia, fixação, status e classificações. Vale para grupos, arquivadas quando expandidas e todas as visualizações; duplicações por classificação compartilham o mesmo estado. Backup mostra o estado da sessão consultada, mas não o altera.
3. No atendimento, conversa selecionada com mensagens carregadas sem erro, em aba visível e janela com foco → `PUT /api/whatsapp/chats/read` com `{chatId,lastMessageId}` da última mensagem carregada, inclusive se a contagem antiga ainda não foi sincronizada. Novas mensagens/contagens enquanto a conversa permanece aberta podem gerar nova leitura. Aba oculta, janela sem foco, histórico ainda carregando/vazio ou Backup não iniciam essa operação. O frontend evita sobreposição e repetições para o mesmo chat/mensagem/contagem, registra a contagem retornada para não reenviar após seu próprio sucesso e não zera o indicador de forma otimista.
4. API exige autenticação e CSRF, JID individual/grupo/LID até cem caracteres e ID da mensagem obrigatório até duzentos. Encaminha a `PUT /sessions/{usuarioAutenticado}/chats/read`; `userId` no body/query não permite atuar sobre outra sessão, inclusive para admin. Não aplica as restrições de envio/carteira/OptOut: confirma a leitura da própria sessão, sem enviar conteúdo ao contato. Dados inválidos → `400`; sessão ausente → `401`.
5. Serviço valida o payload e procura a mensagem pelo usuário/chat/ID (`404` se ausente ou de outra sessão/conversa), incluindo referências de mensagens revogadas. Chave/timestamp insuficientes ou grupo recebido sem participante → `409` pedindo sincronização. Contagem já confirmada como zerada e sem marcador retorna sem chamar socket; zero ainda desconhecido confirma a leitura remota uma vez. Busca as últimas mensagens recebidas armazenadas até a referência carregada, limitadas pela contagem atual (uma para marcador manual ou contagem desconhecida); mensagens próprias não recebem recibos.
6. Com sessão conectada, chama `readMessages` com as chaves originais das recebidas, respeitando as configurações de privacidade implementadas pelo Baileys (`read`/`read-self`), e depois `chatModify({markRead:true,lastMessages:[referência]},chatId)` para sincronizar o estado da conversa. Após sucesso, só zera o contador local se a última mensagem ainda for a carregada e a versão do contador não tiver mudado durante a operação. Atualizações concorrentes e mensagens posteriores não são apagadas por essa gravação; eventos/polling ou nova leitura reconciliam o restante. Preserva arquivamento/fixação, mensagens e dados do lead. Retorna `{chatId,unreadCount,markedUnread}` com o estado restante.
7. Sucesso recarrega imediatamente a lista; normalmente o círculo desaparece, sujeito ao estado remoto/concorrente atual. Falha mostra erro com ação de tentar novamente, mantém a contagem recebida do serviço e não interrompe a consulta/composição da conversa. Desconexão → `409`; outras falhas seguem o tratamento de integração. Sem abrir/ter foco não há leitura automática; fechar/trocar antes de carregar evita a chamada, mas uma leitura já enviada não é desfeita. Recibos podem ser aceitos antes de falhar o patch, ou a operação remota pode ter ocorrido apesar de timeout; não existe rollback entre WhatsApp e SQLite, e eventos posteriores podem confirmar a leitura.
8. A migração acrescenta colunas à tabela existente sem apagar arquivamento/fixação ou histórico. Conversas antigas começam com contagem desconhecida representada por zero até receber estado/eventos do WhatsApp; não trata todo o histórico como não lido nem garante reconstrução integral de contagens antigas. A ressincronização de metadados usa o marcador `chat-state-snapshot-v4`. Ao mapear LID para telefone, a contagem/marcação com atualização mais recente prevalece, inclusive zero, evitando ressuscitar contador antigo; não soma as duas representações do mesmo chat.
9. **Leitura no celular/WhatsApp Web:** além dos estados de chat, `read-sync.ts` consome `messages.update` com status `READ` e chave recebida (`fromMe=false`). Em grupos, consome `message-receipt.update` com `readTimestamp` somente quando o participante corresponde ao telefone ou LID da própria conta; leitura por outro participante e recibos apenas de entrega não alteram o contador. Exige mensagem recebida armazenada na mesma sessão/conversa, aceitando o LID original/telefone canônico, inclusive referência revogada. Guarda `READ` no raw das recebidas até a referência, usando timestamp original e ordem de inserção para desempatar mensagens do mesmo segundo; não troca o horário do conteúdo pelo horário do recibo. Reduz a quantidade conhecida no máximo ao número de recebidas posteriores ainda sem leitura, sem aumentá-la ou apagar essas posteriores. Recibos repetidos são ignorados; sincronizar/editar novamente o conteúdo preserva o status de leitura já salvo. A marcação manual posterior continua dependendo do evento explícito de estado do chat. A lista reflete a redução no próximo polling de cinco segundos, inclusive no Backup, sem abrir a conversa no CRM ou enviar novos recibos. Mensagem ausente, sessão/chat diferente, envio próprio ou recibo não qualificável são ignorados; eventos de chat continuam reconciliando o agregado. Desconectado, depende da retomada da sincronização; recibos descartados antes desta correção não são reconstruídos retroativamente. Não há operação iniciada pelo navegador a cancelar nem alteração dos endpoints/payloads existentes.

## 13. Envio e ações de mensagens

Fontes: [message-composer.tsx](../apps/web/src/features/whatsapp/message-composer.tsx), [message-actions-menu.tsx](../apps/web/src/features/whatsapp/message-actions-menu.tsx), [forward-message-modal.tsx](../apps/web/src/features/whatsapp/forward-message-modal.tsx), [delete-message-modal.tsx](../apps/web/src/features/whatsapp/delete-message-modal.tsx), [WhatsAppController.cs](../apps/api/Features/WhatsApp/WhatsAppController.cs), [schemas.ts](../apps/whatsapp/src/messaging/schemas.ts), [send.ts](../apps/whatsapp/src/messaging/send.ts).

### 13.1 Regra aplicada antes de enviar/editar/reagir/encaminhar/excluir

API `EnsureCanMessage(chatId)`:

1. JID precisa terminar em @s.whatsapp.net; extrai número e normaliza telefone.
2. Busca leads desse telefone no escopo. Qualquer um com Não Enviar Mais → `403`.
3. Se existem leads, exige que pelo menos um tenha CurrentSellerId igual ao usuário → `403` caso contrário, inclusive admin.
4. Se não há leads no escopo com esse telefone, deixa prosseguir. Isso permite atender número não cadastrado.
5. Serviço restringe JID a 12–15 dígitos para envio/reação/encaminhamento/exclusão. Operações remotas exigem connectedSocket; exceção: excluir somente do CRM não precisa socket.

Essa mesma regra significa que um contato bloqueado ou que mudou de carteira também pode impedir edição, reação e exclusão local. Não há permissão administrativa especial para essas ações.

### 13.2 Texto, enviar e responder

1. Usuário escreve → Enviar ou Enter; Shift+Enter mantém quebra de linha. Front impede envio vazio/gravação ativa e desabilita botão durante envio.
2. `POST /api/whatsapp/send`:

```json
{
  "chatId": "5551999999999@s.whatsapp.net",
  "text": "Olá! Vamos conversar?",
  "attachments": [],
  "contact": null,
  "replyTo": null
}
```

3. API aplica regra 13.1 e DTO (texto até 10.000). Aceita `attachments` com até dez anexos ou o campo legado `attachment`, sem combinar ambos preenchidos; limita a soma de base64 a 22.400.000 caracteres. Serviço repete as validações e exige ao menos texto não vazio/anexo/contato; contato não pode coexistir com texto/anexos.
4. Serviço monta conteúdo Baileys. ReplyTo informado → recupera mensagem raw da sessão e exige mesmo chat por remoteJid/remoteJidAlt; inválido → `400`.
5. `socket.sendMessage` precisa retornar key.id; salva cada resultado em messages/chats. Formato legado/texto/contato → `{id,sent:true}`. Array de anexos → envia um por vez, preservando ordem, e responde `{id,ids,sent:true,sentAttachments,textSent}`; `id` é a última confirmação. Valida o conteúdo/tamanho de todos os arquivos e a soma binária até 16 MiB antes do primeiro envio. Aplica texto como legenda apenas ao primeiro arquivo que a suporta (inclusive áudio/figurinha enviado como documento); se todos forem áudio/figurinha, envia texto separado uma única vez ao final. `replyTo` acompanha somente o primeiro arquivo. Não transforma múltiplos arquivos em um único balão remoto/álbum: cada arquivo é uma mensagem física do WhatsApp.
6. Front bloqueia Enviar durante leitura dos arquivos/envio e limpa texto/anexos/contato/reply/edit após sucesso, recarregando mensagens. Antes da primeira confirmação, falha conserva composição e segue o erro HTTP habitual. Falha depois de uma ou mais confirmações retorna `200` com `{sent:false,id,ids,sentAttachments,textSent,error}` e interrompe os restantes; não significa sucesso integral. API preserva esse resultado. Front retira somente os anexos confirmados, limpa texto apenas se confirmado, limpa a resposta já utilizada, mantém os pendentes e mostra quantos foram confirmados com orientação para conferir o histórico. Não reenvia automaticamente. Uma desconexão/timeout sem retorno pode deixar confirmação remota incerta; nesse caso conserva o rascunho, sem rollback/idempotência. Retornar id confirma aceitação pela integração, não leitura do destinatário.
7. “Responder” no menu seleciona mensagem e mostra banner local; enviar usa mesmo endpoint com replyTo. Cancelar seleção limpa banner sem endpoint. O raw preserva o contexto e a listagem renderiza o bloco da mensagem citada conforme 12.3, tanto para respostas enviadas pelo CRM quanto recebidas/sincronizadas do WhatsApp.

### 13.3 Editar

1. Menu Editar aparece para mensagem própria e kind=text → compositor preenchido; seleção de resposta é limpa.
2. Salvar → `PUT /api/whatsapp/messages/{id}` com `{chatId,text}`.
3. API aplica regra 13.1; serviço exige mensagem raw própria no chat (`403`), texto com 1–10.000 caracteres e conexão.
4. Envia `{text,edit:previous.key}`; após a chamada do socket resolver sem exceção, salva o texto novo e `crmMetadata.edited=true`, preservando marcas conhecidas, o contextInfo anterior (citação/encaminhamento) e `messageContextInfo.messageSecret` quando presentes → `{edited:true}`. Registra `editedAt` em milissegundos para não reaplicar revisão criptografada anterior. Usa extendedTextMessage quando precisa conservar contexto; caso contrário mantém conversation=text. Não marca a original antes do retorno do socket; falha mantém conteúdo/indicadores anteriores.
5. Front limpa edição e reload, mostrando “Editada” conforme 12.3. Cancelar só limpa estado, sem marcar a mensagem. Não existe validação local de janela temporal para edição; protocolo externo pode rejeitar.

### 13.4 Reagir e remover reação

Menu → Reagir → escolha entre 👍 ❤️ 😂 😮 😢 🙏. Selecionar a própria reação atual envia emoji vazio para removê-la.

`POST /api/whatsapp/messages/{id}/react` com `{chatId,emoji}` → regra 13.1 → Zod aceita apenas esses emojis ou "" → busca mensagem do chat (`404`) → socket envia react com key original → exige id e salva reação → `{reacted:true}` → reload. Reações no SQLite são únicas por user/message/sender, sem criar balão adicional.

### 13.5 Encaminhar

1. Menu Encaminhar abre modal; busca local nas conversas individuais conhecidas, sem endpoint de candidatos.
2. Clique no destino → `POST /api/whatsapp/messages/{idOriginal}/forward` com `{chatId:jidDestino}`.
3. API verifica elegibilidade do **destino**; serviço procura mensagem original por user/id (`404`), envia `{forward:previous,force:true}` ao destino, exige id e persiste → `{id,forwarded:true}`. O contexto de encaminhamento retornado pelo Baileys é reconhecido na listagem e preservado no raw conforme 12.3; o rótulo não depende do nome/texto da mensagem ou de inferência pela sua origem.
4. Front notifica, fecha modal; se destino é conversa aberta, recarrega mensagens; lista de chats atualiza pelo polling. Falha mantém modal/erro. Não permite escolher telefone novo nesse modal, apenas chats listados.

### 13.6 Excluir para mim ou para todos

1. Menu Excluir → modal com Cancelar/Excluir para mim e, quando `canDeleteForEveryone`, Excluir para todos.
2. `DELETE /api/whatsapp/messages/{id}` tem **corpo JSON** `{chatId,forEveryone:false}` ou true; API aplica regra 13.1 e encaminha DELETE ao serviço.
3. Para mim: verifica user/id/chat, remove messages/reactions e atualiza prévia/data do chat conforme última mensagem restante → `{deleted:true,forEveryone:false}`. Não chama socket e não exclui no celular.
4. Para todos: exige mensagem própria (`403`), mesma conversa (`404`) e timestamp válido, não futuro, idade **menor que dois dias** (`400` se expirou).
5. Envia delete ao socket; marca localmente como deleted, texto “Mensagem apagada”, remove conteúdo/anexos/reações mantendo chave/timestamp; depois exige confirmação key.id → `{requested:true,forEveryone:true}`.
6. Front atualiza mensagens antigas em memória, limpa seleção da mensagem e reload; exibe aviso de apagada para todos. Em falha, modal fica aberto com erro.
7. Não é transação com WhatsApp: marca local precede checagem final do id; confirmação ausente pode deixar indicação local apesar de erro. Cancelamento local da interface não desfaz solicitação já enviada.
8. Balão já apagado ainda pode ser excluído para mim. Exclusão local não cria marcador de supressão: uma futura sincronização do mesmo conteúdo pode reinseri-lo.

## 14. Anexos, áudio, figurinhas e contatos

Fontes: [attachment.tsx](../apps/web/src/features/whatsapp/attachment.tsx), [composer-attachment-menu.tsx](../apps/web/src/features/whatsapp/composer-attachment-menu.tsx), [voice-recorder.tsx](../apps/web/src/features/whatsapp/voice-recorder.tsx), [composer-emoji-picker.tsx](../apps/web/src/features/whatsapp/composer-emoji-picker.tsx), [composer-sticker-picker.tsx](../apps/web/src/features/whatsapp/composer-sticker-picker.tsx), [contact-picker.tsx](../apps/web/src/features/whatsapp/contact-picker.tsx), [message-text.tsx](../apps/web/src/features/whatsapp/message-text.tsx), [message-phones.ts](../apps/web/src/lib/message-phones.ts), [message-attachment.tsx](../apps/web/src/features/whatsapp/message-attachment.tsx), [voice-note.ts](../apps/whatsapp/src/messaging/voice-note.ts).

### 14.1 Escolher ou colar arquivo e enviar

1. Menu “Adicionar à mensagem” → Documento/Fotos e vídeos/Áudio abre seletor local com seleção múltipla. Sem arquivo, não acontece nada. Cada mensagem aceita até dez anexos; novas seleções/colagens acrescentam aos anteriores, com remoção individual. O seletor dos Disparos permanece disponível mesmo com anexos adicionados.
2. `readAttachments` lê o lote na ordem usando FileReader/Data URL, guardando base64 sem prefixo; só acrescenta o lote se todos forem lidos. Rejeita lote acima de dez arquivos ou 16 MiB antes da leitura; ao concluir, `mergeAttachments` considera anexos anteriores e valida novamente quantidade e soma de base64. Erro de leitura/tamanho/quantidade conserva os anexos e texto anteriores, sem anexação parcial. Selecionar arquivos substitui contato; remover anexo é local. Leitura pendente bloqueia Enviar/Preparar disparo; texto e outras mensagens podem continuar sendo editados. Documento mantém `asDocument:true` em todos os arquivos selecionados por esse menu.
3. Envia `/api/whatsapp/send` com:

```json
{
  "chatId": "5551999999999@s.whatsapp.net",
  "text": "Segue o material",
  "attachments": [{ "name": "material.pdf", "mime": "application/pdf", "data": "BASE64", "voiceNote": false, "asDocument": true }, { "name": "foto.png", "mime": "image/png", "data": "BASE64" }]
}
```

4. Serviço valida nome 1–200, MIME até 120, base64 até 22.400.000 caracteres; decodifica e exige conteúdo não vazio e até 16 MiB.
5. asDocument=true → documento mesmo para imagem/áudio; sem flag, image/webp → sticker, image/* → image, video/* → video, audio/* → audio, demais → document.
6. Texto é caption em imagem/vídeo/documento. Sticker é sem legenda. Áudio não aceita caption: serviço envia áudio, persiste, depois envia texto em **segunda mensagem** quando existe.
7. Se áudio foi enviado e segundo texto falha, endpoint retorna erro, mas áudio já permanece enviado/persistido. Novo submit pode duplicar áudio; não há chave de idempotência.
8. **Colar no compositor:** `onPaste` no formulário do chat e em cada editor de mensagem dos Disparos usa `pasteAttachment` de `attachment.tsx`. Se `clipboardData.files` estiver vazio, mantém a colagem normal de texto, sem ler a área de transferência por permissão adicional. Havendo arquivos, impede a inserção do texto/HTML alternativo e encaminha todos ao mesmo leitor múltiplo do seletor, preservando a ordem. Vale para arquivos efetivamente disponibilizados pelo navegador no evento de colagem, incluindo imagens copiadas/capturas; copiar somente caminho/link não cria anexo. MIME vazio usa o fallback existente (WebP pela extensão ou application/octet-stream). No chat, ignora anexação por colagem durante envio, gravação ou edição de texto. Após leitura bem-sucedida acrescenta arquivos, limpa contato e preserva texto, exceto quando há somente uma figurinha (limpa/desabilita texto). Múltiplos anexos, inclusive figurinhas, permitem texto; imagem/vídeo/documento recebem a legenda uma única vez conforme 13.2. Mostra nomes com remoção e miniaturas das imagens que não sejam documento. Colar/remover somente altera o rascunho; não chama API nem envia ao WhatsApp. Enviar continua sendo ação explícita; sair da conversa/página descarta o rascunho. Backup não tem compositor e não cola anexos.

### 14.2 Gravar voz, parar e descartar

1. Ícone microfone aparece quando não há texto/anexo/contato ou já está gravando. Solicita `getUserMedia({audio:true})`; indisponibilidade/navegador sem suporte/permissão negada → erro local, sem API.
2. MediaRecorder escolhe primeiro MIME suportado entre webm/opus, ogg/opus, mp4; coleta chunks a cada 250 ms. Timer visual de 1 s; limite automático de cinco minutos.
3. Parar → fecha tracks, monta Blob, valida não vazio/até 16 MiB → FileReader → attachment `{name:'Mensagem de voz',mime,data,voiceNote:true}` → prévia `<audio>` local.
4. Descartar ou desmontar → marca descarte, para gravação/tracks e não gera anexo. Durante gravação impede envio.
5. Enviar → mesmo endpoint; Zod exige áudio e voiceNote incompatível com asDocument.
6. Serviço converte com ffmpeg-static para Ogg/Opus mono a 32 kbps (timeout 30 s, saída até 16 MiB); falha de conversão → erro. Envia áudio com `ptt:true` e MIME audio/ogg; codecs=opus → persistência/retorno normal.

### 14.3 Emoji e figurinhas

- Emoji: abre picker em português com busca/recentes; insere símbolo na seleção/cursor respeitando maxLength. Não chama back até envio do texto. Funciona também na edição; é desabilitado para contato/sticker/gravação/busy.
- Figurinhas recentes: abrir aba → `GET /api/whatsapp/stickers` → serviço procura 120 mensagens sticker da sessão, exclui Lottie, deduplica SHA256 e devolve até trinta `{id,label}`.
- Front busca bytes em `/api/whatsapp/media/{id}` em grupos de quatro requisições; mídia indisponível deixa tile desabilitado e não impede demais. Selecionar usa dados do arquivo como novo attachment image/webp e limpa texto/contato.
- “Criar”: WebP é lido diretamente; PNG/JPEG até 16 MiB vira canvas transparente 512×512, escala proporcional centralizada, exporta WebP qualidade 0,85; formato inválido/conversão falha → erro local.
- Selecionar/criar apenas prepara anexo. Enviar usa `/whatsapp/send`; não existe biblioteca independente de stickers favoritos nem endpoint de geração. Recentes aparecem após persistir mensagens sticker.

### 14.4 Enviar cartão de contato

1. Menu Contato → modal com busca local nas conversas individuais 12–15 dígitos (até trinta resultados) ou formulário nome/número.
2. Manual exige nome não vazio até 120 e telefone 12–15 dígitos após remoção de símbolos. Seleção limpa texto/anexo e desabilita texto no compositor.
3. Submit da mensagem → `/api/whatsapp/send` com `contact:{name,phone}`, sem texto/anexo. Serviço valida exclusividade, monta vCard 3.0 escapando nome e telefone waid, envia contacts via socket, salva → retorno normal.
4. Recebimento do cartão → serviço extrai displayName/FN e waid/TEL do raw; histórico renderiza card, foto e botão Conversar quando telefone válido. Cartão não cria lead automaticamente.

### 14.5 Conversar com número recebido ou detectado em texto; copiar

1. Após separar os trechos de formatação (12.3), o texto comum de cada trecho é analisado localmente: reconhece candidatos de 10–15 dígitos fora de palavras, com formatos de telefone; sem + e até onze dígitos acrescenta DDI 55. Números dentro de negrito, itálico e tachado mantêm as ações; trechos de código são literais e não criam botões de telefone.
2. Clique no número abre menu com Copiar e, no atendimento, Conversar. Copiar usa clipboard `+numero`; falha gera erro, sem endpoint.
3. Card recebido → Conversar usa o mesmo callback que Conversar no número do texto.
4. `POST /api/whatsapp/resolve-phone` com `{phone:digitos}` → serviço consulta variantes via socket; `null` mostra número não encontrado; desconectado/falha mostra erro.
5. Resolução exata → seleciona chat existente ou provisório. Variante → modal de confirmação; cancelar não muda chat; aceitar seleciona chat variante. Esse callback não altera telefone de um lead, ao contrário da seção 7.1.
6. Backup mantém cópia de número, mas não oferece ações de iniciar conversa pelo texto/card.

### 14.6 Prévia, ampliação e download de mídia recebida

1. Histórico só traz metadados. Image/sticker/video/audio começam a carregar quando IntersectionObserver os detecta próximos da área de mensagens (margem 300 px).
2. `GET /api/whatsapp/media/{id}[?userId=...]` → HistoryUser → serviço procura raw da sessão (`404`), verifica anexo (`400`) e usa a cópia local válida quando disponível. Sem cópia válida, baixa stream via downloadMediaMessage, com reuploadRequest do socket conectado da origem, conforme 7.
3. Limita bytes baixados a 16 MiB (`413` ao exceder) → `{data:base64,mime,name}`; front converte a Blob e ObjectURL.
4. Imagem: thumbnail real + clique amplia; sticker: prévia; vídeo/áudio: controles nativos. PDF pode usar jpegThumbnail inline e ampliar em iframe; documentos mostram nome/tipo/tamanho/páginas e botão de download.
5. Download usa mídia já carregada ou faz GET sob demanda, cria link com download=nome. URLs temporárias são revogadas ao desmontar ou depois do download.
6. Falha de prévia oferece tentar novamente; falha de download/ampliação vai para erro da conversa. Sem thumbnail PDF, o caminho de download continua disponível; o overlay de abertura no card PDF é condicionado à thumbnail.
7. [media.ts](../apps/whatsapp/src/messaging/media.ts) consulta primeiro `media_cache` pelo usuário/ID, exigindo que a mensagem original ainda exista e tenha anexo. Uma cópia dentro da política de 10.4 é entregue mesmo com sessão desconectada; nunca usa cache de outra sessão. Sem cópia válida, mantém o download via WhatsApp, com limite de 16 MiB e sinal de timeout de trinta segundos. Download concluído tenta guardar os bytes em SQLite conforme prazo/limite de limpeza; falha apenas da gravação do cache é avisada no log e não invalida a mídia já baixada. Falta da mensagem continua `404`; falhas externas/conexão seguem o erro da integração. Histórico antigo pode existir sem cópia local e sem mídia disponível no WhatsApp.
8. [send.ts](../apps/whatsapp/src/messaging/send.ts) guarda os bytes de novos anexos enviados após confirmação e persistência da mensagem, incluindo cada arquivo dos lotes/disparos e o áudio convertido quando voiceNote. Não exige outro download para arquivá-los; falha apenas da cópia local não transforma envio já confirmado em falha para retry. Remover a mensagem localmente ou receber revogação remove seu cache; limpeza de mídia de 10.4 preserva a mensagem.
9. Eventos novos `messages.upsert` de tipo `notify`, inclusive de dispositivos da própria conta, tentam baixar anexos em segundo plano sem marcar leitura. Fila somente em memória, até cem chaves pendentes e dois downloads simultâneos; falha registra aviso e não bloqueia recebimento/histórico. Não baixa em massa `messaging-history.set` ou upserts de histórico; abrir uma mídia antiga faz a tentativa sob demanda. Reinício/encerramento descarta pendências; fila cheia também deixa a mídia para a tentativa na visualização. Não garante recuperar mídias já expiradas no WhatsApp. Imagens, vídeos, áudios, documentos e figurinhas usam o mesmo armazenamento.

## 15. Recebimento e sincronização automática do WhatsApp

Fontes: [manager.ts](../apps/whatsapp/src/sessions/manager.ts), [read-sync.ts](../apps/whatsapp/src/sessions/read-sync.ts), [messages.ts](../apps/whatsapp/src/storage/messages.ts), [contacts.ts](../apps/whatsapp/src/storage/contacts.ts), [chat-states.ts](../apps/whatsapp/src/storage/chat-states.ts).

Esses fluxos são originados por eventos Baileys, sem clique e sem POST do navegador.

| Evento | Tratamento/persistência | Resultado visto no app |
| --- | --- | --- |
| `messages.upsert` | saveMessage para cada item; tipo notify agenda arquivamento de anexo conforme 14.6 | Próximo polling exibe novo balão/prévia; arquivo local pode ficar disponível após download |
| `messaging-history.set` | Salva mensagens, contatos, estados/contagens completas e nomes dos chats | Histórico parcial e metadados sincronizados |
| `chats.upsert` / `chats.update` | Salva archived/pinned e contagem/marcação de não lidas quando informados; update positivo soma delta | Próximo GET atualiza arquivadas/fixadas e indicador de não lidas |
| `contacts.upsert` / `contacts.update` | Salva nome por prioridade e IDs phone/lid | Próximo GET exibe nome mais adequado |
| `groups.upsert` / `groups.update` | Persiste subject como nome de conversa | Título de grupo, sem envio no CRM |
| `messages.update` com conteúdo | Mescla update com raw anterior e salva | Conteúdo editado atualizado |
| `messages.update` REVOKE | Marca deleted e remove conteúdo/reação | Balão Mensagem apagada |
| `messages.update` READ / `message-receipt.update` da própria conta | Reconcilia recebidas lidas em outro dispositivo e reduz contador, preservando posteriores e ignorando duplicatas conforme 12.6 | Próximo polling retira/reduz o contador sem abrir a conversa |
| `messages.reaction` | Upsert/delete por remetente | Atualiza chips de reação |
| `messages.delete` com keys | Remove mensagem/reação local por chave | Mensagem sai do histórico |

### 15.1 Caminhos dentro de saveMessage

1. Resolve o chat pelo `remoteJid` original; somente para conversas individuais `@lid` usa `remoteJidAlt` com `@s.whatsapp.net`. Status (`remoteJid='status@broadcast'`) são descartados mesmo com número alternativo do autor, antes de salvar mensagem, reação, nome de perfil ou prévia. Grupos mantêm o JID de grupo. Descarta também mensagens sem chat/id/conteúdo. Respostas a Status cujo chat original é uma conversa individual continuam sendo mensagens reais, mesmo com referência ao Status no contexto citado. Eventos ao vivo e sincronização de histórico usam a mesma regra, sem alteração de endpoints/payloads na API/frontend.
2. Normaliza envelopes Baileys. ReactionMessage atualiza reação e termina; protocolMessage.editedMessage atualiza original do mesmo chat e registra a marca de edição; updates nativos com editedMessage também são reconhecidos. REVOKE marca deleted; outros protocolos/distribuição de chave não geram balões.
3. Classifica conteúdo, extrai texto/caption/nome de documento/card; tipo não suportado pode cair em “Mensagem não suportada”. Timestamp fica em milissegundos.
4. Incoming individual salva pushName; incoming de grupo salva nome do remetente sem substituir título do grupo.
5. INSERT/upsert por `(user_id,id)` atualiza text/kind/raw; registro deleted não é sobrescrito por ressincronização. Atualiza chats last_text/updated_at somente respeitando data do evento, evitando que histórico mais antigo substitua prévia mais nova.
6. Nome no storage: conversationName de grupo prioridade 5, contato salvo 4, metadado de conversa individual/verifiedName 3, notify 2, username/pushName 1. Nome explícito de agenda de contato individual corrige antigas prioridades 5 de metadados conforme 7.4. API ainda sobrepõe nome do lead vinculado. Grupos exigem nome de conversa com prioridade 5 para usar título.
7. Reação recebida sem mensagem alvo armazenada é ignorada; não há buffer para reaplicá-la posteriormente.
8. Recibos de leitura de mensagens recebidas são tratados separadamente por `read-sync.ts` mesmo sem conteúdo no update; o status interno salvo é preservado quando saveMessage recebe novamente o conteúdo. Não exibe recibos individuais nem persiste estados de entrega/leitura das mensagens enviadas a partir desses updates. O estado agregado de não lidas combina eventos de chat e reconciliação dos recibos da própria conta; a seleção no atendimento pode enviar confirmação de leitura conforme 12.6.
9. **Edição criptografada:** [encrypted-edits.ts](../apps/whatsapp/src/storage/encrypted-edits.ts) intercepta `secretEncryptedMessage` cujo `secretEncType` é MESSAGE_EDIT, incluindo valores serializados pelo protobuf no histórico. O evento fica em `pending_message_edits` por sessão/chat/ID/alvo, sem criar mensagem “Mensagem não suportada” nem substituir a prévia pelo envelope. Consulta a original somente no usuário/chat de origem e exige autoria/direção compatíveis. Usa a chave original de 32 bytes, identidades PN/LID normalizadas e mapeamentos locais confiáveis para autenticar/decriptar AES-GCM; o payload precisa conter um protocolo MESSAGE_EDIT com alvo consistente. Não usa texto presumido nem aplica edição de outro participante/conversa/sessão, cifra adulterada ou payload inválido. Referências de protocolo: [Baileys PR 2743](https://github.com/WhiskeySockets/Baileys/pull/2743), [derivação e autenticação de edits](https://raw.githubusercontent.com/maciej/baileys/baileys-message-edits/src/Utils/decrypt-message-edit.ts) e [msgsecret do whatsmeow](https://github.com/tulir/whatsmeow/blob/main/msgsecret.go).
10. Sucesso atualiza o ID original, preservando chave/autor/timestamp de criação e segredo para próximas edições, marca edited e registra a revisão em `crmMetadata.editedAt`; não adiciona um segundo balão. Revisão já aplicada/repetida ou anterior não restaura texto antigo; fila é retirada após confirmação local. Snapshot comum da original sem metadado de edição não substitui o conteúdo de uma revisão já confirmada com editedAt; ainda pode acrescentar um segredo que faltava. Falta da original, segredo, autoria identificável ou autenticação válida mantém o evento pendente e o texto anterior, sem interromper o histórico. Salvar/ressincronizar a original tenta a fila novamente; segredo conhecido é preservado se um snapshot posterior o omitir. Original revogada não recebe edição. Não há requisição de mídia/histórico, confirmação de leitura ou mensagem enviada automaticamente para tentar recuperar uma chave ausente; um segredo já descartado não pode ser reconstruído do ciphertext. O usuário pode continuar usando o último conteúdo confirmado; dados que cheguem depois pela sincronização normal podem permitir nova tentativa.
11. Na inicialização, `reconcileEncryptedEdits` transfere os antigos registros “Mensagem não suportada” reconhecidos como MESSAGE_EDIT para a fila e os retira do histórico, conservando o envelope pendente quando não recuperável. Mensagens não suportadas de outros tipos permanecem. Reaplica revisões recuperáveis, recalcula a prévia/data do chat ao remover o balão indevido e retoma pendências existentes. A identificação é pelo tipo protobuf, não apenas pelo texto exibido. Repetir a inicialização não duplica eventos/revisões; polling/reabrir a conversa reflete o resultado. Páginas antigas já carregadas em memória seguem a limitação existente de recarga da seção 19. A fila conserva os dados necessários à tentativa posterior sem modificar a mensagem original quando faltam chaves.
12. [patch-baileys.mjs](../scripts/patch-baileys.mjs) é executado pelo postinstall do repositório para a dependência fixada 7.0.0-rc14: preserva o messageSecret externo ao desembrulhar deviceSentMessage de outros dispositivos da mesma conta e exclui envelopes MESSAGE_EDIT da contagem de novas mensagens/unread do Baileys. É idempotente e interrompe a instalação se a versão/trecho esperado mudar, exigindo revisar a compatibilidade antes de atualizar a dependência. Os Dockerfiles web/WhatsApp copiam o script antes de npm ci; a imagem do serviço herda o node_modules corrigido. A aplicação trata a decriptação/fila, sem trocar a versão da biblioteca ou depender de código de um branch remoto na instalação. Não corrige contagens históricas estimando quantos eventos já haviam sido lidos.

### 15.2 Correção local da Baileys: origem e manutenção

**Situação conferida em 27/10/2026:** a [PR #2743 — fix(messages): decrypt encrypted message edits](https://github.com/WhiskeySockets/Baileys/pull/2743), de maciej, foi aberta em **31/07/2026** (88 dias antes da conferência) e continuava **aberta, sem merge**. A versão mais recente publicada de `@whiskeysockets/baileys` era **7.0.0-rc14**, de **29/07/2026**, anterior à PR e já fixada no [package.json do serviço](../apps/whatsapp/package.json). Nenhuma versão oficial publicada continha esse merge nessa data. Fontes consultadas: [API da PR](https://api.github.com/repos/WhiskeySockets/Baileys/pulls/2743), [registro npm](https://registry.npmjs.org/@whiskeysockets%2fbaileys) e [release oficial rc14](https://github.com/WhiskeySockets/Baileys/releases/tag/v7.0.0-rc14). Essa informação é um registro datado; deve ser verificada novamente ao atualizar a dependência.

O [script local patch-baileys.mjs](../scripts/patch-baileys.mjs) foi escrito para este repositório e adapta duas alterações propostas nessa PR. **Ele modifica diretamente os arquivos instalados em `node_modules/@whiskeysockets/baileys`**, mantendo a versão declarada como rc14:

- `lib/Utils/decode-wa-message.js`: ao desembrulhar `deviceSentMessage`, combina o conteúdo externo com o interno e seus `messageContextInfo`, preservando o `messageSecret` necessário para edições de mensagens de outros dispositivos da própria conta. Referência: [alterações da PR](https://github.com/WhiskeySockets/Baileys/pull/2743/files), arquivo `src/Utils/decode-wa-message.ts`.
- `lib/Utils/process-message.js`: exclui `secretEncryptedMessage` do tipo `MESSAGE_EDIT` de `isRealMessage`, evitando tratá-lo como nova mensagem para a contagem de não lidas. Referência: [alterações da PR](https://github.com/WhiskeySockets/Baileys/pull/2743/files), arquivo `src/Utils/process-message.ts`.

Não foi aplicada a PR inteira nem instalado seu branch. A descriptografia, as validações de autoria/alvo, a fila de pendências, o controle de revisões e a reconciliação dos balões antigos ficam no código do CRM em [encrypted-edits.ts](../apps/whatsapp/src/storage/encrypted-edits.ts), conforme 15.1. Essa implementação usa a PR e o [protocolo msgsecret do whatsmeow](https://github.com/tulir/whatsmeow/blob/main/msgsecret.go) como referências. A dependência instalada com o patch é, portanto, uma variação local mantida pelo projeto, ainda sem essa correção incorporada oficialmente pela Baileys na data acima.

**Instalação e falhas:** o `postinstall` do [package.json raiz](../package.json) executa o script após `npm ci`/`npm install`. O script não baixa código remoto. Exige a versão exata rc14 e, em cada arquivo, aceita o resultado já aplicado ou exige uma única ocorrência do trecho original; divergência lança erro e falha a instalação. Reexecutar não duplica a alteração. As gravações são sequenciais, sem rollback: se o segundo arquivo falhar, o primeiro pode já estar corrigido; a falha não deve ser ignorada. Instalação com `--ignore-scripts` omite a correção, exigindo executar `node scripts/patch-baileys.mjs` antes de usar o serviço. Os Dockerfiles [web](../apps/web/Dockerfile) e [WhatsApp](../apps/whatsapp/Dockerfile) copiam o script antes de `npm ci`; a imagem final do WhatsApp recebe os arquivos corrigidos.

**Ao atualizar ou remover o patch:**

1. Conferir novamente a PR, as releases e o código efetivamente publicado. Verificar separadamente a preservação do segredo, a exclusão de edições da contagem de não lidas e o tratamento nativo da edição criptografada; apenas mudar o número da versão não comprova compatibilidade.
2. Revisar em conjunto a dependência, o lockfile, o script e a integração de `encrypted-edits.ts`/`messages.ts`, para evitar tratamento duplicado quando a biblioteca passar a emitir a edição já decifrada. Não apenas relaxar a trava de versão ou ignorar a falha do postinstall.
3. Quando a versão escolhida cobrir os comportamentos necessários, remover somente os patches substituídos. Se o script inteiro deixar de ser necessário, remover também seu postinstall e as cópias nos Dockerfiles, mantendo package/lockfile consistentes.
4. Validar em instalação limpa, executar `npm run test -w apps/whatsapp`, `npm run typecheck -w apps/whatsapp` e `npm run build -w apps/whatsapp`, e conferir o build das imagens afetadas. Preservar a cobertura de [encrypted-edits.test.ts](../apps/whatsapp/test/encrypted-edits.test.ts) para dispositivos vinculados, não lidas, isolamento, revisões fora de ordem e pendências, adaptando os testes à API da nova versão.

Remover o patch ou atualizar a biblioteca não recupera segredos já descartados. Edições antigas sem o segredo original continuam sujeitas à limitação descrita em 15.1.

## 16. Disparos e sequências de mensagens

Fontes: [campaigns-page.tsx](../apps/web/src/features/whatsapp/campaigns-page.tsx), [campaign-audience-filter.tsx](../apps/web/src/features/whatsapp/campaign-audience-filter.tsx), [campaign-message-sequence.tsx](../apps/web/src/features/whatsapp/campaign-message-sequence.tsx), [campaign-tracking.tsx](../apps/web/src/features/whatsapp/campaign-tracking.tsx), [WhatsAppController.cs](../apps/api/Features/WhatsApp/WhatsAppController.cs), [EligibilityController.cs](../apps/api/Features/WhatsApp/EligibilityController.cs), [worker.ts](../apps/whatsapp/src/campaigns/worker.ts), [deliver.ts](../apps/whatsapp/src/campaigns/deliver.ts), [send-to-phone.ts](../apps/whatsapp/src/campaigns/send-to-phone.ts), [schemas.ts](../apps/whatsapp/src/messaging/schemas.ts).

### 16.1 Escolher público, filtros e seleção em várias páginas

1. Entrada em `/campaigns` → monta Connection, `GET /api/groups`, lista de candidatos e histórico de campanhas. O filtro Status começa somente com “Agendar Contato” e “Stand By” selecionados, enviados desde a primeira consulta e mantidos na prévia/confirmação. Os demais filtros começam sem restrição. O usuário pode alterar/limpar os status; mudar outro filtro não restaura os status padrão. Uma nova montagem da página reaplica o padrão. O padrão é da interface, sem mudar o contrato da API para clientes que omitem status.
2. Modos Todos os contatos/Grupos. Em Grupos sem groupId, não consulta candidatos; selecionar grupo habilita a consulta.
3. `GET /api/whatsapp/campaign-recipients?page=1&pageSize=20` recebe groupId/search/createdFrom/createdTo e filtros múltiplos `statuses`, `serviceIds`, `sellerIds`, `branchIds`, `classificationIds`, além de `includeNoService`. Arrays são enviados como chaves repetidas na query (`serviceIds=1&serviceIds=2`) e como arrays JSON nos POSTs. Os campos unitários anteriores status/serviceId/sellerId/branchId/classificationId continuam aceitos: seus valores são unidos ao respectivo array e deduplicados. Array vazio/ausente e campo unitário ausente não restringem aquela dimensão. O filtro Classificação carrega `GET /api/classifications`, somente com as classificações pessoais; limpar a seleção remove o filtro. Durante carregamento/falha do catálogo, desabilita apenas esse seletor; falha mostra ErrorBox/retry e mantém os demais filtros disponíveis. Arrays de IDs com formato não numérico e booleano inválido são rejeitados com `400` pelo binding, antes da consulta.
4. API aplica sede, exclui OptOut e sedes inativas, inclusive quando esses valores são pedidos explicitamente. Vendedor pode incluir leads de **outros vendedores da mesma sede**; filtro de vendedor (unitário ou múltiplo não vazio) só admin; de sede só admin global (`403` fora dessas regras). Grupo precisa pertencer ao usuário (`404`). Dentro de cada filtro múltiplo vale qualquer opção selecionada (OU); entre dimensões, período, busca, grupo e seleção/exclusões vale a interseção (E). Classificações exigem ao menos uma marcação numa classificação selecionada pertencente ao usuário autenticado, inclusive para administradores. IDs alheios/inexistentes não concedem correspondência; misturá-los com IDs próprios conserva somente as correspondências próprias. Um lead com várias etiquetas selecionadas aparece uma única vez. A restrição é aplicada antes da paginação/contagem e também na prévia e confirmação. Sem correspondências, tabela mostra “Nenhum lead encontrado com estes filtros”.
5. Nome/telefone por substring, ordenação Name/Id → `{items:[Lead],total,page,pageSize}`. Não precisa vínculo com chat nem conversa anterior.
6. Marcar todos inclui todos os resultados em todas as páginas (`leadIds:null`); desmarcar indivíduos alimenta excludedLeadIds. Seleção manual após desmarcar todos alimenta leadIds explícitos.
7. Cada filtro múltiplo abre uma lista de checkboxes sem exigir Ctrl/Shift, mostra os nomes selecionados no botão (com tooltip do texto completo quando truncado) e tem “Limpar filtro”. A abertura é controlada por estado React; usa botão com `aria-expanded`/`aria-controls` e painel condicional, sem `<details>/<summary>` ou mudanças imperativas de `open`. Checkboxes têm nomes acessíveis explícitos. Clicar fora, perder foco para fora do controle ou usar Escape fecha a lista sem desfazer seleções; Escape retorna foco ao botão. O listener de clique externo existe somente enquanto a lista está aberta e é removido ao fechar/desmontar. Alterar modo/filtro ou limpar uma seleção limpa selected/excluded, restaura todos os contatos resultantes selecionados e volta à página 1. Mudar a seleção de sedes também limpa vendedores; o catálogo de vendedores contempla as sedes selecionadas e administradores globais sem sede, preservando o escopo do administrador logado. Busca não tem debounce nessa página.
8. Os campos “Data de cadastro · de” e “Data de cadastro · até” estão disponíveis diretamente na aba Disparos para Todos os contatos e Grupos, combinados com os demais filtros. Ambos são opcionais; limpar remove o respectivo limite. O frontend converte a data inicial para meia-noite local em UTC (`createdFrom`, inclusivo) e a final para meia-noite local do dia seguinte (`createdTo`, exclusivo), incluindo integralmente o último dia escolhido. Uma mesma data nos dois campos representa um dia completo; pode preencher só início ou só fim. A API filtra `Lead.CreatedAt` antes de contar, paginar e aplicar o limite de quinhentos destinatários. O período também integra os DTOs de prévia/confirmação; não exige criar um grupo. Datas malformadas → `400` pelo binding; início posterior ao fim → `400` com mensagem de período inválido em todas as três rotas. O frontend restringe min/max dos campos e, diante de período invertido, mostra alerta, suspende a consulta, oculta a tabela anterior, zera a seleção exibida e impede preparar o disparo. Alterar uma data usa o mesmo reset de seleção/exclusões/página descrito em 7. Sem correspondências, a lista fica vazia e o envio permanece desabilitado.
9. A opção “Sem serviço” integra o seletor Serviço e envia `includeNoService:true`. Sozinha, limita a `Lead.ServiceId == null`; com serviços selecionados, aceita esses serviços OU serviço nulo. Desmarcada e sem IDs, considera todos os serviços, incluindo contatos sem serviço. A opção não representa catálogo inativo nem string vazia. Também funciona com status, sedes, vendedores, classificações, grupo e período.

### 16.2 Preparar mensagens e prévia local

1. Começa com uma mensagem. Pode adicionar até dez, remover mantendo pelo menos uma, mover para cima/baixo e preencher texto até 10.000 e até dez anexos por mensagem. Quantidade de mensagens representa as entradas da sequência, não a soma de arquivos enviados.
2. Attachments seguem leitura base64/limite por arquivo da seção 14. Soma de base64 da sequência não pode passar 22.400.000 caracteres; limite é verificado front/API/serviço e descrito na interface como 16 MB.
3. WebP é figurinha; limpa/desabilita texto somente quando é o único anexo da mensagem. O editor informa os tokens `${PrimeiroNome}` (primeiro nome) e `${nome}` (nome completo), mantendo `{{nome}}` como alternativa compatível; o placeholder inicial usa `Olá, ${PrimeiroNome}!`. A prévia local mostra todos os anexos de cada entrada na ordem, com texto uma única vez e exemplo “Mariana Almeida”; substitui todas as ocorrências de `${PrimeiroNome}` por “Mariana” e de `${nome}`/`{{nome}}` por “Mariana Almeida”, inclusive em legendas, e inclui imagem/sticker/PDF quando aplicável. Em seguida renderiza os quatro formatos de 12.3, sem ações de telefone. Não chama back nem envia ao WhatsApp; textarea/payload mantêm os marcadores originais.
4. Define intervalSeconds 3–3600, intervalVarianceSeconds 0–1800, pauseEvery 1–500, pauseSeconds 0–3600; defaults 10/3/20/60. Variância precisa manter limite inferior de três segundos.
   - [campaign-timing.ts](../apps/web/src/features/whatsapp/campaign-timing.ts) salva somente esses quatro números no `localStorage`, chave `crm:campaign-timing:v1`, por navegador/perfil e origem do site (compartilhados pelas contas que usam essa mesma origem/perfil). Após montar a página no cliente, restaura e valida a configuração antes de habilitar sua gravação; não sobrescreve o valor salvo com os defaults durante a hidratação. Cada alteração que forme uma combinação válida é salva automaticamente, mesmo sem preparar/confirmar um disparo, com indicação “Configurações de intervalo e pausa salvas neste navegador”. Preserva a digitação temporariamente vazia/inválida na tela, mas não a grava sobre a última combinação válida. Exige quatro inteiros dentro dos limites e `intervalVarianceSeconds <= intervalSeconds - 3`; dados ausentes, JSON inválido, tipos/limites incompatíveis ou falha de leitura usam 10/3/20/60. Falha/bloqueio/falta de espaço no armazenamento não interrompe o formulário e não mostra a indicação de salvamento; a configuração digitada continua disponível para o disparo atual. Voltar à página, recarregar ou abrir outra aba restaura o último valor salvo; não sincroniza mudanças em uma aba já aberta. Limpar dados do site/perfil remove a preferência. Não salva nome, mensagem, anexos, filtros ou destinatários e não usa API, banco ou sessão do WhatsApp. Fechar/cancelar a confirmação não desfaz a preferência já salva; não altera o snapshot de uma campanha já criada, payloads, validações ou execução no servidor.
5. Cada mensagem tem botões `${PrimeiroNome}` e `${nome}` abaixo do texto. Clique insere o token na posição do cursor ou substitui somente o trecho selecionado da mensagem correspondente; devolve foco ao texto e posiciona o cursor após o token. O vínculo do campo usa o ID da mensagem, preservado ao reordenar/remover outras entradas. Não acrescenta espaços automaticamente. Inserção que ultrapassaria 10.000 caracteres exibe erro e mantém o texto; botões ficam desabilitados para figurinhas. Digitação, inserção e prévia são locais; sair sem confirmar não cria campanha nem envia conteúdo.
6. Cada editor aceita selecionar/colar vários arquivos conforme 14.1, tanto em Todos os contatos quanto Grupos. Acrescenta somente à mensagem alvo, preservando os anexos anteriores e atualizando a prévia; remoção é individual. O retorno assíncrono usa o rascunho atual pelo ID, preservando digitação/alterações nas outras mensagens e adições concorrentes; se a mensagem foi removida durante a leitura, descarta o resultado. Aplica novamente o limite total de base64 da sequência antes de gravar; ao exceder, mantém composição anterior com erro. Novos payloads usam `messages:[{text,attachments:[...]}]`, mas API/serviço/detalhes continuam aceitando `attachment` legado sem misturar ambos preenchidos na mesma entrada. Não altera filtros/público ou disparos já em execução. Histórico persistido em JSON guarda os arquivos; não há migração de banco.

### 16.3 Pré-validar e confirmar público

1. Clique “Enviar disparos” ainda **não inicia campanha**. Front rejeita mensagem vazia e monta payload:

```json
{
  "name": "Campanha de matrícula",
  "messages": [{ "text": "Olá, {{nome}}!", "attachments": [] }],
  "leadIds": null,
  "excludedLeadIds": [43],
  "groupId": null,
  "statuses": ["Agendar Contato", "Stand By"],
  "classificationIds": [],
  "serviceIds": [1, 2],
  "includeNoService": true,
  "sellerIds": [],
  "branchIds": [1, 2],
  "search": null,
  "createdFrom": "2026-10-01T03:00:00Z",
  "createdTo": "2026-10-27T03:00:00Z",
  "intervalSeconds": 10,
  "intervalVarianceSeconds": 3,
  "pauseEvery": 20,
  "pauseSeconds": 60
}
```

2. `POST /api/whatsapp/campaigns/preview` recebe contrato de público (campos de mensagem/configuração extra não são utilizados por esse endpoint). Reaplica filtros/escopo, toma até 501 resultados e exige 1–500.
3. LeadIds explícitos precisam corresponder à quantidade distinta selecionada após filtros/exclusões; mudança/ineligibilidade → `409`; zero ou mais de 500 → `400`.
4. Retorna array completo de leads; modal mostra nomes/telefones/status e permite retirar destinatários ou desmarcar tudo. Cancelar fecha modal sem campanha.
5. Confirmar exige ao menos um confirmedId → `POST /api/whatsapp/campaigns` com payload e `leadIds:confirmedIds`. API valida mensagens (1–10, conteúdo), até dez anexos por entrada, uso exclusivo de attachment/attachments, soma de todos os anexos da sequência, ranges e variância; recalcula público com mesmos filtros e seleção.
6. Mudança entre preview e confirmação pode rejeitar a criação, inclusive remoção de uma classificação filtrada ou cadastro fora do período informado: se parte dos IDs confirmados não corresponder mais ao público → `409`; público vazio → `400`. Mantém a configuração e não inicia campanha. IDs manuais e exclusões também são combinados com o período, sem permitir incluir um cadastro fora dele. Preview não testa conexão nem conteúdo pelo contrato completo; confirmação pode falhar nessas etapas posteriores. Classificação e período servem para selecionar/confirmar o público; o worker recebe somente o snapshot de destinatários e não revalida esses filtros durante a execução. Cancelar a confirmação não cria campanha; falha de validação impede chamar o serviço WhatsApp.

### 16.4 Criar campanha persistida e iniciar worker

1. API transforma leads em `recipients:[{leadId,phone,name}]`, sem aceitar livremente essa lista do navegador; envia `/sessions/{user}/campaigns` com name/messages/intervals/pauses/recipients.
2. Fastify valida Zod completo e exige sessão conectada; se outro disparo do usuário está ativo em memória ou running no banco → `409`. Usuários diferentes podem executar campanhas simultaneamente.
3. Gera UUID, grava campaigns com payload completo (incluindo base64), status running, contadores zero; grava campaign_deliveries com posição e status pending.
4. Cria AbortController e dispara run em segundo plano → retorna `{id}` imediatamente; não espera lote terminar.
5. Front notifica, fecha confirmação e remonta acompanhamento na primeira página. Falha mantém configuração; erro aparece na página (modal de confirmação não tem ErrorBox próprio).

### 16.5 Executar destinatário, sequência, variante e pausa

1. Worker percorre recipients em ordem do público (Name/Id). Antes de cada destinatário verifica AbortSignal.
2. Faz `GET /internal/eligibility?userId={user}&leadId={id}&phone={phoneOriginal}` na API CRM, com chave e timeout de dez segundos.
3. API exige chave (`401` inválida); retorna `{eligible}` verificando usuário ativo, lead existente, telefone ainda igual, status não OptOut, sede ativa e usuário na sede do lead ou admin global.
4. **Não exige CurrentSellerId igual ao usuário.** Transferir para outro vendedor da mesma sede não torna inelegível por si só. Validação é uma vez por destinatário, antes da sequência; não é repetida entre todas as mensagens.
5. eligible=false → registra skipped com motivo e avança sem mandar sequência. Falha HTTP/timeout ao verificar → erro global da campanha, interrompe avanço (status failed).
6. Elegível → `deliver` percorre messages na ordem preparada e cria uma cópia de cada mensagem com texto personalizado para o destinatário antes de chamar o envio. Substitui todas as ocorrências exatas de `${PrimeiroNome}` pela primeira parte do nome do snapshot, removendo espaços nas extremidades e separando por espaços/quebras/tabulações; preserva acentos e maiúsculas. `${nome}` e `{{nome}}` recebem o nome completo do snapshot. A substituição é literal e em uma única passagem: não executa expressões, não interpreta `$` nem expande tokens contidos no próprio nome; outros tokens ficam como digitados. Nome vazio/só espaços resulta em primeiro nome vazio; texto ausente e anexos continuam suportados. Aplica-se a todos os textos/legendas da sequência, sem alterar o modelo persistido ou reler o nome atual do CRM. O worker encaminha esse texto já personalizado a `sendMessage`; validações, falhas, intervalos e cancelamento seguem os mesmos caminhos abaixo.
7. Primeira mensagem do destinatário: tenta telefone e variantes com `onWhatsApp`; evita repetir JID resolvido já tentado. Pode tentar outra variante após falha antes de qualquer confirmação; resultado parcial de anexos é convertido em erro identificado e não tenta variantes, evitando repetir arquivos já confirmados. Primeiro sucesso completo guarda JID para mensagens seguintes desse lead e devolve telefone efetivo.
8. Variante no disparo não pede confirmação e não muda Phone/ChatId no CRM; resultado de entrega registra número efetivo. Mesmo telefone em leads de sedes diferentes pode receber mais de uma sequência; não há deduplicação por número no público.
9. Cada mensagem usa sendMessage do serviço diretamente; não passa por EnsureCanMessage da API, por isso a regra de campanha é a do eligibility.
10. Entre tentativas quando há outra mensagem/destinatário, espera inteiro aleatório entre intervalSeconds ± variância. A cada pauseEvery mensagens tentadas, soma pauseSeconds. Conta tentativas, inclusive falhas; skipped não aumenta esse contador.
11. Uma entrada com múltiplos anexos envia os arquivos consecutivamente e pode enviar texto separado ao final quando nenhum aceita legenda. Intervalo/pauseEvery continuam contando a entrada da sequência, não seus envios físicos internos; não há espera adicional entre arquivos da mesma entrada. Cada envio é persistido no histórico individualmente. O sinal de cancelamento é verificado antes de cada arquivo/texto; um envio já iniciado pode concluir. Falha parcial interrompe arquivos/entradas seguintes do destinatário, registra failed com contagem confirmada e prossegue para o próximo contato; não há rollback nem retry automático.
12. Falha de mensagem registra destinatário failed com “Mensagem N de total: motivo”, interrompe o restante da sequência dele, espera quando há próximo destinatário e continua lote. Mensagens anteriores desse contato não são desfeitas.
13. Sequência completa → destinatário sent; armazena id da última mensagem principal retornada e telefone efetivo, incrementa contador uma vez por destinatário. Não há registro separado de entrega para cada mensagem da sequência.
14. Ao terminar iteração → completed mesmo quando alguns destinatários failed/skipped. Failed no nível de campanha é reservado às falhas globais fora do tratamento individual.

### 16.6 Acompanhar histórico, progresso e detalhes

- `GET /api/whatsapp/campaigns?page=1&pageSize=6` a cada quatro segundos → campanhas do usuário, mais recentes primeiro, `{items,total,page,pageSize}`. Item: id/name/total/messageCount/status/sent/failed/skipped/error/createdAt.
- Front calcula processados=sent+failed+skipped, percentual e pendentes=total-processados; estados exibidos running/completed/cancelled/failed/interrupted. Não há métricas de lido/entregue ao aparelho.
- “Ver detalhes” → `GET /api/whatsapp/campaigns/{id}/messages` uma vez: sequência original com arrays de anexos/base64, exibidos na ordem por mensagem; payload legado de texto/anexo único tem fallback. Conteúdo salvo renderiza os quatro formatos de texto de 12.3 na prévia e não é editável/reexecutado; não substitui os tokens de personalização do modelo salvo.
- Detalhes também montam `GET /api/whatsapp/campaigns/{id}/deliveries?page=1&pageSize=10[&status=sent|skipped|failed|pending]` a cada quatro segundos.
- Serviço valida dono (`404` se ausente/alheia), pagina por posição, retorna `{leadId,name,phone,status,error,externalMessageId,updatedAt}`. Mudar filtro de resultado redefine página; fechar detalhes desmonta polling.
- Se a limpeza de 10.4 retirou um anexo, detalhes recebem seus metadados com `data:""` e `removed:true`; `CampaignAttachmentPreview` mostra o nome e “Arquivo removido pela limpeza de mídia”, sem renderizar imagem/iframe vazio. O modelo textual e resultados continuam disponíveis. Campanhas antigas não são reexecutadas automaticamente.
- Falha de listagem/detalhes tem ErrorBox/retry; lista vazia tem Empty. Nenhum endpoint expõe campanhas de outro usuário por parâmetro administrativo.

### 16.7 Cancelar, reiniciar e falhas parciais

1. Campanha running → “Cancelar disparo” → `POST /api/whatsapp/campaigns/{id}/cancel` sem corpo, sem confirm adicional.
2. Serviço verifica dono (`404`), aborta controller se existe e muda running para cancelled → `{cancelled:true}` → front reload.
3. AbortSignal interrompe validação/espera e impede próximos envios nos pontos checados. Envio Baileys já iniciado não é revertido e pode terminar/persistir antes de cancelamento surtir efeito.
4. Já enviados ficam no histórico; destinatários ainda não processados continuam pending. Falha parcial de sequência não aparece como contador por mensagem.
5. Cancelar campanha já concluída pode retornar cancelled:true sem mudar seu estado, pois UPDATE exige running.
6. Não existem pausa manual/retomar/retry de destinatário/reagendamento; pausas são automáticas. Reiniciar serviço marca antigas running/queued como interrupted e não retoma, evitando reenvio automático após confirmação incerta.

## 17. Histórico e backup

Fontes: [backup/page.tsx](../apps/web/src/app/%28workspace%29/backup/page.tsx), [chat-page.tsx](../apps/web/src/features/whatsapp/chat-page.tsx), [conversation.tsx](../apps/web/src/features/whatsapp/conversation.tsx), `HistoryUser` em [WhatsAppController.cs](../apps/api/Features/WhatsApp/WhatsAppController.cs).

1. `/backup` usa `ChatPage backup`: lista de chats a cada cinco segundos; selecionar conversa carrega mensagens uma vez e habilita anteriores por cursor, sem compositor/menu de edição/reação/encaminhamento/exclusão.
2. Pessoal usa os mesmos endpoints sem userId. Admin escolhe usuário no catálogo → limpa chat selecionado → refaz chats com userId; mensagens/fotos/mídia propagam a mesma sessão de origem.
3. `HistoryUser`: ID omitido/próprio → usuário atual; ID de terceiro → exige admin e usuário existente na sede do admin ou admin global. Fora da regra → `403`.
4. Leitura do texto vem do SQLite, mesmo sem origem conectada. Fotos podem funcionar via cache; mídia com cópia local válida também funciona desconectada conforme 14.6. Sem essa cópia, depende do socket da **origem** e da disponibilidade externa; a consulta administrativa preserva a sessão de origem no acesso ao cache.
5. O backup é uma tela de consulta ao histórico persistido: não cria arquivo de exportação, não importa/restaura banco e não garante sincronizar todo histórico do celular.
6. Consulta administrativa permite ver chats da sessão autorizada, mesmo quando uma conversa não está vinculada a lead; sobreposição de nomes de lead continua limitada pelo escopo CRM.

## 18. Persistência, health e encerramento

Fontes: [CrmDbContext.cs](../apps/api/Infrastructure/CrmDbContext.cs), [Entities.cs](../apps/api/Domain/Entities.cs), [database.ts](../apps/whatsapp/src/storage/database.ts), [server.ts](../apps/whatsapp/src/server.ts), [compose.yaml](../compose.yaml).

- CRM: Branches, Users, Catalog, Leads, Appointments, Groups, GroupMembers, Classifications e LeadClassifications via EF/SQLite. Índices únicos Username, BranchId+Phone e ChatUserId+ChatId; chave composta ClassificationId+LeadId nos vínculos pessoais. A migração LeadClassifications cria as novas tabelas no início da API, preservando os registros existentes. Revision é concurrency token só no lead.
- Relações para sede/usuários/catálogo são restritas na exclusão. Excluir lead elimina retornos e memberships; excluir grupo elimina memberships. Não há histórico de transferências/edições por entidade.
- Unicidade de nomes em sedes, serviços/condições e grupos internos é validada pelos endpoints em transações SQLite conforme 9.3 e 10.3, sem migração nem novos índices únicos. Registros anteriores não são renomeados, mesclados ou excluídos automaticamente; duplicados antigos podem ser corrigidos renomeando para um nome disponível. Escritas diretas no banco fora desses endpoints não passam por essa validação.
- WhatsApp: auth, contacts, service_state, chats, chat_states, messages, pending_message_edits, reactions, profile_pictures, campaigns, deliveries no banco separado. Chats/mensagens/auth e fila de edições usam isolamento por user_id; campanha usa UUID + dono. A tabela de edições pendentes é acrescentada por CREATE TABLE IF NOT EXISTS, sem apagar mensagens/credenciais existentes; seu índice usa usuário/chat/alvo/timestamp.
- Mídia: `media_cache` guarda MIME/nome/bytes/data da mensagem por `(user_id,message_id)` e índice de idade; `media_settings` guarda a preferência global e limite já limpo, com singleton inicial desligado/30 dias. Tabelas são acrescentadas por CREATE TABLE IF NOT EXISTS e INSERT OR IGNORE, preservando dados e configurações existentes. Bytes do cache e anexos de campanhas continuam no `whatsapp.db`; backup do banco inclui essas cópias. Não há arquivos em diretório público nem URL que dispense autenticação. A limpeza libera páginas internas reutilizáveis sem executar VACUUM ou prometer redução imediata do arquivo físico.
- Agenda WhatsApp: `contact_names` é acrescentada por CREATE TABLE IF NOT EXISTS, com chave `(user_id,id)`, nome, sobrenome e snapshot do nome completo. Não altera nem apaga contatos existentes; o snapshot permite detectar nome atualizado externamente sem reutilizar uma separação antiga. O DTO de chats acrescenta `contactSaved` opcional para o frontend (ausente em serviço antigo → false), calculado sem uma consulta HTTP por conversa. Nome/sobrenome não vão para o banco de leads nem para sessões de terceiros.
- CRM e serviço têm `GET /health` → `{status:'ok'}`, sem login/chave. São checks de processo; não atestam WhatsApp conectado nem fazem validação aprofundada de dependências.
- `GET /internal/eligibility` é callback serviço→CRM; não passa pelo rewrite `/api` do navegador. Detalhes do contrato estão na seção 16.5.
- SIGTERM/SIGINT no serviço → cancela timer de retenção/pendências de download de mídia, aborta campaigns, marca sessões stopped/cancela reconexões, encerra sockets, fecha Fastify, aguarda workers e fecha banco. Campanha abortada nessa saída não é automaticamente completed; próxima inicialização marca running como interrupted.
- Chaves de proteção do cookie, bancos e credenciais precisam persistir entre reinícios; compose usa volumes. Sessão CRM, sessão WhatsApp e histórico possuem ciclos independentes.

## 19. Limites e diferenças observadas no código

Estes pontos são parte do fluxo implementado e devem ser considerados ao validar produto ou alterar funcionalidades:

1. **Campanha não segue regra de carteira individual:** vendedor pode selecionar outros vendedores da sede; worker confirma sede/status/telefone, sem igualdade de CurrentSellerId. Isso é explicitamente coberto em CampaignAudienceTests.
2. **OptOut durante sequência:** verificação ocorre antes do destinatário; mudança entre mensagens não interrompe automaticamente sua sequência atual.
3. **Abrir conversa existente não necessariamente vincula lead:** ramo exists + telefone exato retorna sem gravação; vínculo pode precisar botão específico.
4. **Transferência temporária não vence sozinha;** não há data de devolução nem job de restauração de vendedor.
5. **Dashboard contabiliza status atual por data de captação;** não é relatório de fechamento de vendas por data histórica. Agenda não segue período de indicadores.
6. **Backup é consulta;** não existe export/import/restore de histórico nem promessa de histórico integral. syncFullHistory=false.
7. **Recebimento não usa requisição periódica ao WhatsApp:** socket recebe eventos; navegador faz polling ao armazenamento.
8. **Enviar pode ter efeitos apesar de erro:** áudio seguido de texto, alternativas de campanha e confirmação incerta do protocolo não têm rollback/idempotência. Erro não prova ausência de envio.
9. **Excluir para todos é solicitação remota:** front declara mensagem apagada ao sucesso do endpoint, sem confirmação posterior de todos os aparelhos. Excluir para mim só remove do banco CRM/serviço.
10. **Grupos e catálogos não são dinâmicos:** grupo salva IDs; inativar item pode impedir salvar lead ainda referenciando esse item. Catálogo só se atualiza via Provider.refresh, não por timer.
11. **Não há flows para** recuperação de senha por e-mail, cadastro público de usuário, venda/contrato independente, upload de contrato, auditoria de status/transferência, notificação agendada de retorno, importação de leads, agendamento futuro de campanha, retomada de campanha ou envio em grupo WhatsApp. Exportação filtrada de leads/vendas para Excel está implementada em 6.9. A entidade Lead contém Contract, porém não há campo no LeadRequest, formulário ou endpoint para administrá-lo.
12. **Fixadas permanecem consulta:** o CRM permite arquivar/desarquivar (12.5) e marcar a conversa como lida ao abrir (12.6), mas não fixar/desafixar. Não há exibição persistida de recibos de entrega/leitura por mensagem.
13. **Dados antigos no front:** páginas sem polling só recarregam por ações/dependências; conflitos de revisão não refazem automaticamente GET do lead. Mensagens antigas carregadas mantêm precedência no dedupe e não são repolled pelo cursor; updates externos podem não se refletir nelas até reabrir conversa.
14. **Desconectar/logout/inativar são diferentes:** logout do CRM não desconecta WhatsApp; desconectar WhatsApp não apaga histórico; inativar usuário invalida CRM/elegibilidade, mas não encerra automaticamente socket restaurável.
15. **Limites variam por camada:** tamanho binário de anexo é 16 MiB; base64 tem teto 22.400.000 caracteres; corpo HTTP 24.000.000 bytes. Nome de contato escolhido a partir de chat também passa pela validação de 120 caracteres no serviço.

## 20. Rastreabilidade e conferência da documentação

Na correção da opção de contato ao abrir conversa pelo lead de 27/10/2026, o problema foi reproduzido no navegador integrado com Camila → Meus leads → Larissa Mendes 2 → Conversa: o ID da conversa tinha onze dígitos e o botão/rotas da agenda exigiam doze. Após alinhar as três camadas a 10–15 dígitos, passaram os 42 testes do frontend (dois novos em contact-button.test.ts), os sete de contacts.test.ts (um novo caso cobrindo os limites e preservação do ID) e os doze de WhatsAppContactTests (quatro novas variações), além das checagens de tipos e do build do serviço. Os testes de interface renderizam o botão real para o ID do caso relatado, em modos salvar/editar, e mantêm ausência em Backup/grupos/LID/IDs inválidos. Sem campanhas running/queued, os serviços foram reiniciados; os três responderam `200`. O mesmo caminho foi repetido no navegador e exibiu “Salvar contato”, abrindo Nome/Sobrenome sem erro de validação. A captura está em `output/contato-lead-larissa-corrigido.png`. O formulário não foi salvo, sem alteração de agenda real ou envio de mensagens para teste; telefone, vínculo e revisão do lead foram preservados.

Na entrega da agenda de contatos WhatsApp de 27/10/2026, passaram os 184 testes da API (oito novos em WhatsAppContactTests), os 114 do serviço (seis novos em contacts.test.ts), os 40 do frontend, as checagens de tipos dos dois projetos Node e o build do serviço. Foram exercitados conta própria mesmo com userId extra, autenticação/CSRF, dados inválidos/limites, sobrenome opcional, nomes compostos com campos preservados, confirmação remota antes de gravar, falha/desconexão/chave ausente sem sucesso local, PN/LID, atualização pelo celular, prioridade sobre nomes antigos de histórico e preservação de prévia/estado do chat. Os sockets dos testes foram simulados, sem alterar agendas ou enviar mensagens reais. Sem campanhas running/queued, o supervisor local foi reiniciado para aplicar a API nova, e API/serviço/frontend responderam `200`. No navegador integrado, foi usada uma conversa provisória sem mensagens: abrir “Salvar contato” mostrou telefone somente leitura, Nome obrigatório, Sobrenome e botão de salvar inicialmente desabilitado; preencher “Maria Clara”/“da Silva” habilitou salvar. O formulário foi cancelado, sem PUT de contato nem gravação remota. Captura em `output/contato-agenda-whatsapp.png`. A confirmação visual da gravação em um celular/conta real não foi feita nesta conferência; a implementação utiliza a função nativa da dependência, sem novo patch na Baileys. Não houve build de imagem Docker nesta entrega.

Na entrega de Mídia e armazenamento de 27/10/2026, passaram os 176 testes da API (12 novos em MediaStorageTests), os 108 do serviço (oito novos em media-storage.test.ts), os 40 do frontend (dois novos em media-settings.test.ts), as checagens de tipos dos dois projetos Node e o build do serviço. Os casos verificam administrador global/CSRF, contratos/erros, contabilização lógica/física, configuração persistida/desligada, corte exato, cache offline e isolado, mensagens/legendas/resultados preservados, formatos legados/múltiplos, campanhas ativas, prevenção de regravação após limpeza e rollback de toda a exclusão em falha. Também verificam que falha da gravação do cache não transforma um envio confirmado em erro para retry. Não havia campanhas running/queued antes de alterar/reiniciar o serviço local. O supervisor foi reiniciado para aplicar a API nova; API, WhatsApp e frontend responderam `200`. No navegador integrado, a página foi aberta pelo link de Configurações, mostrou uso real por categoria, manteve o prazo desligado/30 dias, habilitou a edição do prazo quando marcado e abriu a prévia da limpeza; a prévia foi cancelada sem exclusão. As mudanças de prazo feitas para conferir a interface não foram salvas. A captura da página está em `output/configuracoes-midia.png`. Não houve envio de mensagem ou exclusão real de mídia para teste; exclusão/retorno após falha foram exercitados em bancos isolados. A conferência visual usou a largura padrão do navegador, sem build de produção do frontend ou imagem Docker nesta entrega.

Na entrega da rejeição de nomes duplicados de 27/10/2026, passaram os 164 testes da API, incluindo os 18 novos casos de [DuplicateNameTests.cs](../tests/Crm.Api.Tests/DuplicateNameTests.cs). Foram verificados criação/edição de sedes, serviços, condições e grupos, comparação sem distinção de caixa com acentos e trim, inativos, manutenção do próprio nome, independência entre tipos de catálogo/donos dos grupos, reutilização após excluir grupo, falha sem alterar active/participantes, permissões/404 e nomes vazios. As quatro criações e quatro renomeações simultâneas resultaram em um sucesso e um conflito, sem duplicação. A execução usou banco e saída de build isolados, sem alterar cadastros reais ou reiniciar os serviços locais. O cliente HTTP e os formulários existentes foram conferidos no código para propagação do ProblemDetails.title ao ErrorBox e preservação do formulário; não houve alteração nem conferência visual do frontend nesta entrega. Sem migração de banco ou alteração do serviço WhatsApp.

Na conferência posterior ao relato de grupo duplicado em 27/10/2026, a API local ainda executava o binário das 08:59, anterior à alteração do controller às 09:54. Sem campanhas running/queued, o supervisor local `npm run dev` foi reiniciado para recompilar/aplicar a regra; o novo binário foi gerado às 10:09 e API, WhatsApp e frontend responderam `200`. Um POST autenticado na API local com o nome de um grupo já existente do mesmo usuário retornou `409`, “Já existe um grupo com este nome.”; a quantidade de grupos permaneceu igual antes/depois, sem novo cadastro. Não foram excluídos ou renomeados grupos preexistentes. O bloqueio requer o processo da API com o código atualizado; recarregar somente o navegador não atualiza o binário de `dotnet run`.

Na correção de edições criptografadas de 27/10/2026, passaram os 100 testes do serviço e a checagem de tipos. Os oito novos casos de [encrypted-edits.test.ts](../apps/whatsapp/test/encrypted-edits.test.ts) usam ciphertext gerado com HKDF/AES-GCM para verificar revisão da original, posição/autor/prévia/segredo, fila antes da original ou sem segredo, revisões repetidas/fora de ordem, PN/LID, mensagem própria e grupo, isolamento/autoria/alvo/cifra adulterada, preservação do segredo em edição local/ressincronização e migração seletiva dos balões indevidos. O teste do decoder exercita uma mensagem de dispositivo vinculado com chave no envelope externo; verifica também que MESSAGE_EDIT não conta como nova mensagem. O patch foi executado duas vezes para conferir idempotência. Na base local, não havia campanhas running/queued antes das alterações; após a reconciliação não restaram balões de edição criptografada “Mensagem não suportada”, seis mensagens tinham revisão recuperada e oito eventos permaneceram pendentes por falta de material necessário. Foi gerada uma cópia local do banco já reconciliado em data/backups. API/serviço responderam 200, sem editar/enviar mensagens reais para teste. Dockerfiles foram ajustados/revisados, sem build de imagem nesta conferência. Não há mudança de endpoint/payload público ou necessidade de alterar a API/frontend para esta correção.

Na entrega dos indicadores de edição/encaminhamento de 26/10/2026, passaram os 92 testes do serviço, os 38 do frontend e as checagens de tipos. Os seis novos casos de [message-metadata.test.ts](../apps/whatsapp/test/message-metadata.test.ts) cobrem contexto de encaminhamento em texto/mídia/envelopes, descarte de marcas apenas na citação, edição nativa e por protocolo com isolamento, persistência das marcas em updates sem metadados, ausência de inferência por texto diferente, edição local com citação/encaminhamento preservados e falha sem marcar, além de revogação sem indicadores. No navegador integrado, duas mensagens existentes no Backup mostraram “Encaminhada” com seta e texto em itálico, sem transbordamento horizontal ou erros de JavaScript. Edição local foi exercitada somente com socket simulado, sem editar/encaminhar/enviar mensagens reais. A consulta visual foi somente pelo Backup, sem confirmar leitura. Não havia campanhas running/queued antes das mudanças; o serviço recarregou o código automaticamente. A API repassa os campos adicionais sem mudança de código/reinício; não houve migração de schema.

Na entrega da exibição de respostas citadas de 26/10/2026, passaram os 86 testes do serviço, os 38 do frontend e as checagens de tipos dos dois projetos. Os seis novos casos de [message-replies.test.ts](../apps/whatsapp/test/message-replies.test.ts) cobrem snapshot/corpo independente/paginação, autoria própria por registro/telefone/LID, participante de grupo/envelopes/mídia, fallback com isolamento por sessão/chat e remoteJid, tipos/legendas/nomes/miniaturas/limites, revogação e ausência de citação em mensagens comuns/encaminhadas. Os três casos de [message-reply.test.ts](../apps/web/test/message-reply.test.ts) verificam autor/Você, formatação/escape de HTML, navegação opcional e miniatura/ícone sem controles de envio/download. No navegador integrado, o Backup exibiu a resposta real “ok” citando “teste”, com nome Você, faixa verde rgb(0,128,105), fundo discreto e peso 700 no autor. O clique na citação encontrou a original carregada; não houve transbordamento horizontal nem erros de JavaScript. Foi usada somente a consulta de Backup, sem envio ou confirmação de leitura e sem alterações em cadastros/mensagens. Não havia campanhas running/queued antes da alteração do serviço, que recarregou automaticamente; a API encaminha o novo campo sem alteração de código/reinício ou migração de banco.

Na entrega da memorização dos intervalos de 26/10/2026, passaram os 35 testes do frontend e sua checagem de tipos. Os quatro novos casos de [campaign-timing.test.ts](../apps/web/test/campaign-timing.test.ts) verificam restauração dos quatro campos sem persistir texto/destinatários, dados ausentes/corrompidos/inválidos, limites/inteiros/relação entre intervalo e variância sem substituir a última combinação válida, e falhas de leitura/gravação/acesso ao localStorage. No navegador integrado, os valores 30/5/25/90 permaneceram após recarregar a página; esvaziar temporariamente a frequência da pausa e recarregar recuperou 25, preservando a última combinação válida. A indicação de salvamento ficou visível e não houve erros de JavaScript. Ao finalizar a conferência, os quatro valores anteriores foram restaurados pela própria interface; nenhum disparo foi preparado/criado ou enviado. Alteração apenas no frontend, sem reinício, migração ou mudança de contrato da API/serviço.

Na entrega de múltiplos anexos por mensagem de 26/10/2026, passaram os 146 testes da API (três novos em MultipleAttachmentsTests), os 80 testes do serviço e os 31 do frontend, além das checagens de tipos. Cobertura: encaminhamento em ordem e compatibilidade com attachment legado, limites de quantidade/soma em chat e campanha, campos mutuamente exclusivos, leitura atômica/adição ao rascunho, prévias/remoção, legenda única, áudio/figurinha/documento, validação antes de enviar, persistência, falha parcial com contagem/texto confirmado, cancelamento entre arquivos e ausência de retry por variante após confirmação parcial. No navegador integrado, colou imagem e arquivo juntos na mesma mensagem de Disparos e do chat, acrescentou um terceiro arquivo, removeu individualmente, conservou legenda e sequência ao mudar público para Grupos, e conferiu `multiple` no seletor; não houve erros de JavaScript. Nenhuma mensagem real foi enviada ou campanha criada para teste; o chat usado era provisório, sem histórico. Sem campanhas running/queued, os serviços foram reiniciados para aplicar a API; os três endpoints de conferência responderam `200`.

Na entrega da colagem de anexos de 26/10/2026, passaram os 29 testes do frontend e a checagem de tipos. Os cinco novos casos de [attachment-paste.test.ts](../apps/web/test/attachment-paste.test.ts) cobrem texto sem arquivos, imagem/documento com payload base64 e bloqueio do texto alternativo, vários arquivos sem anexação parcial, tamanho acima de 16 MiB/falha de leitura sem substituir composição e MIME ausente/WebP. No navegador integrado, a colagem por Ctrl+V anexou imagem e arquivo tanto em Disparos quanto no chat, preservou legenda, atualizou a prévia da sequência, permitiu substituição/remoção e manteve a colagem normal de texto. A troca para o público Grupos conservou a mesma sequência. Imagem de teste carregou na prévia e não houve erros de JavaScript. O chat de teste era provisório e sem histórico; nenhuma mensagem foi enviada, campanha criada ou conversa real marcada como lida. A alteração é de frontend, sem mudança de contrato ou necessidade de reiniciar API/serviço WhatsApp.

Na entrega da renderização de mensagens de 26/10/2026, passaram os 24 testes do frontend e a checagem de tipos. Os seis novos casos em [message-format.test.ts](../apps/web/test/message-format.test.ts) renderizam os componentes reais para conferir os quatro estilos, acentos, combinações/trechos adjacentes, código literal de uma/três crases com múltiplas linhas, marcadores incompletos/espaçados/duplicados, palavras/URLs/números, escape de HTML, botões de telefone dentro de estilos e ausência de botões em código, além de dez mil caracteres/delimitadores sem recursão ilimitada. No navegador integrado, a prévia de Disparos foi conferida com primeiro nome em negrito, itálico, tachado, código inline e multilinha; os estilos computados confirmaram peso 700, italic, line-through e fonte Consolas. O texto do editor conservou os marcadores. Nenhuma mensagem foi enviada nem conversa real aberta para testar, e nenhuma campanha foi criada. A alteração é de frontend, sem migração, alteração de API/serviço ou reinício necessário.

Na ampliação de todos os filtros categóricos dos grupos para multisseleção em 26/10/2026, passaram os 143 testes da API, os 18 testes do frontend e a checagem de tipos do frontend. Os três novos casos em [GroupLeadTests.cs](../tests/Crm.Api.Tests/GroupLeadTests.cs) cobrem combinação dos cinco arrays com período/busca, Sem serviço isolado/junto de IDs, união com parâmetros unitários, limpeza, etiquetas próprias/alheias e ausência de duplicatas, mesmo resultado na consulta/criação, atualização válida, revalidação após mudar serviço e rejeição sem gravação parcial. Também verificam permissões de vendedor/sede na consulta, criação e edição. No navegador integrado, o formulário manteve Agendar Contato/Stand By como padrão e permitiu escolher dois serviços mais Sem serviço, duas sedes, dois vendedores e duas classificações simultaneamente, retornando um candidato sem duplicação. O formulário foi cancelado sem salvar grupo real. O ambiente foi reiniciado para aplicar a API e os três serviços responderam HTTP `200`.

Na entrega do padrão de status na criação de grupos de 26/10/2026, passaram os nove testes de GroupLeadTests (dois novos), os 18 testes do frontend e a checagem de tipos do frontend. Os novos casos verificam Agendar Contato/Stand By em conjunto na consulta/criação, ausência de duplicatas, compatibilidade do status unitário, limpeza do filtro, escopo de carteira/sede, rejeição de IDs fora dos status, revalidação após mudar o status e edição sem restrição preservando participantes de outros status. No navegador integrado, Criar grupo abriu somente com os dois status marcados e os demais desmarcados; Escape fechou a lista sem fechar o modal, e editar grupo existente abriu com Todos os status. Ambos os formulários foram cancelados, sem gravação real. O ambiente foi reiniciado para aplicar a API e os três serviços responderam HTTP `200`.

Na entrega dos filtros múltiplos de Disparos de 26/10/2026, passaram os 138 testes da API, os 18 testes do frontend e a checagem de tipos dos dois projetos Node. Os três novos casos de [CampaignAudienceTests.cs](../tests/Crm.Api.Tests/CampaignAudienceTests.cs) verificam OU dentro/E entre os cinco filtros, período/busca/grupo/seleção/exclusões combinados, paginação/contagem antes do recorte, duplicatas de IDs e de classificações, união de contratos unitário/múltiplo, Sem serviço sozinho/junto de serviços, limpeza, revalidação após mudar o serviço e mesmo público na prévia/payload simulado. Também cobrem exclusão de OptOut/sede inativa, privacidade de etiquetas (inclusive misturadas com próprias) e `403` nos três endpoints para arrays de vendedor/sede sem permissão. No navegador foram selecionados dois status, dois serviços mais Sem serviço, duas sedes, dois vendedores e duas classificações simultaneamente; lista e prévia retornaram o mesmo contato uma única vez. Foram conferidos Sem serviço isolado (três contatos), limpeza independente de classificação, fechamento com Escape e reset de vendedores ao mudar sedes. A prévia foi cancelada, sem nova campanha ou envio real. O ambiente foi reiniciado para aplicar a API; API, serviço WhatsApp e frontend responderam HTTP `200` e a sessão WhatsApp restaurou a conexão.

Na entrega do filtro direto por data de cadastro em Disparos de 26/10/2026, passaram os 135 testes da API (incluindo seis novos casos em [CampaignAudienceTests.cs](../tests/Crm.Api.Tests/CampaignAudienceTests.cs)), os 18 testes do frontend e a checagem de tipos dos dois projetos Node. Os novos casos cobrem início inclusivo/fim exclusivo com precisão de ticks, dias em UTC−3, paginação/contagem, limites isolados/remoção/resultado vazio, mesmo público na prévia e no payload encaminhado ao serviço simulado, seleção manual/exclusões, combinação com grupo/classificação/status/serviço/busca, sede/vendedor/OptOut, revalidação na confirmação e datas inválidas/invertidas nas três rotas sem chamada ao serviço. No navegador, alterar o período voltou da página 2 à 1 e refez a seleção; o dia 02/10/2026 retornou dois contatos e a prévia os manteve. Período invertido mostrou alerta, ocultou a tabela e desabilitou Enviar disparos; restaurar as datas recuperou a lista. A prévia foi cancelada, sem criar campanha ou enviar conteúdo real. O ambiente foi reiniciado para aplicar a API e os três serviços responderam HTTP `200`.

Na ampliação da personalização com `${nome}` e botões em 26/10/2026, passaram os 66 testes do serviço, os 18 testes do frontend e a checagem de tipos de ambos. A cobertura existente passou a verificar `${nome}` junto de `${PrimeiroNome}`/`{{nome}}`, substituições repetidas/literais e botões por mensagem, incluindo bloqueio para WebP. No navegador foram conferidos ambos os botões, substituição do trecho selecionado, inserção no cursor, foco devolvido ao texto, duas mensagens reordenadas com tokens preservados e rejeição de inserção acima de 10.000 caracteres sem modificar o texto. A prévia exibiu “Olá, Mariana! Cadastro: Mariana Almeida.”. Nenhuma campanha foi criada e nenhum disparo real foi enviado. Um arquivo de validação de rotas gerado pelo Next.js estava corrompido; foi removido e regenerado pelo reinício do ambiente, após o que a checagem de tipos passou.

Na entrega da personalização `${PrimeiroNome}` de 26/10/2026, passaram os 66 testes do serviço WhatsApp, os 17 testes do frontend e a checagem de tipos dos dois projetos. Os novos casos em [delivery.test.ts](../apps/whatsapp/test/delivery.test.ts) verificam substituições repetidas por destinatário em toda a sequência, legendas/anexos, compatibilidade com `{{nome}}`, acentos/espaços/tabulações, nome único/vazio, substituição literal sem avaliação de expressões e preservação do modelo original. [campaign-personalization.test.ts](../apps/web/test/campaign-personalization.test.ts) renderiza o editor real para conferir instrução, placeholder e prévia com primeiro nome/nome completo e legenda. Na aba Disparos local, digitar `Olá, ${PrimeiroNome}! Cadastro: {{nome}}.` mostrou `Olá, Mariana! Cadastro: Mariana Almeida.` na prévia. Não foi criada campanha nem enviado conteúdo real; os testes de envio usam dependências simuladas. O serviço atualizado respondeu `200` no health check.

Na correção visual do contador em 26/10/2026, a lista real já continha um indicador com duas mensagens não lidas, mas seu fundo computado era transparente por referenciar `--primary`, variável ausente no tema. A troca para `--green` foi conferida no navegador com fundo `rgb(40, 92, 70)`, texto branco e número 2 visível à direita da conversa. Nenhuma conversa foi aberta nem marcada como lida durante essa conferência.

Na entrega do contador de não lidas de 26/10/2026, passaram os 129 testes da API, os 63 testes do serviço e os 16 testes do frontend, além das checagens de tipos de ambos os projetos Node. Após acrescentar o indicador manual separado, os 11 testes de WhatsAppUnreadTests foram reexecutados e passaram. Os testes cobrem migração sem perda, snapshots/deltas/zero/campos omitidos de protobuf, isolamento, merge LID/telefone sem ressuscitar contagem antiga, confirmação remota antes de limpar, mensagens/estados concorrentes, grupos/revogadas/envios próprios, leitura de conversa antiga sem snapshot, falhas/erros, validação, autenticação/CSRF/sessão própria e compatibilidade com serviço antigo. A renderização dos componentes reais verificou badge, singular/plural, limite 99+, ponto manual, zero/ausente e preservação da fixação/prévia. A revisão automática bloqueou a inicialização da prévia interativa simulada e o navegador bloqueou a abertura da prévia estática por protocolo `file:`; não foram contornados esses bloqueios. A lista real foi apenas consultada por HTTP, sem selecionar contatos; naquele momento continha quinhentas conversas expandidas, sem contagem positiva sincronizada. Leituras foram validadas com sockets simulados, sem envios de recibos reais feitos para teste. Sem campanhas running/queued, o comando de desenvolvimento agrupado foi reiniciado para aplicar a API; API, WhatsApp e frontend responderam `200` depois do reinício.

Na correção da leitura em outros dispositivos de 26/10/2026, passaram os 72 testes do serviço e sua checagem de tipos. Os seis novos casos exercitam os handlers com o emissor de eventos do Baileys: leitura recebida sem abrir no CRM, preservação de posteriores (inclusive no mesmo segundo), repetição/ressincronização, isolamento e descarte de entrega/leitura de envio próprio, LID com telefone e grupos com recibo da própria conta por telefone/LID, incluindo mensagem revogada. A conferência não leu conversas reais nem enviou recibos para teste; leitura física no celular não foi validada nesta execução. Não havia campanhas running/queued antes da alteração; o serviço de desenvolvimento recarregou o código e os três serviços responderam `200`.

Na entrega da consulta “Transferidos” de 23/10/2026, passaram os 118 testes da API em execução sequencial, incluindo 11 casos novos de TransferredLeadTests, e a checagem de tipos do frontend. Foram cobertos origem própria versus leads recebidos, escopo de sede/admin global, filtros original/atual combinados com status/vendas/serviço/classificação/período, ordenação e contagem antes de paginar, Excel completo com nomes dos dois vendedores, rejeição de formatos inválidos e de filtro alheio por vendedor comum, leitura sem nova permissão de edição e entrada/saída após transferência temporária/devolução/permanente. A API local foi reiniciada e a rota nova respondeu `200`. No navegador foram conferidos menu Transferidos, rótulos/filtros Original e Atual, combinação de responsáveis e estado vazio com exportação bloqueada; o banco local não tinha leads que satisfizessem o filtro e nenhum cadastro real foi alterado para a conferência. Os testes com dados isolados validaram as linhas e a exportação.

Na entrega da transferência permanente entre sedes de 23/10/2026, passaram os 107 testes da API em execução sequencial (incluindo 15 novos casos de LeadBranchTransferTests) e a checagem de tipos do frontend. Os casos novos cobrem administrador global, destinatário da sede/global, bloqueio de admin de sede/vendedor, rejeição de temporária com destino explícito, sede/vendedor inválidos ou inativos, duplicidade no destino ou dentro do lote, ausência de mudança implícita e consolidação de várias sedes, sem gravação parcial nos erros. Também verificam preservação de IDs/dados/vínculos, remoção do vínculo WhatsApp, atualização de revisão/responsáveis e acesso à agenda pela nova sede. A execução paralela anterior teve uma falha de SQLitePCL por conexão descartada em GroupLeadTests; os 15 casos novos passaram nela e a suíte completa passou sem paralelismo, sem alterar os testes de grupos. Na interface local foram conferidos exibição da sede apenas em Permanente, vendedores filtrados por origem/destino e limpeza ao voltar para Temporária; o modal foi cancelado sem transferir cadastros reais. A API local foi reiniciada e o health check e o frontend responderam normalmente.

Na troca do seletor de ordenação pelos cabeçalhos em 23/10/2026, passou a checagem de tipos do frontend. No navegador com a API local atualizada, foram conferidos os dois sentidos de Cliente/Valor/Entrada, `aria-sort` e descrição da próxima ação, retorno da página 2 para a 1 com limpeza da seleção de transferência, remoção do seletor e ordenação por Valor em Vendas acionada com Enter. A aparência das setas e do cabeçalho ativo também foi inspecionada. Esta troca usa os mesmos parâmetros/regras da API e mantém a ordenação do Excel; não exigiu mudanças ou reinício do backend.

Na entrega da ordenação selecionável de leads/vendas de 23/10/2026, passaram os 32 casos executados de LeadOrderingTests, LeadExportTests, LeadScopeTests e ClassificationTests, além da checagem de tipos do frontend. Os 11 novos casos de LeadOrderingTests cobrem as seis opções, padrão ausente/vazio, desempates por ID, nomes sem distinção de caixa, valores numéricos com centavos, ordenação antes de paginar, mesma sequência completa no Excel, filtros combinados, escopo de sede e rejeição de opção desconhecida em ambos os endpoints sem gravação. O reinício da API local foi bloqueado pela revisão automática de aprovação; o processo em execução continuou na versão anterior. A conferência visual não pôde ser concluída porque o navegador excedeu o tempo limite ao abrir a aba local. Os testes da API usaram saída de build e banco isolados.

Na entrega do filtro por dia dos agendamentos de 23/10/2026, passaram os cinco casos de AppointmentDateFilterTests e a checagem de tipos do frontend. Foram cobertos início inclusivo/fim exclusivo com precisão de ticks, dia completo em UTC−3, filtragem antes da paginação e contagem, remoção/ausência de limites, resultado vazio, datas inválidas/invertidas e combinação com carteira, lead, sede e conclusão, preservando o escopo de acesso. Os testes usaram banco isolado e saída de build temporária porque o executável da API local estava em uso.

Na entrega da exportação Excel com filtro por período de 23/10/2026, passaram os 76 testes da API (incluindo 14 casos de LeadExportTests), os 12 testes do frontend (quatro casos de download) e o build/tipos do frontend. Os XLSX dos testes foram abertos e validados contra o schema OpenXML, incluindo 105 registros além da paginação e resultado vazio. Os testes de período cobriram início inclusivo/fim exclusivo com precisão de ticks, dias completos em UTC−3, dia único, limites opcionais, datas inválidas/invertidas, mesma filtragem na listagem/exportação antes da paginação e combinação com vendas/carteira/classificação/sede. Na interface com banco demonstrativo isolado foram conferidos exportação completa, estado ocupado, bloqueio sem resultados e combinação de status/serviço/vendedor; Vendas baixou `vendas.xlsx`, cujo conteúdo foi conferido com 16 registros, todos Venda Efetivada, e 22 colunas. Nenhuma operação no serviço/conta WhatsApp foi necessária.

Na conferência visual do período, selecionar uma data voltou da página 2 para a página 1. O dia 02/10/2026 retornou dois leads e o Excel baixado continha exatamente esses dois IDs; Vendas filtrada no dia 01/10/2026 mostrou uma venda, e o arquivo baixado continha somente o mesmo ID. A seleção foi feita pelo calendário nativo do navegador; os filtros locais da tela e a exportação usaram os mesmos limites.

Na entrega de arquivar/desarquivar pelo CRM de 23/10/2026, passaram os 74 testes da API, os 58 do serviço WhatsApp e os oito do frontend, além de checagem de tipos e build completo. A primeira execução completa teve falha em DashboardScopeTests; o caso passou isoladamente e os 74 passaram na reexecução completa, sem alteração do Dashboard. Com API simulada na interface, foram conferidos botão bloqueado durante gravação, arquivamento/desarquivamento com reagrupamento e preservação da seleção/histórico/fixação, falha sem mudar o grupo e ausência da ação no Backup. Não foram executadas operações em conta real do WhatsApp.

Na entrega do filtro de classificação no formulário de grupos de 02/10/2026, passaram os sete casos de GroupLeadTests e o build/tipos do frontend. Os testes confirmaram classificação pessoal inclusive para admins, manutenção do escopo de carteira, combinação com status/serviço/busca, criação/edição filtradas e rejeição sem alterações parciais após remover uma marcação. Na interface com banco isolado, foram conferidos limpeza da seleção ao trocar a classificação, candidatos filtrados e criação de grupo somente com os dois leads classificados selecionados.

O levantamento percorreu todas as páginas de `apps/web/src/app`, componentes funcionais em `features`, Provider/cliente HTTP/hook de recursos, todos os controllers de `apps/api/Features`, regras/entidades/índices do CRM e rotas/sessões/messaging/campaigns/storage do serviço WhatsApp. CSS e screenshots não foram usados para inferir comportamento de back.

Na entrega do filtro de classificação em Disparos de 02/10/2026, passaram os 12 casos de CampaignAudienceTests e o build/tipos do frontend. Os testes confirmaram privacidade inclusive para admin global, exclusão de OptOut, paginação após filtrar, combinação com grupo/status/serviço/exclusões, destinatários encaminhados ao serviço simulado e rejeição após remover uma classificação antes da confirmação. Na interface com banco/serviço simulados, foram conferidos retorno à página 1, contagem/seleção dos classificados e prévia contendo somente esses destinatários, sem enviar mensagens reais.

Foram conferidos os cenários declarados na suíte existente, sem executar envios reais. Na entrega de classificações pessoais e seu filtro na tabela de 02/10/2026, os 58 testes da API passaram (incluindo ClassificationTests), assim como a checagem de tipos e o build de produção do frontend. A interface foi conferida com banco e serviço WhatsApp simulados, incluindo criação no menu compacto, seleção múltipla por item com salvamento automático, bolinhas, persistência ao reabrir e falha de gravação com retorno à seleção anterior. A correção da piscada foi verificada ao marcar/desmarcar com resposta de gravação atrasada em dois segundos: a lista manteve tamanho, posição, foco e opacidade durante e após a requisição. Na tabela foram conferidas etiquetas coloridas, filtro pessoal com retorno à primeira página, atualização após fechar o detalhe sem salvar o formulário e Escape fechando apenas o seletor aninhado:

| Evidência no repositório | Regras/caminhos corroborados |
| --- | --- |
| [BusinessFlowTests.cs](../tests/Crm.Api.Tests/BusinessFlowTests.cs) | CSRF, escopo, telefone único, transferências, OptOut, retornos, grupos e elegibilidade |
| [AppointmentDateFilterTests.cs](../tests/Crm.Api.Tests/AppointmentDateFilterTests.cs) | Filtro por dia antes da paginação, limites UTC do dia local, datas inválidas, carteira/lead/sede/conclusão e isolamento de acesso |
| [LeadScopeTests.cs](../tests/Crm.Api.Tests/LeadScopeTests.cs), [LeadEditingTests.cs](../tests/Crm.Api.Tests/LeadEditingTests.cs) | Leitura/edição por sede/carteira, proteção de contato, exclusão |
| [LeadBranchTransferTests.cs](../tests/Crm.Api.Tests/LeadBranchTransferTests.cs) | Transferência permanente entre sedes exclusiva do admin global, validação de sede/vendedor/telefones, rejeição atômica, preservação de vínculos e mudança de escopo dos retornos |
| [TransferredLeadTests.cs](../tests/Crm.Api.Tests/TransferredLeadTests.cs) | Consulta de origem própria com atendimento alheio, escopo/permissões, filtros original/atual, paginação/Excel, validação e evolução após transferência/devolução/permanente |
| [LeadExportTests.cs](../tests/Crm.Api.Tests/LeadExportTests.cs), [api-download.test.ts](../apps/web/test/api-download.test.ts) | XLSX validado pelo schema OpenXML, exportação além da paginação, filtros combinados incluindo período local com limites opcionais e inclusivos por dia, rejeição de datas inválidas/invertidas, escopo de sede/carteira, classificação pessoal, vazio/validação/autenticação, tipos/formatos do Excel, textos literais sem fórmulas, download binário, liberação da URL, cancelamento e preservação de JSON/CSRF |
| [LeadOrderingTests.cs](../tests/Crm.Api.Tests/LeadOrderingTests.cs) | Seis ordenações antes da paginação, desempate estável, padrão preservado, correspondência com Excel completo, filtros e escopo mantidos, rejeição de ordenação inválida |
| [LeadConversationTests.cs](../tests/Crm.Api.Tests/LeadConversationTests.cs) | Variantes, confirmação, duplicidade, conversa existente e número ausente |
| [ClassificationTests.cs](../tests/Crm.Api.Tests/ClassificationTests.cs) | Isolamento pessoal inclusive para admin, cores/nomes/payloads inválidos, escopo de leads, seleção múltipla/remoção/cascata, rejeição atômica de IDs alheios, bolinhas com vínculo explícito/backup e etiquetas/filtro pessoal na listagem antes da paginação, combinado com carteira/vendas/serviço/sede/vendedor e preservando o escopo de sede |
| [GroupLeadTests.cs](../tests/Crm.Api.Tests/GroupLeadTests.cs) | Seleção sem vínculo, filtros combinados incluindo classificação pessoal, privacidade/escopo, revalidação ao salvar e seleção além de cem |
| [CampaignAudienceTests.cs](../tests/Crm.Api.Tests/CampaignAudienceTests.cs) | Público de outros vendedores, filtros, classificação pessoal antes da paginação, combinação com grupo/seleção/exclusões, revalidação na confirmação e elegibilidade |
| [DashboardScopeTests.cs](../tests/Crm.Api.Tests/DashboardScopeTests.cs), [DashboardPeriodTests.cs](../tests/Crm.Api.Tests/DashboardPeriodTests.cs) | Período inclusivo, indicadores e agenda por sede |
| [UserRegistrationTests.cs](../tests/Crm.Api.Tests/UserRegistrationTests.cs) | Cadastro administrativo e limites de sede |
| [WhatsAppContactTests.cs](../tests/Crm.Api.Tests/WhatsAppContactTests.cs), [contacts.test.ts](../apps/whatsapp/test/contacts.test.ts) | Agenda da própria sessão, autenticação/CSRF, limites e nomes compostos, confirmação remota antes de gravar, falhas/chave ausente, PN/LID, atualização pelo celular, prioridade sobre histórico e preservação do estado do chat |
| [contact-button.test.ts](../apps/web/test/contact-button.test.ts) | Ações salvar/editar para a conversa de onze dígitos aberta pelo lead e ausência em Backup, grupos, LID e IDs inválidos |
| [MediaStorageTests.cs](../tests/Crm.Api.Tests/MediaStorageTests.cs), [media-storage.test.ts](../apps/whatsapp/test/media-storage.test.ts), [media-settings.test.ts](../apps/web/test/media-settings.test.ts) | Escopo global/CSRF, contratos/erros, uso lógico/físico, retenção ligada/desligada, limite exato, isolamento/cache offline, preservação de mensagens/resultados, campanhas ativas, formatos legados, rollback e indicação de anexo removido |
| [DuplicateNameTests.cs](../tests/Crm.Api.Tests/DuplicateNameTests.cs) | Nomes duplicados na criação/edição dos quatro cadastros, caixa/acentos/trim, inativos, exclusão do próprio ID, categorias e donos independentes, preservação de membros/active, permissões/404, nomes vazios e criações/renomeações simultâneas |
| [history.test.ts](../apps/whatsapp/test/history.test.ts) | Cursor, isolamento, metadados, nomes, fixadas/arquivadas, reações e exclusão |
| [unread-chats.test.ts](../apps/whatsapp/test/unread-chats.test.ts), [WhatsAppUnreadTests.cs](../tests/Crm.Api.Tests/WhatsAppUnreadTests.cs), [chat-unread.test.ts](../apps/web/test/chat-unread.test.ts) | Migração/contadores por sessão, estados completos/incrementais, marcadores manuais, LID, leitura remota com falhas/concorrência, recibos de outros dispositivos/grupos sem apagar posteriores, JIDs/autorização/CSRF e badge acessível/99+ |
| [archive-chat.test.ts](../apps/whatsapp/test/archive-chat.test.ts), [WhatsAppArchiveTests.cs](../tests/Crm.Api.Tests/WhatsAppArchiveTests.cs) | Arquivar/desarquivar com confirmação remota antes de persistir, preservação de fixação/mensagens, referência mais recente, grupos/LID/revogadas, isolamento de sessão, payload inválido, autenticação/CSRF e propagação de falhas |
| [validation.test.ts](../apps/whatsapp/test/validation.test.ts) | Schema de mensagem/contato/voz/campanha e limites |
| [delivery.test.ts](../apps/whatsapp/test/delivery.test.ts) | Elegibilidade, intervalos, pausa, falha e cancelamento |
| [resolve-phone.test.ts](../apps/whatsapp/test/resolve-phone.test.ts), [send-to-phone.test.ts](../apps/whatsapp/test/send-to-phone.test.ts) | Resolução, variantes e envio/cancelamento durante lookup |
| [campaign-messages.test.ts](../apps/whatsapp/test/campaign-messages.test.ts) | Detalhes de sequência, dono e payload legado |
| [voice-note.test.ts](../apps/whatsapp/test/voice-note.test.ts) | Conversão para Ogg/Opus |
| [message-phones.test.ts](../apps/web/test/message-phones.test.ts) | Telefones detectados em texto e normalização |
| [attachment-paste.test.ts](../apps/web/test/attachment-paste.test.ts), [MultipleAttachmentsTests.cs](../tests/Crm.Api.Tests/MultipleAttachmentsTests.cs), [multiple-attachments.test.ts](../apps/whatsapp/test/multiple-attachments.test.ts) | Colagem múltipla em ordem/adição atômica, limites de quantidade/soma, base64/MIME, arrays e legado na API, legenda única, envio/persistência, falhas parciais e cancelamento entre arquivos |
| [campaign-timing.test.ts](../apps/web/test/campaign-timing.test.ts) | Preferências locais dos quatro intervalos/pausas, restauração, limites/variância, JSON corrompido, preservação da última combinação válida e armazenamento indisponível |
| [message-replies.test.ts](../apps/whatsapp/test/message-replies.test.ts), [message-reply.test.ts](../apps/web/test/message-reply.test.ts) | Citações em texto/mídia/envelopes, autor/conta/LID/grupo, snapshot/fallback isolado, revogação, prévia/miniatura limitada, apresentação escapada e navegação opcional à original carregada |
| [message-metadata.test.ts](../apps/whatsapp/test/message-metadata.test.ts) | Encaminhamento principal versus citado, edição nativa/protocolo/local, persistência das marcas, isolamento, contexto preservado e falha/revogação sem indicador indevido |
| [encrypted-edits.test.ts](../apps/whatsapp/test/encrypted-edits.test.ts) | Edição criptografada autenticada, fila/replay/migração seletiva, segredo de dispositivo vinculado, PN/LID/autoria/escopo, deduplicação/ordem e ausência de balão/unread adicional |
| [chat-groups.test.ts](../apps/web/test/chat-groups.test.ts) | Sete combinações de visualizações, precedência fixa, status/Sem lead, classificação múltipla/Sem classificação por último, arquivadas fixadas, contagens únicas, prioridade de fixadas e reagrupamento com dados atualizados |

Na entrega das visualizações combináveis de Conversas, passaram os 58 testes da API e os oito testes do frontend executados com `node --import tsx --test apps/web/test/*.test.ts`, além de tipos/build. O teste de chats também confirmou leadStatus nulo sem vínculo e atualizado após mudar o status do lead. Na interface com dados simulados foram conferidos padrão WhatsApp, último toggle ativo, precedência ao ativar em ordem inversa, grupos homônimos independentes, recolhimento preservado no polling, busca em arquivadas e manutenção do painel selecionado ao trocar visualizações. Em viewport de 390 px foram conferidas lista vertical rolável, área reservada aos grupos e ausência de transbordamento horizontal.

Para atualizar este documento, revisar primeiro handlers/eventos e contratos dos arquivos vinculados, conferir novos endpoints/call sites e depois ajustar o inventário. A implementação, e não o nome do botão ou a especificação original, determina cada fluxo descrito.

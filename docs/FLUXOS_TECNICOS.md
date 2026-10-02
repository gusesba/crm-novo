# Documentação técnica dos fluxos do Via CRM

Levantamento do código em **02/10/2026**. Este documento descreve a implementação encontrada no frontend Next.js, na API .NET e no serviço WhatsApp Node/Fastify/Baileys. O inventário foi construído a partir das rotas, componentes, handlers, serviços, persistência e testes; `FUNCIONALIDADES.md` não foi usado como fonte do inventário.

“Todos os fluxos” significa os caminhos de negócio e as ramificações explícitas implementadas, incluindo sucesso, validação, autorização, cancelamento, falha parcial e processamento automático. Falhas genéricas compartilhadas estão na seção 3 e se aplicam às operações posteriores. Não é uma homologação de uma conta real do WhatsApp nem uma promessa de compatibilidade do protocolo externo.

Os exemplos usam JSON com propriedades camelCase, como recebido/enviado pelo navegador. IDs, nomes e datas são ilustrativos. Caminhos de código são relativos à raiz do repositório; links deste documento apontam para os arquivos efetivamente pesquisados.

## 1. Lista de funcionalidades e localização dos fluxos

| Área/página | Funcionalidades implementadas | Fluxos |
| --- | --- | --- |
| Inicialização | Migração do CRM, provisionamento, dados demonstrativos condicionais, recuperação de sessões e interrupção de campanhas antigas | 2 |
| Infraestrutura compartilhada | Proxy HTTP, cookie, CSRF, autorização por sede, erros, carregamento, atualização e notificações | 3 |
| `/login`, `/` e navegação | Entrar, recuperar sessão, redirecionar por perfil, sair, menu móvel e ajuda | 4 |
| `/dashboard` | Indicadores, evolução diária, distribuição de status, ranking, filtros de período/sede, próximos retornos e novo lead | 5 |
| `/leads`, `/my-leads`, `/sales` | Consulta geral/pessoal/vendas, busca, filtros (incluindo classificação pessoal), paginação, etiquetas coloridas na tabela, detalhe, criação, edição comercial/de contato, mudança de status, exclusão e transferências | 6 |
| Leads ↔ conversas | Resolver telefone/variantes, confirmar troca de telefone, abrir conversa, vincular explicitamente e criar/editar lead a partir do chat | 7 |
| `/appointments` | Agenda geral/pessoal/por lead, concluídos, paginação, criação, edição, conclusão, reabertura e exclusão | 8 |
| `/groups` | Listar grupos internos, filtrar candidatos, seleção em várias páginas, criar, renomear, substituir participantes e excluir | 9 |
| `/settings` | Equipe, senha/perfil/sede, ativação e inativação de usuários, sedes, serviços e condições de venda | 10 |
| `/whatsapp`, `/campaigns` | Sessão pessoal, QR Code, status, desconexão, reconexão e restauração | 11 |
| `/whatsapp` | Lista/busca de conversas, arquivadas/fixadas, fotos, histórico, mensagens anteriores, nova conversa e bolinhas/seleção múltipla de classificações do lead vinculado | 12 |
| Compositor e mensagens | Texto, emoji, resposta, edição, reação/remoção de reação, encaminhamento, exclusão local/para todos | 13 |
| Anexos e contatos | Fotos, vídeos, documentos, áudio, gravação de voz, figurinhas recentes/criadas, vCard, telefone detectado no texto, copiar número, prévia/download de mídia | 14 |
| Serviço WhatsApp | Receber/sincronizar mensagens, contatos e estados de chats; persistir edição, reação e revogação | 15 |
| `/campaigns` | Público por filtros/grupo/seleção/exclusões, sequência, prévia local, confirmação, fila, intervalos/pausas, resultados/detalhes e cancelamento | 16 |
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
3. Registra rotas Fastify e passa a ouvir. `restoreSessions()` roda em segundo plano: busca usuários com `auth.key='creds'` e chama `connect` para cada um.
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
| Admin global sem sede | Todas as sedes | Todos os leads | Equipe/sedes/catálogos | Sessão própria; pode consultar históricos de outros usuários |

`CurrentUser.Scope` aplica sede antes dos filtros. Um vendedor sem sede não obtém leads por esse método. Grupos têm regra adicional de carteira pessoal para vendedores; campanhas têm regra diferente, descrita na seção 16.

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

### 6.1 Listar, buscar e filtrar

1. `/leads`, `/my-leads` e `/sales` usam o mesmo componente com modos all/mine/sales.
2. Entrada/filtros/página → `GET /api/leads?search=&page=1&pageSize=10&mine=false&sales=false`, acrescido de `status`, `serviceId`, `sellerId`, `branchId`, `classificationId` quando preenchidos. O filtro de classificação carrega `GET /api/classifications`, só com opções pessoais; “Todas as classificações” remove esse filtro. Durante carregamento/falha do catálogo, desabilita apenas esse filtro; falha mostra ErrorBox com retry e não impede consultar a tabela pelos demais critérios.
3. Meus leads envia `mine=true`; Vendas envia `sales=true`. API aplica CurrentSellerId para mine e status Venda Efetivada para sales.
4. Busca por nome/telefone tem debounce de 250 ms. Nome usa lower; telefone usa substring da string armazenada (o termo da busca não é normalizado como telefone).
5. API aplica escopo de sede e filtros combinados antes de contar/paginar, ordena CreatedAt e ID descendentes, pagina e retorna `{items:[Lead com classifications:[{id,name,color}]],total,page,pageSize}`. As classificações vêm ordenadas por nome/ID e pertencem somente ao usuário autenticado, inclusive para admins; ausência retorna `[]`. `classificationId` filtra vínculos pessoais sem ampliar o escopo: ID inexistente ou de outro usuário retorna lista vazia/total zero, sem revelar seu dono. Formato não numérico → `400`. Não há consulta HTTP por linha. Limita pageSize a 1–100 e page ao mínimo 1.
6. Alterar filtro/busca redefine página; mudança de filtros/página limpa seleção de transferência. Filtro vendedor não aparece em Meus leads; status não aparece em Vendas. Retorno vazio → Empty; falha → ErrorBox/retry.
7. A coluna “Classificações” mostra todas as marcações pessoais como etiquetas com nome, bolinha, borda e fundo derivados da cor cadastrada; sem classificação mostra traço. Ao fechar o detalhe (inclusive Cancelar/Escape), recarrega tabela e catálogo do filtro, pois classificações criadas/marcadas no seletor já foram salvas automaticamente mesmo sem salvar o formulário principal. Salvar o lead também recarrega ambos; não há polling nessa tela.

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
3. Não permite mudar BranchId nem SellerId por esse endpoint; instrui usar transferência para vendedor.
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

1. Admin marca um ou vários checkboxes na tabela → “Transferir N” → modal. Seleção é local à página; não existe endpoint distinto para transferência individual.
2. Escolhe vendedor ativo e tipo → `POST /api/leads/transfer`:

```json
{ "leadIds": [42, 43], "sellerId": 3, "permanent": false }
```

3. API exige admin, entre 1 e 500 entradas; busca leads no escopo e compara com quantidade de IDs distintos. Lead fora do escopo/inexistente na seleção → `403`.
4. Para cada lead valida vendedor ativo na mesma sede ou admin global. Uma seleção de várias sedes só funciona se o destino for elegível para todas. Falha impede `SaveChanges` do lote.
5. Temporária → muda CurrentSellerId e preserva SellerId. Permanente → muda ambos. Ambas limpam vínculo do chat, atualizam UpdatedAt e incrementam Revision.
6. `204` → toast, fecha modal, limpa seleção e recarrega lista. Histórico fica na sessão de origem; agenda acompanha o vendedor atual por join, sem mudar LeadId.
7. Não há prazo de expiração/retorno automático para transferência temporária: outra transferência é necessária para devolver o atendimento.

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

## 8. Agenda de retornos

Fontes: [appointments-page.tsx](../apps/web/src/features/appointments/appointments-page.tsx), [appointment-form.tsx](../apps/web/src/features/appointments/appointment-form.tsx), [AppointmentsController.cs](../apps/api/Features/Appointments/AppointmentsController.cs).

### 8.1 Consultar agenda geral, pessoal, por lead e concluídos

1. `/appointments` → `GET /api/appointments?mine=false&includeCompleted=false&page=1&pageSize=10`.
2. Minha agenda muda mine para true; checkbox Mostrar concluídos inclui concluídos **junto dos pendentes**; ambos redefinem página.
3. `?lead=42` acrescenta leadId e faz `GET /api/leads/42` para nome/exibição. Link “Ver toda a agenda” remove filtro.
4. API junta Appointment com leads no escopo e filtra LeadId/BranchId/CurrentSellerId/conclusão. Ordena DueAt, depois Id; limita página/tamanho como leads.
5. Retorna `{items:[{id,leadId,dueAt,note,completed,leadName,phone,currentSellerId,branchId}],total,page,pageSize}`.
6. Data/hora são mostradas no fuso do navegador; retorno vencido e pendente ganha indicador visual local. Não existe notificação agendada/cron de retorno.
7. Botões editar/concluir/excluir só aparecem para admin ou vendedor atual. Se a página ficou vazia após ação e ainda há itens, front volta uma página.

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

Fontes: [groups-page.tsx](../apps/web/src/features/groups/groups-page.tsx), [group-form.tsx](../apps/web/src/features/groups/group-form.tsx), [GroupsController.cs](../apps/api/Features/Groups/GroupsController.cs).

### 9.1 Listar e abrir participantes

1. `/groups` → `GET /api/groups` → grupos com UserId do usuário, `{id,name,count}`. Count só conta membros atualmente acessíveis.
2. Admin não ganha acesso aos grupos particulares de outro usuário.
3. Ver participantes → `GET /api/groups/{id}` → proprietário válido ou `404` → `{id,name,members:[Lead]}` apenas com membros acessíveis.
4. Vendedor acessa membros da própria carteira atual; admin acessa leads no seu escopo de sede. Após transferência, membro pode deixar de aparecer/contar sem exclusão imediata da relação no banco.

### 9.2 Buscar candidatos e selecionar

1. Abrir formulário → `GET /api/groups/leads` com opcionais search/status/serviceId/sellerId/branchId/createdFrom/createdTo.
2. API devolve **array completo**, sem paginação, ordenado CreatedAt desc/Id. Front pagina localmente em blocos de vinte; selecionar tudo inclui todas as páginas filtradas.
3. Filtro vendedor só admin (`403` se vendedor enviar); filtro sede só admin global (`403` para outros). Data inicial maior que final → `400`; frontend evita consulta inválida.
4. Front transforma início local em UTC e data final no início do dia seguinte; API usa `>= createdFrom` e `< createdTo`, tornando o dia final escolhido inclusivo na interface.
5. Alterar filtro limpa seleção e volta à página 1; ao editar, membros atuais são priorizados no array. Não Enviar Mais pode pertencer ao grupo, mas não receber campanhas.

### 9.3 Criar/renomear/adicionar/remover membros

```json
{
  "name": "Interessados em habilitação",
  "leadIds": [42, 43],
  "status": "Agendar Contato",
  "serviceId": 1,
  "sellerId": null,
  "branchId": null,
  "createdFrom": null,
  "createdTo": null,
  "search": null
}
```

1. Submit → `POST /api/groups` ou `PUT /api/groups/{id}`; nome required até 160, trim no back.
2. Back reaplica escopo e todos os filtros, depois LeadIds. IDs informados precisam corresponder aos distintos efetivamente acessíveis/filtrados; seleção inválida → `403`.
3. Novo grupo tem UserId atual. Edição busca grupo do próprio usuário. `SetMembers` remove relações fora da nova seleção e adiciona as faltantes.
4. POST → `200 {id,name}`; PUT → `204`. Front notifica/fecha/recarrega cards; falha preserva formulário.
5. Grupo vazio é permitido (`leadIds:[]`). API aceita `leadIds:null` para pegar todos os resultados da filtragem, mas o formulário atual sempre envia um array explícito.
6. Grupo é um snapshot de IDs, não um filtro dinâmico que agrega futuros leads automaticamente. Salvar edição substitui participantes, inclusive os não acessíveis que não vieram na seleção.

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

Inativar sede impede login/sessão dos usuários associados e elegibilidade de campanhas, além de salvar novos atendimentos na sede. Inativar item não apaga referências existentes; a edição de lead exige escolher item ativo ou removê-lo.

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

Fontes: [chat-page.tsx](../apps/web/src/features/whatsapp/chat-page.tsx), [chat-list.tsx](../apps/web/src/features/whatsapp/chat-list.tsx), [conversation.tsx](../apps/web/src/features/whatsapp/conversation.tsx), [chat-states.ts](../apps/whatsapp/src/storage/chat-states.ts), [messages.ts](../apps/whatsapp/src/storage/messages.ts), [profile-picture.ts](../apps/whatsapp/src/messaging/profile-picture.ts).

### 12.1 Listar, buscar, arquivadas e fixadas

1. ChatPage → `GET /api/whatsapp/chats` a cada cinco segundos → serviço consulta SQLite por user.
2. Normaliza chat states @lid para telefone quando há mapeamento nas chaves. Lista até quinhentas conversas não arquivadas e todas as arquivadas; prioriza fixadas/data. Chats só com estado, sem registro em chats, não são produzidos por essa consulta.
3. API aplica nome de lead vinculado no escopo/sessão sobre o nome recebido; fallback é nome válido do WhatsApp ou número. Retorna `[{id,name,lastText,updatedAt,archived,pinnedAt,leadId,classifications:[{id,name,color}]}]`. Sem vínculo explícito: leadId=null/classifications=[], mesmo que o telefone coincida com um lead. Consulta os vínculos/classificações em lote, somente do usuário autenticado.
4. Busca por nome/ID acontece localmente, sem parâmetro para API. Busca abre seção de arquivadas. Front separa fixadas, normais e arquivadas; botão Arquivadas apenas expande/recolhe.
5. Estados são recebidos do WhatsApp; não há ações para arquivar/desarquivar/fixar/desafixar pelo CRM.
6. Lista vazia → Empty. Selecionar chat define estado local, não envia mensagem nem marca leitura remotamente.
7. Cada classificação pessoal do lead vinculado aparece como uma bolinha ao lado do nome, com nome acessível e tooltip. No cabeçalho de uma conversa vinculada, somente o botão ao lado de “Abrir lead” abre a lista compacta para criar, selecionar e remover várias marcações com salvamento automático ao clicar nos itens (6.8); não há botão acima de Arquivadas. Conversas sem lead vinculado não exibem esse seletor. Lista atualiza no polling de cinco segundos ou após cada marcação/desmarcação/vinculação/criação de lead pelo chat; seletor consulta classificações ao abrir, sem polling próprio.
8. Backup também pode mostrar as bolinhas, sempre das classificações de quem está consultando, inclusive ao consultar sessão de outro usuário. Não expõe o catálogo/marcações do dono da sessão e não exibe controles de criação/atribuição.

### 12.2 Foto e ampliação de perfil

Imagem/Avatar → `GET /api/whatsapp/profile-picture?chatId={jid}[&userId=...]` → verifica HistoryUser → serviço `/profile-picture` → valida JID individual/grupo/lid.

- Cache SQLite de seis horas; ausência de foto também pode ser cacheada.
- Cache expirou → precisa socket conectado, pede URL preview e baixa com timeout de dez segundos, exige image/* e até 5 MB. Se atualização falhar, usa cache anterior quando existe.
- Sem bytes/MIME → serviço `404`; API retorna erro de foto. Sucesso é **binário**, com `Cache-Control: private,max-age=3600`.
- Clicar foto abre modal usando o mesmo endpoint; falha mostra foto indisponível. Avatar tem fallback visual. Não altera cadastro nem foto no WhatsApp.

### 12.3 Abrir mensagens e carregar anteriores

1. Seleção do chat → `GET /api/whatsapp/messages?chatId={jid}` a cada quatro segundos no atendimento.
2. Serviço consulta até cem mensagens da sessão/conversa, ordena desc por timestamp/id e inverte para exibição cronológica. Retorno inclui id/chatId/text/mine/kind/timestamp/canDeleteForEveryone/attachment/contact/reactions; mine vem numérico do SQLite.
3. Tipos: text/image/video/audio/document/sticker/contact/deleted; metadados de anexo podem incluir tamanho/páginas/thumbnail, sem bytes completos da mídia.
4. Front combina página atual com mensagens anteriores e remove IDs duplicados; rola para o fim quando quantidade da página atual muda.
5. A partir de cem mensagens exibidas, “Carregar mensagens anteriores” → mesmo GET com `before={timestampDoPrimeiro}&beforeId={idDoPrimeiro}`. Cursor timestamp+id evita perder empates.
6. Acrescenta lote ao início; array vazio mostra “Não há mensagens anteriores armazenadas”. Não pede sincronização remota de histórico mais antigo.
7. Grupo @g.us ou @lid sem telefone identificado: leitura permitida, compositor/menu de ação não renderizados. Histórico pode ser consultado desconectado; mídia geralmente exige origem conectada.

### 12.4 Nova conversa manual e por deep link

- “Nova conversa” → prompt do navegador → remove não dígitos, exige 12–15 dígitos com DDI/DDD → seleciona objeto Chat provisório, sem requisição de resolução. Cancelar não faz nada; número inválido mostra erro. Chat só é persistido após mensagem/sincronização.
- `/whatsapp?phone=...` aceita 10–15 dígitos e seleciona Chat provisório; contrato de envio é mais restrito, 12–15. Não envia automaticamente nem verifica conexão nessa seleção.
- Resolver número de contato recebido/texto é outro caminho, detalhado na seção 14.5.

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
  "attachment": null,
  "contact": null,
  "replyTo": null
}
```

3. API aplica regra 13.1 e DTO (texto até 10.000). Serviço valida ao menos texto não vazio/anexo/contato; contato não pode coexistir com texto/anexo.
4. Serviço monta conteúdo Baileys. ReplyTo informado → recupera mensagem raw da sessão e exige mesmo chat por remoteJid/remoteJidAlt; inválido → `400`.
5. `socket.sendMessage` precisa retornar key.id; salva resultado em messages/chats → `{id,sent:true}`.
6. Front limpa texto/anexo/contato/reply/edit e recarrega mensagens. Falha conserva composição e exibe erro. Retornar id confirma aceitação pela integração, não leitura do destinatário.
7. “Responder” no menu só seleciona mensagem e mostra banner local; enviar usa mesmo endpoint com replyTo. Cancelar seleção limpa banner sem endpoint. O raw preserva contexto, mas o componente de histórico não renderiza bloco de citação recebido.

### 13.3 Editar

1. Menu Editar aparece para mensagem própria e kind=text → compositor preenchido; seleção de resposta é limpa.
2. Salvar → `PUT /api/whatsapp/messages/{id}` com `{chatId,text}`.
3. API aplica regra 13.1; serviço exige mensagem raw própria no chat (`403`), texto com 1–10.000 caracteres e conexão.
4. Envia `{text,edit:previous.key}`, substitui mensagem armazenada por conversation=text e salva → `{edited:true}`.
5. Front limpa edição e reload. Cancelar só limpa estado. Não existe validação local de janela temporal para edição; protocolo externo pode rejeitar. Substituição raw por texto não preserva todos os campos anteriores do conteúdo.

### 13.4 Reagir e remover reação

Menu → Reagir → escolha entre 👍 ❤️ 😂 😮 😢 🙏. Selecionar a própria reação atual envia emoji vazio para removê-la.

`POST /api/whatsapp/messages/{id}/react` com `{chatId,emoji}` → regra 13.1 → Zod aceita apenas esses emojis ou "" → busca mensagem do chat (`404`) → socket envia react com key original → exige id e salva reação → `{reacted:true}` → reload. Reações no SQLite são únicas por user/message/sender, sem criar balão adicional.

### 13.5 Encaminhar

1. Menu Encaminhar abre modal; busca local nas conversas individuais conhecidas, sem endpoint de candidatos.
2. Clique no destino → `POST /api/whatsapp/messages/{idOriginal}/forward` com `{chatId:jidDestino}`.
3. API verifica elegibilidade do **destino**; serviço procura mensagem original por user/id (`404`), envia `{forward:previous,force:true}` ao destino, exige id e persiste → `{id,forwarded:true}`.
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

### 14.1 Escolher arquivo e enviar

1. Menu “Adicionar à mensagem” → Documento/Fotos e vídeos/Áudio abre seletor local. Sem arquivo, não acontece nada.
2. Front rejeita >16 MiB; FileReader lê Data URL e guarda base64 sem prefixo. Erro de leitura mostra mensagem. Selecionar arquivo substitui contato; remover anexo é local.
3. Envia `/api/whatsapp/send` com:

```json
{
  "chatId": "5551999999999@s.whatsapp.net",
  "text": "Segue o material",
  "attachment": { "name": "material.pdf", "mime": "application/pdf", "data": "BASE64", "voiceNote": false, "asDocument": true }
}
```

4. Serviço valida nome 1–200, MIME até 120, base64 até 22.400.000 caracteres; decodifica e exige conteúdo não vazio e até 16 MiB.
5. asDocument=true → documento mesmo para imagem/áudio; sem flag, image/webp → sticker, image/* → image, video/* → video, audio/* → audio, demais → document.
6. Texto é caption em imagem/vídeo/documento. Sticker é sem legenda. Áudio não aceita caption: serviço envia áudio, persiste, depois envia texto em **segunda mensagem** quando existe.
7. Se áudio foi enviado e segundo texto falha, endpoint retorna erro, mas áudio já permanece enviado/persistido. Novo submit pode duplicar áudio; não há chave de idempotência.

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

1. Texto é analisado localmente: reconhece candidatos de 10–15 dígitos fora de palavras, com formatos de telefone; sem + e até onze dígitos acrescenta DDI 55.
2. Clique no número abre menu com Copiar e, no atendimento, Conversar. Copiar usa clipboard `+numero`; falha gera erro, sem endpoint.
3. Card recebido → Conversar usa o mesmo callback que Conversar no número do texto.
4. `POST /api/whatsapp/resolve-phone` com `{phone:digitos}` → serviço consulta variantes via socket; `null` mostra número não encontrado; desconectado/falha mostra erro.
5. Resolução exata → seleciona chat existente ou provisório. Variante → modal de confirmação; cancelar não muda chat; aceitar seleciona chat variante. Esse callback não altera telefone de um lead, ao contrário da seção 7.1.
6. Backup mantém cópia de número, mas não oferece ações de iniciar conversa pelo texto/card.

### 14.6 Prévia, ampliação e download de mídia recebida

1. Histórico só traz metadados. Image/sticker/video/audio começam a carregar quando IntersectionObserver os detecta próximos da área de mensagens (margem 300 px).
2. `GET /api/whatsapp/media/{id}[?userId=...]` → HistoryUser → serviço procura raw da sessão (`404`), verifica anexo (`400`) e baixa stream via downloadMediaMessage, com reuploadRequest do socket conectado.
3. Limita bytes baixados a 16 MiB (`413` ao exceder) → `{data:base64,mime,name}`; front converte a Blob e ObjectURL.
4. Imagem: thumbnail real + clique amplia; sticker: prévia; vídeo/áudio: controles nativos. PDF pode usar jpegThumbnail inline e ampliar em iframe; documentos mostram nome/tipo/tamanho/páginas e botão de download.
5. Download usa mídia já carregada ou faz GET sob demanda, cria link com download=nome. URLs temporárias são revogadas ao desmontar ou depois do download.
6. Falha de prévia oferece tentar novamente; falha de download/ampliação vai para erro da conversa. Sem thumbnail PDF, o caminho de download continua disponível; o overlay de abertura no card PDF é condicionado à thumbnail.
7. Não há arquivamento permanente dos bytes recebidos. Histórico pode existir enquanto mídia expirou/não está disponível ou a sessão está desconectada.

## 15. Recebimento e sincronização automática do WhatsApp

Fontes: [manager.ts](../apps/whatsapp/src/sessions/manager.ts), [messages.ts](../apps/whatsapp/src/storage/messages.ts), [contacts.ts](../apps/whatsapp/src/storage/contacts.ts), [chat-states.ts](../apps/whatsapp/src/storage/chat-states.ts).

Esses fluxos são originados por eventos Baileys, sem clique e sem POST do navegador.

| Evento | Tratamento/persistência | Resultado visto no app |
| --- | --- | --- |
| `messages.upsert` | saveMessage para cada item | Próximo polling exibe novo balão/prévia |
| `messaging-history.set` | Salva mensagens, contatos, estados e nomes dos chats | Histórico parcial e metadados sincronizados |
| `chats.upsert` / `chats.update` | Salva archived/pinned quando informados | Próximo GET separa arquivadas/fixadas |
| `contacts.upsert` / `contacts.update` | Salva nome por prioridade e IDs phone/lid | Próximo GET exibe nome mais adequado |
| `groups.upsert` / `groups.update` | Persiste subject como nome de conversa | Título de grupo, sem envio no CRM |
| `messages.update` com conteúdo | Mescla update com raw anterior e salva | Conteúdo editado atualizado |
| `messages.update` REVOKE | Marca deleted e remove conteúdo/reação | Balão Mensagem apagada |
| `messages.reaction` | Upsert/delete por remetente | Atualiza chips de reação |
| `messages.delete` com keys | Remove mensagem/reação local por chave | Mensagem sai do histórico |

### 15.1 Caminhos dentro de saveMessage

1. Descarta sem chat/id/conteúdo e `status@broadcast`; prefere remoteJidAlt individual ao remoteJid quando existe.
2. Normaliza envelopes Baileys. ReactionMessage atualiza reação e termina; protocolMessage.editedMessage atualiza original do mesmo chat; REVOKE marca deleted; outros protocolos/distribuição de chave não geram balões.
3. Classifica conteúdo, extrai texto/caption/nome de documento/card; tipo não suportado pode cair em “Mensagem não suportada”. Timestamp fica em milissegundos.
4. Incoming individual salva pushName; incoming de grupo salva nome do remetente sem substituir título do grupo.
5. INSERT/upsert por `(user_id,id)` atualiza text/kind/raw; registro deleted não é sobrescrito por ressincronização. Atualiza chats last_text/updated_at somente respeitando data do evento, evitando que histórico mais antigo substitua prévia mais nova.
6. Nome no storage: conversationName prioridade 5, contato salvo 4, verifiedName 3, notify 2, username/pushName 1. API ainda sobrepõe nome do lead vinculado. Grupos exigem nome de conversa com prioridade 5 para usar título.
7. Reação recebida sem mensagem alvo armazenada é ignorada; não há buffer para reaplicá-la posteriormente.
8. Não persiste estados de entrega/leitura a partir de updates sem conteúdo. Não há envio de recibo de leitura implementado na seleção de chat.

## 16. Disparos e sequências de mensagens

Fontes: [campaigns-page.tsx](../apps/web/src/features/whatsapp/campaigns-page.tsx), [campaign-message-sequence.tsx](../apps/web/src/features/whatsapp/campaign-message-sequence.tsx), [campaign-tracking.tsx](../apps/web/src/features/whatsapp/campaign-tracking.tsx), [WhatsAppController.cs](../apps/api/Features/WhatsApp/WhatsAppController.cs), [EligibilityController.cs](../apps/api/Features/WhatsApp/EligibilityController.cs), [worker.ts](../apps/whatsapp/src/campaigns/worker.ts), [deliver.ts](../apps/whatsapp/src/campaigns/deliver.ts), [send-to-phone.ts](../apps/whatsapp/src/campaigns/send-to-phone.ts), [schemas.ts](../apps/whatsapp/src/messaging/schemas.ts).

### 16.1 Escolher público, filtros e seleção em várias páginas

1. Entrada em `/campaigns` → monta Connection, `GET /api/groups`, lista de candidatos e histórico de campanhas.
2. Modos Todos os contatos/Grupos. Em Grupos sem groupId, não consulta candidatos; selecionar grupo habilita a consulta.
3. `GET /api/whatsapp/campaign-recipients?page=1&pageSize=20` com opcionais groupId/status/serviceId/sellerId/branchId/search.
4. API aplica sede, exclui OptOut e sedes inativas. Vendedor pode incluir leads de **outros vendedores da mesma sede**; filtro sellerId só admin; branchId só admin global. Grupo precisa pertencer ao usuário (`404`). Grupo e filtros sempre se combinam.
5. Nome/telefone por substring, ordenação Name/Id → `{items:[Lead],total,page,pageSize}`. Não precisa vínculo com chat nem conversa anterior.
6. Marcar todos inclui todos os resultados em todas as páginas (`leadIds:null`); desmarcar indivíduos alimenta excludedLeadIds. Seleção manual após desmarcar todos alimenta leadIds explícitos.
7. Alterar modo/filtro limpa selected/excluded, restaura todos selecionados e volta página 1; mudar sede também limpa filtro vendedor. Busca não tem debounce nessa página.
8. API de público não aceita período de cadastro; esse filtro está implementado somente na formação de grupos.

### 16.2 Preparar mensagens e prévia local

1. Começa com uma mensagem. Pode adicionar até dez, remover mantendo pelo menos uma, mover para cima/baixo e preencher texto até 10.000/anexo.
2. Attachments seguem leitura base64/limite por arquivo da seção 14. Soma de base64 da sequência não pode passar 22.400.000 caracteres; limite é verificado front/API/serviço e descrito na interface como 16 MB.
3. WebP limpa/desabilita texto e é figurinha. Prévia local mostra sequência com exemplo “Mariana Almeida”, substitui `{{nome}}`, inclui imagem/sticker/PDF quando aplicável. Não chama back nem envia ao WhatsApp.
4. Define intervalSeconds 3–3600, intervalVarianceSeconds 0–1800, pauseEvery 1–500, pauseSeconds 0–3600; defaults 10/3/20/60. Variância precisa manter limite inferior de três segundos.

### 16.3 Pré-validar e confirmar público

1. Clique “Enviar disparos” ainda **não inicia campanha**. Front rejeita mensagem vazia e monta payload:

```json
{
  "name": "Campanha de matrícula",
  "messages": [{ "text": "Olá, {{nome}}!", "attachment": null }],
  "leadIds": null,
  "excludedLeadIds": [43],
  "groupId": null,
  "status": "Agendar Contato",
  "serviceId": null,
  "sellerId": null,
  "branchId": null,
  "search": null,
  "intervalSeconds": 10,
  "intervalVarianceSeconds": 3,
  "pauseEvery": 20,
  "pauseSeconds": 60
}
```

2. `POST /api/whatsapp/campaigns/preview` recebe contrato de público (campos de mensagem/configuração extra não são utilizados por esse endpoint). Reaplica filtros/escopo, toma até 501 resultados e exige 1–500.
3. LeadIds explícitos precisam corresponder à quantidade distinta selecionada após filtros/exclusões; mudança/ineligibilidade → `409`; zero ou mais de 500 → `400`.
4. Retorna array completo de leads; modal mostra nomes/telefones/status e permite retirar destinatários ou desmarcar tudo. Cancelar fecha modal sem campanha.
5. Confirmar exige ao menos um confirmedId → `POST /api/whatsapp/campaigns` com payload e `leadIds:confirmedIds`. API valida mensagens (1–10, conteúdo), soma anexos, ranges e variância; recalcula público com mesmos filtros e seleção.
6. Mudança entre preview e confirmação pode rejeitar a criação. Preview não testa conexão nem conteúdo pelo contrato completo; confirmação pode falhar nessas etapas posteriores.

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
6. Elegível → percorre messages na ordem preparada; substitui todas as ocorrências exatas de `{{nome}}` pelo nome do snapshot. Não relê nome atual do CRM.
7. Primeira mensagem do destinatário: tenta telefone e variantes com `onWhatsApp`; evita repetir JID resolvido já tentado. Pode tentar outra variante após falha de envio. Primeiro sucesso guarda JID para mensagens seguintes desse lead e devolve telefone efetivo.
8. Variante no disparo não pede confirmação e não muda Phone/ChatId no CRM; resultado de entrega registra número efetivo. Mesmo telefone em leads de sedes diferentes pode receber mais de uma sequência; não há deduplicação por número no público.
9. Cada mensagem usa sendMessage do serviço diretamente; não passa por EnsureCanMessage da API, por isso a regra de campanha é a do eligibility.
10. Entre tentativas quando há outra mensagem/destinatário, espera inteiro aleatório entre intervalSeconds ± variância. A cada pauseEvery mensagens tentadas, soma pauseSeconds. Conta tentativas, inclusive falhas; skipped não aumenta esse contador.
11. Áudio com texto pode produzir duas mensagens físicas no WhatsApp para uma entrada da sequência; intervalo/pauseEvery contam a entrada, não esses dois envios internos.
12. Falha de mensagem registra destinatário failed com “Mensagem N de total: motivo”, interrompe o restante da sequência dele, espera quando há próximo destinatário e continua lote. Mensagens anteriores desse contato não são desfeitas.
13. Sequência completa → destinatário sent; armazena id da última mensagem principal retornada e telefone efetivo, incrementa contador uma vez por destinatário. Não há registro separado de entrega para cada mensagem da sequência.
14. Ao terminar iteração → completed mesmo quando alguns destinatários failed/skipped. Failed no nível de campanha é reservado às falhas globais fora do tratamento individual.

### 16.6 Acompanhar histórico, progresso e detalhes

- `GET /api/whatsapp/campaigns?page=1&pageSize=6` a cada quatro segundos → campanhas do usuário, mais recentes primeiro, `{items,total,page,pageSize}`. Item: id/name/total/messageCount/status/sent/failed/skipped/error/createdAt.
- Front calcula processados=sent+failed+skipped, percentual e pendentes=total-processados; estados exibidos running/completed/cancelled/failed/interrupted. Não há métricas de lido/entregue ao aparelho.
- “Ver detalhes” → `GET /api/whatsapp/campaigns/{id}/messages` uma vez: sequência original com anexos/base64; payload legado de texto/anexo único tem fallback. Conteúdo salvo renderiza prévia e não é editável/reexecutado.
- Detalhes também montam `GET /api/whatsapp/campaigns/{id}/deliveries?page=1&pageSize=10[&status=sent|skipped|failed|pending]` a cada quatro segundos.
- Serviço valida dono (`404` se ausente/alheia), pagina por posição, retorna `{leadId,name,phone,status,error,externalMessageId,updatedAt}`. Mudar filtro de resultado redefine página; fechar detalhes desmonta polling.
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
4. Leitura do texto vem do SQLite, mesmo sem origem conectada. Fotos podem funcionar via cache; mídia depende de socket da **origem** e disponibilidade externa.
5. O backup é uma tela de consulta ao histórico persistido: não cria arquivo de exportação, não importa/restaura banco e não garante sincronizar todo histórico do celular.
6. Consulta administrativa permite ver chats da sessão autorizada, mesmo quando uma conversa não está vinculada a lead; sobreposição de nomes de lead continua limitada pelo escopo CRM.

## 18. Persistência, health e encerramento

Fontes: [CrmDbContext.cs](../apps/api/Infrastructure/CrmDbContext.cs), [Entities.cs](../apps/api/Domain/Entities.cs), [database.ts](../apps/whatsapp/src/storage/database.ts), [server.ts](../apps/whatsapp/src/server.ts), [compose.yaml](../compose.yaml).

- CRM: Branches, Users, Catalog, Leads, Appointments, Groups, GroupMembers, Classifications e LeadClassifications via EF/SQLite. Índices únicos Username, BranchId+Phone e ChatUserId+ChatId; chave composta ClassificationId+LeadId nos vínculos pessoais. A migração LeadClassifications cria as novas tabelas no início da API, preservando os registros existentes. Revision é concurrency token só no lead.
- Relações para sede/usuários/catálogo são restritas na exclusão. Excluir lead elimina retornos e memberships; excluir grupo elimina memberships. Não há histórico de transferências/edições por entidade.
- WhatsApp: auth, contacts, service_state, chats, chat_states, messages, reactions, profile_pictures, campaigns, deliveries no banco separado. Chats/mensagens/auth usam isolamento por user_id; campanha usa UUID + dono.
- CRM e serviço têm `GET /health` → `{status:'ok'}`, sem login/chave. São checks de processo; não atestam WhatsApp conectado nem fazem validação aprofundada de dependências.
- `GET /internal/eligibility` é callback serviço→CRM; não passa pelo rewrite `/api` do navegador. Detalhes do contrato estão na seção 16.5.
- SIGTERM/SIGINT no serviço → aborta campaigns, marca sessões stopped/cancela reconexões, encerra sockets, fecha Fastify, aguarda workers e fecha banco. Campanha abortada nessa saída não é automaticamente completed; próxima inicialização marca running como interrupted.
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
11. **Não há flows para** recuperação de senha por e-mail, cadastro público de usuário, venda/contrato independente, upload de contrato, auditoria de status/transferência, notificação agendada de retorno, importação/exportação de leads, agendamento futuro de campanha, retomada de campanha ou envio em grupo WhatsApp. A entidade Lead contém Contract, porém não há campo no LeadRequest, formulário ou endpoint para administrá-lo.
12. **Arquivadas/fixadas são consultas:** não há comandos do CRM para alterar esse estado no WhatsApp. Sem interface/endpoint de marcação de leitura ou exibição persistida de recibos de entrega/leitura.
13. **Dados antigos no front:** páginas sem polling só recarregam por ações/dependências; conflitos de revisão não refazem automaticamente GET do lead. Mensagens antigas carregadas mantêm precedência no dedupe e não são repolled pelo cursor; updates externos podem não se refletir nelas até reabrir conversa.
14. **Desconectar/logout/inativar são diferentes:** logout do CRM não desconecta WhatsApp; desconectar WhatsApp não apaga histórico; inativar usuário invalida CRM/elegibilidade, mas não encerra automaticamente socket restaurável.
15. **Limites variam por camada:** tamanho binário de anexo é 16 MiB; base64 tem teto 22.400.000 caracteres; corpo HTTP 24.000.000 bytes. Nome de contato escolhido a partir de chat também passa pela validação de 120 caracteres no serviço.

## 20. Rastreabilidade e conferência da documentação

O levantamento percorreu todas as páginas de `apps/web/src/app`, componentes funcionais em `features`, Provider/cliente HTTP/hook de recursos, todos os controllers de `apps/api/Features`, regras/entidades/índices do CRM e rotas/sessões/messaging/campaigns/storage do serviço WhatsApp. CSS e screenshots não foram usados para inferir comportamento de back.

Foram conferidos os cenários declarados na suíte existente, sem executar envios reais. Na entrega de classificações pessoais e seu filtro na tabela de 02/10/2026, os 58 testes da API passaram (incluindo ClassificationTests), assim como a checagem de tipos e o build de produção do frontend. A interface foi conferida com banco e serviço WhatsApp simulados, incluindo criação no menu compacto, seleção múltipla por item com salvamento automático, bolinhas, persistência ao reabrir e falha de gravação com retorno à seleção anterior. A correção da piscada foi verificada ao marcar/desmarcar com resposta de gravação atrasada em dois segundos: a lista manteve tamanho, posição, foco e opacidade durante e após a requisição. Na tabela foram conferidas etiquetas coloridas, filtro pessoal com retorno à primeira página, atualização após fechar o detalhe sem salvar o formulário e Escape fechando apenas o seletor aninhado:

| Evidência no repositório | Regras/caminhos corroborados |
| --- | --- |
| [BusinessFlowTests.cs](../tests/Crm.Api.Tests/BusinessFlowTests.cs) | CSRF, escopo, telefone único, transferências, OptOut, retornos, grupos e elegibilidade |
| [LeadScopeTests.cs](../tests/Crm.Api.Tests/LeadScopeTests.cs), [LeadEditingTests.cs](../tests/Crm.Api.Tests/LeadEditingTests.cs) | Leitura/edição por sede/carteira, proteção de contato, exclusão |
| [LeadConversationTests.cs](../tests/Crm.Api.Tests/LeadConversationTests.cs) | Variantes, confirmação, duplicidade, conversa existente e número ausente |
| [ClassificationTests.cs](../tests/Crm.Api.Tests/ClassificationTests.cs) | Isolamento pessoal inclusive para admin, cores/nomes/payloads inválidos, escopo de leads, seleção múltipla/remoção/cascata, rejeição atômica de IDs alheios, bolinhas com vínculo explícito/backup e etiquetas/filtro pessoal na listagem antes da paginação, combinado com carteira/vendas/serviço/sede/vendedor e preservando o escopo de sede |
| [GroupLeadTests.cs](../tests/Crm.Api.Tests/GroupLeadTests.cs) | Seleção sem vínculo, filtros combinados, escopo e seleção além de cem |
| [CampaignAudienceTests.cs](../tests/Crm.Api.Tests/CampaignAudienceTests.cs) | Público de outros vendedores, filtros, exclusões, confirmação e elegibilidade |
| [DashboardScopeTests.cs](../tests/Crm.Api.Tests/DashboardScopeTests.cs), [DashboardPeriodTests.cs](../tests/Crm.Api.Tests/DashboardPeriodTests.cs) | Período inclusivo, indicadores e agenda por sede |
| [UserRegistrationTests.cs](../tests/Crm.Api.Tests/UserRegistrationTests.cs) | Cadastro administrativo e limites de sede |
| [history.test.ts](../apps/whatsapp/test/history.test.ts) | Cursor, isolamento, metadados, nomes, fixadas/arquivadas, reações e exclusão |
| [validation.test.ts](../apps/whatsapp/test/validation.test.ts) | Schema de mensagem/contato/voz/campanha e limites |
| [delivery.test.ts](../apps/whatsapp/test/delivery.test.ts) | Elegibilidade, intervalos, pausa, falha e cancelamento |
| [resolve-phone.test.ts](../apps/whatsapp/test/resolve-phone.test.ts), [send-to-phone.test.ts](../apps/whatsapp/test/send-to-phone.test.ts) | Resolução, variantes e envio/cancelamento durante lookup |
| [campaign-messages.test.ts](../apps/whatsapp/test/campaign-messages.test.ts) | Detalhes de sequência, dono e payload legado |
| [voice-note.test.ts](../apps/whatsapp/test/voice-note.test.ts) | Conversão para Ogg/Opus |
| [message-phones.test.ts](../apps/web/test/message-phones.test.ts) | Telefones detectados em texto e normalização |

Para atualizar este documento, revisar primeiro handlers/eventos e contratos dos arquivos vinculados, conferir novos endpoints/call sites e depois ajustar o inventário. A implementação, e não o nome do botão ou a especificação original, determina cada fluxo descrito.

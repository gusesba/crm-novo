# Comparação funcional: AutoEscola inicial × CRM atual

**Data da análise:** 22/10/2026.  
**Projeto inicial:** `C:\Users\dados\Documents\Projetos\AutoEscola`.  
**Projeto atual:** `C:\Users\dados\Documents\Projetos\crm-novo`.

## 1. Escopo e critérios

Comparação estática do código disponível nas duas pastas, cobrindo páginas, componentes, chamadas HTTP, controllers, handlers, regras de autorização, entidades, persistência e processos do serviço WhatsApp. No inicial, foram consideradas as três partes:

- Frontend: `CRM-AutoEscola-Front`.
- API: `CRM-Docker/crm-auto-escola-back/ExemploBackendDotNet`.
- WhatsApp: `CRM-Docker/crm-auto-escola-whats`.

No atual, foram consideradas `apps/web`, `apps/api` e `apps/whatsapp`, além dos testes existentes e de [FLUXOS_TECNICOS.md](FLUXOS_TECNICOS.md). A documentação serviu como orientação; as conclusões foram conferidas no código. Não foram executados os sistemas, testes ou envios reais de WhatsApp nesta análise. Portanto, **“existe” significa implementação identificada**, sem atestar funcionamento em produção ou compatibilidade atual com o WhatsApp externo.

Uma página, campo de entidade ou botão isolado não foi considerado prova de funcionalidade completa. Quando tela e servidor divergem, a diferença está explicitada. “Não encontrado” refere-se ao código pesquisado nessas pastas, sem inferir o que existe em outros repositórios ou versões implantadas.

Legenda das matrizes:

| Resultado | Significado |
| --- | --- |
| Ambos | A capacidade existe nos dois, ainda que a organização visual seja diferente. |
| Só inicial | Existe no inicial e não foi encontrado equivalente direto no atual. |
| Só atual | Existe no atual e não foi encontrado equivalente no inicial. |
| Alterado | Existe capacidade relacionada nos dois, mas regra, alcance ou apresentação mudou. |
| Parcial | Há código, campo ou interface, mas o fluxo não está completo ou tem restrição relevante. |

Os identificadores de fontes, como [A5] e [N2], são links para os arquivos examinados; **A** identifica o inicial e **N**, o atual. Outros arquivos complementares são apontados pelo caminho dentro da mesma área.

## 2. Principais diferenças

O atual preserva o núcleo comercial do inicial: leads/vendas no mesmo cadastro, cinco status, equipe e sedes, serviços e condições, retornos, transferências, WhatsApp pessoal, grupos internos, envio em lote e consulta ao histórico. Entretanto, **não há paridade funcional integral**.

### 2.1 Existe no inicial e falta equivalente direto no atual

1. **Exportação de leads/vendas para Excel**, com filtros de período, status, sede e vendedor atual; gera `vendas.xlsx`. [A5]
2. **Filtros de vendedor e serviço no dashboard**. No atual, o dashboard aceita sede e período. [A6] [A7] [N3]
3. **Consulta de agenda por dia/período**, busca por cliente e ordenação escolhida pelo usuário. O atual tem agenda geral/pessoal/por lead, mas não esses filtros. [A9] [N4]
4. **Arquivar e desarquivar conversas no WhatsApp pelo CRM**. O atual apenas consulta e organiza o estado recebido. [A13] [A16] [N6] [N7]
5. **Salvar/editar contato na agenda do WhatsApp**, com nome e sobrenome. Enviar cartão de contato no atual é outra operação. [A13] [A16]
6. **Desvincular manualmente conversa de lead**, no chat e no cadastro comercial. O atual limpa o vínculo ao transferir ou trocar o telefone, mas não oferece desvinculação independente. [A13] [A25] [N1] [N2]
7. **“Vincular todos”**, que tenta associar várias conversas aos leads correspondentes e apresenta resumo dos resultados. [A14] [A27]
8. **Ver e alterar grupos internos diretamente no chat e no detalhe do lead**; o atual concentra a manutenção em `/groups`. [A14] [A25] [N6] [N5]
9. **Contador visual de mensagens não lidas**, com zeragem local ao selecionar conversa. Não foi encontrado equivalente no contrato/lista do atual. [A14] [A28] [N7]
10. **Personalização por primeiro nome**, `${PrimeiroNome}`, além de `${NomeCompleto}`. O atual implementa apenas `{{nome}}`, substituído pelo nome inteiro do snapshot. [A15] [N8]
11. **Múltiplos status, serviços e sedes simultaneamente no público do lote**, opção explícita de destinatários sem serviço e filtro direto por data de cadastro. O atual usa um valor por filtro; período pode ser aplicado ao criar um grupo. [A15] [N7]
12. **Memorização dos intervalos de lote no navegador**. O atual persiste a configuração da campanha já criada, mas não recupera preferências para um novo formulário. [A15] [N8]
13. **Renderização de negrito, itálico, tachado e código no texto das mensagens**, e **bloco visual da mensagem citada** nas respostas. O atual envia resposta referenciada, mas não renderiza esse bloco nem interpreta essa formatação no texto. [A22] [A23] [N9] [N10]
14. **Colar arquivo/imagem no compositor** via tratamento de clipboard. O atual oferece seleção de anexos, sem handler equivalente de colagem de arquivo. [A24] [N11]
15. **Listagens de equipe, sedes, serviços e condições com busca, filtros, ordenação e paginação**. No atual, Configurações carrega o catálogo em listas sem esses controles e a tela é administrativa. [A29] [N12]

### 2.2 Existe no atual e falta equivalente no inicial

1. **Classificações pessoais coloridas de leads**, múltiplas por lead, com privacidade por usuário, salvamento automático e filtros em leads, grupos e campanhas. [N13]
2. **Visualizações combináveis de conversas por WhatsApp, status e classificação**, grupos recolhíveis, contagens e priorização de fixadas. [N6] [N14]
3. **Excluir lead**, com exclusão em cascata dos seus retornos, membros de grupos e marcações pessoais. [N1]
4. **Editar, concluir, reabrir e excluir agendamentos**, além de identificar retornos vencidos. [N4]
5. **Renomear grupo e substituir participantes em uma edição**, com seleção em várias páginas e revalidação dos filtros. [N5]
6. **Campanhas persistidas**, com nome, progresso consultável, histórico, sequência salva e resultado por destinatário; o envio continua em worker depois da resposta HTTP. [N7] [N8]
7. **Campanhas sem vínculo prévio de chat**, revalidação de elegibilidade antes de cada destinatário e bloqueio obrigatório de “Não Enviar Mais” no servidor. [N7] [N15]
8. **Reagir e remover reação de mensagem**, com sincronização e persistência das reações. [N9] [N16]
9. **Gravar áudio no navegador**, pré-escutar, descartar e enviar como mensagem de voz, com conversão para Ogg/Opus. [N11] [N17]
10. **Selecionar figurinhas recentes e criar figurinha a partir de PNG/JPEG/WebP**. [N18]
11. **Enviar e exibir cartão de contato vCard**, além de copiar números detectados nas mensagens. [N9] [N10] [N16]
12. **Ampliar foto de perfil** e tratamento mais detalhado de prévias/downloads de anexos, incluindo PDF. [N6] [N19]
13. **Gráficos de evolução e distribuição de status**, conversão geral e próximos retornos no dashboard. [N3] [N20]
14. **Editar e inativar sedes, serviços e condições**, com efeito das inativações nas regras de acesso/cadastro/envio. [N12]
15. **Controle de concorrência por revisão no lead**, sessão em cookie HttpOnly com CSRF, logout efetivo no servidor, limitação de login e invalidação das sessões ao editar usuário. [N1] [N2] [N21]

## 3. Navegação: correspondência entre telas

| Área | Inicial | Atual | Observação |
| --- | --- | --- | --- |
| Login | `/auth` | `/login` | Contrato de autenticação substituído. |
| Entrada `/` | Página principal vazia após autenticação | Redireciona por perfil | Admin vai ao dashboard; vendedor, aos próprios leads. |
| Dashboard | `/dashboard` | `/dashboard` | Ambos; filtros e cálculo do ranking diferem. |
| Leads/vendas gerais | `/venda` | `/leads` | No inicial, `/venda` lista o cadastro misto, não apenas vendas efetivadas. |
| Meus leads | `/venda/leads` | `/my-leads` | No inicial, começa com status 1 e 3; no atual, carteira pessoal sem essa exclusão inicial. |
| Vendas efetivadas | Consulta do cadastro misto; filtro também na exportação/API | `/sales` | Visão dedicada no atual, usando o mesmo cadastro de lead. |
| Novo/editar lead | `/venda/novo`, `/venda/editar/[id]` | Modais nas listagens e no chat | Atual também aceita `/leads?lead=ID`. |
| Transferência | `/venda/trocar` | Seleção na tabela + modal | A tela de duas carteiras do inicial não foi mantida. |
| Agenda geral | `/agendamento` | `/appointments` | Atual reúne operações de manutenção do retorno. |
| Agenda diária/pessoal | `/agendamento/diario` | Aba “Minha agenda” | A aba atual não substitui o filtro de dia/período do inicial. |
| Agenda por cadastro | `/agendamento/venda/[id]` | `/appointments?lead=ID` | Ambos. |
| Criar retorno | `/agendamento/novo/[id]` e criação do lead | Modal de agenda e formulário do lead | Atual permite também adicionar retorno ao editar lead. |
| Conversas | `/whatsapp` | `/whatsapp` | Inicial usa o rótulo “Disparos” no menu para esta área. |
| Envio em lote | Modal “Envio em grupo” dentro de `/whatsapp` | `/campaigns` | Substituído por campanhas acompanháveis. |
| Grupos internos | `/whatsapp/grupos` | `/groups` | Nenhuma dessas telas cria uma sala de grupo no WhatsApp externo. |
| Histórico | `/backup` | `/backup` | Ambos são consulta a mensagens persistidas. |
| Equipe | `/vendedor`, `/vendedor/novo`, `/vendedor/editar/[id]` | `/settings`, aba Equipe | Cadastro/edição mantidos; consulta mudou de alcance. |
| Sedes | `/sede`, `/sede/novo` | `/settings`, aba Sedes | Atual acrescenta edição. |
| Serviços | `/servico`, `/servico/novo` | `/settings`, aba Serviços | Atual acrescenta edição/inativação. |
| Condições | `/condicaoVenda`, `/condicaoVenda/novo` | `/settings`, aba Condições | Atual acrescenta edição/inativação. |

Fontes: [A1], árvore de `app/(main)` do inicial, árvore de `apps/web/src/app` e componentes de funcionalidades do atual.

## 4. Matriz funcional detalhada

### 4.1 Acesso, usuários e permissões

Fontes: [A1], [A2], [A21], [A30], [N12], [N21], [N22].

| Funcionalidade/regra | Inicial | Atual | Resultado |
| --- | --- | --- | --- |
| Login por usuário e senha | JWT Bearer, salvo em `localStorage`, validade de 12 horas. | Cookie HttpOnly, validade de 8 horas com renovação deslizante. | Alterado |
| Restaurar identificação ao abrir | Hook decodifica JWT local e confere expiração. | Provider consulta `/auth/me` e carrega catálogo. | Alterado |
| Sair do CRM | Botão apenas navega para `/auth`; não remove o token nem revoga sessão no servidor. | `/auth/logout` encerra cookie e limpa estado do cliente. | Só atual como encerramento efetivo |
| Perfis vendedor/admin | Sim; admin global sem sede e escopo por sede já existem. | Sim; mantém distinção global/sede. | Ambos |
| Dashboard protegido como operação administrativa | Menu só para admin, mas endpoint usa `UserOrAdmin`. | Front e endpoint exigem admin. | Alterado |
| Cadastro administrativo de usuário | Nome, usuário, senha, admin e sede. | Mesmos dados e estado ativo. | Ambos |
| Edição de usuário e senha por admin | Sim; inclui status, perfil e sede. | Sim; senha nova com mínimo de 10 caracteres. | Ambos, com validações ampliadas |
| Inativar usuário | Impede novo login; token existente não tem SecurityStamp/revalidação equivalente. | Impede login e invalida cookie em próxima validação. | Alterado |
| Invalidar sessões após editar usuário | Não encontrado mecanismo equivalente. | Novo SecurityStamp em toda edição. | Só atual |
| Impedir admin de remover o próprio acesso | Não encontrado no handler de edição. | Rejeita própria inativação, mudança de perfil/sede. | Só atual |
| Mudar sede de vendedor com carteira | Handler não exige transferência prévia. | Exige transferir permanentemente leads em que seja vendedor original ou atual. | Alterado |
| Criação de usuário por admin de sede | Handler de criação não usa o serviço de escopo do autor. | Restringe sede e impede criar admin global. | Alterado |
| Limitar tentativas de login | Não encontrado rate limiter no fluxo. | 15 requisições/IP/minuto. | Só atual |
| Proteção CSRF | Não há fluxo equivalente; autenticação é Bearer. | Token e validação nas mutações, inclusive login. | Só atual |
| Consultar equipe/sedes/serviços/condições como vendedor | Telas de consulta e GETs permitidos. | `/catalog` continua autenticado e fornece opções, mas `/settings` é administrativa. | Alterado; perda das telas de consulta para vendedor |
| Navegação móvel | Layout principal fixa lateral de 16rem. | Shell com menu móvel e estilos responsivos. | Ampliado no atual; sem homologação visual nesta análise |

### 4.2 Cadastro comercial, busca e transferências

Fontes: [A3], [A4], [A5], [A25], [A26], [A31], [N1], [N2], [N23].

| Funcionalidade/regra | Inicial | Atual | Resultado |
| --- | --- | --- | --- |
| Criar e editar lead/venda | Sim, entidade `VendaModel`. | Sim, entidade `Lead`. | Ambos |
| Venda como entidade financeira separada | Não; é status do cadastro. | Não; `/sales` filtra status. | Ausente em ambos |
| Dados pessoais e comerciais | Nome, contato principal, fone adicional, e-mail, gênero, nascimento, origem, indicação, descoberta, motivo, serviço, condição, valor e observações. | Campos equivalentes; ver seção 5. | Ambos |
| Cinco status comerciais | Agendar Contato, Venda Efetivada, Stand By, Optou pela Concorrência, Não Enviar Mais. | Mesmos significados, gravados como texto. | Ambos |
| Busca de nome/contato e paginação | Sim. | Sim, busca única por nome ou telefone e debounce na tela de leads. | Ambos |
| Carteira pessoal | Filtro por vendedor atual, inicialmente status 1/3. | `mine=true`, sem restringir inicialmente aos abertos. | Alterado |
| Consultar múltiplos status ao mesmo tempo | Array `status` na API; Meus Leads envia `[1,3]` fixos, sem seletor visual de status. | Um `status` por consulta. | Só inicial na API/combinação fixa da carteira |
| Filtro por serviço na consulta comercial | Suportado na API. | Suportado na API e na barra da listagem. | Ambos; exposição ampliada no atual |
| Filtros por sede/vendedor atual | API inicial suporta; exposição varia entre listagem, lote, dashboard e exportação. | Listagem com selects, conforme perfil/modo. | Ambos, reorganizados |
| Filtros avançados da API de vendas | ID, condição, gênero, origem, vendedor original/atual, nomes de vendedores, e-mail, fones, datas, valor mínimo/máximo e exclusão do vendedor atual. | GET de leads não aceita esse conjunto; aceita busca, status, serviço, vendedor atual, sede, classificação, mine/sales. | Só inicial para os filtros sem equivalente |
| Ordenação comercial configurável | API aceita cliente/data/valor/status/ID e direção; tela permite solicitar ordenação. | Ordenação fixa por criação desc/ID desc. | Só inicial |
| Exportar Excel | Botão consulta até 10.000 registros e gera arquivo com 9 colunas. | Não há exportação na interface/API. | Só inicial |
| Bloquear telefone duplicado | Handlers procuram variantes de `Contato` em vendas de todas as sedes; não há índice único equivalente no banco. | Normaliza telefone e exige unicidade de `BranchId + Phone`, também por índice. | Alterado |
| Mesmo telefone em sedes distintas | A busca de duplicidade não separa sede. | Permitido em sedes diferentes. | Alterado |
| Editar dados de contato como vendedor | Tela desabilita nome/fones; handler aceita os campos sem validação equivalente por perfil. | Tela e API protegem nome, telefones, e-mail, gênero e nascimento de lead existente. | Alterado |
| Editar lead de outro vendedor da sede | Handler verifica sede, sem exigir vendedor atual. | Vendedor só altera a carteira atual; admin altera dentro do escopo. | Alterado |
| Atribuir vendedor na criação | Tela restringe vendedor comum; handler não repete a mesma garantia. | API impede vendedor de cadastrar para outro usuário. | Alterado |
| Alterar sede de cadastro existente | Handler aceita SedeId dentro da regra de escopo; admin global pode mudar. | LeadService impede mudar BranchId. | Só inicial para mudança de sede do lead |
| Mudar vendedor pelo formulário comercial | Edição atualiza `VendedorAtualId` com o vendedor enviado. | Formulário/API exigem usar transferência. | Alterado |
| Revisão/edição concorrente | Não há revisão de lead. | Revision enviada, comparação e token EF; conflito devolve 409. | Só atual |
| Excluir cadastro comercial | Não há DELETE de Venda; DELETE de `VendaWhatsapp` só remove vínculo. | DELETE de lead, apenas admin no escopo. | Só atual |
| Transferência temporária/permanente | Atualiza vendedor atual; permanente atualiza também original. | Mesma distinção. | Ambos |
| Transferência em lote | Tela de origem/destino e opção “Transferidos”. | Seleção na tabela e modal, de 1 a 500 entradas na API. | Ambos, com interface alterada |
| Consulta “Transferidos” para devolver carteira | Usa vendedor original e exclusão de vendedor atual na API. | Não há filtro específico original ≠ atual nem tela de duas carteiras. | Só inicial como consulta dedicada |
| Autorizar e validar transferência no servidor | Endpoint `UserOrAdmin`; handler verifica sede dos registros encontrados, sem validar integralmente destino/IDs faltantes. | Endpoint admin; valida todos os IDs e vendedor ativo/elegível por sede antes de salvar. | Alterado |
| Vínculo de chat após transferência | Handler não remove vínculo. | Remove ChatId/ChatUserId e incrementa revisão. | Alterado |
| Retorno automático de transferência temporária | Não encontrado. | Não existe prazo/job; exige outra transferência. | Ausente em ambos |
| Criar retorno junto do cadastro | Criação da venda grava venda e depois retorno, em SaveChanges separados, sem transação explícita conjunta. | Criação e edição podem adicionar retorno; operação envolve transação conjunta. | Ampliado no atual |
| Classificações pessoais | Não encontrado. | Criar nome/cor, atribuir várias, remover marcações e filtrar; não há edição/exclusão do catálogo de classificações. | Só atual |

Nota sobre filtros/ordenação: presença na API inicial não significa que todo filtro tenha controle em todas as telas. A API inicial também não implementa ordenação de todas as colunas clicáveis; valores de `OrderBy` sem ramo específico caem na ordenação por ID.

### 4.3 Dashboard

Fontes: [A6], [A7], [N3], [N20].

| Funcionalidade/regra | Inicial | Atual | Resultado |
| --- | --- | --- | --- |
| Total de leads, matrículas, abertos, sem sucesso e receita | Sim. | Sim. | Ambos |
| Período personalizado | Datas inicial/final; padrão é mês anterior. | Datas inicial/final; padrão relativo de 30 dias. | Ambos, com padrão alterado |
| Atalhos de 7/30/90/365 dias | Não encontrado. | Sim. | Só atual |
| Filtro por sede | Sim. | Sim, para admin global; admin de sede usa seu escopo. | Ambos |
| Filtro por serviço | Sim, afeta cards e comparativo. | Endpoint/componente não aceitam serviço. | Só inicial |
| Filtro por vendedor nos cards | Sim; comparativo ignora esse filtro. | Não há filtro por vendedor. | Só inicial |
| Comparativo de vendedores | Leads, matrículas, conversão e receita por vendedor original. | Leads, matrículas e receita por vendedor atual; tabela sem coluna de conversão individual. | Alterado |
| Critério do ranking | Receita descrescente. | Quantidade de vendas decrescente. | Alterado |
| Conversão geral | Pode ser derivada, mas não é card/retorno geral equivalente. | Calculada pela API e apresentada. | Só atual como indicador explícito |
| Evolução diária | Não há série/gráfico no fluxo. | Série de leads e vendas por dia. | Só atual |
| Distribuição de status | Não há painel específico. | Distribuição de todos os status. | Só atual |
| Próximos retornos e atalho de novo lead | Não aparecem no dashboard inicial. | Agenda resumida e criação. | Só atual |
| Data usada nos resultados | DataInicial, isto é, captação, com status atual. | CreatedAt, também captação, com status atual. | Ambos; nenhum é histórico de fechamento por data de venda |

**Exemplo do impacto:** se um lead captado por Ana é transferido temporariamente para Bruno e vira venda, o comparativo inicial atribui ao vendedor original Ana; o atual agrupa por Bruno. A transferência temporária não altera o vendedor original, portanto os números podem diferir sem perda do cadastro.

### 4.4 Agenda de retornos

Fontes: [A8], [A9], [N4].

| Funcionalidade/regra | Inicial | Atual | Resultado |
| --- | --- | --- | --- |
| Criar vários retornos para um lead | Sim. | Sim. | Ambos |
| Listagem geral e por lead | Sim. | Sim. | Ambos |
| Consulta pessoal | Tela diária filtra por `Venda.VendedorId`, o original. | Minha agenda filtra CurrentSellerId. | Alterado |
| Dia específico/período | Tela diária com início e fim opcional; API aceita limites. | Não há filtro de data na tela nem no GET de agendamentos. | Só inicial |
| Busca por cliente | Tela/GET inicial. | Não há busca na lista; busca de lead existe no formulário de criação. | Só inicial como filtro de agenda |
| Busca por observação, ID e vendedor na API | Implementada no handler inicial. | GET atual não oferece esses parâmetros. | Só inicial |
| Paginação | Sim. | Sim. | Ambos |
| Ordenação configurável | Por data/ID e direção na API. | Fixa por vencimento/ID crescentes. | Só inicial |
| Editar data/nota | Sem PUT. | PUT de agendamento. | Só atual |
| Concluir/reabrir e mostrar concluídos | Entidade inicial não possui estado de conclusão. | Estado persistido e controles próprios. | Só atual |
| Excluir retorno | Sem DELETE. | DELETE autorizado pelo lead. | Só atual |
| Indicador de retorno vencido | Não encontrado controle equivalente. | Calculado na interface para pendentes. | Só atual |
| Autorização para criar retorno | Handler inicial verifica existência da venda. | Verifica escopo e direito de editar o lead. | Alterado |
| Alerta automático na hora agendada | Não encontrado job/notificação programada. | Também não existe. | Ausente em ambos |

### 4.5 Sedes, serviços e condições comerciais

Fontes: [A10], [A29], [A30], [N12].

| Funcionalidade/regra | Inicial | Atual | Resultado |
| --- | --- | --- | --- |
| Criar/listar sedes, serviços e condições | Sim, endpoints/telas separados. | Sim, catálogo e abas de Configurações. | Ambos |
| Editar nome de sede/serviço/condição | Sem endpoints PUT correspondentes. | Sim. | Só atual |
| Ativar/inativar sede | Comando cria com campo `Ativo=true`; tela só envia nome, sem controle de estado e sem PUT. | Criação e edição do estado. | Só atual como ação de manutenção |
| Ativar/inativar serviço/condição | Entidades não possuem estado ativo. | Possuem Active, com edição. | Só atual |
| Data de inclusão da sede | Comando aceita DataInclusao e usa data local atual por padrão; listagem mostra a data, mas tela de criação só pede nome. | CreatedAt automático em UTC; formulário não administra essa data. | Alterado no contrato e na apresentação |
| Busca por ID/nome e filtro ativo | Listagens/GETs individuais oferecem filtros. | `/catalog` retorna conjunto do escopo, sem filtros de pesquisa. | Só inicial nessa forma |
| Paginação e ordenação dos cadastros | Implementadas nas consultas iniciais. | Sem controles equivalentes em Configurações. | Só inicial |
| Impedir nome duplicado no cadastro | Handlers iniciais checam nomes exatos de sede/serviço/condição. | Não há checagem/índice único de nome equivalente nesses cadastros. | Só inicial para essa validação |
| Gestão de catálogo compartilhado | POSTs exigem admin, sem distinção global/sede nesses handlers. | Serviço/condição e novas sedes exigem admin global; admin de sede edita sua sede. | Alterado |
| Efeito de sede inativa | Login inicial não consulta estado da sede. | Impede login/validação de cookie, novos salvamentos e elegibilidade de campanha. | Só atual como regra integrada |
| Exclusão definitiva de equipe/sede/serviço/condição | Não encontrada. | Não implementada; usa inativação. | Ausente em ambos |

### 4.6 Sessão WhatsApp, lista de conversas e vínculo comercial

Fontes: [A13], [A14], [A16], [A17], [A25], [A27], [A28], [N1], [N6], [N7], [N14], [N24].

| Funcionalidade/regra | Inicial | Atual | Resultado |
| --- | --- | --- | --- |
| Sessão pessoal e QR Code | LocalAuth por usuário; consulta de login cria/recupera cliente. | Credenciais por usuário no SQLite; conectar é ação POST explícita. | Ambos, com ciclo alterado |
| Remover/desconectar sessão | Sim, DELETE de sessão. | Sim, POST disconnect; preserva histórico. | Ambos |
| Consultar status continuamente | Poll de login a cada 5 s, encerrado ao conectar. | Poll de status a cada 5 s enquanto componente está montado. | Alterado |
| Recuperar conexão | Manager inicial recria cliente ao acessar sessão; credenciais em disco. | Reconexão automática limitada e restauração de credenciais ao iniciar serviço. | Ampliado no atual |
| Listar conversas | Consulta `getChats()` do cliente conectado. | Consulta banco local; texto/histórico podem existir desconectados. | Alterado |
| Buscar conversa | Nome/identificador na interface. | Nome/identificador na interface. | Ambos |
| Atualizações recebidas na tela | Socket.IO envia eventos ao navegador. | Socket Baileys persiste; navegador consulta chats em 5 s e mensagens em 4 s. | Alterado |
| Conversa nova recebida que não estava na lista | Callback inicial ignora evento se chat ainda não está na lista. | Persistência cria/atualiza chat e o polling pode incluí-lo. | Ampliado no atual |
| Exibir arquivadas | Sim, grupo/expansão local. | Sim, inclusive busca e hierarquia. | Ambos |
| Arquivar/desarquivar remotamente | Botões e chamada `archive/unarchive`. | Sem comandos; recebe estado do WhatsApp. | Só inicial |
| Exibir/priorizar fixadas | Não encontrado estado de fixação equivalente. | Estado sincronizado e priorização. | Só atual |
| Fixar/desafixar pelo CRM | Não encontrado. | Não encontrado. | Ausente em ambos |
| Contagem de não lidas | Retorno unreadCount e badge; zeragem local ao clicar. | Não há campo/badge equivalente na lista. | Só inicial |
| Foto de perfil | Cache em disco e imagem na lista/cabeçalho. | Cache SQLite e imagem na lista/cabeçalho. | Ambos |
| Ampliar foto de perfil | Não encontrado modal equivalente. | Modal de visualização. | Só atual |
| Nome do lead na conversa | Cabeçalho prioriza lead vinculado. | API sobrepõe nome na lista; cabeçalho também usa lead. | Ampliado no atual |
| Status comercial na lista/cabeçalho | Indica situação do vínculo, sem badge comercial equivalente em cada conversa. | Badge do status comercial em lista/cabeçalho. | Só atual nessa apresentação |
| Agrupar por status/classificação | Não encontrado. | Visualizações combináveis e recolhíveis. | Só atual |
| Criar lead pelo chat | Abre cadastro em outra aba com nome/contato. | Abre modal e tenta vincular após salvar quando elegível. | Ambos, com integração ampliada |
| Abrir lead pelo chat | Abre outra aba. | Abre modal do cadastro. | Ambos |
| Vincular individualmente | Sim; exige vendedor responsável atual, mas usa identificadores recebidos do frontend. | Sim; exige vendedor atual e JID correspondente ao telefone. | Ambos, com validação alterada |
| Vincular todas as conversas compatíveis | Endpoint e botão, resumo de já vinculadas/novas/sem lead. | Não há equivalente em lote. | Só inicial |
| Desvincular sem transferir/trocar telefone | Remove VendaWhatsapp e relações dos grupos de envio. | Não há comando independente. | Só inicial |
| Identificar telefone com/sem nono dígito | Vários fluxos iniciais geram variantes. | Resolução do serviço e confirmação explícita em fluxos de abertura. | Ambos, com confirmação ampliada |
| Resolver variante antes de abrir pelo lead | Fluxos iniciais de associação/envio não têm equivalente à confirmação com revisão. | `/leads/{id}/conversation` valida revisão, consulta variante e pode pedir confirmação antes de gravar telefone/vínculo. | Só atual nesse fluxo |
| Criar conversa manualmente | Fluxo com número e primeira mensagem; envio resolve variantes. | Seleciona chat provisório; envio manual não resolve variantes automaticamente. | Alterado |
| Administrador selecionar outra sessão no atendimento | Existe seletor, mas rotas Node rejeitam userId diferente do JWT, inclusive admin. | Atendimento usa só a própria sessão; outras sessões ficam no Histórico autorizado. | Parcial no inicial; não contar como acesso operacional funcional |
| Consultar grupos reais do WhatsApp | Lista permite grupos reais e o envio inicial não os bloqueia por tipo. | Histórico de grupos disponível para consulta. | Ambos para leitura |
| Enviar/responder/encaminhar em grupo real do WhatsApp | Rotas e compositor não impõem a restrição individual equivalente. | Interface/API restringem ações a telefone individual identificado. | Só inicial como caminho implementado, sujeito à integração |

### 4.7 Mensagens, anexos e contatos

Fontes: [A13], [A16], [A22], [A23], [A24], [N9], [N10], [N11], [N16], [N17], [N18], [N19].

| Funcionalidade/regra | Inicial | Atual | Resultado |
| --- | --- | --- | --- |
| Texto, emojis, envio por Enter | Implementados. | Implementados. | Ambos |
| Picker de emojis com busca/recentes | Sim. | Sim. | Ambos |
| Formatação visual do texto WhatsApp | Interpreta marcadores de negrito/itálico/tachado/código. | MessageText trata telefones, sem parser equivalente de formatação. | Só inicial |
| Responder mensagem | Endpoint específico reply; citação no histórico e no compositor. | ReplyTo no envio; banner do compositor, sem bloco citado no histórico. | Ambos para enviar; apresentação reduzida no atual |
| Editar mensagem própria | Implementado. | Implementado; valida autor/chat no serviço. | Ambos |
| Indicar edição/encaminhamento | Componente inicial renderiza indicadores quando recebe/atualiza metadados. | Contrato/balão não expõem indicadores equivalentes. | Só inicial nessa apresentação |
| Encaminhar mensagem | Lista de conversas e campo de chatId manual. | Seletor de conversas individuais já conhecidas. | Ambos; destino manual específico só no inicial |
| Apagar para mim | `msg.delete(false)` no cliente WhatsApp, quando conectado. | Exclui registro local do CRM/serviço, sem apagar no celular; não exige socket nessa etapa. | Alterado |
| Apagar para todos | Solicita via cliente WhatsApp. | Exige autoria e idade inferior a 2 dias; solicita e marca registro local. | Ambos, com regra explícita no atual |
| Reagir/remover reação | Sem rotas/controles equivalentes. | Escolha entre seis emojis, remoção e persistência. | Só atual |
| Imagem, vídeo, áudio e documento como arquivo | Upload multipart e visualização/download. | JSON/base64, visualização/download. | Ambos |
| Forçar envio de mídia como documento | Não há flag/controle equivalente. | `asDocument` no menu/payload. | Só atual |
| Limite de anexo explicitamente aplicado | Upload Multer sem limite configurado equivalente; lote também esbarra no limite JSON padrão do Express. | Validação de 16 MiB e limites de base64/corpo nas camadas. | Alterado; não inferir upload ilimitado no inicial |
| Colar arquivo no compositor | Handler onPaste prepara arquivo. | Sem handler equivalente; arquivo precisa ser selecionado por controle. | Só inicial |
| Prévia de arquivo antes de envio | Compositor inicial tem prévias de anexos. | Tags de arquivo; prévia específica para voz/figurinha e prévia de sequência na campanha. | Alterado |
| Gravar voz no navegador | Não há MediaRecorder/getUserMedia no compositor inicial. | Gravar/parar/descartar, pré-escuta e limite de 5 minutos. | Só atual |
| Converter áudio para nota de voz | Não encontrado pipeline equivalente. | ffmpeg para Ogg/Opus e envio PTT. | Só atual |
| Receber/exibir figurinha | Sim, tipo sticker no histórico. | Sim. | Ambos |
| Criar figurinha e escolher recentes | Sem seletor/criador equivalente; enviar arquivo de imagem não prova envio como sticker. | Seletor de recentes e criação em canvas. | Só atual |
| Enviar/exibir cartão de contato | Fluxo inicial de mensagens não implementa vCard dedicado; mensagem sem mídia cai em chat. | Payload contact, vCard e card no histórico. | Só atual |
| Salvar/editar contato na agenda WhatsApp | Modal “Adicionar contato” e `saveOrEditAddressbookContact`. | Não há endpoint equivalente; criar lead/enviar vCard não salva agenda remota. | Só inicial |
| Telefone detectado no texto abre nova conversa | Sim, botão usa número detectado. | Sim; resolve variantes e permite confirmação. | Ambos |
| Copiar número pelo menu de ações | Não há ação equivalente dedicada no fluxo inicial. | Menu Copiar número; também disponível no Histórico. | Só atual |
| Prévia/download de mídia recebida | Imagem, vídeo, áudio, figurinha e documento. | Mesmos tipos; carregamento próximo do viewport, retry e detalhes de documento/PDF. | Ambos, com recursos ampliados no atual |
| Preservar bytes recebidos localmente | Cache em disco; limpeza por idade, padrão 7 dias. | Não arquiva permanentemente os bytes; download depende da sessão/disponibilidade externa. | Alterado |
| Bloquear contato “Não Enviar Mais” no servidor individual | Node não consulta status/carteira do CRM antes de enviar. | EnsureCanMessage valida status e carteira, inclusive para ações de editar/reagir/apagar. | Só atual como bloqueio obrigatório |
| Mensagem de erro confiável no envio básico | Algumas funções iniciais de texto/reply/mídia não testam response.ok. | Cliente lança erro e compositor conserva rascunho em falha. | Ampliado no atual |

### 4.8 Grupos internos e segmentação

Fontes: [A11], [A12], [A14], [A25], [A32], [N5], [N13].

| Funcionalidade/regra | Inicial | Atual | Resultado |
| --- | --- | --- | --- |
| Criar/listar/excluir grupo interno | Sim. | Sim. | Ambos |
| Criar grupo real no WhatsApp externo | Não; são listas internas de destinatários. | Também não. | Ausente em ambos |
| Nome repetido de grupo | Handler inicial rejeita nome exato já existente, globalmente. | Sem validação equivalente de unicidade; grupos são pessoais. | Alterado |
| Participante do grupo | Relação com VendaWhatsapp, isto é, vínculo de lead/chat. | Relação direta com LeadId. | Alterado |
| Formar grupo a partir de leads sem chat | Criação filtrada gera vínculos sintéticos `@c.us` para leads sem VendaWhatsapp. | Usa LeadId sem criar vínculo de conversa. | Ambos alcançam leads sem conversa, por mecanismos diferentes |
| Filtros de status/serviço/cadastro | Sim na criação filtrada. | Sim na busca e edição. | Ambos |
| Filtros de vendedor/sede/busca/classificação no formulário | Não há formulário equivalente com esse conjunto. | Candidatos filtrados conforme perfil e classificação pessoal. | Ampliado no atual |
| Seleção manual em várias páginas antes de salvar | Inicial inclui participantes por vínculo, com ações de adicionar/remover; não tem editor equivalente de candidatos com seleção global. | Seleção paginada local e selecionar todos os resultados. | Só atual nessa forma |
| Adicionar/remover participante | Endpoints dedicados e atalhos em grupo/chat/lead. | Edição substitui conjunto de participantes. | Ambos, reorganizados |
| Renomear grupo existente | Sem PUT correspondente. | Editor permite alterar nome. | Só atual |
| Ver grupos do lead/chat e editar por ali | Sim, inclusive no backup inicial. | Não há seção equivalente em chat/LeadForm/Histórico. | Só inicial |
| Grupo privado por dono em todos os acessos | UI normalmente filtra usuário; algumas consultas do servidor usam sede e filtros recebidos, sem exigir dono em todos os caminhos. | Listar/abrir/editar/excluir exigem dono autenticado. | Alterado |
| Revalidar todos os IDs/filtros antes de salvar edição | Não há editor equivalente; inclusão dedicada checa duplicidade. | API reaplica filtros e rejeita seleção fora do escopo. | Só atual nessa forma |
| Grupo dinâmico que inclui futuros leads sozinho | Não; criação filtrada materializa participantes. | Não; também salva snapshot de IDs. | Ausente em ambos |
| Transferência e permanência em grupos | Vínculo antigo é preservado pelo handler de transferência. | Membership permanece, mas visibilidade/contagem considera acesso atual; vínculo do chat é limpo. | Alterado |

### 4.9 Lotes e campanhas

Fontes: [A15], [A16], [N7], [N8], [N15], [N25].

| Funcionalidade/regra | Inicial | Atual | Resultado |
| --- | --- | --- | --- |
| Sequência de texto/mídia | Monta mensagens de preview e envia itens em ordem. | De 1 a 10 mensagens, com editor e reordenação. | Ambos, com limite/edição alterados |
| Prévia antes de enviar | Local, no modal. | Local e confirmação de público validada pela API. | Ambos; validação ampliada no atual |
| Fonte de destinatários | Grupo interno ou “Todos os vinculados”. | Leads por filtro/grupo/seleção, mesmo sem vínculo de chat. | Alterado |
| Deduplicação por chat | Modal inicial usa Map por whatsappChatId. | Público é por LeadId; números iguais em sedes distintas podem receber mais de uma sequência. | Alterado |
| Selecionar/desmarcar destinatários | Sim, seleção local do público carregado. | Sim; seleção/exclusões em várias páginas e confirmação final. | Ambos |
| Status/serviço/sede no público | Conjuntos de múltiplos valores; inclui opção sem serviço. | Um valor por filtro; sem serviço específico não tem opção dedicada. | Capacidade mais ampla no inicial nessa dimensão |
| Filtro direto por data de cadastro | Sim no modal. | Não no endpoint de público; alternativa é grupo criado por período. | Só inicial como filtro direto |
| Filtro por classificação pessoal | Não existe. | Aplicado a candidatos, preview e confirmação. | Só atual |
| Filtro por vendedor | Inicial usa original OU atual em “Todos os vinculados”; em grupo usa atual com fallback original. | Filtro explícito só admin e considera CurrentSellerId. | Alterado |
| Escopo do público de vendedor comum | “Todos os vinculados” restringe a vendedor original OU atual; grupos seguem caminho próprio. | Sem filtro de vendedor, campanha pode incluir outros vendedores da mesma sede. | Alterado; não é a mesma regra do atendimento individual |
| Primeiro nome/nome completo | `${PrimeiroNome}` e `${NomeCompleto}`, com parâmetros por chat. | `{{nome}}` com nome completo do snapshot. | Só inicial para primeiro nome; sintaxe incompatível |
| Intervalos e pausas automáticas | Intervalo aleatório de base a 2×base; pausa longa usa índice da mensagem dentro de cada destinatário. | Intervalo base ± variância, mínimo 3 s; pausa a cada N tentativas acumuladas no lote. | Ambos, com semântica diferente |
| Lembrar intervalos para próximo envio | localStorage após resposta do envio. | Formulário começa com valores padrão; campanha antiga guarda seu payload. | Só inicial como preferência reutilizada |
| Um lote ativo por usuário | Map em memória; rejeita segundo lote. | Controle em memória e campanha running no banco. | Ambos |
| Execução fora da requisição HTTP original | Rota espera terminar/cancelar o lote para responder. | Retorna ID e worker segue em segundo plano. | Só atual |
| Nome e histórico persistido do disparo | Não há entidade/consulta de campanhas. | Campaigns e deliveries persistidos. | Só atual |
| Acompanhar progresso e resultados após sair/voltar | Sem API de consulta; resposta final traz detalhes, mas modal não monta histórico consultável. | Polling de histórico/deliveries, contadores, filtros e sequência enviada. | Só atual |
| Resultado por mensagem do destinatário | Resposta inicial inclui índices/IDs enviados e erros de cada chat, sem histórico persistido. | Resultado agregado por destinatário, com referência ao erro/último envio; não há entrega persistida por item da sequência. | Alterado; detalhamento da resposta inicial não é igual ao histórico atual |
| Bloquear “Não Enviar Mais” | Inicial deixa esse status desmarcado por padrão, mas permite reativá-lo; Node recebe chatIds sem revalidar CRM. | Exclui no público e verifica novamente antes de cada destinatário. | Só atual como regra obrigatória |
| Revalidar usuário/sede/telefone/status no worker | Não há callback equivalente. | `/internal/eligibility` antes de cada destinatário. | Só atual |
| Revalidar vendedor atual antes de enviar | Lote inicial não tem validação equivalente de carteira no Node. | Eligibility confere sede/status/telefone, mas não exige CurrentSellerId igual ao autor. | Não confundir com regra de carteira individual |
| Erro em um item da sequência | Registra erro e continua próximos itens do mesmo contato. | Falha interrompe sequência daquele contato, registra failed e segue ao próximo destinatário. | Alterado |
| Cancelar lote | Sinal em Map por usuário e endpoint cancel. | AbortController por campanha, estado cancelled e histórico preservado. | Ambos |
| Reinício durante envio | Estado ativo em memória se perde; não há histórico de lote consultável. | Running/queued antigos tornam-se interrupted, sem retomar. | Ampliado no atual |
| Pausa manual/retomar/agendar disparo futuro | Não encontrado. | Não implementado. | Ausente em ambos |

Limites relevantes do atual: 1–500 destinatários, 1–10 mensagens, texto de até 10.000 caracteres por mensagem e soma de anexos sujeita ao teto de base64 de 22.400.000 caracteres, apresentada como 16 MB. Elegibilidade é checada antes de cada destinatário, **não entre cada mensagem**. Mudança para “Não Enviar Mais” durante a sequência pode não interromper as mensagens restantes daquele contato. Cancelamento não desfaz mensagens já enviadas ou em envio.

### 4.10 Histórico, backup e processos automáticos

Fontes: [A17], [A18], [A19], [A20], [N8], [N9], [N24], [N26].

| Funcionalidade/regra | Inicial | Atual | Resultado |
| --- | --- | --- | --- |
| Histórico persistido por usuário/conversa | Node envia eventos de mensagem à API; chats/mensagens no PostgreSQL. | Serviço WhatsApp salva eventos e conteúdo raw no seu SQLite. | Ambos, com arquitetura alterada |
| Ler histórico desconectado | Textos já salvos pela API podem ser consultados. | Textos já salvos pelo serviço podem ser consultados. | Ambos |
| Consultar histórico de terceiros como admin | Seletor na tela; handler aplica sede. | Seletor; API exige admin e usuário dentro do escopo. | Ambos |
| Privacidade do histórico para vendedor no servidor | GETs iniciais de chats/mensagens aplicam sede, sem regra pessoal equivalente em todos os caminhos. | HistoryUser rejeita sessão de terceiro para não admin. | Alterado |
| Histórico estritamente sem ações de manutenção | `disableSend` impede envio pelo compositor, mas não remove consistentemente menus de mensagem; cabeçalho/tela ainda têm vínculo, grupo, contato e arquivamento. A presença desses controles não garante sucesso contra IDs de backup ou sessão alheia. | Backup sem compositor, ações de mensagem, criação/atribuição de classificações ou edição de grupo. | Alterado |
| Carregar mensagens anteriores | Atendimento aumenta limit e refaz fetch; backup baixa a lista completa da API e corta no cliente. | Cursor timestamp+ID em lotes de até 100 mensagens armazenadas. | Alterado |
| Guardar contexto bruto, reações e revogações | Backup inicial salva campos básicos e retorna registro anterior em mensagem duplicada; não atualiza edição/reação/revogação por esses eventos. | Persiste raw e trata edições, reações e revogação. | Ampliado no atual |
| Sincronizar contatos/nomes/arquivadas/fixadas | Atendimento usa dados do cliente e cache de imagens. | Eventos de contatos/chats/grupos e ressincronização de estados persistidos. | Ampliado no atual |
| Backup como arquivo exportável/restaurável | Não há fluxo de exportar/importar/restaurar banco pela tela. | Também não há. | Ausente em ambos |
| Histórico integral garantido do celular | Não há garantia no código. | syncFullHistory=false e consulta só do armazenado. | Ausente em ambos |
| Limpeza automática de cache de mídia | Worker remove arquivos antigos; padrão 7 dias, a cada 60 minutos. | Não há cache permanente equivalente de mídia recebida nem esse job. | Só inicial nesse mecanismo |
| Restauração automática das sessões ao subir serviço | Não há varredura equivalente no startup; manager recupera quando solicitado. | Busca credenciais no banco e tenta conectar em segundo plano. | Só atual nesse mecanismo |
| Health checks de API/WhatsApp | Não encontrados endpoints equivalentes no código de entrada/rotas. | GET `/health` nos dois processos. | Só atual |
| Encerramento coordenado de workers/sockets | Sem rotina equivalente à do atual no server inicial. | Sinais de encerramento abortam campanhas, fecham sessões/servidor/banco. | Só atual nesse fluxo |

## 5. Correspondência de dados comerciais

Fontes: `VendaModel`, requests/handlers iniciais em [A31] e [A25]; `Lead`, `LeadRequest` e `LeadService` em [N2] e [N27].

| Inicial | Atual | Situação |
| --- | --- | --- |
| Cliente | Name | Mantido. |
| Contato | Phone | Telefone principal mantido; normalização e unicidade por sede no atual. |
| Fone | AdditionalPhone | Telefone adicional mantido. |
| Email | Email | Mantido; DTO atual valida formato. |
| Genero | Gender | Enum numérico passa a texto validado. |
| DataNascimento | BirthDate | DateTime opcional passa a DateOnly; atual rejeita data futura. |
| Origem | Origin | Enum numérico passa a texto validado. |
| Indicacao | Referral | Mantido. |
| ComoConheceu | Discovery | Mantido. |
| MotivoEscolha | ChoiceReason | Mantido. |
| ServicoId | ServiceId | Mantido, com validação de item ativo no atual. |
| CondicaoVendaId | ConditionId | Mantido, com validação de item ativo no atual. |
| Status | Status | Cinco significados preservados; representação muda. |
| ValorVenda | Value | Nullable no inicial; decimal não nulo no atual, com faixa de 0 a 100.000.000. |
| Obs | Notes | Mantido. |
| SedeId | BranchId | Opcional no modelo/request inicial; obrigatório e validado no atual. |
| VendedorId | SellerId | Responsável original preservado. |
| VendedorAtualId | CurrentSellerId | Responsável atual preservado, não nulo no atual. |
| DataInicial | CreatedAt | Data de criação/captação. |
| DataAlteracao | UpdatedAt | Data de atualização. |
| VendaWhatsapp.WhatsappChatId/UserId | ChatId/ChatUserId no lead | Vínculo deixa de ser entidade separada. |
| DataRetorno/ObsRetorno | ReturnAt/ReturnNote | No atual, criação/edição do lead pode adicionar retorno. |
| Contrato | Contract | **Parcial nos dois**: campo no modelo; comandos iniciais o declaram, mas handlers criar/editar não o gravam. Atual não o recebe no LeadRequest nem no formulário. Não existe gestão/upload de contrato comprovada. |
| Sem equivalente | Revision | Novo controle de concorrência. |
| Sem equivalente | Classifications/LeadClassifications | Novos catálogo e vínculos pessoais de classificações. |

**Ter campos equivalentes não significa migração pronta.** Não foi identificado fluxo de importação automática entre os projetos. IDs, enums, hashes de senha, JIDs, formato de vínculo e motores de banco mudaram. Sessões e bancos antigos não podem ser tratados como intercambiáveis sem conversão específica.

## 6. Diferenças técnicas que afetam o comportamento

| Aspecto | Inicial | Atual | Efeito prático |
| --- | --- | --- | --- |
| API | .NET 9, MediatR, PostgreSQL. | .NET 10, controllers/serviços por feature, SQLite. | Não basta reutilizar a base antiga; contratos e persistência mudaram. |
| WhatsApp | Express + whatsapp-web.js + Puppeteer/Chromium. | Fastify + Baileys. | Formatos de identificador, sessões, histórico e compatibilidade externa são diferentes. |
| Caminho do navegador | Chamadas diretas para API e serviço WhatsApp configurados separadamente. | Mesmo domínio `/api`, rewrite para API, comunicação interna com WhatsApp. | Autorização/erros ficam mais centralizados no atual. |
| Credencial do serviço | JWT do usuário validado pelo Node via endpoint de validação. | Chave interna entre processos; usuário derivado da sessão na API. | Rotas antigas não são clientes compatíveis das novas. |
| Documentação interativa da API | Swagger UI e ReDoc no Program inicial. | Sem mapeamento equivalente no Program atual. | Recurso técnico presente apenas no inicial. |
| Endpoint de exemplo | GET/POST `/api/exemplo`, autenticados. | Sem equivalente. | Código demonstrativo removido; não representa funcionalidade comercial perdida. |
| Migrações/provisionamento | Migrations versionadas; Program inicial não chama Migrate/seed equivalente. | Migrações automáticas e seed condicionado ao ambiente/configuração. | Startup do atual inicializa estrutura/cadastro básico e pode gerar demo em Development. |
| Testes no código consultado | Não localizada suíte própria equivalente de testes nas áreas pesquisadas. | Testes de API, mensageria/campanhas e utilitários do frontend. | Existência de testes foi conferida; não foram executados nesta entrega. |

Fontes: [A20], [A21], [A16], [A17], [N21], [N24], [N26], projetos `.csproj`, `package.json` e diretórios de testes do atual.

## 7. Ausências comuns e cuidados com a interpretação

- **Recuperação de senha por e-mail e cadastro público:** não encontrados como fluxos completos em nenhum dos dois. Cadastro de equipe e troca de senha são administrativos.
- **Gestão efetiva de contratos:** o nome do campo no banco não comprova cadastro, upload, assinatura ou emissão de contrato; ver seção 5.
- **Vendas separadas de leads:** nenhum dos dois possui, nesse fluxo, entidade independente de pedido/contrato financeiro; venda é um status do cadastro comercial.
- **Histórico de mudanças de status e transferências:** não foi encontrado registro de auditoria específico por alteração; vendedor original/atual e timestamps não são uma trilha completa.
- **Restauração/exportação de backup pela interface:** “Backup” é consulta ao histórico. A exportação Excel do inicial é de dados comerciais e não de backup de conversas.
- **Agendamento futuro e retomada de campanha:** não implementados; pausas automáticas durante lote não equivalem a pausar/retomar manualmente.
- **“Envio em grupo”:** o modal inicial distribui mensagens a uma lista de chats; não cria grupo externo. Já enviar a um grupo real é permitido pelos caminhos genéricos iniciais e restringido no atual.
- **“Não Enviar Mais”:** existe como status nos dois, mas somente o atual impõe a checagem no servidor de atendimento e na execução da campanha. O padrão desmarcado do inicial não é bloqueio obrigatório.
- **Envio, cancelamento e falha parcial:** ambos podem ter mensagens já enviadas quando a operação falha/cancela. Não há rollback remoto nem garantia de ausência de envio após um erro.
- **Proteção por sede não é proteção por carteira/dono:** o inicial já tem escopo de sede em vários handlers. O atual acrescenta verificações, mas campanhas atuais também não se restringem automaticamente ao vendedor atual do lead.

## 8. Itens para decidir se a intenção for recuperar paridade

Esta seção registra diferenças; não foi feita implementação nem assumida aprovação de prioridades de produto.

| Capacidade inicial sem equivalente | Alternativa atual existente | O que ainda falta para equivalência |
| --- | --- | --- |
| Exportar Excel | Consulta paginada de leads. | Exportação com filtros e todas as linhas desejadas. |
| Dashboard por vendedor/serviço | Período e sede. | Filtros e definição de atribuição original/atual do resultado. |
| Agenda por dia/período/cliente | Minha agenda, agenda da unidade e agenda do lead. | Filtros e ordenação; esclarecer vendedor original versus atual. |
| Arquivar/desarquivar | Exibição do estado sincronizado. | Comando remoto, endpoint e ação de interface. |
| Salvar contato na agenda WhatsApp | Lead e vCard. | Operação específica de agenda remota compatível com a integração. |
| Desvincular e vincular em lote | Vincular um a um; limpar vínculo por transferência/telefone. | Ações independentes e definição dos efeitos em grupos/classificações. |
| Grupos no chat/detalhe do lead | Manutenção central em `/groups`. | Consulta/atalho contextual de memberships. |
| Não lidas | Lista atualizada por polling. | Estado/contagem e política de leitura/zeragem. |
| Primeiro nome e filtros múltiplos no lote | `{{nome}}`, filtros únicos e grupos por período. | Variáveis adicionais, filtros diretos/múltiplos e opção sem serviço. |
| Formatação/citação/colar arquivo | Texto, resposta referenciada e seletor de arquivo. | Renderização e interação equivalentes. |
| Consultas avançadas de catálogo | Abas administrativas. | Busca/filtros/paginação e definição de acesso do vendedor. |
| Atendimento em grupo real | Histórico somente leitura. | Decisão explícita de escopo e suporte na interface/API. |

## 9. Rastreabilidade e limites da entrega

Foram inventariadas todas as páginas de negócio do inicial e do atual e conferidos os controllers de negócio, handlers iniciais correspondentes, rotas dos serviços WhatsApp e componentes dos fluxos descritos. Consultas adicionais verificaram modelos, contratos, índices, autorização, processos automáticos e referências a recursos sem equivalente. A estrutura de navegação foi conferida nos componentes/layouts, sem homologação visual da interface.

A entrega cria apenas este relatório. Não altera funcionalidades nem `FLUXOS_TECNICOS.md`, pois não houve mudança de comportamento. Alterações e arquivos já presentes no diretório de trabalho foram preservados. A análise retrata os arquivos encontrados, inclusive alterações locais, e não uma comparação entre dois commits históricos.

### Fontes do projeto inicial

Os links abaixo partem deste documento para a pasta irmã `AutoEscola`; continuam válidos enquanto os projetos mantiverem a estrutura informada.

- Navegação e autenticação: [A1] (Sidebar), [A2] (serviço de autenticação), [A21] (Program) e [A30] (edição de usuário).
- Comercial: [A3] (controller), [A4] (consulta), [A5] (listagem/exportação), [A25] (formulário de edição), [A26] (transferência) e [A31] (criação).
- Dashboard: [A6] (handler) e [A7] (página).
- Agenda: [A8] (controller) e [A9] (página diária).
- Cadastros: [A10] (controller de sedes) e [A29] (consulta de equipe); também foram conferidos controllers/handlers/páginas de serviços e condições.
- Grupos e vínculos: [A11] (criação de grupo), [A12] (consulta de grupos), [A27] (vinculação em lote) e [A32] (página de grupos).
- Atendimento: [A13] (janela da conversa), [A14] (página WhatsApp), [A15] (envio em lote), [A16] (rotas Node), [A17] (cliente/eventos) e [A28] (item da lista).
- Texto e composição: [A22] (formatação), [A23] (balão/citação) e [A24] (compositor/clipboard).
- Histórico e dados: [A18] (persistência de mensagem), [A19] (tela Backup) e [A20] (DbContext).

[A1]: ../../AutoEscola/CRM-AutoEscola-Front/components/layout/Sidebar.tsx
[A2]: ../../AutoEscola/CRM-AutoEscola-Front/services/authService.ts
[A3]: ../../AutoEscola/CRM-Docker/crm-auto-escola-back/ExemploBackendDotNet/CRM.API/Controllers/VendaController.cs
[A4]: ../../AutoEscola/CRM-Docker/crm-auto-escola-back/ExemploBackendDotNet/CRM.Service/Handlers/BuscarVendasQueryHandler.cs
[A5]: <../../AutoEscola/CRM-AutoEscola-Front/app/(main)/venda/page.tsx>
[A6]: ../../AutoEscola/CRM-Docker/crm-auto-escola-back/ExemploBackendDotNet/CRM.Service/Handlers/DashboardQueryHandler.cs
[A7]: <../../AutoEscola/CRM-AutoEscola-Front/app/(main)/dashboard/page.tsx>
[A8]: ../../AutoEscola/CRM-Docker/crm-auto-escola-back/ExemploBackendDotNet/CRM.API/Controllers/AgendamentoController.cs
[A9]: <../../AutoEscola/CRM-AutoEscola-Front/app/(main)/agendamento/diario/page.tsx>
[A10]: ../../AutoEscola/CRM-Docker/crm-auto-escola-back/ExemploBackendDotNet/CRM.API/Controllers/SedeController.cs
[A11]: ../../AutoEscola/CRM-Docker/crm-auto-escola-back/ExemploBackendDotNet/CRM.Service/Handlers/CriarGrupoWhatsCommandHandler.cs
[A12]: ../../AutoEscola/CRM-Docker/crm-auto-escola-back/ExemploBackendDotNet/CRM.Service/Handlers/BuscarGruposWhatsappQueryHandler.cs
[A13]: ../../AutoEscola/CRM-AutoEscola-Front/components/whats/ChatWindow.tsx
[A14]: <../../AutoEscola/CRM-AutoEscola-Front/app/(main)/whatsapp/Whatsapp.tsx>
[A15]: ../../AutoEscola/CRM-AutoEscola-Front/components/whats/BatchSendModal.tsx
[A16]: ../../AutoEscola/CRM-Docker/crm-auto-escola-whats/src/routes/whatsapp.routes.js
[A17]: ../../AutoEscola/CRM-Docker/crm-auto-escola-whats/src/whatsapp/createClient.js
[A18]: ../../AutoEscola/CRM-Docker/crm-auto-escola-back/ExemploBackendDotNet/CRM.Service/Handlers/RegistrarMensagemWhatsappCommandHandler.cs
[A19]: <../../AutoEscola/CRM-AutoEscola-Front/app/(main)/backup/Backup.tsx>
[A20]: ../../AutoEscola/CRM-Docker/crm-auto-escola-back/ExemploBackendDotNet/CRM.Persistence/ExemploDbContext.cs
[A21]: ../../AutoEscola/CRM-Docker/crm-auto-escola-back/ExemploBackendDotNet/CRM.API/Program.cs
[A22]: ../../AutoEscola/CRM-AutoEscola-Front/lib/formatWhatsText.tsx
[A23]: ../../AutoEscola/CRM-AutoEscola-Front/components/whats/MessageBubble.tsx
[A24]: ../../AutoEscola/CRM-AutoEscola-Front/components/whats/MessageInput.tsx
[A25]: <../../AutoEscola/CRM-AutoEscola-Front/app/(main)/venda/editar/[id]/page.tsx>
[A26]: ../../AutoEscola/CRM-Docker/crm-auto-escola-back/ExemploBackendDotNet/CRM.Service/Handlers/TransferirVendasCommandHandler.cs
[A27]: ../../AutoEscola/CRM-Docker/crm-auto-escola-back/ExemploBackendDotNet/CRM.Service/Handlers/VincularConversasNumeroCommandHandler.cs
[A28]: ../../AutoEscola/CRM-AutoEscola-Front/components/whats/ChatItem.tsx
[A29]: <../../AutoEscola/CRM-AutoEscola-Front/app/(main)/vendedor/page.tsx>
[A30]: ../../AutoEscola/CRM-Docker/crm-auto-escola-back/ExemploBackendDotNet/CRM.Service/Handlers/EditarUsuarioCommandHandler.cs
[A31]: ../../AutoEscola/CRM-Docker/crm-auto-escola-back/ExemploBackendDotNet/CRM.Service/Handlers/CriarVendaCommandHandler.cs
[A32]: <../../AutoEscola/CRM-AutoEscola-Front/app/(main)/whatsapp/grupos/page.tsx>

### Fontes do projeto atual

- Comercial: [N1] (controller), [N2] (serviço), [N13] (classificações), [N23] (listagem) e [N27] (entidades).
- Dashboard: [N3] (controller) e [N20] (visão geral).
- Agenda e grupos: [N4] (agendamentos) e [N5] (grupos).
- Administração e acesso: [N12] (catálogo), [N21] (autenticação) e [N22] (escopo).
- Atendimento: [N6] (página), [N7] (controller WhatsApp), [N9] (conversa), [N10] (texto/telefones), [N11] (compositor) e [N14] (agrupamentos).
- Mensageria e mídia: [N16] (envio/ações), [N17] (voz), [N18] (figurinhas) e [N19] (anexos).
- Campanhas: [N8] (worker/histórico), [N15] (elegibilidade) e [N25] (sequência/intervalos/falhas).
- Operação: [N24] (sessões/eventos) e [N26] (servidor/encerramento).

[N1]: ../apps/api/Features/Leads/LeadsController.cs
[N2]: ../apps/api/Features/Leads/LeadService.cs
[N3]: ../apps/api/Features/Dashboard/DashboardController.cs
[N4]: ../apps/api/Features/Appointments/AppointmentsController.cs
[N5]: ../apps/api/Features/Groups/GroupsController.cs
[N6]: ../apps/web/src/features/whatsapp/chat-page.tsx
[N7]: ../apps/api/Features/WhatsApp/WhatsAppController.cs
[N8]: ../apps/whatsapp/src/campaigns/worker.ts
[N9]: ../apps/web/src/features/whatsapp/conversation.tsx
[N10]: ../apps/web/src/features/whatsapp/message-text.tsx
[N11]: ../apps/web/src/features/whatsapp/message-composer.tsx
[N12]: ../apps/api/Features/Admin/CatalogController.cs
[N13]: ../apps/api/Features/Leads/ClassificationsController.cs
[N14]: ../apps/web/src/lib/chat-groups.ts
[N15]: ../apps/api/Features/WhatsApp/EligibilityController.cs
[N16]: ../apps/whatsapp/src/messaging/send.ts
[N17]: ../apps/web/src/features/whatsapp/voice-recorder.tsx
[N18]: ../apps/web/src/features/whatsapp/composer-sticker-picker.tsx
[N19]: ../apps/web/src/features/whatsapp/message-attachment.tsx
[N20]: ../apps/web/src/features/dashboard/overview.tsx
[N21]: ../apps/api/Features/Auth/AuthenticationSetup.cs
[N22]: ../apps/api/Infrastructure/CurrentUser.cs
[N23]: ../apps/web/src/features/leads/leads-page.tsx
[N24]: ../apps/whatsapp/src/sessions/manager.ts
[N25]: ../apps/whatsapp/src/campaigns/deliver.ts
[N26]: ../apps/whatsapp/src/server.ts
[N27]: ../apps/api/Domain/Entities.cs

# Funcionamento do CRM da autoescola

## Visão geral

O projeto é um CRM web, acessado pelo navegador e utilizado por múltiplos usuários, voltado à captação de clientes e ao acompanhamento comercial de uma autoescola. Ele organiza os interessados nos serviços, distribui os atendimentos entre vendedores e permite acompanhar o relacionamento até a concretização da venda.

O sistema tem duas funções principais:

1. **Manter leads e vendas:** cadastrar interessados, registrar informações comerciais, acompanhar a situação de cada atendimento e programar retornos.
2. **Conectar o WhatsApp:** oferecer uma interface de conversas semelhante ao WhatsApp Web, integrada ao CRM, com atendimento individual e envio de mensagens em lote.

As duas funções se complementam: um lead pode ser vinculado a uma conversa do WhatsApp, relacionando os dados comerciais ao atendimento por mensagens.

## Organização por sede e vendedor

O CRM é dividido por sedes, que representam as unidades da autoescola. Usuários e leads possuem associação com uma sede, permitindo organizar a operação comercial de cada unidade.

Cada lead está atrelado a um vendedor. O sistema diferencia o vendedor responsável pelo registro e o vendedor atual que conduz o atendimento. Essa distinção permite transferir a carteira temporariamente ou alterar o responsável de forma permanente.

A regra de negócio desejada é que **os clientes sejam únicos por sede**, considerando o telefone de contato: um mesmo cliente não deve ter cadastros duplicados dentro da mesma unidade, mas pode ser atendido por sedes diferentes, com seu respectivo vínculo comercial em cada uma.

Nas consultas com controle por sede, usuários vinculados a uma unidade ficam limitados a ela, inclusive administradores com sede definida. Um administrador sem sede pode ter uma visão global. Um usuário comum precisa ter uma sede cadastrada.

## 1. Gestão de leads e vendas

Um lead é uma pessoa interessada nos serviços da autoescola. Seu cadastro reúne informações de contato, origem do interesse, serviço procurado e evolução da negociação.

No projeto, leads e vendas usam o mesmo cadastro, a diferença é que na venda, o status = venda efetivada - os outros são leads

### Campos cadastrados

| Campo                 | Finalidade                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| Sede                  | Unidade da autoescola à qual o atendimento pertence.                                              |
| Vendedor              | Responsável comercial pelo lead.                                                                  |
| Cliente               | Nome do interessado ou cliente.                                                                   |
| Gênero                | Masculino, feminino, outro ou prefiro não informar.                                               |
| Data de nascimento    | Informação pessoal do cliente.                                                                    |
| Origem                | Canal de entrada: presencialmente, fone, site ou redes sociais.                                   |
| E-mail                | Endereço eletrônico para contato.                                                                 |
| Fone                  | Telefone adicional, separado do contato principal.                                                |
| Contato (telefone)    | Número principal, usado na identificação do lead e na associação com o WhatsApp.                  |
| Indicação             | Registro de quem indicou o cliente.                                                               |
| Como conheceu         | Descrição de como conheceu a autoescola.                                                          |
| Motivo da escolha     | Motivo informado para escolher a autoescola.                                                      |
| Serviço               | Serviço de interesse ou contratado, selecionado do cadastro de serviços.                          |
| Condição de venda     | Condição comercial selecionada do cadastro correspondente.                                        |
| Status                | Situação atual da negociação.                                                                     |
| Valor da venda        | Valor comercial registrado para a oportunidade ou venda.                                          |
| Observações           | Anotações sobre o cliente e o atendimento.                                                        |
| Data de retorno       | Data prevista para um próximo contato; gera um agendamento quando preenchida no cadastro inicial. |
| Observação de retorno | Orientação ou contexto para o próximo atendimento.                                                |

No formulário inicial, sede, vendedor, nome do cliente, contato e status são obrigatórios. Se houver uma observação de retorno, também é necessário informar a data de retorno.

O sistema mantém ainda identificadores, data de criação, data de alteração, vendedor atual e vínculo com o WhatsApp. O modelo de dados também prevê um campo de contrato, mas ele não está exposto nos formulários de cadastro e edição analisados.

### Situações do atendimento

| Status                  | Significado funcional                                           |
| ----------------------- | --------------------------------------------------------------- |
| Agendar Contato         | O atendimento precisa de um próximo contato.                    |
| Venda Efetivada         | A negociação foi concluída com venda.                           |
| Stand By                | A oportunidade está em espera.                                  |
| Optou pela Concorrência | O cliente informou que escolheu outra empresa.                  |
| Não Enviar Mais         | O registro sinaliza que não devem ser enviadas novas mensagens. |

Esses status ajudam a organizar a carteira e a selecionar públicos para acompanhamento e comunicação.

### Consulta e acompanhamento

O vendedor tem uma área de “Meus Leads”, além das consultas de vendas e leads. Os registros podem ser consultados e editados para manter informações e situação comercial atualizadas.

Os agendamentos permitem registrar retornos associados a um lead, com data e observação. Há uma consulta geral, uma visão de agendamentos do vendedor e acesso aos agendamentos de uma venda. São compromissos de acompanhamento comercial, não um cadastro de aulas de direção.

### Transferência de leads

A interface administrativa oferece transferência de leads entre vendedores, inclusive com seleção de vários registros:

- **Temporária:** altera o vendedor atual que realiza o atendimento, preservando o responsável original.
- **Permanente:** altera também o vendedor responsável pelo registro.

Isso permite redistribuir a carteira quando há mudanças na equipe ou necessidade de cobertura de atendimentos.

## 2. Atendimento e envio de mensagens pelo WhatsApp

O módulo de WhatsApp, acessível pela opção “Disparos”, conecta uma sessão por meio de QR Code escaneado no celular. A sessão é identificada pelo usuário no CRM.

A interface reproduz a experiência principal do WhatsApp Web: lista de conversas, seleção de contato, histórico de mensagens e composição de respostas. Não representa uma reprodução integral de todos os recursos do aplicativo original.

O atendimento inclui mensagens de texto e anexos, como imagens, vídeos, arquivos de áudio e documentos. Também há recursos de resposta a mensagens e edição de texto, conforme o suporte da integração.

### Envio em lote

Além das conversas individuais, o sistema permite preparar uma mensagem e enviá-la a vários destinatários. O fluxo oferece seleção de contatos, uso de grupos organizados no CRM, filtros pelos dados comerciais e envio com anexos.

O usuário pode configurar o intervalo entre mensagens e uma pausa maior após determinada quantidade de envios. Há acompanhamento do envio e opção de solicitar seu cancelamento.

Os status dos leads participam da seleção dos destinatários. A situação “Não Enviar Mais” deve ser considerada na organização dos contatos; a seleção e os filtros do lote precisam corresponder ao público que se deseja contatar.

### Grupos de contatos

Os “Grupos de WhatsApp” do CRM são agrupamentos internos de contatos para organizar públicos e facilitar disparos. Não devem ser confundidos com a criação de uma conversa coletiva no aplicativo WhatsApp.

É possível nomear grupos, gerar sua composição a partir de filtros de leads, consultar participantes, adicionar ou remover conversas e excluir grupos. Entre os critérios de organização estão status e serviço.

### Histórico e backup

A área “Backup” permite consultar conversas e mensagens armazenadas pelo sistema. Ela auxilia na recuperação do contexto de atendimentos já registrados, e administradores podem selecionar usuários para consulta dentro do escopo disponível.

Esse recurso é uma consulta ao histórico persistido no CRM; não equivale a um backup completo de todo o aplicativo WhatsApp.

## Integração entre leads e WhatsApp

O vínculo entre as duas funções associa um cadastro comercial a uma conversa. Assim, o vendedor pode reconhecer o cliente do chat, acessar seu registro e usar os dados do lead para organizar o atendimento e os envios.

O telefone de contato é usado para localizar correspondências entre leads e conversas. Também existe um fluxo de vinculação explícita. Na vinculação manual, o sistema verifica se o usuário é o responsável atual pelo lead e impede que um mesmo cadastro seja ligado a outro chat quando já possui vínculo.

Uma conversa pode existir antes de o interessado estar cadastrado no CRM. A interface permite iniciar um novo cadastro a partir do contexto do WhatsApp, aproveitando nome e contato. Da mesma forma, um lead pode ser cadastrado primeiro e vinculado ao WhatsApp posteriormente.

Um fluxo típico de uso é:

1. O interessado entra em contato ou tem seus dados registrados por um vendedor.
2. O vendedor cadastra o lead na sede correspondente e informa origem, interesse e situação.
3. A conversa do WhatsApp é associada ao cadastro.
4. O atendimento continua pelo chat, com atualização das informações comerciais e agendamento de retornos.
5. Quando pertinente, o contato participa de um grupo interno para comunicações em lote.
6. O vendedor registra o resultado da negociação, como venda efetivada, espera ou escolha da concorrência.

## Administração e indicadores

O sistema possui usuários comuns e administradores. A interface reserva aos administradores ações como cadastro de vendedores e tabelas auxiliares, transferência de leads e acesso ao dashboard.

Os cadastros de apoio incluem:

| Cadastro            | Informações principais                                                          |
| ------------------- | ------------------------------------------------------------------------------- |
| Usuários/vendedores | Nome, usuário de acesso, senha, perfil de administrador, situação e sede.       |
| Sedes               | Nome da unidade; o sistema também mantém data de inclusão e indicador de ativo. |
| Serviços            | Nome dos serviços que podem ser associados aos leads e vendas.                  |
| Condições de venda  | Nome das condições comerciais disponíveis para seleção no atendimento.          |
| Agendamentos        | Lead/venda associado, data do retorno e observação.                             |
| Grupos de contatos  | Nome, usuário proprietário e contatos participantes.                            |

O dashboard apresenta total de leads, matrículas/vendas efetivadas, leads abertos, leads sem sucesso e valor total de vendas. Também oferece um comparativo por vendedor com quantidade de leads, matrículas e valores comerciais.

## Estrutura técnica em poucas palavras

O projeto tem três partes principais: uma aplicação web em Next.js/React, um backend em .NET que concentra os cadastros e regras comerciais, e um serviço Node.js para integração com o WhatsApp com baileys e fastify. Há uma configuração Docker para os serviços de infraestrutura e backend.

Para o usuário, essas partes formam uma única ferramenta de trabalho: acesso pelo navegador, carteira de leads organizada por sede e vendedor, acompanhamento comercial e comunicação pelo WhatsApp.

# Arquitetura e regras

## Limites dos serviços

**Web:** Next.js App Router + React + TypeScript. As telas estão em `features`, enquanto as rotas apenas compõem a navegação. Formulários, cliente HTTP, contexto de sessão e componentes compartilhados têm responsabilidades separadas. As telas sempre consultam dados persistidos; não há fallback silencioso para dados falsos.

**API:** ASP.NET Core 10 com controllers, DTOs validados, EF Core e serviços de aplicação. O `LeadService` coordena validações, concorrência e transação de lead + retorno inicial. `CurrentUser` aplica escopo de sede e autorização de edição. O acesso aos dados fica próximo à funcionalidade, sem repositórios genéricos que apenas repitam o EF Core.

**WhatsApp:** Fastify + Baileys + TypeScript. O módulo mantém uma sessão por usuário, com credenciais e chaves em SQLite (sem `useMultiFileAuthState`). Eventos de mensagens alimentam a consulta de conversas/histórico. O worker executa um lote por sessão e consulta a API antes de cada destinatário.

## Persistência

Dois bancos SQLite em WAL, separados por serviço. O banco CRM tem migrações EF Core. O serviço WhatsApp tem esquema inicial idempotente em `storage/database.ts`. São apropriados para uma instalação de pequeno/médio porte com **uma instância de cada serviço**. Não compartilhe os arquivos SQLite entre réplicas ou via filesystem de rede.

Antes de escalar horizontalmente, migre o CRM para PostgreSQL, adote migrações do banco de mensagens e distribua o worker/sessões com coordenação exclusiva por usuário. Isso é uma evolução operacional, não uma configuração suportada por esta entrega.

## Autorização

| Perfil | Consulta | Edição de lead | Administração |
| --- | --- | --- | --- |
| Vendedor com sede | Dados da sua sede | Somente sua carteira atual | Não |
| Administrador com sede | Apenas sua sede | Leads da sua sede | Equipe e sede dentro do escopo; dashboard e transferências |
| Administrador global | Todas as sedes | Todos os leads | Sedes, equipe, catálogos, indicadores e transferências |

Serviços e condições de venda são catálogos globais: administradores de sede os consultam; apenas o administrador global os altera. Grupos são pessoais. A sessão de WhatsApp também é pessoal, inclusive para administradores. O acesso administrativo a outras sessões é somente leitura, na área de histórico.

As permissões são verificadas na API. A remoção/inativação de uma sede bloqueia o login e invalida o uso das sessões dos seus usuários. Alterações em usuário renovam seu security stamp e invalidam cookies existentes. Senhas são armazenadas com `PasswordHasher` do ASP.NET Core.

## Regras comerciais

- Normalização remove pontuação; números brasileiros de 10/11 dígitos recebem DDI 55. Números internacionais precisam incluir o DDI.
- Índice único `(BranchId, Phone)` protege inclusive contra cadastros simultâneos.
- Um vendedor comum sempre tem sede. O vendedor atribuído deve estar ativo e na sede do lead, ou ser administrador global.
- Uma transferência temporária altera apenas `CurrentSellerId`; a permanente altera também `SellerId`. O vínculo de chat da sessão anterior é limpo, preservando o histórico daquele usuário.
- A sede do lead não muda por edição. Uma mudança de sede do vendedor exige antes a transferência permanente dos cadastros pelos quais ele é responsável.
- `Revision` impede sobrescrita de uma edição concorrente. O frontend pede atualização em caso de conflito.
- Lead e agendamento inicial são gravados na mesma transação. Ao editar, preencher novo retorno cria um novo compromisso; não sobrescreve os anteriores.
- Dashboard filtra a **data de criação/captação do lead**. Matrículas e receita representam o status atual dos leads captados no período. Não é um relatório financeiro por data de fechamento.
- O campo de contrato é persistido no modelo, sem formulário, conforme especificação.

## Disparos e entrega

API resolve os destinatários no escopo da carteira atual e exclui opt-outs. Worker revalida cada destinatário imediatamente antes do envio. Se CRM estiver indisponível, o lote para. A cancelamento impede próximos envios e interrompe esperas, mas não pode desfazer um envio já iniciado.

Não há garantia de entrega “exatamente uma vez”: uma falha de rede pode acontecer depois de o WhatsApp aceitar a mensagem. O worker interrompe o lote nesse caso e não reenvia automaticamente. Reinícios marcam lotes como `interrupted`; a interface apresenta o motivo e o progresso persistido.

## Segurança e operação

Cookies HttpOnly + SameSite Strict, antiforgery em mutações, ausência de CORS permissivo, hash de senha, limitação de login e chave entre serviços. Chaves de Data Protection persistem no volume da API; os arquivos devem ter acesso restrito e armazenamento criptografado pelo ambiente. A configuração não implementa MFA, SSO, trilha de auditoria completa ou alta disponibilidade.

## Referências

- [Next.js: instalação e App Router](https://nextjs.org/docs/app/getting-started/installation)
- [ASP.NET Core: autenticação por cookie](https://learn.microsoft.com/aspnet/core/security/authentication/cookie?view=aspnetcore-10.0)
- [Baileys: repositório e documentação](https://github.com/WhiskeySockets/Baileys)

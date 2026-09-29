# Validação da implementação

Última execução: **28/09/2026**, em Windows, Node.js 22.20 e .NET SDK 10.

## Verificações automatizadas

| Verificação | Resultado |
| --- | --- |
| `npm run build` | Frontend Next.js, serviço WhatsApp e solução .NET compilados; .NET sem avisos ou erros |
| `npm run typecheck` | Frontend e serviço WhatsApp sem erros TypeScript |
| `npm test` | 33 testes aprovados: 11 da API e 22 do serviço WhatsApp |
| `docker compose config --quiet` | Configuração válida, com variáveis temporárias de validação |

Os testes da API cobrem autenticação, CSRF, escopo de sede e vendedor, unicidade de telefone, transferências, criação e paginação de retornos, concorrência, vínculo de conversa, grupos e bloqueio de destinatários. O serviço WhatsApp tem testes de validação, isolamento de histórico, paginação com timestamps iguais, edição, reação e exclusão de mensagens, revalidação de destinatários, pausas, cancelamento e falhas sem reenvio automático.

## Conferência no navegador

Login administrativo, dashboard com dados persistidos, cadastro de lead, criação automática do retorno e criação de grupo interno por filtros foram conferidos no ambiente demonstrativo. O agendamento preservou o horário informado e o grupo incluiu o contato da carteira do usuário. As rotas foram separadas por módulo e reconstruídas com sucesso.

O dashboard foi inspecionado em desktop e em viewport de 390 × 844. Evidências: [desktop](screenshots/dashboard-desktop.png) e [celular](screenshots/dashboard-mobile.png).

## Limites desta validação

- O Docker Desktop falhou ao iniciar seu componente local `dockerInference`. A configuração Compose foi validada, mas o build e a execução dos containers não foram confirmados neste ambiente.
- Nenhuma conta WhatsApp real foi conectada e nenhuma mensagem externa foi enviada. A homologação com conta e contato controlados segue o procedimento em [operação](OPERATIONS.md).
- O aviso experimental de `node:sqlite` é emitido pelo Node.js 22; os testes de armazenamento passaram.

# Migração do CRM antigo

Procedimento implementado em **07/11/2026**. Origem: backup PostgreSQL do CRM antigo. Destino: SQLite compatível com as migrations atuais da API. Não acessa o servidor antigo e não importa sessões, mensagens, grupos ou campanhas WhatsApp.

## Executar a partir de um backup

Pré-requisitos: Docker em execução, .NET SDK 10 e PowerShell. Execute na raiz do repositório. A pasta de saída deve ser nova, preferencialmente dentro de `data/`, que é ignorada pelo Git. Snapshot, banco e relatórios contêm dados pessoais; o snapshot também contém hashes de senha. Não versione nem publique esses arquivos.

Primeiro, somente auditar:

```powershell
./scripts/migrate-legacy.ps1 `
  -Backup 'C:\caminho\backup.backup' `
  -OutputDirectory 'C:\caminho\crm-novo\data\auditoria-legado' `
  -AuditOnly
```

Para gerar uma base nova e separar os registros conflitantes, após revisar o relatório:

```powershell
./scripts/migrate-legacy.ps1 `
  -Backup 'C:\caminho\backup.backup' `
  -OutputDirectory 'C:\caminho\crm-novo\data\importacao-legado' `
  -AllowPending
```

O script restaura o backup inteiro com `pg_restore --single-transaction --no-owner --no-privileges` em um container descartável PostgreSQL 17, sem rede externa ou portas publicadas. A imagem lê o formato custom 1.16 do backup recebido (servidor 16.11, pg_dump 18.1), apesar da extensão `.sql` do arquivo. Falha interrompe o procedimento. Exporta as seis áreas numa transação read-only repeatable-read, em UTC, usando [export-legacy.sql](../scripts/export-legacy.sql). O container é parado/removido ao terminar; a origem não é modificada. Esse backup não inclui os objetos globais do cluster, como papéis e tablespaces.

## Arquivos produzidos

- `backup-manifest.json`: caminho, tamanho, SHA-256 e registro da restauração.
- `source.json`: snapshot original das seis áreas, incluindo hashes BCrypt; mantém todos os registros.
- `report.json`: estado, SHA-256 do snapshot, contagens, mapas de IDs, reconciliação por sede/status/valor, conversões por registro e problemas encontrados.
- `report.json.pending.json`: leads e agendamentos pendentes com seus campos originais e motivos; não escolhe automaticamente um sobrevivente entre duplicatas.
- `crm.db`: criado somente na importação concluída e verificada. Não contém dados demonstrativos.

O comando direto, para reutilizar um snapshot já exportado, é:

```powershell
dotnet run --project tools/LegacyMigration -- import `
  --source 'C:\caminho\source.json' `
  --report 'C:\caminho\nova-execucao.json' `
  --output 'C:\caminho\novo-crm.db' `
  --allow-pending
```

Substitua `import` por `audit` e omita `--output` para auditar. Códigos de saída: 0 sucesso (podendo conter pendências explicitamente autorizadas), 2 auditoria com bloqueios/pendências sem autorização, 1 erro, 130 cancelamento. `--allow-pending` aceita apenas a separação de leads/agendamentos; erros em sedes, usuários ou catálogos sempre bloqueiam a importação inteira. Relatórios e destino existentes nunca são sobrescritos. Repetir usa nomes novos e gera outra base; não é um merge incremental com o banco em uso.

## Regras de conversão

| Dados | Tratamento |
| --- | --- |
| Sedes | Preserva ID, nome com trim, ativo/inativo e dia de inclusão (meia-noite UTC, sem inferir horário histórico). |
| Usuários | Preserva ID, perfil, sede e hash BCrypt; login com trim/lower invariant e novo SecurityStamp. Status 1 vira ativo; 2/3 inativo, com estado antigo registrado no snapshot/relatório. Vendedor sem sede ou referência inexistente bloqueia. |
| Senhas | Login aceita BCrypt legado e ASP.NET Identity. Após senha válida e sede ativa, troca BCrypt por Identity com atualização condicional no hash/stamp original. Inativo, senha errada, hash inválido ou sede inativa não atualizam hash. Alteração concorrente das credenciais rejeita o login; futuras trocas mantêm mínimo de dez caracteres. |
| Serviços/condições | Serviços mantêm IDs; condições recebem IDs acima do maior ID de serviço, com mapa explícito. Tipos separados em Catalog e nomes únicos por tipo; todos ativos, pois o legado não tinha esse estado. |
| Leads | Preserva ID, sede, vendedores original/atual, contatos, informações comerciais, observações, contrato e datas válidas. Status 1–5 seguem a ordem dos cinco status atuais, incluindo Não Enviar Mais. Enums de origem/gênero viram os textos aceitos. Revision começa em 1; vínculo de conversa fica vazio. |
| Ausências | Origem nula vira `não informado`; valor nulo vira zero; DataAlteracao `-infinity`/ausente usa CreatedAt. Cada ocorrência é registrada, sem atribuir uma origem de captação fictícia. Nascimento conserva o dia, sem deslocar pelo fuso. |
| Telefone | Aplica exatamente LeadRules.NormalizePhone. Não infere DDD, nono dígito ou número ausente. Todos os membros de uma duplicidade por sede ficam pendentes, mesmo quando a grafia original era diferente. Mesmos números em sedes diferentes são permitidos. |
| Responsáveis | Vendedor atual nulo usa o original somente se passar na validação da sede. Vendedores original/atual precisam pertencer à sede ou ser administradores globais; não movimenta leads entre sedes por suposição. Referências históricas a usuários/sedes inativos são preservadas sem reativação. |
| Validações | Reutiliza os DTOs atuais para obrigatórios, tamanhos, e-mail e valor decimal entre 0 e 100.000.000, incluindo centavos. Rejeita enums/datas inválidos e nascimento futuro. Duplicidade de nomes/logins respeita trim e lower invariant. |
| Agendamentos | Preserva ID, referência ao lead, horário UTC e observação. Todos pendentes: o legado não registra conclusão. Retorno vencido não vira concluído. Retorno de lead pendente também fica separado, sem perder o vínculo original. |

## Gravação, falha e cancelamento

O importador usa [CrmDbContext](../apps/api/Infrastructure/CrmDbContext.cs) e aplica as migrations oficiais em um arquivo temporário exclusivo, sem executar SeedData. Salva as seis áreas numa transação. Lê cada campo de todos os registros gravados para comparar com o plano (decimais por valor, datas UTC) e executa `PRAGMA integrity_check` e `PRAGMA foreign_key_check`. Somente depois publica o arquivo final por renomeação sem sobrescrita. Falha ou cancelamento antes da publicação descarta apenas o arquivo temporário; a origem e o banco em uso continuam intactos. Relatórios já produzidos e snapshot permanecem para diagnóstico. Falha ao gravar um relatório após publicar a base deve ser conferida pelo arquivo de destino e pela mensagem do comando antes de repetir com novos caminhos.

## Ativar e retornar

1. Pare a API do destino para impedir gravações e confira o caminho real de ConnectionStrings:Crm. Em desenvolvimento padrão é `apps/api/data/crm.db`.
2. Faça backup consistente do SQLite anterior; preserve seu original e os arquivos auxiliares enquanto houver processos abertos. Preserve também as chaves de Data Protection. Se o WhatsApp tiver dados de teste ligados aos IDs anteriores, isole seu banco antes de reutilizar esses IDs para pessoas diferentes.
3. Instale uma cópia do `crm.db` validado, mantendo o artefato de migração. Inicie a API com o código desta entrega. Como já existem usuários, o seed não adiciona demonstrações.
4. Confira health, login com senha antiga, catálogo, contagens, valores, escopo por sede, transferidos e agenda. Abra o novo CRM em uma sessão sem cookies de teste. O WhatsApp precisa ser conectado novamente quando o banco de sessões tiver sido isolado; a migração comercial não cria conexão nem envia mensagens.
5. Para retornar antes de novas gravações, pare a API, preserve o banco migrado e restaure o backup anterior. Depois de novas gravações, reconcilie as alterações antes de qualquer retorno; uma simples troca de arquivo perderia o trabalho posterior.

## Resolver pendências depois

Para a revisão autorizada em 07/11/2026, execute com **Node.js 24**:

```powershell
node scripts/resolve-legacy-pending.mjs `
  --source 'C:\caminho\source.json' `
  --pending 'C:\caminho\report.json.pending.json' `
  --database 'C:\caminho\crm-novo\apps\api\data\crm.db' `
  --output-dir 'C:\caminho\nova-revisao'
```

O banco precisa existir e a pasta de saída deve ser nova. O procedimento faz backup consistente, revalida a carga em um candidato separado e aplica somente as inclusões/correções autorizadas em uma transação na base ativa. Não substitui os dados já usados nem redefine senhas. Rejeita IDs já importados e reverte todo o lote em conflitos, preservando relatórios e backup para diagnóstico. Para nova revisão use o `source-resolved.json` e as pendências da última revisão, mantendo o snapshot original como evidência; reusar a lista antiga não deve reinserir dados.

As regras específicas desta revisão são:

- Corrigir a sede do lead para a sede definida do vendedor atual.
- Igualar o vendedor original ao atual apenas quando os dois vendedores têm sedes definidas e diferentes. A verificação inclui os registros já gravados; transferências na mesma sede são mantidas. Administrador global sem sede não é tratado como outra sede.
- Consolidar grupos pendentes com mesmo telefone/sede, mesmo quando os nomes diferem, conforme a segunda revisão autorizada. Manter o mais recente por DataAlteracao válida ou DataInicial; desempatar pelo menor ID. O registro escolhido mantém seus campos, sem soma de valores. Todos os originais e os IDs absorvidos são preservados em `merged-originals.json`, e retornos são vinculados ao ID escolhido. Não absorver automaticamente um registro que já esteja no banco ativo.
- Nascimento futuro nos pendentes vira nulo: o modelo, o DTO e o formulário aceitam ausência de nascimento. Não atribuir uma idade fictícia. `birthCorrections` registra cada ID e a data original; datas válidas, snapshot original e demais campos permanecem preservados.
- Manter as demais validações de telefone, valor, limites e referências. Telefones inválidos, valores negativos e outros problemas continuam pendentes. Um conflito novo com dado já existente interrompe a gravação; não sobrescreve registros da base ativa.

O relatório `resolution-report.json` informa o estado, os IDs adicionados, os absorvidos, as correções e os totais restantes. `PENDENCIAS.md` apresenta os grupos em sequência e `report.json.pending.json` mantém os dados completos. `crm-before.db` é o backup anterior e `crm.db` é uma cópia consistente posterior ao commit. Falha de relatório/cópia após o commit exige conferir os IDs no banco antes de repetir. Não há envio ou alteração de sessão WhatsApp.

Testes do procedimento:

```powershell
node --test scripts/legacy-pending-rules.test.mjs
```

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { DatabaseSync, backup } from 'node:sqlite';
import { resolveSnapshot, ownershipCorrection, orderPending, applyResolution, normalizePhone } from './legacy-pending-rules.mjs';

const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i += 2) {
  if (!['--source', '--pending', '--database', '--output-dir'].includes(args[i]) || !args[i + 1] || options[args[i]])
    throw new Error('Use --source snapshot.json --pending report.json.pending.json --database crm.db --output-dir pasta-nova');
  options[args[i]] = path.resolve(args[i + 1]);
}
if (Object.keys(options).length !== 4 || new Set(Object.values(options)).size !== 4) throw new Error('Informe quatro caminhos distintos.');
const out = options['--output-dir'];
if (fs.existsSync(out)) throw new Error('A pasta de saída já existe; preserve as execuções anteriores.');
if (!fs.existsSync(options['--database'])) throw new Error('Banco ativo inexistente.');
fs.mkdirSync(out, { recursive: true });
const write = (name, value) => fs.writeFileSync(path.join(out, name), JSON.stringify(value, null, 2));
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const source = read(options['--source']);
const oldPending = read(options['--pending']);
const pendingIds = new Set(oldPending.leads.map(x => x.Id));
const db = new DatabaseSync(options['--database']);
db.exec('PRAGMA busy_timeout=5000');
try {
  await backup(db, path.join(out, 'crm-before.db'));
  const users = new Map(db.prepare('SELECT Id,BranchId FROM Users ORDER BY Id').all().map(x => [x.Id, x]));
  const existing = db.prepare('SELECT * FROM Leads').all();
  const expectedCorrections = existing.map(lead => ({ lead, fixed: ownershipCorrection(lead, users) }))
    .filter(x => x.lead.SellerId !== x.fixed.sellerId || x.lead.BranchId !== x.fixed.branchId);
  const rules = resolveSnapshot(source, pendingIds, users);
  write('source-resolved.json', rules.snapshot);
  write('merged-originals.json', rules.merged);
  write('pending-before.json', oldPending);
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const build = path.join(out, 'build').replaceAll('\\', '/') + '/';
  function run(parameters) {
    const result = spawnSync('dotnet', parameters, { cwd: root, encoding: 'utf8' });
    if (result.status !== 0) throw new Error('Falha no validador .NET: ' + (result.stdout ?? '') + (result.stderr ?? ''));
    process.stdout.write(result.stdout);
  }
  run(['build', path.join(root, 'tools/LegacyMigration/LegacyMigration.csproj'), '-p:BaseOutputPath=' + build]);
  run([path.join(build, 'Debug/net10.0/LegacyMigration.dll'), 'import', '--source', path.join(out, 'source-resolved.json'),
    '--report', path.join(out, 'validation-report.json'), '--output', path.join(out, 'candidate.db'), '--allow-pending']);
  const validation = read(path.join(out, 'validation-report.json'));
  const pending = read(path.join(out, 'validation-report.json.pending.json'));
  // Never silently remove a previously imported record from the audit after changing a branch.
  if (pending.leads.some(x => !pendingIds.has(x.Id))) throw new Error('A correção criou conflito com um lead já importado; revise o relatório.');
  pending.leads = orderPending(pending.leads);
  write('report.json.pending.json', pending);
  const branches = new Map(source.branches.map(x => [x.Id, x.Nome]));
  const cell = x => String(x ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
  const reviewDate = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  let md = `# Pendências após revisão — ${reviewDate}\n\n`;
  md += `${pending.leads.length} leads e ${pending.appointments.length} agendamento(s) permanecem separados. Telefones repetidos na mesma sede aparecem em sequência.\n\n`;
  md += '| Grupo | ID antigo | Nome | Sede | Telefone original | Motivos |\n| --- | --- | --- | --- | --- | --- |\n';
  const groupNumbers = new Map();
  for (const lead of pending.leads) {
    const phone = normalizePhone(lead.Contato);
    const key = phone ? `${lead.SedeId}:${phone}` : `invalid:${lead.Id}`;
    if (!groupNumbers.has(key)) groupNumbers.set(key, groupNumbers.size + 1);
    const issues = validation.issues.filter(x => x.Entity === 'lead' && x.Id === lead.Id);
    md += `| ${groupNumbers.get(key)} | ${lead.Id} | ${cell(lead.Cliente)} | ${cell(branches.get(lead.SedeId))} | ${cell(lead.Contato)} | ${issues.map(x => cell(x.Detail)).join('; ')} |\n`;
  }
  md += '\n## Agendamentos separados\n\n| ID antigo | Lead antigo | Data/hora UTC | Observação |\n| --- | --- | --- | --- |\n';
  for (const a of pending.appointments) md += `| ${a.Id} | ${a.VendaId} | ${cell(a.DataAgendamento)} | ${cell(a.Obs)} |\n`;
  md += '\nAs linhas consolidadas e seus dados originais estão em `merged-originals.json`; os IDs de cada grupo apontam para um único lead. O backup original e as revisões anteriores foram preservados.\n';
  fs.writeFileSync(path.join(out, 'PENDENCIAS.md'), md);
  write('resolution-report.json', { state: 'prepared', originalPending: pendingIds.size,
    corrections: rules.corrections, birthCorrections: rules.birthCorrections, merges: rules.merged.map(({ originals, ...x }) => x), existingCorrections: expectedCorrections.map(x => ({
      id: x.lead.Id, oldSellerId: x.lead.SellerId, sellerId: x.fixed.sellerId, oldBranchId: x.lead.BranchId, branchId: x.fixed.branchId })) });
  const result = applyResolution(db, path.join(out, 'candidate.db'), pendingIds, users, expectedCorrections);
  const counts = Object.fromEntries(['Users', 'Branches', 'Catalog', 'Leads', 'Appointments'].map(table => [table, db.prepare(`SELECT COUNT(*) total FROM ${table}`).get().total]));
  const report = { state: 'applied_and_verified', appliedAt: new Date().toISOString(), database: options['--database'],
    originalPending: pendingIds.size, insertedCount: result.insertedIds.length, insertedIds: result.insertedIds,
    absorbedCount: rules.aliases.size, merges: rules.merged.map(({ originals, ...x }) => x), corrections: rules.corrections, birthCorrections: rules.birthCorrections,
    correctedExistingIds: result.correctedIds, remainingPending: pending.leads.length, remainingAppointments: pending.appointments.length, counts };
  write('resolution-report.json', report);
  await backup(db, path.join(out, 'crm.db'));
  console.log(`Aplicado: ${result.insertedIds.length} leads adicionados; ${rules.aliases.size} duplicatas absorvidas; ${pending.leads.length} leads pendentes. Banco ativo preservado incrementalmente.`);
} finally {
  db.close();
}

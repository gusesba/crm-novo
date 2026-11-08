export function normalizePhone(value) {
  let phone = (value ?? '').replace(/[^0-9]/g, '');
  if (phone.length === 10 || phone.length === 11) phone = '55' + phone;
  return /^[1-9][0-9]{11,14}$/.test(phone) ? phone : null;
}

export function ownershipCorrection(lead, users) {
  const current = users.get(lead.CurrentSellerId);
  const original = users.get(lead.SellerId);
  // A global administrator has no branch; that is not a different named branch.
  const seller = original?.BranchId != null && current?.BranchId != null && original.BranchId !== current.BranchId
    ? lead.CurrentSellerId : lead.SellerId;
  return { sellerId: seller, branchId: current?.BranchId ?? lead.BranchId };
}

export function resolveSnapshot(source, pendingIds, users, today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())) {
  const snapshot = structuredClone(source);
  const corrections = [];
  const birthCorrections = [];
  for (const lead of snapshot.leads.filter(x => pendingIds.has(x.Id))) {
    const current = lead.VendedorAtualId ?? lead.VendedorId;
    const fixed = ownershipCorrection({ SellerId: lead.VendedorId, CurrentSellerId: current, BranchId: lead.SedeId }, users);
    if (fixed.sellerId !== lead.VendedorId || fixed.branchId !== lead.SedeId)
      corrections.push({ id: lead.Id, oldSellerId: lead.VendedorId, sellerId: fixed.sellerId, oldBranchId: lead.SedeId, branchId: fixed.branchId });
    lead.VendedorId = fixed.sellerId;
    lead.SedeId = fixed.branchId;
    if (typeof lead.DataNascimento === 'string' && !Number.isNaN(Date.parse(lead.DataNascimento)) && lead.DataNascimento.slice(0, 10) > today) {
      birthCorrections.push({ id: lead.Id, oldBirthDate: lead.DataNascimento, birthDate: null });
      lead.DataNascimento = null;
    }
  }
  const groups = new Map();
  for (const lead of snapshot.leads) {
    const phone = normalizePhone(lead.Contato);
    if (!phone) continue;
    const key = `${lead.SedeId}:${phone}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(lead);
  }
  const merged = [];
  const aliases = new Map();
  for (const group of groups.values()) {
    if (group.length < 2 || !group.every(x => pendingIds.has(x.Id))) continue;
    const effectiveDate = x => Date.parse(x.DataAlteracao) || Date.parse(x.DataInicial) || 0;
    const sorted = [...group].sort((a, b) => effectiveDate(b) - effectiveDate(a) || a.Id - b.Id);
    const selected = sorted[0];
    for (const other of sorted.slice(1)) aliases.set(other.Id, selected.Id);
    merged.push({ selectedId: selected.Id, absorbedIds: sorted.slice(1).map(x => x.Id),
      rule: 'Mesmo telefone/sede, independentemente do nome; registro mais recente, desempate pelo menor ID.',
      originals: source.leads.filter(x => group.some(g => g.Id === x.Id)) });
  }
  snapshot.leads = snapshot.leads.filter(x => !aliases.has(x.Id));
  snapshot.appointments = snapshot.appointments.map(x => ({ ...x, VendaId: aliases.get(x.VendaId) ?? x.VendaId }));
  return { snapshot, corrections, birthCorrections, merged, aliases };
}

export function orderPending(leads) {
  const key = x => `${String(x.SedeId).padStart(8, '0')}:${normalizePhone(x.Contato) ?? '~' + String(x.Id).padStart(10, '0')}`;
  return [...leads].sort((a, b) => key(a).localeCompare(key(b)) || a.Id - b.Id);
}

export function applyResolution(database, candidatePath, pendingIds, users, expectedCorrections, now = new Date().toISOString()) {
  database.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000');
  database.prepare('ATTACH DATABASE ? AS candidate').run(candidatePath);
  database.exec('BEGIN IMMEDIATE');
  try {
    const currentUsers = database.prepare('SELECT Id,BranchId FROM Users ORDER BY Id').all().map(x => [x.Id, x.BranchId]);
    const auditedUsers = [...users.values()].sort((a, b) => a.Id - b.Id).map(x => [x.Id, x.BranchId]);
    if (JSON.stringify(currentUsers) !== JSON.stringify(auditedUsers)) throw new Error('As sedes dos usuários mudaram após a auditoria.');
    const liveLeads = database.prepare('SELECT * FROM Leads').all();
    const corrections = liveLeads.map(lead => ({ lead, fixed: ownershipCorrection(lead, users) }))
      .filter(x => x.lead.SellerId !== x.fixed.sellerId || x.lead.BranchId !== x.fixed.branchId);
    if (JSON.stringify(corrections) !== JSON.stringify(expectedCorrections))
      throw new Error('A base mudou após a auditoria das responsabilidades; execute uma nova análise.');
    for (const { lead, fixed } of corrections) {
      database.prepare('UPDATE Leads SET SellerId=?,BranchId=?,Revision=Revision+1,UpdatedAt=?,ChatId=NULL,ChatUserId=NULL WHERE Id=? AND Revision=?')
        .run(fixed.sellerId, fixed.branchId, now, lead.Id, lead.Revision);
    }
    const existing = new Set(liveLeads.map(x => x.Id));
    const incoming = database.prepare('SELECT * FROM candidate.Leads ORDER BY Id').all().filter(x => pendingIds.has(x.Id));
    if (incoming.some(x => existing.has(x.Id))) throw new Error('Um ID pendente já existe na base ativa; nenhuma gravação foi confirmada.');
    for (const table of ['Leads', 'Appointments']) {
      const columns = database.prepare(`PRAGMA table_info(${table})`).all().map(x => x.name);
      const otherColumns = database.prepare(`PRAGMA candidate.table_info(${table})`).all().map(x => x.name);
      if (JSON.stringify(columns) !== JSON.stringify(otherColumns)) throw new Error('Schema divergente: ' + table);
      const rows = table === 'Leads' ? incoming : database.prepare('SELECT * FROM candidate.Appointments ORDER BY Id').all()
        .filter(x => incoming.some(l => l.Id === x.LeadId));
      const sql = `INSERT INTO ${table} (${columns.map(x => '"' + x + '"').join(',')}) VALUES (${columns.map(() => '?').join(',')})`;
      const insert = database.prepare(sql);
      for (const row of rows) insert.run(...columns.map(x => row[x]));
    }
    if (database.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Referências inválidas; operação revertida.');
    if (database.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('Integridade inválida; operação revertida.');
    database.exec('COMMIT');
    return { insertedIds: incoming.map(x => x.Id), correctedIds: corrections.map(x => x.lead.Id) };
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  } finally {
    database.exec('DETACH DATABASE candidate');
  }
}

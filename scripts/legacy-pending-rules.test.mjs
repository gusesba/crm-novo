import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ownershipCorrection, resolveSnapshot, orderPending, applyResolution } from './legacy-pending-rules.mjs';

const users = new Map([{ Id: 1, BranchId: 1 }, { Id: 2, BranchId: 1 }, { Id: 3, BranchId: 2 }, { Id: 4, BranchId: null }].map(x => [x.Id, x]));
const legacy = (id, name, overrides = {}) => ({ Id: id, Cliente: name, Contato: '41987654321', SedeId: 1,
  VendedorId: 1, VendedorAtualId: 2, DataInicial: '2025-01-01T00:00:00Z', DataAlteracao: '-infinity', ...overrides });

test('changes original seller only across two actual branches; preserves same-branch transfers and global admin', () => {
  assert.deepEqual(ownershipCorrection({ SellerId: 1, CurrentSellerId: 2, BranchId: 1 }, users), { sellerId: 1, branchId: 1 });
  assert.deepEqual(ownershipCorrection({ SellerId: 1, CurrentSellerId: 3, BranchId: 1 }, users), { sellerId: 3, branchId: 2 });
  assert.deepEqual(ownershipCorrection({ SellerId: 4, CurrentSellerId: 3, BranchId: 2 }, users), { sellerId: 4, branchId: 2 });
});

test('deduplicates equal names with trim/case, keeps most recent, remaps appointments, preserves originals', () => {
  const source = { leads: [legacy(10, ' ANA '), legacy(11, 'ana', { Contato: '5541987654321', DataAlteracao: '2026-01-01T00:00:00Z' })], appointments: [{ Id: 8, VendaId: 10 }] };
  const result = resolveSnapshot(source, new Set([10, 11]), users);
  assert.equal(result.snapshot.leads.length, 1); assert.equal(result.snapshot.leads[0].Id, 11);
  assert.equal(result.snapshot.appointments[0].VendaId, 11); assert.equal(result.aliases.get(10), 11);
  assert.equal(source.leads.length, 2); assert.equal(source.appointments[0].VendaId, 10);
  assert.equal(result.merged[0].originals.length, 2);
});

test('keeps only the most recent even for different names and three-record groups; never merges into existing source rows', () => {
  const source = { leads: [legacy(10, 'Ana'), legacy(11, 'Beto', { DataAlteracao: '2026-02-01T00:00:00Z' }), legacy(12, 'Ana Maria')], appointments: [{ Id: 8, VendaId: 12 }] };
  const result = resolveSnapshot(source, new Set([10, 11, 12]), users);
  assert.equal(result.snapshot.leads.length, 1);
  assert.equal(result.snapshot.leads[0].Id, 11);
  assert.deepEqual(result.merged[0].absorbedIds, [10, 12]);
  assert.equal(result.snapshot.appointments[0].VendaId, 11);
  source.leads.pop();
  assert.equal(resolveSnapshot(source, new Set([10]), users).snapshot.leads.length, 2);
});

test('future birth becomes null only in pending rows; valid births, other errors and originals are preserved', () => {
  const source = { leads: [legacy(10, 'Ana', { DataNascimento: '2026-11-12T00:00:00Z', ValorVenda: -0.02 }),
    legacy(11, 'Beto', { Contato: '41', DataNascimento: '2000-01-01T00:00:00Z' }),
    legacy(12, 'Carla', { Contato: '41955554444', DataNascimento: '2026-11-16T00:00:00Z' })], appointments: [] };
  const result = resolveSnapshot(source, new Set([10, 11]), users, '2026-11-07');
  assert.equal(result.snapshot.leads[0].DataNascimento, null);
  assert.equal(result.snapshot.leads[0].ValorVenda, -0.02);
  assert.equal(result.snapshot.leads[1].DataNascimento, '2000-01-01T00:00:00Z');
  assert.equal(result.snapshot.leads[1].Contato, '41');
  assert.equal(result.snapshot.leads[2].DataNascimento, '2026-11-16T00:00:00Z');
  assert.equal(source.leads[0].DataNascimento, '2026-11-12T00:00:00Z');
  assert.deepEqual(result.birthCorrections, [{ id: 10, oldBirthDate: '2026-11-12T00:00:00Z', birthDate: null }]);
});

test('branch correction precedes duplicate detection and keeps two distinct branch groups apart', () => {
  const source = { leads: [legacy(10, 'Ana', { VendedorId: 3, VendedorAtualId: 3 }), legacy(11, 'Ana', { SedeId: 2, VendedorId: 3, VendedorAtualId: 3 })], appointments: [] };
  const result = resolveSnapshot(source, new Set([10, 11]), users);
  assert.equal(result.snapshot.leads.length, 1); assert.equal(result.snapshot.leads[0].SedeId, 2);
  assert.equal(result.corrections[0].oldBranchId, 1);
  const separate = { leads: [legacy(10, 'Ana'), legacy(11, 'Ana', { SedeId: 2, VendedorId: 3, VendedorAtualId: 3 })], appointments: [] };
  assert.equal(resolveSnapshot(separate, new Set([10, 11]), users).snapshot.leads.length, 2);
});

test('pending rows stay consecutive for the same normalized phone/branch', () => {
  const rows = orderPending([legacy(10, 'Ana'), legacy(20, 'Beto', { Contato: '41911111111' }), legacy(30, 'Ana Maria', { Contato: '5541987654321' })]);
  assert.deepEqual(rows.map(x => x.Id), [20, 10, 30]);
});

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-pending-'));
  const db = new DatabaseSync(path.join(dir, 'live.db'));
  const candidate = new DatabaseSync(path.join(dir, 'candidate.db'));
  const schema = `CREATE TABLE Users(Id INTEGER PRIMARY KEY,BranchId INTEGER);
    INSERT INTO Users VALUES(1,1),(2,1),(3,2),(4,NULL);
    CREATE TABLE Leads(Id INTEGER PRIMARY KEY, SellerId INTEGER,CurrentSellerId INTEGER,BranchId INTEGER,
      Phone TEXT,Name TEXT,Revision INTEGER,UpdatedAt TEXT,ChatId TEXT,ChatUserId INTEGER, UNIQUE(BranchId,Phone));
    CREATE TABLE Appointments(Id INTEGER PRIMARY KEY,LeadId INTEGER REFERENCES Leads(Id),Note TEXT);`;
  db.exec(schema); candidate.exec(schema);
  db.exec("INSERT INTO Leads VALUES(100,1,2,1,'5541988880000','Preservado',5,'2026-01-01',NULL,NULL)");
  candidate.exec("INSERT INTO Leads VALUES(10,3,3,2,'5541987654321','Novo',1,'2026-01-01',NULL,NULL); INSERT INTO Appointments VALUES(8,10,'Retorno')");
  candidate.close();
  return { db, candidate: path.join(dir, 'candidate.db'), close() { db.close(); fs.rmSync(dir, { recursive: true }); } };
}

test('incremental insert preserves existing fields and appointments, replay cannot duplicate', () => {
  const f = fixture();
  try {
    const before = f.db.prepare('SELECT * FROM Leads WHERE Id=100').get();
    const result = applyResolution(f.db, f.candidate, new Set([10]), users, []);
    assert.deepEqual(result.insertedIds, [10]);
    assert.deepEqual(f.db.prepare('SELECT * FROM Leads WHERE Id=100').get(), before);
    assert.equal(f.db.prepare('SELECT LeadId FROM Appointments WHERE Id=8').get().LeadId, 10);
    assert.throws(() => applyResolution(f.db, f.candidate, new Set([10]), users, []), /já existe/);
    assert.equal(f.db.prepare('SELECT COUNT(*) count FROM Leads').get().count, 2);
  } finally { f.close(); }
});

test('late insert conflict rolls back an existing seller/branch correction', () => {
  const f = fixture();
  try {
    f.db.exec("UPDATE Leads SET CurrentSellerId=3 WHERE Id=100; INSERT INTO Leads VALUES(101,3,3,2,'5541987654321','Conflito',1,'2026-01-01',NULL,NULL)");
    const lead = f.db.prepare('SELECT * FROM Leads WHERE Id=100').get();
    assert.throws(() => applyResolution(f.db, f.candidate, new Set([10]), users, [{ lead, fixed: ownershipCorrection(lead, users) }]), /UNIQUE/);
    assert.deepEqual(f.db.prepare('SELECT * FROM Leads WHERE Id=100').get(), lead);
    assert.equal(f.db.prepare('SELECT COUNT(*) count FROM Appointments').get().count, 0);
  } finally { f.close(); }
});

-- Run only against a locally restored backup. The snapshot includes password hashes.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET TIME ZONE 'UTC';
SELECT json_build_object(
  'branches', (SELECT coalesce(json_agg(t ORDER BY t."Id"), '[]') FROM sede t),
  'users', (SELECT coalesce(json_agg(t ORDER BY t."Id"), '[]') FROM usuario t),
  'services', (SELECT coalesce(json_agg(t ORDER BY t."Id"), '[]') FROM servico t),
  'conditions', (SELECT coalesce(json_agg(t ORDER BY t."Id"), '[]') FROM "condicaoVenda" t),
  'leads', (SELECT coalesce(json_agg(t ORDER BY t."Id"), '[]') FROM venda t),
  'appointments', (SELECT coalesce(json_agg(t ORDER BY t."Id"), '[]') FROM agendamento t)
);
COMMIT;

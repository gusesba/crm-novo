import { db } from "./database.js";
import { sessionNumber } from "./backups.js";
import { sessionOwner } from "../sessions/session-id.js";

export function initializeCampaignNumbers() {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`UPDATE campaigns SET owner_id=CASE WHEN instr(user_id,'_')>0
      THEN substr(user_id,1,instr(user_id,'_')-1) ELSE user_id END WHERE owner_id IS NULL`);
    const legacy = db.prepare("SELECT id,owner_id FROM campaigns WHERE sender_phone IS NULL").all() as { id: string; owner_id: string }[];
    const numbers = db.prepare(`SELECT DISTINCT b.number FROM campaign_deliveries d
      JOIN backup_messages b ON b.owner_id=? AND b.id=d.external_message_id
        AND b.chat_id=d.phone||'@s.whatsapp.net'
      WHERE d.campaign_id=? AND json_extract(b.payload,'$.mine')=1
        AND b.number NOT GLOB '*[^0-9]*' AND length(b.number) BETWEEN 10 AND 15`);
    const update = db.prepare("UPDATE campaigns SET sender_phone=? WHERE id=?");
    for (const campaign of legacy) {
      const matches = numbers.all(campaign.owner_id, campaign.id) as { number: string }[];
      // Não atribui o número atual da guia a disparos antigos sem evidência de origem.
      if (matches.length === 1) update.run(matches[0].number, campaign.id);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function campaignScope(session: string) {
  const phone = sessionNumber(session) || null;
  return {
    phone,
    condition: "((owner_id=? AND sender_phone=?) OR (user_id=? AND sender_phone IS NULL))",
    params: [sessionOwner(session), phone, session],
  };
}

export function scopedCampaign(session: string, id: string) {
  const scope = campaignScope(session);
  const campaign = db.prepare(`SELECT id FROM campaigns WHERE id=? AND ${scope.condition}`)
    .get(id, ...scope.params) as { id: string } | undefined;
  if (!campaign)
    throw Object.assign(new Error("Disparo não encontrado."), { statusCode: 404 });
  return campaign;
}

import { z } from "zod";
export const attachmentSchema = z.object({
  name: z.string().min(1).max(200),
  mime: z.string().max(120),
  data: z.string().max(22_400_000),
});
const contactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().regex(/^\d{12,15}$/),
});
export const sendSchema = z
  .object({
    chatId: z.string().regex(/^\d{12,15}@s\.whatsapp\.net$/),
    text: z.string().max(10000).nullish(),
    attachment: attachmentSchema
      .extend({
        voiceNote: z.boolean().optional(),
        asDocument: z.boolean().optional(),
      })
      .nullish(),
    contact: contactSchema.nullish(),
    replyTo: z.string().max(200).nullish(),
  })
  .refine((x) => !!x.text?.trim() || !!x.attachment || !!x.contact, {
    message: "Escreva uma mensagem ou selecione um anexo ou contato.",
  })
  .refine((x) => !x.contact || (!x.text?.trim() && !x.attachment), {
    message: "Envie o contato sem texto ou outro anexo.",
  })
  .refine(
    (x) => !x.attachment?.voiceNote || x.attachment.mime.startsWith("audio/"),
    {
      message: "Mensagem de voz precisa conter áudio.",
    },
  )
  .refine((x) => !x.attachment?.voiceNote || !x.attachment.asDocument, {
    message: "Mensagem de voz não pode ser enviada como documento.",
  });
export const chatIdSchema = z.string().regex(/^\d{12,15}@s\.whatsapp\.net$/);
export const reactionSchema = z.object({
  chatId: chatIdSchema,
  emoji: z.enum(["", "👍", "❤️", "😂", "😮", "😢", "🙏"]),
});
export const forwardSchema = z.object({ chatId: chatIdSchema });
export const deleteSchema = z.object({
  chatId: chatIdSchema,
  forEveryone: z.boolean(),
});
const campaignMessageSchema = z
  .object({
    text: z.string().max(10000).nullish(),
    attachment: attachmentSchema.nullish(),
  })
  .refine((message) => !!message.text?.trim() || !!message.attachment, {
    message: "Cada mensagem deve ter texto ou anexo.",
  });
export const campaignSchema = z
  .object({
    name: z.string().min(1).max(160),
    messages: z.array(campaignMessageSchema).min(1).max(10),
    recipients: z
      .array(
        z.object({
          leadId: z.number().int().positive(),
          phone: z.string().regex(/^\d{12,15}$/),
          name: z.string(),
        }),
      )
      .min(1)
      .max(500),
    intervalSeconds: z.number().int().min(3).max(3600),
    intervalVarianceSeconds: z.number().int().min(0).max(1800),
    pauseEvery: z.number().int().min(1).max(500),
    pauseSeconds: z.number().int().min(0).max(3600),
  })
  .refine(
    (input) => input.intervalVarianceSeconds <= input.intervalSeconds - 3,
    {
      message: "A variação deve manter o intervalo mínimo em 3 segundos.",
      path: ["intervalVarianceSeconds"],
    },
  )
  .refine(
    (input) =>
      input.messages.reduce(
        (total, message) => total + (message.attachment?.data.length || 0),
        0,
      ) <= 22_400_000,
    {
      message: "Os anexos da sequência devem somar no máximo 16 MB.",
      path: ["messages"],
    },
  );
export type SendInput = z.infer<typeof sendSchema>;
export type CampaignInput = z.infer<typeof campaignSchema>;

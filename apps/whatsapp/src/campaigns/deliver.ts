import type { CampaignInput } from "../messaging/schemas.js";

type Recipient = CampaignInput["recipients"][number];
type CampaignMessage = CampaignInput["messages"][number];
export interface DeliveryDependencies {
  eligible: (recipient: Recipient) => Promise<boolean>;
  send: (
    recipient: Recipient,
    message: CampaignMessage,
    messageIndex: number,
  ) => Promise<unknown>;
  record: (
    recipient: Recipient,
    status: "sent" | "skipped" | "failed",
    error?: unknown,
    result?: unknown,
  ) => void;
  wait: (milliseconds: number, signal: AbortSignal) => Promise<unknown>;
  random: () => number;
}

export async function deliver(
  input: CampaignInput,
  signal: AbortSignal,
  dependencies: DeliveryDependencies,
) {
  let attemptedMessages = 0;
  for (const [recipientIndex, recipient] of input.recipients.entries()) {
    signal.throwIfAborted();
    const eligible = await dependencies.eligible(recipient);
    signal.throwIfAborted();
    if (!eligible)
      dependencies.record(
        recipient,
        "skipped",
        "O contato deixou de ser elegível antes do envio.",
      );
    else {
      let lastResult: unknown;
      let failed = false;
      for (const [messageIndex, message] of input.messages.entries()) {
        signal.throwIfAborted();
        try {
          lastResult = await dependencies.send(
            recipient,
            message,
            messageIndex,
          );
        } catch (error) {
          const reason =
            error instanceof Error ? error.message : "Falha de envio";
          dependencies.record(
            recipient,
            "failed",
            new Error(
              `Mensagem ${messageIndex + 1} de ${input.messages.length}: ${reason}`,
            ),
          );
          failed = true;
        }
        attemptedMessages++;
        const hasAnotherMessage =
          !failed && messageIndex < input.messages.length - 1;
        const hasAnotherRecipient =
          recipientIndex < input.recipients.length - 1;
        if (hasAnotherMessage || hasAnotherRecipient) {
          const variance = input.intervalVarianceSeconds;
          const minimum = input.intervalSeconds - variance;
          const maximum = input.intervalSeconds + variance;
          const interval =
            minimum +
            Math.floor(dependencies.random() * (maximum - minimum + 1));
          const pause =
            attemptedMessages % input.pauseEvery === 0 ? input.pauseSeconds : 0;
          await dependencies.wait((interval + pause) * 1000, signal);
        }
        if (failed) break;
      }
      if (!failed)
        dependencies.record(recipient, "sent", undefined, lastResult);
    }
  }
}

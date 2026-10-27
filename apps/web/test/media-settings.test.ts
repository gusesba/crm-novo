import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CampaignAttachmentPreview } from "../src/features/whatsapp/campaign-message-sequence";
import { storageSize } from "../src/features/settings/media-settings-page";

test("removed campaign attachments keep their name and do not render a broken media source", () => {
  const html = renderToStaticMarkup(
    createElement(CampaignAttachmentPreview, {
      attachment: {
        name: "Foto antiga.jpg",
        mime: "image/jpeg",
        data: "",
        removed: true,
      },
    }),
  );
  assert.match(html, /Foto antiga.jpg/);
  assert.match(html, /Arquivo removido/);
  assert.doesNotMatch(html, /data:image|<img|<iframe/);
});
test("storage size uses disk units and formats zero, KB, MB and GB", () => {
  assert.equal(storageSize(0), "0 B");
  assert.equal(storageSize(1024), "1 KB");
  assert.equal(storageSize(1024 ** 2), "1 MB");
  assert.equal(storageSize(1024 ** 3), "1 GB");
});

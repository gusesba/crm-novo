import test from "node:test";
import assert from "node:assert/strict";
import { convertVoiceNote } from "../src/messaging/voice-note.js";

test("gravação PCM é convertida para Ogg/Opus reproduzível", async () => {
  const samples = Buffer.alloc(8000 * 2);
  const wav = Buffer.alloc(44 + samples.length);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(samples.length, 40);
  samples.copy(wav, 44);
  const ogg = await convertVoiceNote(wav);
  assert.equal(ogg.subarray(0, 4).toString(), "OggS");
  assert.ok(ogg.includes(Buffer.from("OpusHead")));
});

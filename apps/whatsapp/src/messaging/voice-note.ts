import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const ffmpegPath = createRequire(import.meta.url)("ffmpeg-static") as
  string | null;

export function convertVoiceNote(input: Buffer): Promise<Buffer> {
  if (!ffmpegPath) throw new Error("Conversor de áudio indisponível.");
  return new Promise((resolve, reject) => {
    const process = spawn(ffmpegPath, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      "pipe:0",
      "-vn",
      "-c:a",
      "libopus",
      "-b:a",
      "32k",
      "-ac",
      "1",
      "-avoid_negative_ts",
      "make_zero",
      "-f",
      "ogg",
      "pipe:1",
    ]);
    const chunks: Buffer[] = [];
    let size = 0;
    const timer = setTimeout(() => process.kill(), 30_000);
    process.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 16 * 1024 * 1024) process.kill();
      else chunks.push(chunk);
    });
    process.stdin.on("error", () => {});
    process.on("error", reject);
    process.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 || !size || size > 16 * 1024 * 1024)
        reject(
          Object.assign(
            new Error("Não foi possível converter a gravação de áudio."),
            { statusCode: 400 },
          ),
        );
      else resolve(Buffer.concat(chunks));
    });
    process.stdin.end(input);
  });
}

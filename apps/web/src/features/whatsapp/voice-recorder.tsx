"use client";
import type { Attachment } from "@/lib/types";
import { Mic, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function VoiceRecorder({
  disabled,
  compact = false,
  onRecorded,
  onRecordingChange,
  onError,
}: {
  disabled: boolean;
  compact?: boolean;
  onRecorded: (attachment: Attachment) => void;
  onRecordingChange: (recording: boolean) => void;
  onError: (message: string) => void;
}) {
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const discard = useRef(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);

  function stop(discardRecording = false) {
    if (discardRecording) discard.current = true;
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  useEffect(() => {
    if (!recording) return;
    const interval = setInterval(() => setSeconds((value) => value + 1), 1000);
    const limit = setTimeout(() => stop(), 5 * 60 * 1000);
    return () => {
      clearInterval(interval);
      clearTimeout(limit);
    };
  }, [recording]);

  useEffect(
    () => () => {
      discard.current = true;
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      onError(
        "A gravação de áudio não está disponível neste navegador ou conexão.",
      );
      return;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = media;
      const mime = [
        "audio/webm;codecs=opus",
        "audio/ogg;codecs=opus",
        "audio/mp4",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const instance = new MediaRecorder(
        media,
        mime ? { mimeType: mime } : undefined,
      );
      const chunks: BlobPart[] = [];
      discard.current = false;
      instance.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      instance.onstop = () => {
        media.getTracks().forEach((track) => track.stop());
        stream.current = null;
        recorder.current = null;
        setRecording(false);
        onRecordingChange(false);
        if (discard.current) return;
        const blob = new Blob(chunks, {
          type: instance.mimeType || "audio/webm",
        });
        if (!blob.size || blob.size > 16 * 1024 * 1024) {
          onError("A gravação deve ter áudio e no máximo 16 MB.");
          return;
        }
        const reader = new FileReader();
        reader.onload = () =>
          onRecorded({
            name: "Mensagem de voz",
            mime: blob.type,
            data: String(reader.result).split(",")[1],
            voiceNote: true,
          });
        reader.onerror = () => onError("Não foi possível ler a gravação.");
        reader.readAsDataURL(blob);
      };
      instance.onerror = () => {
        stop(true);
        onError("A gravação falhou. Tente novamente.");
      };
      recorder.current = instance;
      setSeconds(0);
      instance.start(250);
      setRecording(true);
      onRecordingChange(true);
    } catch {
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
      onError(
        "Não foi possível acessar o microfone. Verifique a permissão do navegador.",
      );
    }
  }

  if (recording)
    return (
      <div className="voice-recording">
        <span>
          Gravando {Math.floor(seconds / 60)}:
          {String(seconds % 60).padStart(2, "0")}
        </span>
        <button
          type="button"
          aria-label="Descartar gravação"
          onClick={() => {
            stop(true);
          }}
        >
          <X size={16} />
        </button>
        <button
          type="button"
          aria-label="Parar gravação"
          onClick={() => stop()}
        >
          <Square size={15} /> Parar
        </button>
      </div>
    );
  return (
    <button
      type="button"
      className={compact ? "composer-mic" : "file-label"}
      disabled={disabled}
      aria-label="Gravar áudio"
      onClick={() => void start()}
    >
      <Mic size={18} /> {!compact && "Gravar áudio"}
    </button>
  );
}

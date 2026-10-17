"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

interface VideoUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  exerciseName: string;
  setNumber: number;
  onSaveVideoUrl: (url: string) => void;
}

export function VideoUploadModal({
  isOpen,
  onClose,
  exerciseName,
  setNumber,
  onSaveVideoUrl,
}: VideoUploadModalProps) {
  const [videoUrl, setVideoUrl] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (!videoUrl.trim()) {
      setError("Por favor ingresa un enlace de video o identificador.");
      return;
    }
    setError(null);
    onSaveVideoUrl(videoUrl.trim());
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm animate-in fade-in"
      data-testid="video-upload-modal"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary text-lg">
              📹
            </span>
            <div>
              <h2 className="text-base font-bold text-foreground">
                Subir Video para Form Check
              </h2>
              <p className="text-xs text-muted-foreground">
                {exerciseName} • Serie {setNumber}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-sm font-bold p-1"
          >
            ✕
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          Copia el enlace de tu video grabado (almacenado en Cloudflare R2, YouTube no listado, Google Drive o enlace directo) para que tu coach evalúe tu biomecánica.
        </p>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground block">
            URL o ID del Video:
          </label>
          <input
            type="url"
            value={videoUrl}
            onChange={(e) => {
              setVideoUrl(e.target.value);
              setError(null);
            }}
            placeholder="https://pub-r2.gozster.app/form-checks/serie-1.mp4"
            className="w-full rounded-lg border border-input bg-background p-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <div className="flex gap-2 pt-2 border-t border-border/60">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            className="flex-1 bg-primary text-primary-foreground font-bold"
            onClick={handleConfirm}
            data-testid="submit-video-url-btn"
          >
            ✓ Enviar al Coach
          </Button>
        </div>
      </div>
    </div>
  );
}

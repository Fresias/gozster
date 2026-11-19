"use client";

import * as React from "react";
import { AthleteSheet } from "@/components/athlete/athlete-sheet";
import { Check, Image as ImageIcon, Info, Link as LinkIcon, Video } from "@/components/athlete/icons";
import {
  normalizarEnlaceVideo,
  validarArchivoVideo,
  type VideoValidacionResultado,
} from "@/lib/athlete/video-serie";

export type VideoAttachOrigen =
  | { tipo: "enlace"; url: string }
  | { tipo: "archivo"; file: File };

export type VideoAttachResultado =
  | "ok"
  | "invalido"
  | VideoValidacionResultado;

export const VIDEO_ERROR_MENSAJES: Record<
  Exclude<VideoAttachResultado, "ok">,
  string
> = {
  "muy-pesado": "El video pesa más de 100 MB. Grabá uno más corto o pegá un enlace.",
  "muy-largo": "El video dura más de 2 minutos. Grabá uno más corto o pegá un enlace.",
  formato: "Ese archivo no es un video que podamos subir (MP4, MOV o WebM).",
  invalido: "Pegá un enlace que empiece con https://",
};

export interface VideoUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  exerciseName: string;
  setNumber: number;
  currentVideoUrl?: string | null;
  onAttachVideo?: (origen: VideoAttachOrigen) => Promise<VideoAttachResultado> | VideoAttachResultado;
  onRemoveVideo?: () => void;
  onSaveVideoUrl?: (url: string) => void;
}

export function VideoUploadModal({
  isOpen,
  onClose,
  exerciseName,
  setNumber,
  currentVideoUrl,
  onAttachVideo,
  onRemoveVideo,
  onSaveVideoUrl,
}: VideoUploadModalProps) {
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [linkOpen, setLinkOpen] = React.useState(false);
  const [linkValue, setLinkValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const recInputRef = React.useRef<HTMLInputElement | null>(null);
  const galInputRef = React.useRef<HTMLInputElement | null>(null);
  const linkInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!isOpen) return;
    setSelectedFile(null);
    setLinkOpen(false);
    setLinkValue("");
    setError(null);
    setIsSubmitting(false);
  }, [isOpen, setNumber]);

  React.useEffect(() => {
    if (linkOpen) {
      linkInputRef.current?.focus();
    }
  }, [linkOpen]);

  if (!isOpen) return null;

  const trimmedLink = linkValue.trim();
  const selectionSummary = selectedFile
    ? selectedFile.name
    : trimmedLink
      ? `Enlace: ${trimmedLink}`
      : null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (!file) return;

    const validacion = await validarArchivoVideo(file);
    if (validacion !== "ok") {
      setSelectedFile(null);
      setError(VIDEO_ERROR_MENSAJES[validacion]);
      return;
    }

    setSelectedFile(file);
    setLinkValue("");
    setError(null);
  };

  const handleConfirm = async () => {
    if (isSubmitting) return;

    if (selectedFile) {
      setIsSubmitting(true);
      setError(null);
      try {
        const res = onAttachVideo
          ? await onAttachVideo({ tipo: "archivo", file: selectedFile })
          : "ok";
        if (res !== "ok") {
          setError(VIDEO_ERROR_MENSAJES[res]);
          return;
        }
        onClose();
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    const normalizado = normalizarEnlaceVideo(trimmedLink);
    if (!normalizado) {
      setError(VIDEO_ERROR_MENSAJES.invalido);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      if (onAttachVideo) {
        const res = await onAttachVideo({ tipo: "enlace", url: normalizado });
        if (res !== "ok") {
          setError(VIDEO_ERROR_MENSAJES[res]);
          return;
        }
      } else if (onSaveVideoUrl) {
        onSaveVideoUrl(normalizado);
      }
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AthleteSheet
      isOpen={isOpen}
      onClose={onClose}
      title={`Video de la serie ${setNumber}`}
      subtitle={`${exerciseName} · opcional · tu coach lo ve en tu registro`}
      titleId="set-video-modal-title"
      closeAriaLabel="Cerrar"
      dialogTestId="video-upload-modal"
      closeTestId="close-video-upload-modal-btn"
    >
      <button
        type="button"
        className="a-vopt a-primary"
        onClick={() => recInputRef.current?.click()}
        data-testid="video-record-btn"
      >
        <Video width={20} height={20} className="a-i" /> Grabar ahora
      </button>
      <input
        ref={recInputRef}
        id="vidRec"
        className="a-vfile"
        type="file"
        accept="video/*"
        capture="environment"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => void handleFileChange(e)}
        data-testid="video-record-input"
      />

      <button
        type="button"
        className="a-vopt"
        onClick={() => galInputRef.current?.click()}
        data-testid="video-gallery-btn"
      >
        <ImageIcon width={20} height={20} className="a-i" /> Elegir de la galería
      </button>
      <input
        ref={galInputRef}
        id="vidGal"
        className="a-vfile"
        type="file"
        accept="video/*"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => void handleFileChange(e)}
        data-testid="video-gallery-input"
      />

      <span className="a-t-sec a-muted">
        Hasta 2 minutos o 100 MB. Sin señal, queda en el teléfono y se envía cuando vuelva.
      </span>

      {linkOpen ? (
        <div className="grid gap-1.5">
          <label className="a-t-label a-muted" htmlFor="vidLink">
            Enlace al video
          </label>
          <input
            ref={linkInputRef}
            id="vidLink"
            type="url"
            inputMode="url"
            autoComplete="off"
            value={linkValue}
            onChange={(e) => {
              setLinkValue(e.target.value);
              setSelectedFile(null);
              setError(null);
            }}
            placeholder="https://"
            className="a-fin a-t-body"
            data-testid="video-link-input"
          />
        </div>
      ) : (
        <button
          type="button"
          className="a-vopt"
          onClick={() => setLinkOpen(true)}
          data-testid="video-link-toggle-btn"
        >
          <LinkIcon width={20} height={20} className="a-i" /> Pegar un enlace
        </button>
      )}

      {error && (
        <div className="a-ferr a-t-sec" role="alert" data-testid="video-upload-error">
          <Info width={18} height={18} className="a-i shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {selectionSummary && (
        <p className="a-oknote a-t-sec" data-testid="video-selection-confirm">
          <Check width={16} height={16} className="a-i shrink-0" />
          <span className="truncate">{selectionSummary}</span>
        </p>
      )}

      <button
        type="button"
        id="vidSend"
        className="a-btn"
        disabled={!selectionSummary || isSubmitting}
        onClick={() => void handleConfirm()}
        data-testid="submit-video-url-btn"
      >
        Adjuntar a la serie {setNumber}
      </button>

      {currentVideoUrl && onRemoveVideo && (
        <button
          type="button"
          className="a-btn a-soft"
          onClick={() => {
            onRemoveVideo();
            onClose();
          }}
          data-testid="remove-video-btn"
        >
          Quitar video
        </button>
      )}
    </AthleteSheet>
  );
}

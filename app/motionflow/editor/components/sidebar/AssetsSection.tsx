import type { RefObject } from "react";
import {
  IconClose,
  IconFolder,
  IconImage,
  IconMusic,
  IconUpload,
} from "../../../primitives";
import { AccordionSection } from "../shared";
import type { JobAsset } from "../../types";

export const AssetsSection = ({
  open,
  onToggle,
  jobAssets,
  assetsUploading,
  assetsError,
  assetsInputRef,
  onAssetsChange,
  removeAsset,
  canUpload,
}: {
  open: boolean;
  onToggle: () => void;
  jobAssets: JobAsset[];
  assetsUploading: boolean;
  assetsError: string | null;
  assetsInputRef: RefObject<HTMLInputElement | null>;
  onAssetsChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  removeAsset: (assetId: string) => Promise<void>;
  canUpload: boolean;
}) => (
  <AccordionSection
    label="ASSETS"
    badge={
      jobAssets.length > 0
        ? `${jobAssets.length} ${jobAssets.length === 1 ? "FILE" : "FILES"}`
        : "—"
    }
    open={open}
    onToggle={onToggle}
  >
    <input
      ref={assetsInputRef}
      type="file"
      multiple
      accept="image/*,video/*,audio/*"
      onChange={onAssetsChange}
      style={{ display: "none" }}
    />

    {jobAssets.length === 0 ? (
      <button
        onClick={() => assetsInputRef.current?.click()}
        disabled={assetsUploading || !canUpload}
        style={{
          width: "100%",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          padding: "16px 12px",
          borderRadius: 10,
          background: "rgba(255,255,255,0.015)",
          border: "1px dashed var(--line-2)",
          color: "var(--ink-2)",
          cursor: assetsUploading ? "wait" : "pointer",
          fontFamily: "inherit", fontSize: 12,
          opacity: assetsUploading || !canUpload ? 0.65 : 1,
        }}
      >
        {assetsUploading ? "Uploading…" : (
          <>
            <IconUpload size={13}/>
            Upload assets (images · videos · audio)
          </>
        )}
      </button>
    ) : (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {jobAssets.map((a) => (
          <div
            key={a.id}
            draggable
            onDragStart={(e) => {
              // Wire-up for phase 2 drag-and-drop. Encode the asset so a
              // timeline drop target can read it without DB roundtrips.
              e.dataTransfer.setData("application/x-mg-asset", JSON.stringify(a));
              e.dataTransfer.effectAllowed = "copy";
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: 6,
              borderRadius: 10,
              background: "rgba(0,0,0,0.25)",
              border: "1px solid var(--line)",
              cursor: "grab",
            }}
          >
            <div
              style={{
                width: 44, height: 44,
                flexShrink: 0,
                borderRadius: 8,
                background:
                  a.kind === "image"
                    ? `url(${a.url}) center/cover, rgba(255,255,255,0.04)`
                    : a.kind === "video"
                      ? "linear-gradient(135deg, #1F2937, #5468FF)"
                      : a.kind === "audio"
                        ? "linear-gradient(135deg, #5b3aa8, #a78bfa)"
                        : "rgba(255,255,255,0.04)",
                border: "1px solid var(--line)",
                display: "grid", placeItems: "center",
                color: "rgba(255,255,255,0.85)",
              }}
            >
              {a.kind === "video" ? <IconImage size={14}/> :
               a.kind === "audio" ? <IconMusic size={14}/> :
               a.kind === "image" ? null : <IconFolder size={14}/>}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: 12, color: "var(--ink-1)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
              >
                {a.name}
              </div>
              <div
                className="mf-mono"
                style={{
                  fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.06em",
                  marginTop: 2,
                }}
              >
                {a.kind.toUpperCase()} · {Math.max(1, Math.round(a.size_bytes / 1024))} KB
              </div>
            </div>
            <button
              onClick={() => removeAsset(a.id)}
              aria-label={`Remove ${a.name}`}
              title="Remove"
              style={{
                width: 26, height: 26, borderRadius: 6,
                display: "grid", placeItems: "center",
                background: "transparent",
                border: "1px solid var(--line)",
                color: "var(--ink-3)", cursor: "pointer", padding: 0,
              }}
            >
              <IconClose size={12}/>
            </button>
          </div>
        ))}

        <button
          onClick={() => assetsInputRef.current?.click()}
          disabled={assetsUploading}
          style={{
            marginTop: 4,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            padding: "10px 12px",
            borderRadius: 10,
            background: "rgba(255,255,255,0.015)",
            border: "1px dashed var(--line-2)",
            color: "var(--ink-2)",
            cursor: assetsUploading ? "wait" : "pointer",
            fontFamily: "inherit", fontSize: 12,
            opacity: assetsUploading ? 0.65 : 1,
          }}
        >
          <IconUpload size={12}/>
          {assetsUploading ? "Uploading…" : "Add more"}
        </button>
      </div>
    )}

    {assetsError && (
      <div style={{ marginTop: 8, fontSize: 11, color: "#FCA5A5", lineHeight: 1.45 }}>
        {assetsError}
      </div>
    )}
  </AccordionSection>
);

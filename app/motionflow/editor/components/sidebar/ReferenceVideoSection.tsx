import type { RefObject } from "react";
import { IconClose, IconUpload } from "../../../primitives";
import { AccordionSection } from "../shared";

type ReferenceAnalysisView = { summary?: string; model?: string; error?: string } | null;

export const ReferenceVideoSection = ({
  open,
  onToggle,
  locked,
  referenceLink,
  setReferenceLink,
  uploadedName,
  uploading,
  referenceError,
  referenceInputRef,
  onReferenceFileChange,
  clearUpload,
  analysis,
}: {
  open: boolean;
  onToggle: () => void;
  locked: boolean;
  referenceLink: string;
  setReferenceLink: (v: string) => void;
  uploadedName: string | null;
  uploading: boolean;
  referenceError: string | null;
  referenceInputRef: RefObject<HTMLInputElement | null>;
  onReferenceFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  clearUpload: () => void;
  analysis: ReferenceAnalysisView;
}) => (
  <AccordionSection
    label="REFERENCE VIDEO"
    badge={uploadedName ? "UPLOAD" : referenceLink.trim() ? "LINK" : "—"}
    open={open}
    onToggle={onToggle}
  >
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 11, color: "var(--ink-3)", lineHeight: 1.5 }}>
        Gemini studies the reference's pacing, palette and motion; Claude directs your film in that style.
        Leave the script empty to let the reference's message become the script.
      </div>

      <input
        type="url"
        value={referenceLink}
        onChange={(e) => setReferenceLink(e.target.value)}
        placeholder="YouTube link or direct .mp4 URL"
        disabled={locked || Boolean(uploadedName)}
        style={{
          padding: "8px 10px",
          borderRadius: 8,
          background: "rgba(0,0,0,0.30)",
          border: "1px solid var(--line)",
          color: "var(--ink-1)",
          fontFamily: "inherit", fontSize: 12,
          opacity: locked || uploadedName ? 0.6 : 1,
        }}
      />

      <input
        ref={referenceInputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm,video/x-m4v,video/mpeg"
        onChange={onReferenceFileChange}
        style={{ display: "none" }}
      />
      {uploadedName ? (
        <div
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: 10,
            borderRadius: 10,
            background: "rgba(0,0,0,0.25)",
            border: "1px solid var(--line)",
          }}
        >
          <div
            style={{
              flex: 1, minWidth: 0,
              fontSize: 12, color: "var(--ink-1)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}
          >
            {uploadedName}
          </div>
          <button
            onClick={clearUpload}
            disabled={locked}
            aria-label="Remove reference video"
            title="Remove reference video"
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
      ) : (
        <button
          onClick={() => referenceInputRef.current?.click()}
          disabled={locked || uploading}
          style={{
            width: "100%",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            padding: "14px 12px",
            borderRadius: 10,
            background: "rgba(255,255,255,0.015)",
            border: "1px dashed var(--line-2)",
            color: "var(--ink-2)",
            cursor: uploading ? "wait" : "pointer",
            fontFamily: "inherit", fontSize: 12,
            opacity: locked || uploading ? 0.65 : 1,
          }}
        >
          <IconUpload size={13}/>
          {uploading ? "Uploading…" : "Upload video (≤ 95 MB)"}
        </button>
      )}

      {referenceError && (
        <div
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            background: "rgba(255,107,107,0.08)",
            border: "1px solid rgba(255,107,107,0.30)",
            color: "#FCA5A5",
            fontSize: 11, lineHeight: 1.45,
          }}
        >
          {referenceError}
        </div>
      )}

      {analysis?.summary && (
        <div style={{ fontSize: 11, color: "var(--ink-2)", lineHeight: 1.5 }}>
          <span className="mf-mono" style={{ fontSize: 10, color: "var(--ink-4)", letterSpacing: "0.08em" }}>
            ANALYZED{analysis.model ? ` · ${analysis.model.toUpperCase()}` : ""}
          </span>
          <div style={{ marginTop: 4 }}>{analysis.summary}</div>
        </div>
      )}
      {analysis?.error && (
        <div style={{ fontSize: 11, color: "#FCA5A5", lineHeight: 1.45 }}>
          Reference analysis failed: {analysis.error}
        </div>
      )}
    </div>
  </AccordionSection>
);

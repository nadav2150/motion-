import type { RefObject } from "react";
import {
  IconClose,
  IconPalette,
  IconPlus,
  IconUpload,
} from "../../../primitives";
import { AccordionSection } from "../shared";

export const BrandSection = ({
  open,
  onToggle,
  brandLogoUrl,
  brandLogoName,
  brandLogoUploading,
  brandLogoError,
  brandColors,
  draftColor,
  setDraftColor,
  brandSourceUrl,
  setBrandSourceUrl,
  brandScraping,
  brandScrapeError,
  logoInputRef,
  onLogoChange,
  clearLogo,
  addColor,
  removeColor,
  handleScrapeFromUrl,
}: {
  open: boolean;
  onToggle: () => void;
  brandLogoUrl: string | null;
  brandLogoName: string | null;
  brandLogoUploading: boolean;
  brandLogoError: string | null;
  brandColors: string[];
  draftColor: string;
  setDraftColor: (v: string) => void;
  brandSourceUrl: string;
  setBrandSourceUrl: (v: string) => void;
  brandScraping: boolean;
  brandScrapeError: string | null;
  logoInputRef: RefObject<HTMLInputElement | null>;
  onLogoChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  clearLogo: () => void;
  addColor: () => void;
  removeColor: (c: string) => void;
  handleScrapeFromUrl: () => Promise<void>;
}) => (
  <AccordionSection
    label="BRAND"
    badge={
      brandLogoUrl || brandColors.length > 0
        ? `${brandLogoUrl ? "LOGO" : ""}${brandLogoUrl && brandColors.length ? " · " : ""}${brandColors.length ? `${brandColors.length} ${brandColors.length === 1 ? "COLOR" : "COLORS"}` : ""}`
        : "—"
    }
    open={open}
    onToggle={onToggle}
  >
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* From URL — auto-populate logo + palette from any public site */}
      <div>
        <div
          className="mf-mono"
          style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.12em", marginBottom: 8 }}
        >
          FROM URL
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            type="url"
            value={brandSourceUrl}
            onChange={(e) => setBrandSourceUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !brandScraping) {
                e.preventDefault();
                void handleScrapeFromUrl();
              }
            }}
            placeholder="https://artlist.io"
            disabled={brandScraping}
            style={{
              flex: 1, padding: "8px 10px",
              borderRadius: 8,
              background: "rgba(0,0,0,0.30)",
              border: "1px solid var(--line)",
              color: "var(--ink-1)",
              fontFamily: "inherit", fontSize: 12,
            }}
          />
          <button
            onClick={() => void handleScrapeFromUrl()}
            disabled={brandScraping || !brandSourceUrl.trim()}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              background: "rgba(122,162,255,0.16)",
              border: "1px solid rgba(122,162,255,0.45)",
              color: "var(--ink-1)",
              fontFamily: "inherit", fontSize: 12,
              cursor: brandScraping ? "wait" : "pointer",
              opacity: brandScraping || !brandSourceUrl.trim() ? 0.6 : 1,
            }}
          >
            {brandScraping ? "Fetching…" : "Fetch"}
          </button>
        </div>
        {brandScrapeError && (
          <div
            style={{
              marginTop: 6,
              fontSize: 11, color: "var(--ink-3)",
            }}
          >
            {brandScrapeError}
          </div>
        )}
      </div>

      {/* Logo */}
      <div>
        <div
          className="mf-mono"
          style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.12em", marginBottom: 8 }}
        >
          LOGO
        </div>
        <input
          ref={logoInputRef}
          type="file"
          accept="image/*"
          onChange={onLogoChange}
          style={{ display: "none" }}
        />
        {brandLogoUrl ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: 10,
              borderRadius: 10,
              background: "rgba(0,0,0,0.25)",
              border: "1px solid var(--line)",
            }}
          >
            <div
              style={{
                width: 44, height: 44, borderRadius: 8,
                background: `url(${brandLogoUrl}) center/contain no-repeat, rgba(255,255,255,0.04)`,
                border: "1px solid var(--line)",
                flexShrink: 0,
              }}
            />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: 12, color: "var(--ink-1)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
              >
                {brandLogoName ?? "logo"}
              </div>
              <button
                onClick={() => logoInputRef.current?.click()}
                disabled={brandLogoUploading}
                style={{
                  marginTop: 4, padding: 0,
                  background: "transparent", border: "none",
                  color: "var(--ink-3)", fontSize: 11,
                  cursor: brandLogoUploading ? "wait" : "pointer",
                  fontFamily: "inherit",
                  textDecoration: "underline",
                  opacity: brandLogoUploading ? 0.55 : 1,
                }}
              >
                {brandLogoUploading ? "Uploading…" : "Replace"}
              </button>
            </div>
            <button
              onClick={clearLogo}
              disabled={brandLogoUploading}
              aria-label="Remove logo"
              title="Remove logo"
              style={{
                width: 26, height: 26, borderRadius: 6,
                display: "grid", placeItems: "center",
                background: "transparent",
                border: "1px solid var(--line)",
                color: "var(--ink-3)", cursor: "pointer", padding: 0,
                opacity: brandLogoUploading ? 0.55 : 1,
              }}
            >
              <IconClose size={12}/>
            </button>
          </div>
        ) : (
          <button
            onClick={() => logoInputRef.current?.click()}
            disabled={brandLogoUploading}
            style={{
              width: "100%",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              padding: "16px 12px",
              borderRadius: 10,
              background: "rgba(255,255,255,0.015)",
              border: "1px dashed var(--line-2)",
              color: "var(--ink-2)",
              cursor: brandLogoUploading ? "wait" : "pointer",
              fontFamily: "inherit", fontSize: 12,
              opacity: brandLogoUploading ? 0.65 : 1,
            }}
          >
            {brandLogoUploading ? (
              <>
                <span
                  style={{
                    width: 12, height: 12, borderRadius: "50%",
                    border: "2px solid rgba(255,255,255,0.18)",
                    borderTopColor: "var(--ink-1)",
                    animation: "mf-spin-slow 0.6s linear infinite",
                  }}
                />
                Uploading…
              </>
            ) : (
              <>
                <IconUpload size={13}/>
                Upload logo
              </>
            )}
          </button>
        )}
        {brandLogoError && (
          <div
            style={{
              marginTop: 8,
              padding: "6px 10px",
              borderRadius: 8,
              background: "rgba(255,107,107,0.08)",
              border: "1px solid rgba(255,107,107,0.30)",
              color: "#FCA5A5",
              fontSize: 11,
              lineHeight: 1.45,
            }}
          >
            {brandLogoError}
          </div>
        )}
      </div>

      {/* Colors */}
      <div>
        <div
          className="mf-mono"
          style={{ fontSize: 10, color: "var(--ink-3)", letterSpacing: "0.12em", marginBottom: 8 }}
        >
          BRAND COLORS
        </div>

        {brandColors.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            {brandColors.map((c) => (
              <div
                key={c}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "4px 8px 4px 6px",
                  borderRadius: 7,
                  background: "rgba(255,255,255,0.025)",
                  border: "1px solid var(--line)",
                }}
              >
                <span
                  style={{
                    width: 14, height: 14, borderRadius: 4,
                    background: c,
                    border: "1px solid rgba(255,255,255,0.10)",
                    boxShadow: `0 0 8px ${c}40`,
                  }}
                />
                <span
                  className="mf-mono"
                  style={{ fontSize: 10.5, color: "var(--ink-1)", letterSpacing: "0.04em" }}
                >
                  {c.toUpperCase()}
                </span>
                <button
                  onClick={() => removeColor(c)}
                  aria-label={`Remove ${c}`}
                  style={{
                    display: "grid", placeItems: "center",
                    width: 16, height: 16, borderRadius: 4,
                    background: "transparent", border: "none",
                    color: "var(--ink-3)", cursor: "pointer", padding: 0,
                  }}
                >
                  <IconClose size={9}/>
                </button>
              </div>
            ))}
          </div>
        )}

        <div
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: 6,
            borderRadius: 10,
            background: "rgba(0,0,0,0.25)",
            border: "1px solid var(--line)",
          }}
        >
          <label
            style={{
              width: 28, height: 28, borderRadius: 6,
              background: draftColor,
              border: "1px solid rgba(255,255,255,0.15)",
              cursor: "pointer",
              flexShrink: 0,
              position: "relative",
              overflow: "hidden",
            }}
            title="Pick color"
          >
            <input
              type="color"
              value={draftColor}
              onChange={(e) => setDraftColor(e.target.value)}
              style={{
                position: "absolute", inset: 0,
                opacity: 0, cursor: "pointer", border: "none",
              }}
            />
          </label>
          <input
            type="text"
            value={draftColor}
            onChange={(e) => {
              const v = e.target.value.trim();
              if (/^#?[0-9a-fA-F]{0,6}$/.test(v)) {
                setDraftColor(v.startsWith("#") ? v : `#${v}`);
              }
            }}
            placeholder="#7AA2FF"
            className="mf-mono"
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              color: "var(--ink-1)",
              fontSize: 11.5, letterSpacing: "0.04em",
              outline: "none",
              fontFamily: "inherit",
            }}
          />
          <button
            onClick={addColor}
            disabled={!/^#[0-9a-fA-F]{6}$/.test(draftColor) || brandColors.includes(draftColor.toLowerCase())}
            style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "5px 10px",
              borderRadius: 7,
              background: "rgba(122,162,255,0.10)",
              border: "1px solid rgba(122,162,255,0.35)",
              color: "var(--ink-0)",
              fontFamily: "inherit", fontSize: 11, fontWeight: 500,
              cursor: "pointer",
            }}
          >
            <IconPlus size={11}/>
            Add
          </button>
        </div>

        {brandColors.length === 0 && (
          <div
            style={{
              marginTop: 8,
              fontSize: 11, color: "var(--ink-4)", lineHeight: 1.55,
              display: "flex", alignItems: "center", gap: 6,
            }}
          >
            <IconPalette size={11}/>
            Pick a swatch, then click Add.
          </div>
        )}
      </div>
    </div>
  </AccordionSection>
);

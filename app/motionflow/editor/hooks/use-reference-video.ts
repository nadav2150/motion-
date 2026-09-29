import { useRef, useState } from "react";

// Reference video for the next Generate: either a pasted link (YouTube or a
// direct video URL) or a file uploaded to /api/reference-video. The upload
// wins when both are set. Read once at Generate time, like audioTracks.
export function useReferenceVideo() {
  const [referenceLink, setReferenceLink] = useState("");
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [uploadedName, setUploadedName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const referenceInputRef = useRef<HTMLInputElement | null>(null);

  const onReferenceFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setReferenceError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/reference-video", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as {
        referenceVideoUrl?: string;
        name?: string;
        error?: string;
      };
      if (!res.ok || !data.referenceVideoUrl) {
        setReferenceError(data.error ?? `Upload failed (${res.status})`);
        return;
      }
      setUploadedUrl(data.referenceVideoUrl);
      setUploadedName(data.name ?? file.name);
    } catch (err) {
      setReferenceError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const clearUpload = () => {
    setUploadedUrl(null);
    setUploadedName(null);
    setReferenceError(null);
  };

  const referenceVideoUrl = uploadedUrl ?? (referenceLink.trim() || null);

  return {
    referenceLink,
    setReferenceLink,
    uploadedName,
    uploading,
    referenceError,
    referenceInputRef,
    onReferenceFileChange,
    clearUpload,
    referenceVideoUrl,
  };
}

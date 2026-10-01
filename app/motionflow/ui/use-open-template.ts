import { useCallback, useState } from "react";
import { useNavigate } from "react-router";
import { api } from "./api";
import { toast } from "./Toast";

// Clicking a template copies its example video into the account and opens it
// in the editor. Templates without an editable example (or any error) fall
// back to pre-filling the Home prompt card with the template.
export function useOpenTemplate() {
  const navigate = useNavigate();
  const [openingId, setOpeningId] = useState<string | null>(null);

  const open = useCallback(
    async (templateId: string) => {
      if (openingId) return;
      setOpeningId(templateId);
      try {
        const { id } = await api.useTemplate(templateId);
        navigate(`/videos/${encodeURIComponent(id)}`);
      } catch {
        toast("Couldn't open the editor for this template — starting from its prompt instead.", "info");
        navigate(`/home?template=${encodeURIComponent(templateId)}`);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } finally {
        setOpeningId(null);
      }
    },
    [navigate, openingId],
  );

  return { open, openingId };
}

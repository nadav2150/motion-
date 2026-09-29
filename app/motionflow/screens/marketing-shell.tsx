// Shared shell for marketing SEO pages (use-case landing pages and
// competitor comparison pages). Renders the same TopNav, aurora bloom
// background, and a content-rich footer used as the internal link graph
// that ties the marketing pages together. Crawlers follow these footer
// links so every page in the cluster gets discovered and gets a small
// internal-link signal.
//
// Pages render their own hero + sections as `children`. The shell only
// owns chrome (nav, bg, footer).

import type { ReactNode } from "react";
import { MarketingFooter, MarketingHeader } from "../ui/marketing";

// v2: the shell adopts the new header/footer and palette; the pages keep
// rendering their own content as children.
export const MarketingShell = ({
  isAuthed = false,
  children,
}: {
  onCta?: () => void;
  onSignIn?: () => void;
  isAuthed?: boolean;
  children: ReactNode;
}) => (
  <div className="vd-root relative min-h-screen overflow-x-hidden">
    <MarketingHeader isAuthed={isAuthed} />
    <main>{children}</main>
    <MarketingFooter />
  </div>
);

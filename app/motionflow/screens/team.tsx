// /team — coming soon. Real workspaces (members, roles, invites) ship in
// Phase 6; until then this is a clearly-labelled preview with no fake people.

import { UserPlus, Users } from "lucide-react";
import { AppShell, type ShellUser } from "../ui/AppShell";
import { Button } from "../ui/Button";
import { Card, PageHeader } from "../ui/Card";

export function TeamScreen({ user, planTier, credits }: { user: ShellUser; planTier: string | null; credits: number | null }) {
  const you = user.name || user.email?.split("@")[0] || "You";
  return (
    <AppShell user={user} planTier={planTier} credits={credits}>
      <PageHeader
        title="Team"
        subtitle="Work together on videos and brand assets."
        action={
          <Button icon={<UserPlus className="size-4" aria-hidden />} disabled title="Coming soon">
            Invite member
          </Button>
        }
      />
      <Card className="relative min-h-[400px] overflow-hidden">
        <div className="pointer-events-none select-none opacity-40" aria-hidden>
          <div className="grid grid-cols-[1.5fr_1.5fr_1fr] gap-4 border-b border-slate/40 px-6 py-3 text-xs font-semibold uppercase tracking-wide text-silver max-sm:grid-cols-[1fr_1fr]">
            <span>Name</span>
            <span className="max-sm:hidden">Email</span>
            <span>Role</span>
          </div>
          <div className="grid grid-cols-[1.5fr_1.5fr_1fr] items-center gap-4 px-6 py-4 max-sm:grid-cols-[1fr_1fr]">
            <span className="flex items-center gap-3 text-sm font-medium text-paper">
              <span className="flex size-8 items-center justify-center rounded-full bg-coral text-xs font-bold text-white">
                {you[0]?.toUpperCase()}
              </span>
              {you}
            </span>
            <span className="truncate text-sm text-silver max-sm:hidden">{user.email}</span>
            <span className="text-sm text-silver">Owner</span>
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="grid grid-cols-[1.5fr_1.5fr_1fr] items-center gap-4 border-t border-slate/30 px-6 py-4 max-sm:grid-cols-[1fr_1fr]">
              <span className="flex items-center gap-3">
                <span className="size-8 rounded-full bg-slate/60" />
                <span className="h-3 w-28 rounded bg-slate/50" />
              </span>
              <span className="h-3 w-40 rounded bg-slate/40 max-sm:hidden" />
              <span className="h-3 w-14 rounded bg-slate/40" />
            </div>
          ))}
        </div>
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-ink via-ink/85 to-ink/40 p-6">
          <div className="max-w-md text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-coral/15 text-coral">
              <Users className="size-6" aria-hidden />
            </span>
            <p className="mt-4 inline-block rounded-full border border-coral/50 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-coral">
              Coming soon
            </p>
            <h2 className="mt-3 text-xl font-semibold text-paper">Shared workspaces are on the way</h2>
            <p className="mt-2 text-sm text-silver">
              Invite teammates as editors or viewers, share one brand kit and asset library, and review videos together.
            </p>
          </div>
        </div>
      </Card>
    </AppShell>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useTeam } from "@/hooks/useTeam";
import { getPocketBase } from "@/lib/pocketbase";
import { sha256 } from "@/lib/utils";
import type { Invite } from "@/lib/types";
import type { ClientResponseError } from "pocketbase";

export default function SettingsPage() {
  const { team, members, loading, setTeam, refetch } = useTeam();
  const pb = getPocketBase();
  const currentUserId = pb.authStore.record?.id;

  const [teamName, setTeamName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [pendingInvites, setPendingInvites] = useState<Invite[]>([]);
  const [memberError, setMemberError] = useState<string | null>(null);

  const teamId = team?.id;

  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;
    pb.collection("invites")
      .getFullList<Invite>({
        filter: `team="${teamId}" && accepted=false`,
      })
      .then((invites) => { if (!cancelled) setPendingInvites(invites); })
      .catch((err) => {
        if (cancelled) return;
        const pbErr = err as ClientResponseError;
        if (pbErr?.isAbort) {
          // Auto-cancelled by concurrent request — retry once after a short delay
          setTimeout(() => {
            if (cancelled) return;
            pb.collection("invites")
              .getFullList<Invite>({
                filter: `team="${teamId}" && accepted=false`,
              })
              .then((invites) => { if (!cancelled) setPendingInvites(invites); })
              .catch(() => {/* ignore on retry */});
          }, 200);
        }
      });
    return () => { cancelled = true; };
  }, [pb, teamId]);

  async function saveTeamName(e: React.FormEvent) {
    e.preventDefault();
    if (!team || !teamName.trim()) return;
    setSavingName(true);
    try {
      const updated = await pb.collection("teams").update(team.id, { name: teamName.trim() });
      setTeam({ ...team, name: updated.name });
      setTeamName("");
    } finally {
      setSavingName(false);
    }
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!team || !inviteEmail.trim()) return;
    setInviteError(null);
    setInviteSuccess(null);
    setInviting(true);
    try {
      // Store SHA-256 hash of the token — keep plaintext only in the invite URL
      const rawToken = crypto.randomUUID();
      const tokenHash = await sha256(rawToken);
      const expires = new Date();
      expires.setDate(expires.getDate() + 7); // 7 day expiry

      const inv = await pb.collection("invites").create<Invite>({
        team: team.id,
        email: inviteEmail.trim(),
        token: tokenHash,
        accepted: false,
        expires: expires.toISOString(),
      });

      const inviteUrl = `${window.location.origin}/invite/${rawToken}`;

      // Attempt to send invite email via PocketBase mailer.
      // If SMTP is not configured or sending fails, fall back to showing the
      // link manually so the owner can share it themselves.
      let emailSent = false;
      try {
        const emailRes = await fetch("/api/send-invite-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: inviteEmail.trim(),
            inviteUrl,
            teamName: team.name,
          }),
        });
        emailSent = emailRes.ok;
      } catch {
        // network error — will fall back to manual link
      }

      setInviteSuccess(emailSent ? "sent" : inviteUrl);
      setPendingInvites((prev) => [inv, ...prev]);
      setInviteEmail("");
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Failed to create invite.");
    } finally {
      setInviting(false);
    }
  }

  async function removeMember(memberId: string) {
    setMemberError(null);
    try {
      await pb.collection("team_members").delete(memberId);
      refetch();
    } catch {
      setMemberError("Failed to remove member. You may not have permission.");
    }
  }

  async function revokeInvite(inviteId: string) {
    try {
      await pb.collection("invites").delete(inviteId);
      setPendingInvites((prev) => prev.filter((i) => i.id !== inviteId));
    } catch {
      setInviteError("Failed to revoke invite.");
    }
  }

  const currentMembership = members.find((m) => m.user === currentUserId);
  const isOwner = currentMembership?.role === "owner";

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-xs text-[#737373]">Loading...</p>
      </div>
    );
  }

  return (
    <div className="px-6 py-8 max-w-xl">
      <h1 className="text-sm font-medium mb-8">Settings</h1>

      {/* Team name */}
      <section className="mb-8">
        <h2 className="text-xs font-medium text-[#737373] mb-3 uppercase tracking-wide">
          Team
        </h2>
        <div className="border border-[#e5e5e5] p-4">
          <p className="text-sm mb-4">{team?.name}</p>
          {isOwner && (
            <form onSubmit={saveTeamName} className="flex gap-2">
              <input
                type="text"
                placeholder="New team name"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                className="flex-1 border border-[#e5e5e5] px-3 py-1.5 text-xs outline-none focus:border-black placeholder:text-[#d4d4d4]"
              />
              <button
                type="submit"
                disabled={savingName || !teamName.trim()}
                className="text-xs border border-black px-3 py-1.5 hover:bg-black hover:text-white transition-none disabled:opacity-40"
              >
                Rename
              </button>
            </form>
          )}
        </div>
      </section>

      {/* Members */}
      <section className="mb-8">
        <h2 className="text-xs font-medium text-[#737373] mb-3 uppercase tracking-wide">
          Members
        </h2>
        <div className="border border-[#e5e5e5] divide-y divide-[#e5e5e5]">
          {members.map((m) => {
            const u = m.expand?.user;
            return (
              <div
                key={m.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div>
                  <p className="text-xs font-medium">{u?.name ?? "—"}</p>
                  <p className="text-xs text-[#737373]">{u?.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[#737373]">{m.role}</span>
                  {isOwner && m.user !== currentUserId && (
                    <button
                      onClick={() => removeMember(m.id)}
                      className="text-xs text-[#737373] hover:text-[#cc0000] transition-none"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {memberError && (
          <p className="text-xs text-[#cc0000] mt-2">{memberError}</p>
        )}
      </section>

      {/* Invite */}
      {isOwner && (
        <section className="mb-8">
          <h2 className="text-xs font-medium text-[#737373] mb-3 uppercase tracking-wide">
            Invite by email
          </h2>
          <form onSubmit={sendInvite} className="flex gap-2 mb-3">
            <input
              type="email"
              required
              placeholder="colleague@company.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="flex-1 border border-[#e5e5e5] px-3 py-1.5 text-xs outline-none focus:border-black placeholder:text-[#d4d4d4]"
            />
            <button
              type="submit"
              disabled={inviting}
              className="text-xs border border-black bg-black text-white px-3 py-1.5 hover:bg-white hover:text-black transition-none disabled:opacity-50"
            >
              {inviting ? "..." : "Send invite"}
            </button>
          </form>
          {inviteError && (
            <p className="text-xs text-[#cc0000] mb-2">{inviteError}</p>
          )}
          {inviteSuccess && (
            <div className="border border-[#e5e5e5] p-3 bg-[#fafafa]">
              {inviteSuccess === "sent" ? (
                <p className="text-xs text-[#737373]">Invite email sent.</p>
              ) : (
                <>
                  <p className="text-xs text-[#737373] mb-1">Email could not be sent — share this link manually:</p>
                  <p className="text-xs font-mono break-all">{inviteSuccess}</p>
                </>
              )}
            </div>
          )}

          {/* Pending invites */}
          {pendingInvites.length > 0 && (
            <div className="mt-4">
              <p className="text-xs text-[#737373] mb-2">Pending invites</p>
              <div className="border border-[#e5e5e5] divide-y divide-[#e5e5e5]">
                {pendingInvites.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between px-4 py-2.5"
                  >
                    <span className="text-xs">{inv.email}</span>
                    <button
                      onClick={() => revokeInvite(inv.id)}
                      className="text-xs text-[#737373] hover:text-[#cc0000] transition-none"
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

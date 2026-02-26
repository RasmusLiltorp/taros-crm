import { type NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

function parseEnvBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) return defaultValue;
  return value.trim().toLowerCase() === "true";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * POST /api/send-invite-email
 *
 * Sends a team invite email directly via SMTP using PB_SMTP_* env vars.
 *
 * Body: { to: string; inviteUrl: string; teamName: string }
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>).to !== "string" ||
    typeof (body as Record<string, unknown>).inviteUrl !== "string" ||
    typeof (body as Record<string, unknown>).teamName !== "string"
  ) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const { to, inviteUrl, teamName } = body as {
    to: string;
    inviteUrl: string;
    teamName: string;
  };

  const smtpHost = process.env.PB_SMTP_HOST?.trim();
  const smtpPortRaw = process.env.PB_SMTP_PORT?.trim() || "587";
  const smtpPort = Number.parseInt(smtpPortRaw, 10);
  const smtpTls = parseEnvBoolean(process.env.PB_SMTP_TLS, false);
  const smtpUser = process.env.PB_SMTP_USER?.trim() || "";
  const smtpPass = process.env.PB_SMTP_PASS?.trim() || "";
  const smtpAuthMethod = process.env.PB_SMTP_AUTH_METHOD?.trim() || "";
  const senderEmail = process.env.PB_SENDER_EMAIL?.trim();

  if (!smtpHost || !senderEmail || Number.isNaN(smtpPort)) {
    return NextResponse.json(
      { error: "server_misconfigured" },
      { status: 500 }
    );
  }

  let parsedInviteUrl: URL;
  try {
    parsedInviteUrl = new URL(inviteUrl);
  } catch {
    return NextResponse.json({ error: "invalid_invite_url" }, { status: 400 });
  }

  if (parsedInviteUrl.protocol !== "https:" && parsedInviteUrl.protocol !== "http:") {
    return NextResponse.json({ error: "invalid_invite_url" }, { status: 400 });
  }

  const safeTeamName = escapeHtml(teamName);
  const safeInviteUrl = escapeHtml(inviteUrl);

  try {
    const transport = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpTls,
      requireTLS: !smtpTls,
      auth: smtpUser && smtpPass ? { user: smtpUser, pass: smtpPass } : undefined,
      authMethod: smtpAuthMethod || undefined,
    });

    await transport.sendMail({
      from: `"Taros Simple CRM" <${senderEmail}>`,
      to,
      subject: `You've been invited to join ${teamName} on Taros Simple CRM`,
      html: `<p>Hello,</p>
<p>You've been invited to join <strong>${safeTeamName}</strong> on Taros Simple CRM.</p>
<p><a href="${safeInviteUrl}">Accept invite</a></p>
<p>This link expires in 7 days. If you weren't expecting this invite, you can ignore this email.</p>
<p>Thanks,<br/>Taros Simple CRM</p>`,
      text: `Hello,\n\nYou've been invited to join ${teamName} on Taros Simple CRM.\n\nAccept invite: ${inviteUrl}\n\nThis link expires in 7 days. If you weren't expecting this invite, you can ignore this email.\n\nThanks,\nTaros Simple CRM`,
    });

    transport.close();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[send-invite-email] SMTP send failed: ${message}\n`);
    return NextResponse.json({ error: "email_send_failed" }, { status: 502 });
  }

  return NextResponse.json({ success: true });
}

/* global $app, $os, onBootstrap */

// Runs on every PocketBase startup.
// Configures SMTP (SES) and ensures the users collection has the correct
// auth settings (verified-only login + email OTP MFA).
onBootstrap((e) => {
  e.next();

  // ── SMTP ──────────────────────────────────────────────────────────────────
  const smtpHost = ($os.getenv("PB_SMTP_HOST") || "").trim();

  if (smtpHost) {
    try {
      var smtpUser = ($os.getenv("PB_SMTP_USER") || "").trim();
      var smtpPass = ($os.getenv("PB_SMTP_PASS") || "").trim();
      var smtpPortRaw = parseInt($os.getenv("PB_SMTP_PORT") || "587", 10);
      var smtpPort = isNaN(smtpPortRaw) ? 587 : smtpPortRaw;
      var smtpTls = ($os.getenv("PB_SMTP_TLS") || "false").trim().toLowerCase() !== "false";
      var smtpAuthEnv = $os.getenv("PB_SMTP_AUTH_METHOD");
      // Default to LOGIN if not set; empty string means no auth method
      var smtpAuthMethod = smtpAuthEnv === null ? "LOGIN" : smtpAuthEnv.trim();
      var settings = $app.settings();
      settings.smtp.enabled = true;
      settings.smtp.host = smtpHost;
      settings.smtp.port = smtpPort;
      settings.smtp.username = smtpUser;
      settings.smtp.password = smtpPass;
      settings.smtp.tls = smtpTls;
      settings.smtp.authMethod = smtpAuthMethod;
      settings.meta.appName = "Taros Simple CRM";
      settings.meta.senderName = "Taros Simple CRM";
      settings.meta.senderAddress = $os.getenv("PB_SENDER_EMAIL") || "";
      $app.save($app.settings());
    } catch (err) {
      console.log("[settings.pb.js] SMTP config error:", err);
    }
  }

  // ── Users collection: verified-only login + MFA (email OTP) ──────────────
  try {
    const col = $app.findCollectionByNameOrId("users");
    const appUrl = ($os.getenv("NEXT_PUBLIC_APP_URL") || "http://localhost:3000").replace(/\/$/, "");

    // Open registration (empty string = allow all on the built-in auth collection)
    col.createRule = "";

    // Only verified users may log in
    col.authRule = "verified = true";

    // OTP
    col.otp.enabled = true;
    col.otp.duration = 180;
    col.otp.length = 8;

    // MFA
    col.mfa.enabled = true;
    col.mfa.duration = 300;
    col.mfa.rule = "";

    // Verification email template pointing to Next.js app
    col.verificationTemplate.subject = "Verify your Taros Simple CRM email";
    col.verificationTemplate.body = `<p>Hello,</p>
<p>Thank you for signing up for Taros Simple CRM.</p>
<p>Click the link below to verify your email address:</p>
<p><a href="${appUrl}/confirm-verification?token={TOKEN}">Verify email</a></p>
<p>The link expires in 72 hours.</p>
<p>Thanks,<br/>Taros Simple CRM</p>`;

    // Reset password email template pointing to Next.js app
    col.resetPasswordTemplate.subject = "Reset your Taros Simple CRM password";
    col.resetPasswordTemplate.body = `<p>Hello,</p>
<p>Click the link below to reset your Taros Simple CRM password:</p>
<p><a href="${appUrl}/reset-password?token={TOKEN}">Reset password</a></p>
<p>The link expires in 30 minutes. If you did not request a password reset, you can ignore this email.</p>
<p>Thanks,<br/>Taros Simple CRM</p>`;

    $app.save(col);
    console.log("[settings.pb.js] users collection configured successfully");
  } catch (err) {
    console.log("[settings.pb.js] users collection config error:", err);
  }
});

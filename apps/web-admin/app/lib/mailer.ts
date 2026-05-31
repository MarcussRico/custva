import nodemailer from "nodemailer";

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_PORT === "465",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

let _transporter: ReturnType<typeof nodemailer.createTransport> | null = null;
function getTransporter() {
  if (!_transporter) _transporter = createTransporter();
  return _transporter;
}

export async function sendAdminOtpEmail(to: string, otp: string): Promise<void> {
  const fromEmail = process.env.SMTP_USER ?? "noreply@custva.com";

  await getTransporter().sendMail({
    from: `"Custva Admin" <${fromEmail}>`,
    to,
    subject: `${otp} — Custva Admin access code`,
    text: `Your Custva Admin login code is: ${otp}\n\nExpires in 10 minutes. Do not share this code.`,
    html: `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#000000;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#000;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#0a0a0a;border-radius:16px;border:1px solid rgba(255,212,0,0.2);overflow:hidden;">
        <tr>
          <td style="padding:28px 36px 24px;border-bottom:1px solid rgba(255,212,0,0.1);">
            <table cellpadding="0" cellspacing="0"><tr>
              <td style="background:#ffd400;border-radius:8px;width:30px;height:30px;text-align:center;vertical-align:middle;">
                <span style="font-size:14px;font-weight:800;color:#000;">C</span>
              </td>
              <td style="padding-left:10px;">
                <span style="font-size:14px;font-weight:700;color:#fff;letter-spacing:0.05em;text-transform:uppercase;">Custva Admin</span>
              </td>
            </tr></table>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 36px;">
            <p style="margin:0 0 6px;font-size:20px;font-weight:700;color:#ffffff;">Admin access code</p>
            <p style="margin:0 0 24px;font-size:13px;color:rgba(255,255,255,0.5);line-height:1.6;">
              This code expires in <strong style="color:rgba(255,255,255,0.75);">10 minutes</strong>. Never share it with anyone.
            </p>
            <div style="background:rgba(255,212,0,0.06);border:1.5px solid rgba(255,212,0,0.3);border-radius:12px;padding:22px;text-align:center;margin-bottom:24px;">
              <span style="font-size:38px;font-weight:800;color:#ffd400;letter-spacing:12px;">${otp}</span>
            </div>
            <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.3);line-height:1.6;">
              If you did not request this, please ignore this email and secure your account immediately.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:18px 36px;border-top:1px solid rgba(255,212,0,0.1);">
            <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.25);">
              &copy; 2025 Custva &middot; Platform Admin System &middot; Confidential
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim(),
  });
}

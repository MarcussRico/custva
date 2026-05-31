import nodemailer from "nodemailer";

/**
 * Nodemailer transporter singleton.
 * Reads SMTP config from environment variables set in .env.local.
 */
function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_PORT === "465", // true only for port 465 (SSL)
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

let _transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
  if (!_transporter) {
    _transporter = createTransporter();
  }
  return _transporter;
}

/**
 * Send a one-time password email to a merchant.
 * The OTP is valid for 10 minutes.
 */
export async function sendOtpEmail(to: string, otp: string): Promise<void> {
  const transporter = getTransporter();
  const fromName = "Custva";
  const fromEmail = process.env.SMTP_USER ?? "noreply@custva.com";

  await transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject: `${otp} is your Custva login code`,
    text: `Your Custva login verification code is: ${otp}\n\nThis code expires in 10 minutes. Do not share it with anyone.`,
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Custva OTP</title>
</head>
<body style="margin:0;padding:0;background:#060e1c;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#060e1c;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="background:#0b1f3a;border-radius:16px;border:1px solid rgba(255,255,255,0.1);overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="padding:32px 40px 24px;border-bottom:1px solid rgba(255,255,255,0.08);">
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:#ffd400;border-radius:8px;width:32px;height:32px;text-align:center;vertical-align:middle;">
                    <span style="font-size:16px;font-weight:800;color:#000;line-height:32px;">C</span>
                  </td>
                  <td style="padding-left:10px;">
                    <span style="font-size:18px;font-weight:700;color:#ffffff;">Custva</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ffffff;">Your login code</p>
              <p style="margin:0 0 28px;font-size:14px;color:rgba(255,255,255,0.6);line-height:1.6;">
                Use the code below to complete your sign-in to Custva. It expires in <strong style="color:rgba(255,255,255,0.85);">10 minutes</strong>.
              </p>
              <!-- OTP Box -->
              <div style="background:rgba(255,212,0,0.08);border:1.5px solid rgba(255,212,0,0.35);border-radius:12px;padding:24px;text-align:center;margin-bottom:28px;">
                <span style="font-size:40px;font-weight:800;color:#ffd400;letter-spacing:10px;">${otp}</span>
              </div>
              <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.4);line-height:1.6;">
                If you did not request this code, you can safely ignore this email. Someone may have entered your email address by mistake.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid rgba(255,255,255,0.08);">
              <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.3);">
                &copy; 2025 Custva · Retention intelligence for offline businesses
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim(),
  });
}

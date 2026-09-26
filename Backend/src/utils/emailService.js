const nodemailer = require('nodemailer');

/**
 * LitSphere Email Service
 * Handles dispatching verification emails.
 */

// Create reusable transporter object using the default SMTP transport with strict timeouts
const getTransporter = () => {
  const user = (process.env.EMAIL_USER || '').trim();
  const pass = (process.env.EMAIL_PASS || '').trim().replace(/^["']|["']$/g, '');
  const host = (process.env.EMAIL_HOST || '').trim();
  const port = parseInt(process.env.EMAIL_PORT, 10) || 587;

  const timeoutConfig = {
    connectionTimeout: 4000, // 4s timeout prevents proxy 502 Gateway Timeouts
    greetingTimeout: 4000,
    socketTimeout: 5000,
  };

  // If using Gmail, 'service: gmail' is the most robust transport config in nodemailer
  if (host === 'smtp.gmail.com' || (!host && user.endsWith('@gmail.com'))) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
      ...timeoutConfig,
    });
  }

  return nodemailer.createTransport({
    host: host || 'smtp.gmail.com',
    port: port,
    secure: port === 465,
    auth: { user, pass },
    ...timeoutConfig,
  });
};

/**
 * Sends a highly professional academic password reset verification email.
 * Supports HTTP Email APIs (Resend, Brevo) over HTTPS port 443 (ideal for Render Free Tier which blocks SMTP),
 * as well as direct SMTP with strict timeouts.
 *
 * @param {string} toEmail - The recipient's email address
 * @param {string} resetCode - The 6-digit cryptographic verification passcode
 * @param {string} name - (Optional) User's name
 */
async function sendPasswordResetEmail(toEmail, resetCode, name = 'Researcher') {
  const user = (process.env.EMAIL_USER || '').trim();
  const pass = (process.env.EMAIL_PASS || '').trim().replace(/^["']|["']$/g, '');
  const resendKey = (process.env.RESEND_API_KEY || '').trim();
  const brevoKey = (process.env.BREVO_API_KEY || '').trim();

  // If running in test environment, simulate the dispatch
  if (process.env.NODE_ENV === 'test') {
    console.log(`🧪 [TEST EMAIL] Simulated Email Dispatch to: ${toEmail} | Code: ${resetCode}`);
    return true;
  }

  // Create a stunning, professional HTML email template
  const htmlContent = `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f7f6; padding: 40px 0;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
        
        <!-- Header -->
        <div style="background-color: #0f172a; padding: 25px 40px; text-align: center;">
          <h1 style="color: #d4af37; margin: 0; font-size: 24px; letter-spacing: 1px;">LitSphere Platform</h1>
          <p style="color: #94a3b8; margin: 5px 0 0 0; font-size: 14px;">Academic Account Security</p>
        </div>

        <!-- Body -->
        <div style="padding: 40px;">
          <h2 style="color: #1e293b; margin-top: 0;">Password Reset Verification</h2>
          <p style="color: #475569; line-height: 1.6; font-size: 16px;">
            Hello <strong>${name}</strong>,
          </p>
          <p style="color: #475569; line-height: 1.6; font-size: 16px;">
            We received a request to reset the password for your LitSphere academic account associated with this email address. Please use the following 6-digit cryptographic passcode to complete your password reset.
          </p>

          <!-- Code Box -->
          <div style="margin: 35px 0; padding: 25px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; text-align: center;">
            <p style="margin: 0 0 10px 0; font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 1px;">Verification Passcode</p>
            <div style="font-family: monospace; font-size: 34px; font-weight: 700; letter-spacing: 8px; color: #0f172a;">
              ${resetCode}
            </div>
            <p style="margin: 15px 0 0 0; font-size: 13px; color: #ef4444;">
              ⏱ This code is valid for exactly <strong>15 minutes</strong>.
            </p>
          </div>

          <p style="color: #475569; line-height: 1.6; font-size: 16px;">
            If you did not request this password reset, please ignore this email. Your account remains secure.
          </p>
        </div>

        <!-- Footer -->
        <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 40px; text-align: center;">
          <p style="color: #94a3b8; font-size: 12px; margin: 0;">
            &copy; ${new Date().getFullYear()} LitSphere Research Discovery Platform. All rights reserved.<br>
            Secure Automated Dispatch
          </p>
        </div>
      </div>
    </div>
  `;

  // 1. HTTP Email Delivery via Resend (HTTPS Port 443 - works everywhere including Render Free Tier)
  if (resendKey) {
    try {
      let fromAddr = (process.env.EMAIL_FROM || '').trim();
      // Resend requires onboarding@resend.dev unless a custom domain is verified
      if (!fromAddr || fromAddr.includes('@gmail.com') || !fromAddr.includes('@')) {
        fromAddr = 'LitSphere Security <onboarding@resend.dev>';
      }
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromAddr,
          to: [toEmail],
          subject: 'LitSphere — Password Reset Verification Passcode',
          html: htmlContent,
        }),
      });

      const resendData = await resendRes.json().catch(() => ({}));
      if (!resendRes.ok) {
        throw new Error(resendData.message || `Resend HTTP error ${resendRes.status}`);
      }

      console.log(`✅ [EMAIL SERVICE] Sent verification email via Resend API to ${toEmail}: ${resendData.id}`);
      return true;
    } catch (resendErr) {
      console.error('❌ [EMAIL SERVICE] Resend HTTP API error:', resendErr);
      throw new Error('Failed to dispatch email via Resend: ' + resendErr.message);
    }
  }

  // 2. HTTP Email Delivery via Brevo (Sendinblue)
  if (brevoKey) {
    try {
      const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': brevoKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: 'LitSphere Security', email: user || 'security@litsphere.org' },
          to: [{ email: toEmail }],
          subject: 'LitSphere — Password Reset Verification Passcode',
          htmlContent: htmlContent,
        }),
      });

      const brevoData = await brevoRes.json().catch(() => ({}));
      if (!brevoRes.ok) {
        throw new Error(brevoData.message || `Brevo HTTP error ${brevoRes.status}`);
      }

      console.log(`✅ [EMAIL SERVICE] Sent verification email via Brevo API to ${toEmail}`);
      return true;
    } catch (brevoErr) {
      console.error('❌ [EMAIL SERVICE] Brevo HTTP API error:', brevoErr);
      throw new Error('Failed to dispatch email via Brevo: ' + brevoErr.message);
    }
  }

  // 3. SMTP Delivery (Nodemailer)
  if (!user || !pass || pass.includes('your_16_char_app_password')) {
    console.error('❌ [EMAIL SERVICE ERROR] Live email credentials not configured.');
    throw new Error('Email service is not configured. Please set EMAIL_USER/EMAIL_PASS (or RESEND_API_KEY) in server environment.');
  }

  const transporter = getTransporter();
  const fromAddress = (process.env.EMAIL_FROM || '').trim() || `"LitSphere Security" <${user}>`;

  const mailOptions = {
    from: fromAddress,
    to: toEmail,
    subject: 'LitSphere — Password Reset Verification Passcode',
    html: htmlContent,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ [EMAIL SERVICE] Sent password reset verification email to ${toEmail}: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error(`❌ [EMAIL SERVICE] Error sending email to ${toEmail}:`, error);

    // Render free tier blocks outbound SMTP ports 25, 465, and 587
    if (error.code === 'ETIMEDOUT' || error.message.includes('timeout') || error.message.includes('ECONNREFUSED')) {
      throw new Error('SMTP connection timed out. On Render Free Tier, SMTP ports 465/587 are blocked. Please add RESEND_API_KEY to your Render environment variables to send emails over HTTPS.');
    }

    throw new Error('Failed to dispatch email: ' + error.message);
  }
}

module.exports = {
  sendPasswordResetEmail,
};

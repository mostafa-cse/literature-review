const nodemailer = require('nodemailer');

/**
 * LitSphere Email Service
 * Handles dispatching verification emails.
 */

// Create reusable transporter object using the default SMTP transport
const getTransporter = () => {
  const user = (process.env.EMAIL_USER || '').trim();
  const pass = (process.env.EMAIL_PASS || '').trim().replace(/^["']|["']$/g, '');
  const host = (process.env.EMAIL_HOST || '').trim();
  const port = parseInt(process.env.EMAIL_PORT, 10) || 587;

  // If using Gmail, 'service: gmail' is the most robust transport config in nodemailer
  if (host === 'smtp.gmail.com' || (!host && user.endsWith('@gmail.com'))) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });
  }

  return nodemailer.createTransport({
    host: host || 'smtp.gmail.com',
    port: port,
    secure: port === 465,
    auth: { user, pass },
  });
};

/**
 * Sends a highly professional academic password reset verification email.
 * @param {string} toEmail - The recipient's email address
 * @param {string} resetCode - The 6-digit cryptographic verification passcode
 * @param {string} name - (Optional) User's name
 */
async function sendPasswordResetEmail(toEmail, resetCode, name = 'Researcher') {
  const user = (process.env.EMAIL_USER || '').trim();
  const pass = (process.env.EMAIL_PASS || '').trim().replace(/^["']|["']$/g, '');

  // If running in test environment, simulate the dispatch
  if (process.env.NODE_ENV === 'test') {
    console.log(`🧪 [TEST EMAIL] Simulated Email Dispatch to: ${toEmail} | Code: ${resetCode}`);
    return true;
  }

  // If live SMTP credentials are not configured, reject clearly
  if (!user || !pass || pass.includes('your_16_char_app_password')) {
    console.error('❌ [EMAIL SERVICE ERROR] Live SMTP credentials not configured (EMAIL_USER or EMAIL_PASS missing).');
    throw new Error('Email service is not configured on the server. Please set EMAIL_USER and EMAIL_PASS environment variables.');
  }

  const transporter = getTransporter();

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
    throw new Error('Failed to dispatch email. Please check server SMTP configuration: ' + error.message);
  }
}

module.exports = {
  sendPasswordResetEmail,
};

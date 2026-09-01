const nodemailer = require('nodemailer');

/**
 * LitSphere Email Service
 * Handles dispatching verification emails.
 */

// Create reusable transporter object using the default SMTP transport
const getTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: process.env.EMAIL_PORT || 587,
    secure: process.env.EMAIL_PORT == 465, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
};

/**
 * Sends a highly professional academic password reset verification email.
 * @param {string} toEmail - The recipient's email address
 * @param {string} resetCode - The 6-digit cryptographic verification passcode
 * @param {string} name - (Optional) User's name
 */
async function sendPasswordResetEmail(toEmail, resetCode, name = 'Researcher') {
  // If no SMTP credentials are provided, we simulate the dispatch in console.
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('\n⚠️ [EMAIL SERVICE WARNING] SMTP Credentials not found in .env.');
    console.log(`📧 Simulated Email Dispatch to: ${toEmail} | Code: ${resetCode}\n`);
    return true; // Simulate success
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
            <div style="font-family: monospace; font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #0f172a;">
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

  const mailOptions = {
    from: process.env.EMAIL_FROM || '"LitSphere Security" <security@litsphere.ac>',
    to: toEmail,
    subject: 'LitSphere — Password Reset Verification Passcode',
    html: htmlContent,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ [EMAIL SERVICE] Sent message: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error('❌ [EMAIL SERVICE] Error sending email:', error);
    throw new Error('Failed to dispatch email. Please check server SMTP configuration.');
  }
}

module.exports = {
  sendPasswordResetEmail,
};

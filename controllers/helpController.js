import { Resend } from 'resend';
import Help from '../models/Help.js';

export const submitHelp = async (req, res) => {
  try {
    console.log({ key: process.env.RESEND_API_KEY });
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { name, email, message: userMessage, subject } = req.body;

    // Create record in database
    const helpRequest = await Help.create({
      userId: req.user.id,
      name,
      email,
      message: userMessage,
      subject: subject || 'General Support'
    });

    // Send email using Resend
    try {


      await resend.emails.send({
        from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
        to: process.env.EMAIL_TO || 'quantumcusp@gmail.com',
        subject: `New Support Request: ${subject || 'General Support'}`,
        html: `
          <div style="font-family: sans-serif; padding: 20px; color: #333;">
            <h2 style="color: #4f46e5;">New Support Request Received</h2>
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Subject:</strong> ${subject || 'General Support'}</p>
            <div style="margin-top: 20px; padding: 15px; background: #f9fafb; border-radius: 8px; border-left: 4px solid #4f46e5;">
              <p><strong>Message:</strong></p>
              <p style="white-space: pre-wrap;">${userMessage}</p>
            </div>
            <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;" />
            <p style="font-size: 12px; color: #666;">This message was sent from the Bank Statement OCR Support Form.</p>
          </div>
        `
      });
      console.log(`📧 Support email sent for: ${email}`);
    } catch (emailError) {
      console.error('Failed to send support email:', emailError);
      // We don't fail the whole request if email fails, as DB record is created
    }

    res.status(200).json({
      success: true,
      message: 'Support request received successfully. Our team will get back to you soon!',
      data: helpRequest
    });
  } catch (error) {
    console.error('Help Request Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process support request. Please try again later.'
    });
  }
};

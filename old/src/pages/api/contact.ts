import type { NextApiRequest, NextApiResponse } from 'next'
import nodemailer from 'nodemailer'

type ResponseData = {
  success?: boolean
  error?: string
  testAccount?: any
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<ResponseData>) {
  // Only allow POST method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { email, message } = req.body

  // Simple validation
  if (!email || !message) {
    return res.status(400).json({ error: 'Email and message are required' })
  }

  try {
    let transporter
    let testAccount

    // Check if we have SMTP credentials
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD) {
      // Use configured SMTP
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD,
        },
      })
    } else {
      // Create a test account for development
      console.log('No SMTP credentials found. Using test account...')
      testAccount = await nodemailer.createTestAccount()

      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      })
    }

    // Email content
    const mailOptions = {
      from:
        process.env.EMAIL_FROM ||
        `"BioKEA Contact" <${testAccount ? testAccount.user : 'contact@biokea.ai'}>`,
      to: process.env.EMAIL_TO || 'frederik@biokea.ai',
      subject: 'New Contact Form Submission',
      text: `You have received a new message from ${email}:\n\n${message}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4f46e5;">New Contact Form Submission</h2>
          <p><strong>From:</strong> ${email}</p>
          <div style="background-color: #f3f4f6; padding: 20px; border-radius: 5px; margin-top: 20px;">
            <p>${message.replace(/\n/g, '<br/>')}</p>
          </div>
        </div>
      `,
    }

    // Send email
    const info = await transporter.sendMail(mailOptions)

    // If using test account, provide the test URL to view the email
    if (testAccount) {
      console.log('Test email sent: %s', info.messageId)
      console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info))
      return res.status(200).json({
        success: true,
        testAccount: {
          previewUrl: nodemailer.getTestMessageUrl(info),
          messageId: info.messageId,
        },
      })
    }

    // Return success
    return res.status(200).json({ success: true })
  } catch (error) {
    console.error('Error sending email:', error)
    return res.status(500).json({ error: 'Failed to send email' })
  }
}

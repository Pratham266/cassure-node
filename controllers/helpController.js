import Help from '../models/Help.js';

export const submitHelp = async (req, res) => {
  try {
    const { name, email, message: userMessage, subject } = req.body;

    const helpRequest = await Help.create({
      userId: req.user.id,
      name,
      email,
      message: userMessage,
      subject: subject || 'General Support'
    });

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

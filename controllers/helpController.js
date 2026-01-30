export const submitHelp = async (req, res) => {
  try {
    const { name, email, message: userMessage } = req.body;

    console.log('--- NEW HELP REQUEST ---');
    console.log(`Name: ${name}`);
    console.log(`Email: ${email}`);
    console.log(`Message: ${userMessage}`);
    console.log('-------------------------');

    res.status(200).json({
      success: true,
      message: 'Help request received successfully. Our team will get back to you soon.'
    });
  } catch (error) {
    console.error('Help Request Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process help request. Please try again later.'
    });
  }
};

const Feedback = require('../models/Feedback');

exports.submitFeedback = async (req, res) => {
  const { name, email, message } = req.body;
  const userId = req.user.id; // From your auth middleware

  try {
    const feedback = new Feedback({ name, email, message, userId });
    await feedback.save();
    res.status(201).json({ message: 'Feedback submitted successfully!' });
  } catch (err) {
    console.error('Error submitting feedback:', err);
    res.status(500).json({ message: 'Failed to submit feedback', error: err.message });
  }
};

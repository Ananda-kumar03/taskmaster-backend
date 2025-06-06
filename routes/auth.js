const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

router.post('/register', async (req, res) => {
    const { username, password, firstName, email, lastName, phone } = req.body;

  try {
    const existing = await User.findOne({ $or: [{ username }, { email }] });
    if (existing) return res.status(400).json({ message: 'Username already exists' });

    const verificationToken = crypto.randomBytes(32).toString('hex');

    const user = new User({ username, password, firstName, email, lastName, phone,isVerified: false,
      verificationToken,
      verificationTokenExpiry: Date.now() + 1000 * 60 * 60 * 24 });
    await user.save();
    const transporter = nodemailer.createTransport({
      service: 'Gmail',
      auth: {
        user: 'taskmastertodo.noreply@gmail.com',
        pass: 'qudx ttjl epzv bkeo'
      }
    });

    const link = `http://localhost:5173/verify-email/${verificationToken}`;
    await transporter.sendMail({
      to: email,
      subject: 'Verify your email',
      html: `<p>Click to verify your email: <a href="${link}">${link}</a></p>`
    });

    res.status(201).json({ message: 'User registered. Check email to verify.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Registration error' });
  }
});



// Login user
router.post('/login', async (req, res) => {
    const { identifier, password } = req.body;
    try {
        const user = await User.findOne({
    $or: [
      { email: identifier.toLowerCase() },
      { username: identifier }
    ]
  });
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        if (!user.isVerified) {
  return res.status(403).json({ message: 'Please verify your email first' });
}

        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.json({ token, userId: user._id });
    } catch (error) {
        res.status(500).json({ message: 'Error logging in', error: error.message });
    }
});





router.post('/request-password-reset', async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });

  if (!user) return res.status(404).json({ message: 'No account with that email' });

  const token = crypto.randomBytes(32).toString('hex');
  const expiry = Date.now() + 1000 * 60 * 15; // 15 mins

  user.resetToken = token;
  user.resetTokenExpiry = expiry;
  await user.save();

  // Setup mail transport (e.g., Gmail or ethereal)
  const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
      user: 'taskmastertodo.noreply@gmail.com',
      pass: 'qudx ttjl epzv bkeo' // use app password
    }
  });

  const resetLink = `http://localhost:5173/reset-password/${token}`;

  await transporter.sendMail({
    to: user.email,
    subject: 'Reset Your Password',
    html: `<p>Click to reset password: <a href="${resetLink}">${resetLink}</a></p>`
  });

  res.json({ message: 'Password reset link sent' });
});

router.post('/reset-password/:token', async (req, res) => {
  const { password } = req.body;
  const { token } = req.params;

  const user = await User.findOne({
    resetToken: token,
    resetTokenExpiry: { $gt: Date.now() }
  });

  if (!user) return res.status(400).json({ message: 'Invalid or expired token' });

  const bcrypt = require('bcryptjs');
  const hashed = await bcrypt.hash(password, 10);

  user.password = password;
  user.resetToken = null;
  user.resetTokenExpiry = null;
  await user.save();

  res.json({ message: 'Password reset successful' });
});


router.get('/verify-email/:token', async (req, res) => {
  const { token } = req.params;

  const user = await User.findOne({
    verificationToken: token,
    verificationTokenExpiry: { $gt: Date.now() }
  });

  if (!user) return res.status(400).json({ message: 'Invalid or expired token' });

  user.isVerified = true;
  user.verificationToken = null;
  user.verificationTokenExpiry = null;
  await user.save();

  res.json({ message: '✅ Email verified. You can now log in.' });
});


router.post('/resend-verification', async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });

  if (!user) return res.status(404).json({ message: 'User not found' });
  if (user.isVerified) return res.status(400).json({ message: 'Already verified' });

  const token = crypto.randomBytes(32).toString('hex');
  user.verificationToken = token;
  user.verificationTokenExpiry = Date.now() + 1000 * 60 * 60 * 24;
  await user.save();

  const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
      user: 'taskmastertodo.noreply@gmail.com',
      pass: 'qudx ttjl epzv bkeo'
    }
  });

  const link = `http://localhost:5173/verify-email/${token}`;
  await transporter.sendMail({
    to: email,
    subject: '🔁 Resend Email Verification',
    html: `<p>Click to verify your email: <a href="${link}">${link}</a></p>`
  });

  res.json({ message: 'Verification link resent' });
});


module.exports = router;
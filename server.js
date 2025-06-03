const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
const cron = require('node-cron');

const app = express();

// app.use(express.json());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cors());
// MongoDB connection
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
const connection = mongoose.connection;
connection.once('open', () => {
    console.log("MongoDB database connection established successfully");
});

// Import routes
const todoRoutes = require('./routes/todos');
const authRoutes = require('./routes/auth');
const generateRecurringTodos = require('./services/recurringTodoService'); // Import the new service
const feedbackRoutes = require('./routes/feedbackRoutes');
app.use('/api/feedback', feedbackRoutes);
const statsRoutes = require('./routes/stats');
app.use('/api/stats', statsRoutes);

app.use('/api/users', require('./routes/userRoutes'));

app.use('/api/auth', authRoutes);
app.use('/api/todos', todoRoutes);

// Schedule the recurring todo worker
// This will run daily at 2:00 AM (0 2 * * *)
// For testing, you can change it to run every minute: '* * * * *'
cron.schedule('0 2 * * *', () => {
    console.log('Running scheduled recurring todo generation...');
    generateRecurringTodos();
});

// Also run once when the server starts up to catch any missed generations
console.log('Running recurring todo generation on server startup...');
generateRecurringTodos();

app.get('/', (req, res) => {
    res.send('API is running...');
});

app.listen(5000, () => console.log('Server started on port 5000'));

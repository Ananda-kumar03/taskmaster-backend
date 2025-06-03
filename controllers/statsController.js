const Todo = require('../models/Todo');
const moment = require('moment');

exports.getReflectionSummary = async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Completed count
    const completedCount = await Todo.countDocuments({ userId, completed: true });

    // 2. Missed count (overdue + incomplete)
    const now = new Date();
    const missedCount = await Todo.countDocuments({
      userId,
      completed: false,
      dueDate: { $lt: now },
    });

    // 3. Average completion time (only for completed tasks with completedAt)
    const completedTodos = await Todo.find({ userId, completed: true, completedAt: { $ne: null } });
    let avgTime = 0;
    if (completedTodos.length > 0) {
      const totalDuration = completedTodos.reduce((sum, todo) => {
        const duration = new Date(todo.completedAt) - new Date(todo.createdAt);
        return sum + duration;
      }, 0);
      avgTime = totalDuration / completedTodos.length / (1000 * 60 * 60); // convert ms → hours
    }

    // 4. Top tags
    const tagAgg = await Todo.aggregate([
      { $match: { userId: req.user._id || userId } },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 3 }
    ]);
    const topTags = tagAgg.map(tag => tag._id);

    // 5. Recurrence rate
    const totalTodos = await Todo.countDocuments({ userId });
    const recurringCount = await Todo.countDocuments({ userId, recurrence: { $ne: 'none' } });
    

    // 6. Completion streak (e.g., how many days in a row completed at least 1 todo)
    const daysWithCompletion = await Todo.aggregate([
      {
        $match: {
          userId: req.user._id || userId,
          completed: true,
          completedAt: { $ne: null }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$completedAt' },
            month: { $month: '$completedAt' },
            day: { $dayOfMonth: '$completedAt' }
          }
        }
      }
    ]);

    const streakDates = daysWithCompletion.map(d =>
      moment(`${d._id.year}-${d._id.month}-${d._id.day}`, 'YYYY-MM-DD').startOf('day')
    );

    streakDates.sort((a, b) => b - a); // sort desc

    let streak = 0;
    let today = moment().startOf('day');
    for (const date of streakDates) {
      if (date.isSame(today)) {
        streak++;
        today = today.subtract(1, 'day');
      } else {
        break;
      }
    }

    const recurrenceRate = totalTodos > 0 ? Math.round((recurringCount / totalTodos) * 100) : 0;

    res.json({
      completed: completedCount,
      missed: missedCount,
      avgCompletionTime: avgTime.toFixed(2),
      topTags,
      recurrenceRate,
      streak,
      suggestion: streak >= 3
        ? '🎉 Keep your streak going!'
        : '⏰ Try completing at least one task daily!',
    });

  } catch (err) {
    console.error('Error generating reflection summary:', err);
    res.status(500).json({ message: 'Failed to generate summary' });
  }
};

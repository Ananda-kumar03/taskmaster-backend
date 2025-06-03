// routes/todos.js (Updated based on your working code)
const express = require('express');
const router = express.Router();
const Todo = require('../models/Todo');
const auth = require('../middleware/auth');
const todoController = require('../controllers/todoController');


router.delete('/completed', auth, todoController.clearCompletedTodos);

router.delete('/:id', auth, todoController.deleteTodo);

router.put('/reorder', auth, todoController.reorderTodos);

// All routes here will use the 'auth' middleware for protection
router.use(auth);
router.use((req, res, next) => {
    console.log('Received DELETE request for path:', req.path);
    next();
});

// CRUD operations
router.post('/', auth, todoController.createTodo);
// router.post('/', auth, todoController.submitFeedback);
router.put('/:id', auth, todoController.updateTodo);
router.put('/:id/complete', auth, todoController.toggleComplete);
router.get('/', auth, todoController.getTodos);
router.get('/today', auth, todoController.getTodaysTodos); // Specific route for "My Day"

router.get('/profile', auth, todoController.getProfile);
router.put('/profile', auth, todoController.updateProfile);




// Helper function to get start and end of week (Sunday to Saturday)
// For "This Week", you might want Monday to Sunday or Sunday to Saturday.
// This example uses Sunday to Saturday based on common JS date behavior for getDay()
function getWeekRange(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0); // Start of day

    const day = d.getDay(); // 0 for Sunday, 1 for Monday, ..., 6 for Saturday
    const diff = d.getDate() - day; // Go back to Sunday

    const startOfWeek = new Date(d.setDate(diff));
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999); // End of day

    return { startOfWeek, endOfWeek };
}

// Helper function to get start and end of month
function getMonthRange(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0); // Start of day

    const startOfMonth = new Date(d.getFullYear(), d.getMonth(), 1);
    const endOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0); // Last day of month
    endOfMonth.setHours(23, 59, 59, 999); // End of day

    return { startOfMonth, endOfMonth };
}



    // Get all todos for a specific user (with optional tag filter, search, filter, and dateFilter)
router.get('/', auth, async (req, res) => {
    try {
        const userId = req.user.id; // Changed from req.userId to req.user.id based on common auth middleware
        const { tag, search, filter, dateFilter, archived } = req.query; // NEW: archived

        const query = { user: userId }; // Start with user filter

        // NEW: Apply archiving filter first
        if (archived === 'true') {
            query.isArchived = true;
        } else {
            query.isArchived = false; // Default: Only show non-archived tasks
        }

        // Apply main filters (completed, priority) - These apply AFTER archiving
        if (filter) {
            switch (filter) {
                case 'completed':
                    query.completed = true;
                    break;
                case 'incomplete':
                    query.completed = false;
                    break;
                case 'priority-high':
                    query.priority = 'High';
                    break;
                case 'priority-medium':
                    query.priority = 'Medium';
                    break;
                case 'priority-low':
                    query.priority = 'Low';
                    break;
                // 'all' and 'archived' filters are handled by the 'archived' query parameter
                // and the default setting of query.isArchived = false;
                default:
                    break;
            }
        }

        // Apply date range filters based on 'dateFilter' query parameter
        // Ensure date filters are not applied when viewing 'archived' tasks,
        // or refine this logic based on your desired behavior.
        // For now, these will apply to whatever 'isArchived' filter is active.
        const now = new Date();
        now.setHours(0, 0, 0, 0); // Set to start of today for consistent comparisons

        if (dateFilter) {
            switch (dateFilter) {
                case 'overdue':
                    query.dueDate = { $lt: now };
                    // If filter is 'archived', completed won't apply to overdue specifically
                    // If filter is 'all' or 'incomplete', then query.completed = false ensures only incomplete overdue
                    if (filter !== 'archived' && filter !== 'completed') {
                        query.completed = false; // Only show incomplete overdue todos unless explicitly looking at completed or archived
                    }
                    break;
                case 'upcoming-7-days':
                    const endOfNext7Days = new Date(now);
                    endOfNext7Days.setDate(now.getDate() + 7);
                    endOfNext7Days.setHours(23, 59, 59, 999); // End of the 7th day

                    query.dueDate = { $gte: now, $lte: endOfNext7Days };
                     if (filter !== 'archived' && filter !== 'completed') {
                        query.completed = false; // Only show incomplete upcoming todos
                    }
                    break;
                case 'this-week':
                    // Ensure getWeekRange is available in your file
                    const { startOfWeek, endOfWeek } = getWeekRange(now);
                    query.dueDate = { $gte: startOfWeek, $lte: endOfWeek };
                    break;
                case 'this-month':
                    // Ensure getMonthRange is available in your file
                    const { startOfMonth, endOfMonth } = getMonthRange(now);
                    query.dueDate = { $gte: startOfMonth, $lte: endOfMonth };
                    break;
                // 'all' and 'grouped' filters are handled client-side for rendering, not backend query
                default:
                    break;
            }
        }


        // Add tag filter if provided
        if (tag) {
            query.tags = { $regex: new RegExp(tag, 'i') };
        }

        // Add search functionality
        if (search) {
            const searchRegex = new RegExp(search, 'i');
            query.$or = [
                { text: { $regex: searchRegex } },
                { tags: { $regex: searchRegex } },
                { description: { $regex: searchRegex } }
            ];
        }

        console.log("Backend Query:", JSON.stringify(query)); // For debugging backend query

        const todos = await Todo.find(query).sort({ order: 1 }); // Sort by order
        res.json(todos);
    } catch (error) {
        console.error('Error fetching todos:', error.message);
        res.status(500).json({ message: 'Error fetching todos', error: error.message });
    }
});

// Add new todo
router.post('/', auth, async (req, res) => {
    try {
        // NEW: Destructure subtasks
        const { text, completed, priority, dueDate, tags, reminderTime, description, subtasks } = req.body;
        const userId = req.userId;

        // Determine the next order number
        const lastTodo = await Todo.findOne({ user: userId }).sort({ order: -1 });
        const newOrder = lastTodo ? lastTodo.order + 1 : 0;

        const newTodo = new Todo({
            user: userId,
            text,
            completed,
            priority,
            dueDate,
            order: newOrder,
            tags,
            reminderTime,
            description,
            subtasks // NEW: Include subtasks
        });

        await newTodo.save();
        res.status(201).json(newTodo);
    } catch (error) {
        console.error('Error adding todo:', error.message);
        res.status(500).json({ message: 'Error adding todo', error: error.message });
    }
});

// PUT route to reorder todos (No change needed here as it doesn't involve reminderTime)
router.put('/reorder', auth, async (req, res) => {
    const { order: newOrder } = req.body;

    if (!Array.isArray(newOrder)) {
        return res.status(400).json({ message: 'Invalid order data' });
    }

    try {
        await Promise.all(
            newOrder.map(async (todoId, index) => {
                await Todo.findOneAndUpdate(
                    { _id: todoId, user: req.userId }, // Correct: using req.userId
                    { order: index }
                );
            })
        );
        res.json({ message: 'Todo order updated successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error updating todo order', error: error.message });
    }
});

// Update a todo
router.put('/:id', auth, async (req, res) => {
    try {
        // NEW: Destructure isArchived along with other fields
        const { text, completed, priority, dueDate, tags, reminderTime, description, subtasks, recurrence, recurrenceDetails, lastRecurredDate, isRecurringInstance, recurringParentId, isArchived } = req.body;
        const todoId = req.params.id;
        const userId = req.user.id; // Changed from req.userId to req.user.id

        const updateFields = {
            text, completed, priority, dueDate, tags, reminderTime, description, subtasks,
            recurrence, recurrenceDetails, lastRecurredDate, isRecurringInstance, recurringParentId,
            isArchived // NEW: Include isArchived
        };

        const updatedTodo = await Todo.findOneAndUpdate(
            { _id: todoId, user: userId },
            updateFields, // Use the updateFields object
            { new: true } // Return the updated document
        );

        if (!updatedTodo) {
            return res.status(404).json({ message: 'Todo not found or unauthorized' });
        }
        res.json(updatedTodo);
    } catch (error) {
        console.error('Error updating todo:', error.message);
        res.status(500).json({ message: 'Error updating todo', error: error.message });
    }
});

// PUT route to mark a todo as completed (No change needed for reminderTime, but consider clearing reminder if completed)
router.put('/:id/complete', auth, async (req, res) => {
    try {
        const todo = await Todo.findOne({ _id: req.params.id, user: req.userId }); // Correct: using req.userId
        if (!todo) {
            return res.status(404).json({ message: 'Todo not found' });
        }
        todo.completed = !todo.completed;
        // Optional: If a todo is completed, you might want to clear its reminder.
        // todo.reminderTime = null; // Uncomment if you want this behavior
        const updatedTodo = await todo.save();
        res.json(updatedTodo);
    } catch (error) {
        console.error('Error updating todo completion status:', error.message);
        res.status(500).json({ message: 'Error updating todo completion status', error: error.message });
    }
});

// DELETE route to clear all completed todos for a specific user
router.delete('/completed', auth, async (req, res) => {
    try {
        const result = await Todo.deleteMany({ completed: true, user: req.userId }); // Correct: using req.userId
        res.json({ message: `${result.deletedCount} completed todos deleted` });
    } catch (error) {
        console.error('Error clearing completed todos:', error.message);
        res.status(500).json({ message: 'Error clearing completed todos', error: error.message });
    }
});

// Delete todo by ID
router.delete('/:id', auth, async (req, res) => {
    try {
        const deletedTodo = await Todo.findOneAndDelete({ _id: req.params.id, user: req.userId }); // Correct: using req.userId
        if (!deletedTodo) {
            return res.status(404).json({ message: 'Todo not found' });
        }
        res.json({ message: 'Deleted' });
    } catch (error) {
        console.error('Error deleting todo:', error.message);
        res.status(500).json({ message: 'Error deleting todo', error: error.message });
    }
});


router.get('/today', auth, async (req, res) => {
    try {
        const userId = req.userId; // Get user ID from auth middleware

        // Get today's date range (start of day to end of day)
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0); // Set to midnight today

        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999); // Set to end of today

        // Build the query
        const myDayQuery = {
            user: userId,
            $or: [
                // Option 1: dueDate is today
                {
                    dueDate: {
                        $gte: startOfToday,
                        $lte: endOfToday
                    }
                },
                // Option 2: reminderTime is today
                {
                    reminderTime: {
                        $gte: startOfToday,
                        $lte: endOfToday
                    }
                }
            ]
        };

        const todos = await Todo.find(myDayQuery).sort({ order: 1 }); // Sort by order
        res.json(todos);
    } catch (error) {
        console.error('Error fetching "My Day" todos:', error.message);
        res.status(500).json({ message: 'Error fetching "My Day" todos', error: error.message });
    }
});

module.exports = router;
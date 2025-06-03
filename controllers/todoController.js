// backend/controllers/todoController.js
const Feedback = require('../models/Feedback');
const Todo = require('../models/Todo'); // Ensure this path is correct
const User = require('../models/User'); // Assuming you have a User model for user validation if needed
const moment = require('moment'); // Required for date calculations in recurring service

// Helper to remove any instances generated from a recurring todo when the parent is deleted
const deleteRecurringInstances = async (recurringParentId, userId) => {
    try {
        await Todo.deleteMany({ recurringParentId: recurringParentId, userId: userId });
        console.log(`Deleted recurring instances for parent: ${recurringParentId}`);
    } catch (error) {
        console.error(`Error deleting recurring instances for ${recurringParentId}:`, error);
    }
};

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

exports.createTodo = async (req, res) => {
    const {
        text, completed, priority, dueDate, tags, reminderTime,
        description, subtasks, recurrence, recurrenceDetails
    } = req.body;
    const userId = req.user.id; // Correctly get userId from req.user.id set by auth middleware

    try {
        const newTodo = new Todo({
            userId, // Use userId field as defined in models/Todo.js
            text,
            completed: completed !== undefined ? completed : false,
            priority: priority || 'Medium',
            dueDate: dueDate || null,
            tags: tags || [],
            reminderTime: reminderTime || null,
            description: description || '',
            subtasks: subtasks || [],
            recurrence: recurrence || 'none',
            recurrenceDetails: recurrenceDetails || {},
            lastRecurredDate: recurrence && recurrence !== 'none' ? (dueDate ? new Date(dueDate) : new Date()) : null,
            isRecurringInstance: false,
            recurringParentId: null
        });
        const todo = await newTodo.save();
        res.status(201).json(todo);
    } catch (error) {
        console.error('Error creating todo:', error);
        res.status(400).json({ message: error.message });
    }
};

exports.getTodos = async (req, res) => {
    const userId = req.user.id;
    const { search, filter, tag, dateFilter, priority, archived } = req.query; 

    try {
        let query = { userId }; 

        console.log('--- Inside getTodos controller ---');
        console.log('Received query parameters:', req.query); // See all incoming params
        console.log('Current filter state:', filter); // What 'filter' value is received

        // 1. Apply Archived Filter (Already working, just showing for context)
        if (archived === 'true') {
            query.isArchived = true;
        } else {
            query.isArchived = { $ne: true }; 
        }

        // 2. Search Logic (already working)
        if (search) {
            const searchRegex = new RegExp(search, 'i');
            query.$or = [
                { text: searchRegex },
                { description: searchRegex },
                { tags: searchRegex }
            ];
        }

        // 3. Main Filter Logic (e.g., 'completed', 'incomplete') (already working)
        if (filter) {
            if (filter === 'completed') {
                query.completed = true;
            } else if (filter === 'incomplete') {
                query.completed = false;
            }
        }

        // 4. Priority Filter (THIS IS THE SECTION TO REVIEW CAREFULLY)
        // This handles filters like 'priority-high', 'priority-medium', 'priority-low'
        if (filter && (filter === 'priority-high' || filter === 'priority-medium' || filter === 'priority-low')) {
            const priorityLevel = filter.split('-')[1]; // Extracts 'high', 'medium', or 'low'
            query.priority = priorityLevel.charAt(0).toUpperCase() + priorityLevel.slice(1); // Converts to 'High', 'Medium', 'Low'
            console.log('Applied filter-based priority filter. Query.priority set to:', query.priority);
        } else if (priority) { // This block is for a separate 'priority' query param, which your frontend might not be sending for these cases
            query.priority = priority;
            console.log('Applied direct priority filter. Query.priority set to:', query.priority);
        }


        // 5. Tag Filter (already working)
        if (tag) {
            query.tags = tag;
            console.log('Applied tag filter:', tag);
        }

        // 6. Date Filter Logic (already working)
        if (dateFilter) {
            const moment = require('moment'); 
            const now = moment().startOf('day');

            if (dateFilter === 'overdue') {
                query.dueDate = { $lt: now.toDate() };
                query.completed = false;
            } else if (dateFilter === 'upcoming-7-days') {
                const sevenDaysLater = moment(now).add(7, 'days').endOf('day');
                query.dueDate = { $gte: now.toDate(), $lte: sevenDaysLater.toDate() };
                query.completed = false;
            } else if (dateFilter === 'this-week') {
                const startOfWeek = moment(now).startOf('isoWeek');
                const endOfWeek = moment(now).endOf('isoWeek');
                query.dueDate = { $gte: startOfWeek.toDate(), $lte: endOfWeek.toDate() };
            } else if (dateFilter === 'this-month') {
                const startOfMonth = moment(now).startOf('month');
                const endOfMonth = moment(now).endOf('month');
                query.dueDate = { $gte: startOfMonth.toDate(), $lte: endOfMonth.toDate() };
            }
        }

        console.log('Final MongoDB Query object:', query); // See the final query object before fetching
        const todos = await Todo.find(query).sort({ order: 1, createdAt: -1 });
        res.json(todos);
    } catch (error) {
        console.error('Error fetching todos:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

exports.getTodaysTodos = async (req, res) => {
    const userId = req.user.id; // Correctly get userId
    const today = moment().startOf('day');
    const tomorrow = moment(today).add(1, 'days');

    try {
        const todos = await Todo.find({
            userId,
            dueDate: {
                $gte: today.toDate(),
                $lt: tomorrow.toDate()
            }
        }).sort({ order: 1 });
        res.json(todos);
    } catch (error) {
        console.error('Error fetching today\'s todos:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const updates = req.body;
    const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true }).select('-password');
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Update failed' });
  }
};

exports.updateTodo = async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id; // Correctly get userId
    const updates = req.body;

    try {
        const todo = await Todo.findOne({ _id: id, userId });
        if (!todo) {
            return res.status(404).json({ message: 'Todo not found' });
        }

        // Handle recurrence updates:
        if (updates.recurrence !== undefined && todo.recurrence !== updates.recurrence) {
            todo.recurrence = updates.recurrence;
            todo.recurrenceDetails = updates.recurrenceDetails || {};
            if (updates.recurrence !== 'none' && !todo.isRecurringInstance) {
                todo.lastRecurredDate = updates.dueDate ? new Date(updates.dueDate) : new Date();
            } else if (updates.recurrence === 'none') {
                todo.lastRecurredDate = null;
                todo.recurrenceDetails = {};
            }
        } else if (updates.recurrenceDetails !== undefined) {
             if (todo.recurrence !== 'none') {
                 todo.recurrenceDetails = updates.recurrenceDetails;
             }
        }

        // Apply other updates normally
        if (updates.text !== undefined) todo.text = updates.text;
        if (updates.completed !== undefined) todo.completed = updates.completed;
        if (updates.priority !== undefined) todo.priority = updates.priority;
        if (updates.dueDate !== undefined) todo.dueDate = updates.dueDate;
        if (updates.tags !== undefined) todo.tags = updates.tags;
        if (updates.reminderTime !== undefined) todo.reminderTime = updates.reminderTime;
        if (updates.description !== undefined) todo.description = updates.description;
        if (updates.subtasks !== undefined) todo.subtasks = updates.subtasks;
        // NEW: Handle isArchived update
        if (updates.isArchived !== undefined) {
            todo.isArchived = updates.isArchived;
        }
        if (updates.pinned !== undefined) todo.pinned = updates.pinned; 

        const updatedTodo = await todo.save();
        res.json(updatedTodo);
    } catch (error) {
        console.error('Error updating todo:', error);
        res.status(400).json({ message: error.message });
    }
};

exports.toggleComplete = async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id; // Correctly get userId

    try {
        const todo = await Todo.findOne({ _id: id, userId });
        if (!todo) {
            return res.status(404).json({ message: 'Todo not found' });
        }

        // If the task has subtasks and any are incomplete, prevent completion
        if (todo.subtasks && todo.subtasks.length > 0 && todo.subtasks.some(subtask => !subtask.completed)) {
            return res.status(400).json({ message: "Please complete all subtasks before marking the main task as complete." });
        }

        todo.completed = !todo.completed;
        // If marking as completed, set completedAt to now; otherwise, clear it 
        if (todo.completed) {
            todo.completedAt = new Date();
        } else {
            todo.completedAt = null; // Clear completedAt when marking as incomplete
        }

        await todo.save();
        res.json(todo);
    } catch (error) {
        console.error('Error toggling complete status:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.deleteTodo = async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    // Add extensive logging here
    console.log('--- Inside deleteTodo controller (for single delete) ---');
    console.log('Received ID for single delete:', id);
    console.log('User ID from auth middleware:', userId);

    try {
        // ... rest of your deleteTodo logic ...
        const todo = await Todo.findOne({ _id: id, userId }); // THIS is where the CastError happens if 'id' is "completed"

        if (!todo) {
            return res.status(404).json({ message: 'Todo not found' });
        }

        // If this is a recurring parent todo, delete all its generated instances too
        if (todo.recurrence !== 'none' && !todo.isRecurringInstance) {
            // Make sure deleteRecurringInstances is defined somewhere or imported
            await deleteRecurringInstances(todo._id, userId);
            console.log(`Deleted master recurring todo and its instances: ${todo._id}`);
        }

        await Todo.deleteOne({ _id: id, userId });
        console.log(`Successfully deleted todo with ID: ${id}`);
        console.log('--- Exiting deleteTodo controller ---');
        res.status(200).json({ message: 'Todo deleted successfully' });
    } catch (error) {
        console.error('Error in deleteTodo function:', error);
        // Log the specific type of error
        if (error.name === 'CastError') {
            console.error('CastError details:', error.message, 'Value:', error.value, 'Path:', error.path);
        }
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// NEW FUNCTION: Clear all completed todos for the authenticated user
exports.clearCompletedTodos = async (req, res) => {
    try {
        const userId = req.user.id; // This relies on your auth middleware setting req.user.id

        // Add extensive logging here to see what's happening
        console.log('--- Inside clearCompletedTodos controller ---');
        console.log('User ID from auth middleware:', userId);

        if (!userId) {
            console.error('Error: userId is undefined in clearCompletedTodos. Auth middleware problem?');
            return res.status(401).json({ message: 'User not authenticated or ID missing.' });
        }

        const result = await Todo.deleteMany({ userId: userId, completed: true });

        console.log(`Cleared ${result.deletedCount} completed todos for userId: ${userId}`);
        console.log('--- Exiting clearCompletedTodos controller ---');
        res.status(200).json({ message: `${result.deletedCount} completed todos cleared successfully` });
    } catch (error) {
        console.error('Error in clearCompletedTodos function:', error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

exports.reorderTodos = async (req, res) => {

    console.log('Backend Debug: Full request body received:', req.body);
    const userId = req.user.id;
    const { order: newOrderIds } = req.body; // Expects an array of IDs in the new order

    // --- Debugging Logs (Add these temporarily) ---
    console.log('--- Inside reorderTodos controller ---');
    console.log('User ID for reorder:', userId);
    console.log('Received new order of IDs:', newOrderIds);
    // --- End Debugging Logs ---

    if (!Array.isArray(newOrderIds) || newOrderIds.length === 0) {
        console.error('Reorder: Invalid or empty order array received.');
        return res.status(400).json({ message: 'Invalid order array provided.' });
    }

    try {
        // Create an array of bulk write operations
        const operations = newOrderIds.map((id, index) => ({
            updateOne: {
                filter: { _id: id, userId: userId }, // Filter by _id AND userId for security
                update: { $set: { order: index } }
            }
        }));

        const result = await Todo.bulkWrite(operations);

        // --- Debugging Log ---
        console.log('Bulk write result:', result);
        console.log('Todos reordered successfully.');
        // --- End Debugging Log ---

        res.status(200).json({ message: 'Todos reordered successfully.' });
    } catch (error) {
        console.error('Error reordering todos:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};
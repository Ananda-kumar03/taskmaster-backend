// backend/services/recurringTodoService.js
const cron = require('node-cron');
const moment = require('moment'); // For easy date manipulation
const Todo = require('../models/Todo');

// Function to calculate the next occurrence date for a recurring todo
const getNextOccurrenceDate = (lastDate, recurrenceType, recurrenceDetails) => {
    let nextDate = moment(lastDate).startOf('day'); // Start from the beginning of the last date

    switch (recurrenceType) {
        case 'daily':
            nextDate.add(1, 'days');
            break;
        case 'weekly':
            nextDate.add(1, 'weeks'); // Move to the same day next week
            // If a specific day of week is defined, adjust to that day
            if (typeof recurrenceDetails.dayOfWeek === 'number') {
                // moment().day(0) is Sunday, 1 is Monday...
                nextDate.day(recurrenceDetails.dayOfWeek);
                // If setting the day makes it earlier than the lastDate, move to the *next* week
                if (nextDate.isSameOrBefore(moment(lastDate).startOf('day'), 'day')) {
                    nextDate.add(1, 'weeks');
                }
            }
            break;
        case 'monthly':
            nextDate.add(1, 'months'); // Move to the same day next month
            // If a specific day of month is defined, adjust to that day
            if (typeof recurrenceDetails.dayOfMonth === 'number') {
                // moment().date() handles month-end clamping (e.g., day 31 in Feb)
                nextDate.date(recurrenceDetails.dayOfMonth);
                // If setting the date makes it earlier than the lastDate of *previous* month, move to the *next* month
                if (nextDate.isSameOrBefore(moment(lastDate).startOf('day'), 'day') && nextDate.month() === moment(lastDate).month()) {
                     nextDate.add(1, 'month').date(recurrenceDetails.dayOfMonth);
                }
            }
            break;
        case 'yearly':
            nextDate.add(1, 'years');
            // If specific month/day of month are defined, adjust
            if (typeof recurrenceDetails.month === 'number') {
                nextDate.month(recurrenceDetails.month); // 0-11
            }
            if (typeof recurrenceDetails.dayOfMonth === 'number') {
                nextDate.date(recurrenceDetails.dayOfMonth);
            }
            // If setting the date makes it earlier than the lastDate of *previous* year, move to the *next* year
            if (nextDate.isSameOrBefore(moment(lastDate).startOf('day'), 'day') && nextDate.year() === moment(lastDate).year()) {
                 nextDate.add(1, 'year').month(recurrenceDetails.month || nextDate.month()).date(recurrenceDetails.dayOfMonth || nextDate.date());
            }
            break;
        default:
            return null; // Should not happen with enum validation
    }
    return nextDate;
};


const generateRecurringTodos = async () => {
    console.log('Running recurring todo generation service...');
    const today = moment().startOf('day'); // Normalize today to start of the day

    try {
        // Find all recurring parent todos that are not completed and have not generated an instance for today
        const recurringParents = await Todo.find({
            recurrence: { $ne: 'none' },
            isRecurringInstance: false, // We only want the template todo
            completed: false, // Only active recurring tasks
            $or: [
                { lastRecurredDate: { $lt: today.toDate() } }, // Last instance was before today
                { lastRecurredDate: null } // Never generated an instance before (newly created recurring todo)
            ]
        });

        for (const parentTodo of recurringParents) {
            // Determine the starting point for calculating the next instance
            // Use lastRecurredDate if available, otherwise dueDate (if set), otherwise createdAt
            let calculationStartDate = parentTodo.lastRecurredDate
                ? moment(parentTodo.lastRecurredDate).startOf('day')
                : (parentTodo.dueDate ? moment(parentTodo.dueDate).startOf('day') : moment(parentTodo.createdAt).startOf('day'));

            let nextInstanceDate = getNextOccurrenceDate(calculationStartDate, parentTodo.recurrence, parentTodo.recurrenceDetails);

            // Loop to generate all missed instances up to and including today
            while (nextInstanceDate && nextInstanceDate.isSameOrBefore(today, 'day')) {
                console.log(`Generating new instance for recurring todo: "${parentTodo.text}" due on ${nextInstanceDate.format('YYYY-MM-DD')}`);

                const newTodoInstance = new Todo({
                    userId: parentTodo.userId,
                    text: parentTodo.text,
                    completed: false, // New instance is always incomplete
                    priority: parentTodo.priority,
                    dueDate: nextInstanceDate.toDate(), // Due date for the new instance
                    tags: [...parentTodo.tags], // Copy tags
                    // Adjust reminder time to the new due date, keeping original time of day
                    reminderTime: parentTodo.reminderTime
                        ? nextInstanceDate.clone().set({
                            hour: moment(parentTodo.reminderTime).hour(),
                            minute: moment(parentTodo.reminderTime).minute(),
                            second: moment(parentTodo.reminderTime).second()
                          }).toDate()
                        : null,
                    description: parentTodo.description,
                    subtasks: parentTodo.subtasks.map(st => ({ ...st, completed: false })), // Subtasks reset to incomplete
                    isRecurringInstance: true, // Mark as an instance
                    recurringParentId: parentTodo._id, // Link to the master todo
                });

                await newTodoInstance.save();

                // Move to calculate the next potential instance from the current generated one
                calculationStartDate = nextInstanceDate;
                nextInstanceDate = getNextOccurrenceDate(calculationStartDate, parentTodo.recurrence, parentTodo.recurrenceDetails);
            }

            // After generating all instances up to today, update the parent's lastRecurredDate
            if (parentTodo.recurrence !== 'none') {
                parentTodo.lastRecurredDate = today.toDate();
                await parentTodo.save();
            }
        }
        console.log('Recurring todo generation service finished.');
    } catch (error) {
        console.error('Error generating recurring todos:', error);
    }
};

// Export the function to be scheduled in server.js
module.exports = generateRecurringTodos;
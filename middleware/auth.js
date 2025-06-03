// const jwt = require('jsonwebtoken');

// const auth = (req, res, next) => {
//     try {
//         const token = req.header('Authorization').replace('Bearer ', '');
//         if (!token) {
//             return res.status(401).json({ message: 'No token, authorization denied' });
//         }
//         const decoded = jwt.verify(token, '83f9a9d65609930d511a776dd96d805faeef19a2fa388532be5f758da8b0cdd82b501fd4faaccabf31533aba0c9386e718c58e5fba7c88919b53a4d3cc1ce0a6'); // Replace 'your-secret-key'
//         req.userId = decoded.userId;
//         next();
//     } catch (error) {
//         res.status(401).json({ message: 'Token is not valid' });
//     }
// };

// module.exports = auth;

// backend/middleware/auth.js (CORRECTED version)

const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
dotenv.config(); // Make sure .env variables are loaded here

const auth = (req, res, next) => {
    try {
        const authHeader = req.header('Authorization');

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            console.error('Auth middleware: No Bearer token found or malformed header.');
            return res.status(401).json({ message: 'No token, authorization denied' });
        }

        const token = authHeader.slice(7); // Extract token by removing 'Bearer '

        if (!token) {
            console.error('Auth middleware: Token is empty after removing "Bearer " prefix.');
            return res.status(401).json({ message: 'No token, authorization denied' });
        }

        // Verify token using the secret from environment variables
        const decoded = jwt.verify(token, process.env.JWT_SECRET); 

        // CRITICAL: Map your previous decoded `userId` to the `req.user.id` that the new controllers expect
        // If your JWT payload was { userId: "someId" }, then decoded.userId will exist.
        if (decoded && decoded.userId) {
            req.user = { id: decoded.userId }; // Set req.user.id for consistency with new controllers
        } else {
            console.error('Auth middleware: Decoded token payload does not contain expected "userId" property:', decoded);
            return res.status(401).json({ message: 'Invalid token payload structure' });
        }
        
        next(); // Proceed to the next middleware/route handler
    } catch (error) {
        console.error('Auth middleware verification error:', error.message);
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Token expired' });
        }
        res.status(401).json({ message: 'Token is not valid' });
    }
};

module.exports = auth;
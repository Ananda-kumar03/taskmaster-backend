const router = require('express').Router();
const auth = require('../middleware/auth');
const statsController = require('../controllers/statsController');

router.get('/reflection-summary', auth, statsController.getReflectionSummary);

module.exports = router;

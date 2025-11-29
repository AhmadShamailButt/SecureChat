const express = require('express');
const router = express.Router();
const callController = require('../controllers/callController');
const authMiddleware = require('../middleware/authMiddleware');

// Apply auth middleware to all routes
router.use(authMiddleware);

// Get call history
router.get('/history', callController.getCallHistory);

// Get specific call
router.get('/:callId', callController.getCallById);

// Delete call from history
router.delete('/:callId', callController.deleteCallHistory);

module.exports = router;





const express = require('express');
const userController = require('../controllers/userController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// PUT /api/users/public-key - Update public key (must come before /:id)
router.put('/public-key', authMiddleware, userController.updatePublicKey);

// GET /api/users/:id/public-key - Get user's public key (must come before /:id)
router.get('/:id/public-key', authMiddleware, userController.getPublicKey);

// GET /api/users/:id - Get user details (must come LAST)
router.get('/:id', authMiddleware, userController.getUserDetails);

module.exports = router;
const express = require('express');
const router  = express.Router();

const contactsController = require('../controllers/contactsController');
const messageController  = require('../controllers/messageController');
const userRoutes = require('./userRoutes');
const fileRoutes = require('./fileRoutes');
const authMiddleware = require('../middleware/authMiddleware');


// Apply auth middleware to all messaging routes
router.use('/messages', authMiddleware);

// User routes (includes public key endpoints)
router.use('/users', userRoutes);

// File upload routes
router.use('/files', fileRoutes);

// Contacts routes
router.get('/messages/contacts', contactsController.getContacts);

// Messages routes
router.get('/messages/:conversationId', messageController.getMessages);
router.post('/messages', messageController.postMessage);

// Create or get conversation
router.get('/messages/conversation/:userId', messageController.getOrCreateConversation);

module.exports = router;
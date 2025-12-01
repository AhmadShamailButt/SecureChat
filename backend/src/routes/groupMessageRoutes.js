const express = require("express");
const router = express.Router();
const groupMessageController = require("../controllers/groupMessageController");

// Group message routes
router.post("/:groupId/messages", groupMessageController.sendGroupMessage);
router.get("/:groupId/messages", groupMessageController.getGroupMessages);

// Group key management routes
router.post("/:groupId/keys", groupMessageController.storeGroupKey);
router.get("/:groupId/keys/:userId", groupMessageController.getGroupKey);

// Read receipts
router.post("/:groupId/messages/:messageId/read", groupMessageController.markMessageAsRead);

module.exports = router;

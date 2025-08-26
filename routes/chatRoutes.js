// routes/chatRoutes.js - Buyer-Seller Messaging Routes
const express = require("express");
const router = express.Router();

const {
  getConversations,
  getConversationMessages,
  startConversation,
  sendMessage,
  markConversationAsRead,
  deleteConversation,
  getConversationDetails,
} = require("../controllers/chatController");
const { authenticateToken } = require("../middleware/auth");

router.use(authenticateToken);

// Middleware for request validation
const validatePagination = (req, res, next) => {
  const { page = 1, limit = 20 } = req.query;

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);

  if (isNaN(pageNum) || pageNum < 1) {
    return res.status(400).json({
      success: false,
      message: "Invalid page number",
    });
  }

  if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
    return res.status(400).json({
      success: false,
      message: "Invalid limit. Must be between 1 and 100",
    });
  }

  req.query.page = pageNum;
  req.query.limit = limitNum;
  next();
};

const validateObjectId = (paramName) => (req, res, next) => {
  const id = req.params[paramName];
  if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
    return res.status(400).json({
      success: false,
      message: `Invalid ${paramName} format`,
    });
  }
  next();
};

const validateMessageContent = (req, res, next) => {
  const { messageType = "text", content } = req.body;

  if (!content) {
    return res.status(400).json({
      success: false,
      message: "Message content is required",
    });
  }

  // Basic validation for different message types
  switch (messageType) {
    case "text":
      if (!content.text || content.text.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: "Text content is required for text messages",
        });
      }
      if (content.text.length > 1000) {
        return res.status(400).json({
          success: false,
          message: "Text message too long (max 1000 characters)",
        });
      }
      break;

    case "image":
      if (
        !content.images ||
        !Array.isArray(content.images) ||
        content.images.length === 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Images are required for image messages",
        });
      }
      if (content.images.length > 10) {
        return res.status(400).json({
          success: false,
          message: "Too many images (max 10)",
        });
      }
      break;

    case "file":
      if (
        !content.files ||
        !Array.isArray(content.files) ||
        content.files.length === 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Files are required for file messages",
        });
      }
      if (content.files.length > 5) {
        return res.status(400).json({
          success: false,
          message: "Too many files (max 5)",
        });
      }
      break;

    case "offer":
      if (!content.offer || !content.offer.amount || !content.offer.currency) {
        return res.status(400).json({
          success: false,
          message: "Offer amount and currency are required",
        });
      }
      if (isNaN(content.offer.amount) || content.offer.amount <= 0) {
        return res.status(400).json({
          success: false,
          message: "Invalid offer amount",
        });
      }
      break;
  }

  next();
};

// ============ CONVERSATION ROUTES ============

/**
 * @route   GET /api/chat/conversations
 * @desc    Get user's conversations
 * @access  Authenticated users (Buyer, Seller)
 * @query   page, limit, type (product_inquiry, general, all)
 */
router.get("/conversations", validatePagination, getConversations);

/**
 * @route   GET /api/chat/conversations/:id
 * @desc    Get conversation details
 * @access  Authenticated users (participants only)
 */
router.get(
  "/conversations/:id",
  validateObjectId("id"),
  getConversationDetails
);

/**
 * @route   GET /api/chat/conversations/:id/messages
 * @desc    Get conversation messages
 * @access  Authenticated users (participants only)
 * @query   page, limit
 */
router.get(
  "/conversations/:id/messages",
  validateObjectId("id"),
  validatePagination,
  getConversationMessages
);

/**
 * @route   POST /api/chat/conversations/start
 * @desc    Start new conversation (product inquiry)
 * @access  Authenticated users (primarily Buyers)
 * @body    { sellerId, productId?, message }
 */
router.post(
  "/conversations/start",
  (req, res, next) => {
    const { sellerId, message } = req.body;

    if (!sellerId || !/^[0-9a-fA-F]{24}$/.test(sellerId)) {
      return res.status(400).json({
        success: false,
        message: "Valid seller ID is required",
      });
    }

    if (!message || message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Message is required",
      });
    }

    if (message.length > 1000) {
      return res.status(400).json({
        success: false,
        message: "Message too long (max 1000 characters)",
      });
    }

    // Validate productId if provided
    if (req.body.productId && !/^[0-9a-fA-F]{24}$/.test(req.body.productId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID format",
      });
    }

    next();
  },
  startConversation
);

/**
 * @route   POST /api/chat/conversations/:id/messages
 * @desc    Send message to conversation
 * @access  Authenticated users (participants only)
 * @body    { messageType?, content, replyTo? }
 */
router.post(
  "/conversations/:id/messages",
  validateObjectId("id"),
  validateMessageContent,
  (req, res, next) => {
    // Validate replyTo if provided
    if (req.body.replyTo && !/^[0-9a-fA-F]{24}$/.test(req.body.replyTo)) {
      return res.status(400).json({
        success: false,
        message: "Invalid replyTo message ID format",
      });
    }
    next();
  },
  sendMessage
);

/**
 * @route   PUT /api/chat/conversations/:id/read
 * @desc    Mark conversation as read
 * @access  Authenticated users (participants only)
 */
router.put(
  "/conversations/:id/read",
  validateObjectId("id"),
  markConversationAsRead
);

/**
 * @route   DELETE /api/chat/conversations/:id
 * @desc    Delete conversation (soft delete)
 * @access  Authenticated users (participants only)
 */
router.delete("/conversations/:id", validateObjectId("id"), deleteConversation);

// ============ MESSAGE STATUS ROUTES ============

/**
 * @route   PUT /api/chat/messages/:id/delivered
 * @desc    Mark message as delivered
 * @access  Authenticated users
 */
router.put(
  "/messages/:id/delivered",
  validateObjectId("id"),
  async (req, res) => {
    try {
      const { id: messageId } = req.params;
      const { id: userId, role: userType } = req.user;

      const Message = require("../models/Message");

      // Update delivery status
      await Message.updateOne(
        {
          _id: messageId,
          "recipients.userId": userId,
          "recipients.userType": userType,
        },
        {
          $set: {
            "recipients.$.deliveredAt": new Date(),
          },
        }
      );

      // Emit socket event if available
      if (req.io) {
        const { handleMessageDelivered } = require("../utils/socketHelpers");
        handleMessageDelivered(req.io)(messageId, userId, userType);
      }

      res.json({
        success: true,
        message: "Message marked as delivered",
      });
    } catch (error) {
      console.error("Error marking message as delivered:", error);
      res.status(500).json({
        success: false,
        message: "Failed to mark message as delivered",
      });
    }
  }
);

/**
 * @route   PUT /api/chat/messages/:id/read
 * @desc    Mark specific message as read
 * @access  Authenticated users
 */
router.put("/messages/:id/read", validateObjectId("id"), async (req, res) => {
  try {
    const { id: messageId } = req.params;
    const { id: userId, role: userType } = req.user;

    const Message = require("../models/Message");

    // Get message to find conversation
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      });
    }

    // Update read status
    await Message.updateOne(
      {
        _id: messageId,
        "recipients.userId": userId,
        "recipients.userType": userType,
      },
      {
        $set: {
          "recipients.$.readAt": new Date(),
          status: "read",
        },
      }
    );

    // Emit socket event if available
    if (req.io) {
      const { handleMessageRead } = require("../utils/socketHelpers");
      handleMessageRead(req.io)(
        messageId,
        message.conversation,
        userId,
        userType
      );
    }

    res.json({
      success: true,
      message: "Message marked as read",
    });
  } catch (error) {
    console.error("Error marking message as read:", error);
    res.status(500).json({
      success: false,
      message: "Failed to mark message as read",
    });
  }
});

// ============ UTILITY ROUTES ============

/**
 * @route   GET /api/chat/stats
 * @desc    Get user's chat statistics
 * @access  Authenticated users
 */
router.get("/stats", async (req, res) => {
  try {
    const { id: userId, role: userType } = req.user;
    const Conversation = require("../models/Conversation");
    const Message = require("../models/Message");

    // Get conversation stats
    const totalConversations = await Conversation.countDocuments({
      "participants.user.userId": userId,
      "participants.user.userType": userType,
      "participants.isDeleted": false,
    });

    const activeConversations = await Conversation.countDocuments({
      "participants.user.userId": userId,
      "participants.user.userType": userType,
      "participants.isDeleted": false,
      status: "active",
    });

    // Get unread count
    const conversationsWithUnread = await Conversation.find({
      "participants.user.userId": userId,
      "participants.user.userType": userType,
      "participants.isDeleted": false,
    });

    const totalUnreadMessages = conversationsWithUnread.reduce(
      (total, conv) => {
        const participant = conv.participants.find(
          (p) =>
            p.user.userId.toString() === userId && p.user.userType === userType
        );
        return total + (participant ? participant.unreadCount : 0);
      },
      0
    );

    // Get sent messages count
    const sentMessages = await Message.countDocuments({
      "sender.userId": userId,
      "sender.userType": userType,
      isDeleted: false,
    });

    res.json({
      success: true,
      data: {
        totalConversations,
        activeConversations,
        totalUnreadMessages,
        sentMessages,
      },
    });
  } catch (error) {
    console.error("Error getting chat stats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get chat statistics",
    });
  }
});

// ============ ERROR HANDLING ============

// Handle 404 for chat routes
router.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: "Chat endpoint not found",
  });
});

module.exports = router;

const Product = require("../models/Product");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const Notification = require("../models/Notification");

const {
  createUserRef,
  isParticipant,
  getOtherParticipants,
  getParticipant,
  conversationExists,
  createParticipants,
  updateUnreadCount,
  resetUnreadCount,
  createRecipients,
  validateMessageContent,
  sanitizeContent,
  validateUser,
  validateProduct,
  createErrorResponse,
  createSuccessResponse,
  createPaginationInfo,
  calculateSkip,
  getUserNotificationChannels,
  getNotificationTemplate,
  pipeAsync,
} = require("../utils/fpHelpers");

const {
  deliverMessage,
  sendDirectNotification,
  handleMessageDelivered,
  handleMessageRead,
  handleConversationRead,
} = require("../utils/socketHelpers");
const { default: mongoose } = require("mongoose");

// ============ PURE BUSINESS LOGIC FUNCTIONS ============

/**
 * Validate conversation access
 */
const validateConversationAccess = async (conversationId, userId, userType) => {
  const conversation = await Conversation.findById(conversationId)
    .populate("product", "title status seller")
    .populate({
      path: "participants.user.userId",
      select: "firstName lastName businessInfo.businessName avatar",
    });

  if (!conversation) {
    return {
      valid: false,
      error: createErrorResponse("Conversation not found", 404),
    };
  }

  console.log(conversation, userId, userType);

  if (!isParticipant(userId, userType)(conversation)) {
    return {
      valid: false,
      error: createErrorResponse("Access denied to this conversation", 403),
    };
  }

  return { valid: true, conversation };
};

/**
 * Validate users for conversation
 */
const validateConversationUsers = async (
  buyerId,
  sellerId,
  productId = null
) => {
  // Validate buyer
  const buyerValid = await validateUser("Buyer", buyerId);
  if (!buyerValid) {
    return { valid: false, error: createErrorResponse("Invalid buyer", 400) };
  }

  // Validate seller
  const sellerValid = await validateUser("Seller", sellerId);
  if (!sellerValid) {
    return { valid: false, error: createErrorResponse("Invalid seller", 400) };
  }

  // Validate product if provided
  if (productId) {
    const productValid = await validateProduct(productId, Product);
    if (!productValid) {
      return {
        valid: false,
        error: createErrorResponse("Product not found or not available", 404),
      };
    }
  }

  // Check if users are trying to message themselves
  if (buyerId === sellerId) {
    return {
      valid: false,
      error: createErrorResponse(
        "Cannot start conversation with yourself",
        400
      ),
    };
  }

  return { valid: true };
};

/**
 * Create or get existing conversation
 */
const getOrCreateConversation = async (
  buyerId,
  sellerId,
  productId,
  messageContent
) => {
  const participants = [
    { userType: "Buyer", userId: buyerId },
    { userType: "Seller", userId: sellerId },
  ];

  // Check if conversation exists
  let conversation = await conversationExists(
    participants,
    productId
  )(Conversation);

  if (!conversation) {
    // Create new conversation
    const conversationData = {
      participants: createParticipants(participants),
      type: productId ? "product_inquiry" : "general",
      status: "active",
    };

    if (productId) {
      conversationData.product = productId;
    }

    conversation = await Conversation.create(conversationData);
  }

  return conversation;
};

/**
 * Create and save message
 */
const createMessage = async (
  conversationId,
  senderId,
  senderType,
  messageType,
  content,
  replyTo = null
) => {
  const conversation = await Conversation.findById(conversationId);
  const recipients = createRecipients(senderId, senderType)(conversation);

  const messageData = {
    conversation: conversationId,
    sender: createUserRef(senderType, senderId),
    recipients: recipients,
    messageType,
    content: sanitizeContent(messageType, content),
    status: "sent",
  };

  if (replyTo) {
    messageData.replyTo = replyTo;
  }

  const message = await Message.create(messageData);

  // Populate sender info
  await message.populate(
    "sender.userId",
    "firstName lastName businessInfo.businessName avatar"
  );

  return message;
};

/**
 * Update conversation after new message
 */
const updateConversationAfterMessage = async (
  conversationId,
  messageId,
  senderId,
  senderType
) => {
  const conversation = await Conversation.findById(conversationId);

  // Update last message and activity
  conversation.lastMessage = messageId;
  conversation.lastActivity = new Date();

  // Increment unread count for recipients
  const otherParticipants = getOtherParticipants(
    senderId,
    senderType
  )(conversation);
  otherParticipants.forEach((participant) => {
    const participantIndex = conversation.participants.findIndex(
      (p) =>
        p.user.userId.toString() === participant.user.userId.toString() &&
        p.user.userType === participant.user.userType
    );

    if (participantIndex !== -1) {
      conversation.participants[participantIndex].unreadCount += 1;
    }
  });

  await conversation.save();
  return conversation;
};

/**
 * Create notifications for message recipients
 */
const createMessageNotifications = async (message, io) => {
  const { recipients, sender, conversation } = message;

  for (const recipient of recipients) {
    try {
      // Get notification preferences
      const channels = await getUserNotificationChannels(
        recipient.userType,
        recipient.userId
      );

      // Get notification template
      const template = getNotificationTemplate("message", recipient.userType, {
        senderName:
          sender.userId?.firstName ||
          sender.userId?.businessInfo?.businessName ||
          "User",
      });

      // Create notification
      const notification = await Notification.create({
        recipient: {
          userType: recipient.userType,
          userId: recipient.userId,
        },
        type: "message",
        template: template.template,
        title: template.title,
        message: template.message,
        data: {
          conversationId: conversation,
          messageId: message._id,
          senderId: sender.userId,
          senderType: sender.userType,
        },
        channels,
        priority: "medium",
        relatedEntities: [
          { entityType: "Conversation", entityId: conversation },
          { entityType: "Message", entityId: message._id },
        ],
      });

      // Send real-time notification
      if (io) {
        sendDirectNotification(io)(
          recipient.userType,
          recipient.userId,
          notification
        );
      }
    } catch (error) {
      console.error("Error creating notification:", error);
    }
  }
};

function capitalizeFirstLetter(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ============ CONTROLLER FUNCTIONS ============

/**
 * Get user's conversations
 */
const getConversations = async (req, res) => {
  try {
    const { id: userId, userType } = req.user;
    const { page = 1, limit = 20, type = "all" } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = calculateSkip(pageNum, limitNum);

    // Build query
    const query = {
      "participants.user.userId": userId,
      "participants.user.userType": capitalizeFirstLetter(userType),
      "participants.isDeleted": false,
    };

    console.log(query);

    if (type !== "all") {
      query.type = type;
    }

    // Get conversations
    const conversations = await Conversation.find(query)
      .populate("lastMessage")
      .populate("product", "title media.images status")
      .populate({
        path: "participants.user.userId",
        select: "firstName lastName businessInfo.businessName avatar",
      })
      .sort({ lastActivity: -1 })
      .skip(skip)
      .limit(limitNum);

    // Add unread count for current user
    const conversationsWithUnread = conversations.map((conv) => {
      const participant = getParticipant(userId, userType)(conv);
      return {
        ...conv.toObject(),
        unreadCount: participant ? participant.unreadCount : 0,
      };
    });

    const totalConversations = await Conversation.countDocuments(query);

    res.json(
      createSuccessResponse(
        {
          conversations: conversationsWithUnread,
          pagination: createPaginationInfo(
            pageNum,
            limitNum,
            totalConversations
          ),
        },
        "Conversations retrieved successfully"
      )
    );
  } catch (error) {
    console.error("Error getting conversations:", error);
    res
      .status(500)
      .json(createErrorResponse("Failed to get conversations", 500));
  }
};

/**
 * Get conversation messages
 */
const getConversationMessages = async (req, res) => {
  try {
    const { id: conversationId } = req.params;
    const { id: userId, role: userType } = req.user;
    const { page = 1, limit = 50 } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = calculateSkip(pageNum, limitNum);

    // ✅ Get conversation with participants
    const conversation = await Conversation.findById(conversationId)
      .populate("product")
      .lean();

    if (!conversation) {
      return res
        .status(404)
        .json(createErrorResponse("Conversation not found", 404));
    }

    // ✅ Find the other participant
    const otherParticipantData = conversation.participants.find(
      (p) =>
        p.user.userId.toString() !== userId.toString() &&
        p.user.userType.toLowerCase() !== userType.toLowerCase()
    );

    let otherParticipant = null;

    if (otherParticipantData) {
      // ✅ Dynamically populate based on userType
      otherParticipant = await mongoose
        .model(otherParticipantData.user.userType)
        .findById(
          otherParticipantData.user.userId,
          "firstName lastName role avatar"
        )
        .exec();
    }

    console.log(otherParticipant, otherParticipantData);

    // ✅ Get messages
    const messages = await Message.find({
      conversation: conversationId,
      isDeleted: false,
    })
      .populate(
        "sender.userId",
        "firstName lastName businessInfo.businessName avatar"
      )
      .populate("replyTo")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const totalMessages = await Message.countDocuments({
      conversation: conversationId,
      isDeleted: false,
    });

    // ✅ Mark messages as read and reset unread count
    await pipeAsync(
      async () => {
        await Message.updateMany(
          {
            conversation: conversationId,
            "recipients.userId": userId,
            "recipients.userType": userType,
            "recipients.readAt": { $exists: false },
          },
          {
            $set: {
              "recipients.$.readAt": new Date(),
              status: "read",
            },
          }
        );
      },
      async () => {
        await Conversation.findOneAndUpdate(
          {
            _id: conversationId,
            "participants.user.userId": userId,
            "participants.user.userType": userType,
          },
          {
            $set: {
              "participants.$.unreadCount": 0,
              "participants.$.lastRead": new Date(),
            },
          }
        );
      }
    )();

    res.json(
      createSuccessResponse(
        {
          otherParticipant,
          product: conversation.product || null,
          messages: messages.reverse(), // Show oldest first
          pagination: createPaginationInfo(pageNum, limitNum, totalMessages),
        },
        "Messages retrieved successfully"
      )
    );
  } catch (error) {
    console.error("Error getting conversation messages:", error);
    res.status(500).json(createErrorResponse("Failed to get messages", 500));
  }
};

/**
 * Start new conversation
 */
const startConversation = async (req, res) => {
  try {
    const { productId, sellerId, message } = req.body;
    const { id: buyerId, role: userType } = req.user;

    // Validation
    if (!sellerId || !message) {
      return res
        .status(400)
        .json(createErrorResponse("Seller ID and message are required"));
    }

    if (userType.toLowerCase() !== "buyer") {
      return res
        .status(403)
        .json(
          createErrorResponse("Only buyers can start product conversations")
        );
    }

    // Validate users and product
    const { valid, error } = await validateConversationUsers(
      buyerId,
      sellerId,
      productId
    );
    if (!valid) {
      return res.status(error.statusCode).json(error);
    }

    // Create or get conversation
    const conversation = await getOrCreateConversation(
      buyerId,
      sellerId,
      productId,
      message
    );

    // Create message
    const newMessage = await createMessage(
      conversation._id,
      buyerId,
      "Buyer",
      "text",
      { text: message }
    );

    // Update conversation
    await updateConversationAfterMessage(
      conversation._id,
      newMessage._id,
      buyerId,
      "Buyer"
    );

    // Create notifications
    await createMessageNotifications(newMessage, req.io);

    // Deliver message via socket
    if (req.io) {
      deliverMessage(req.io)(newMessage, conversation._id);
    }

    // Update product inquiry stats
    if (productId) {
      await Product.findByIdAndUpdate(productId, {
        $inc: { "stats.inquiries": 1 },
      });
    }

    res.status(201).json(
      createSuccessResponse(
        {
          conversation: conversation._id,
          message: newMessage,
        },
        "Conversation started successfully"
      )
    );
  } catch (error) {
    console.error("Error starting conversation:", error);
    res
      .status(500)
      .json(createErrorResponse("Failed to start conversation", 500));
  }
};

/**
 * Send message
 */
const sendMessage = async (req, res) => {
  try {
    const { id: conversationId } = req.params;
    const { messageType = "text", content, replyTo } = req.body;
    const { id: senderId, role: senderType } = req.user;

    // Validate access
    // const { valid, error } = await validateConversationAccess(
    //   conversationId,
    //   senderId,
    //   senderType
    // );
    // if (!valid) {
    //   return res.status(error.statusCode).json(error);
    // }

    // Validate message content
    if (!validateMessageContent(messageType, content)) {
      return res
        .status(400)
        .json(
          createErrorResponse(
            "Invalid message content for type: " + messageType
          )
        );
    }

    // Create message
    const newMessage = await createMessage(
      conversationId,
      senderId,
      senderType,
      messageType,
      content,
      replyTo
    );

    // Update conversation
    await updateConversationAfterMessage(
      conversationId,
      newMessage._id,
      senderId,
      senderType
    );

    // Create notifications
    await createMessageNotifications(newMessage, req.io);

    // Deliver message via socket
    if (req.io) {
      deliverMessage(req.io)(newMessage, conversationId);
    }

    res.status(201).json(
      createSuccessResponse(
        {
          message: newMessage,
        },
        "Message sent successfully"
      )
    );
  } catch (error) {
    console.error("Error sending message:", error);
    res.status(500).json(createErrorResponse("Failed to send message", 500));
  }
};

/**
 * Mark conversation as read
 */
const markConversationAsRead = async (req, res) => {
  try {
    const { id: conversationId } = req.params;
    const { id: userId, role: userType } = req.user;

    // Validate access
    const { valid, error } = await validateConversationAccess(
      conversationId,
      userId,
      userType
    );
    if (!valid) {
      return res.status(error.statusCode).json(error);
    }

    // Update message read status and conversation unread count
    await pipeAsync(
      async () => {
        await Message.updateMany(
          {
            conversation: conversationId,
            "recipients.userId": userId,
            "recipients.userType": userType,
            "recipients.readAt": { $exists: false },
          },
          {
            $set: {
              "recipients.$.readAt": new Date(),
              status: "read",
            },
          }
        );
      },
      async () => {
        await Conversation.findOneAndUpdate(
          {
            _id: conversationId,
            "participants.user.userId": userId,
            "participants.user.userType": userType,
          },
          {
            $set: {
              "participants.$.unreadCount": 0,
              "participants.$.lastRead": new Date(),
            },
          }
        );
      }
    )();

    // Emit read status via socket
    if (req.io) {
      handleConversationRead(req.io)(conversationId, userId, userType);
    }

    res.json(createSuccessResponse({}, "Conversation marked as read"));
  } catch (error) {
    console.error("Error marking conversation as read:", error);
    res
      .status(500)
      .json(createErrorResponse("Failed to mark conversation as read", 500));
  }
};

/**
 * Delete conversation (soft delete)
 */
const deleteConversation = async (req, res) => {
  try {
    const { id: conversationId } = req.params;
    const { id: userId, role: userType } = req.user;

    const conversation = await Conversation.findOneAndUpdate(
      {
        _id: conversationId,
        "participants.user.userId": userId,
        "participants.user.userType": userType,
      },
      { $set: { "participants.$.isDeleted": true } },
      { new: true }
    );

    if (!conversation) {
      return res
        .status(404)
        .json(
          createErrorResponse("Conversation not found or access denied", 404)
        );
    }

    res.json(createSuccessResponse({}, "Conversation deleted successfully"));
  } catch (error) {
    console.error("Error deleting conversation:", error);
    res
      .status(500)
      .json(createErrorResponse("Failed to delete conversation", 500));
  }
};

/**
 * Get conversation details
 */
const getConversationDetails = async (req, res) => {
  try {
    const { id: conversationId } = req.params;
    const { id: userId, role: userType } = req.user;

    const { valid, error, conversation } = await validateConversationAccess(
      conversationId,
      userId,
      userType
    );
    if (!valid) {
      return res.status(error.statusCode).json(error);
    }

    const participant = getParticipant(userId, userType)(conversation);
    const conversationData = {
      ...conversation.toObject(),
      unreadCount: participant ? participant.unreadCount : 0,
    };

    res.json(
      createSuccessResponse(
        {
          conversation: conversationData,
        },
        "Conversation details retrieved successfully"
      )
    );
  } catch (error) {
    console.error("Error getting conversation details:", error);
    res
      .status(500)
      .json(createErrorResponse("Failed to get conversation details", 500));
  }
};

module.exports = {
  getConversations,
  getConversationMessages,
  startConversation,
  sendMessage,
  markConversationAsRead,
  deleteConversation,
  getConversationDetails,
};

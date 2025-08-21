const Admin = require("../models/Admin");
const Buyer = require("../models/Buyer");
const Seller = require("../models/Seller");

/**
 * Get user model based on userType
 */
const getUserModel = (userType) => {
  const models = {
    Buyer: Buyer,
    Seller: Seller,
    Admin: Admin,
  };
  return models[userType];
};

/**
 * Create polymorphic user reference
 */
const createUserRef = (userType, userId) => ({
  userType,
  userId,
});

/**
 * Extract user info from polymorphic reference
 */
const extractUserInfo = (userRef) => ({
  userType: userRef.userType,
  userId: userRef.userId,
});

/**
 * Check if user is participant in conversation
 */
const isParticipant = (userId, userType) => (conversation) => {
  return conversation.participants.some(
    (p) =>
      p.user.userId.toString() === userId.toString() &&
      p.user.userType === userType &&
      !p.isDeleted
  );
};

/**
 * Get other participants (excluding current user)
 */
const getOtherParticipants =
  (currentUserId, currentUserType) => (conversation) => {
    return conversation.participants.filter(
      (p) =>
        !(
          p.user.userId.toString() === currentUserId.toString() &&
          p.user.userType === currentUserType
        ) && !p.isDeleted
    );
  };

/**
 * Get participant by user reference
 */
const getParticipant = (userId, userType) => (conversation) => {
  return conversation.participants.find(
    (p) =>
      p.user.userId.toString() === userId.toString() &&
      p.user.userType === userType
  );
};

// ============ CONVERSATION UTILITIES ============

/**
 * Check if conversation exists between users
 */
const conversationExists =
  (participants, productId = null) =>
  async (ConversationModel) => {
    const query = {
      "participants.user.userId": {
        $all: participants.map((p) => p.userId),
      },
      "participants.isDeleted": false,
    };

    if (productId) {
      query.product = productId;
    }

    return await ConversationModel.findOne(query);
  };

/**
 * Create conversation participants array
 */
const createParticipants = (users) => {
  return users.map((user) => ({
    user: createUserRef(user.userType, user.userId),
    unreadCount: 0,
    isDeleted: false,
    joinedAt: new Date(),
  }));
};

/**
 * Update unread count for participant
 */
const updateUnreadCount =
  (userId, userType, increment = 1) =>
  (conversation) => {
    const participant = getParticipant(userId, userType)(conversation);
    if (participant) {
      participant.unreadCount += increment;
      participant.lastRead = new Date();
    }
    return conversation;
  };

/**
 * Reset unread count for participant
 */
const resetUnreadCount = (userId, userType) => (conversation) => {
  const participant = getParticipant(userId, userType)(conversation);
  if (participant) {
    participant.unreadCount = 0;
    participant.lastRead = new Date();
  }
  return conversation;
};

// ============ MESSAGE UTILITIES ============

/**
 * Create message recipients from conversation participants
 */
const createRecipients = (senderId, senderType) => (conversation) => {
  return getOtherParticipants(
    senderId,
    senderType
  )(conversation).map((p) => ({
    userType: p.user.userType,
    userId: p.user.userId,
  }));
};

/**
 * Validate message content based on type
 */
const validateMessageContent = (messageType, content) => {
  const validators = {
    text: (content) => content?.text && content.text.trim().length > 0,
    image: (content) =>
      content?.images &&
      Array.isArray(content.images) &&
      content.images.length > 0,
    file: (content) =>
      content?.files &&
      Array.isArray(content.files) &&
      content.files.length > 0,
    location: (content) => content?.location && content.location.coordinates,
    offer: (content) =>
      content?.offer && content.offer.amount && content.offer.currency,
    system: (content) => content?.system && content.system.type,
  };

  const validator = validators[messageType];
  return validator ? validator(content) : false;
};

/**
 * Sanitize message content
 */
const sanitizeContent = (messageType, content) => {
  const sanitizers = {
    text: (content) => ({
      text: content.text.trim().substring(0, 1000), // Limit text length
    }),
    image: (content) => ({
      images: content.images.map((img) => ({
        url: img.url,
        publicId: img.publicId,
        alt: img.alt || "Message image",
        size: img.size || 0,
      })),
    }),
    file: (content) => ({
      files: content.files.map((file) => ({
        url: file.url,
        name: file.name,
        size: file.size,
        type: file.type,
        publicId: file.publicId,
      })),
    }),
    location: (content) => ({
      location: {
        coordinates: content.location.coordinates,
        address: content.location.address || "",
      },
    }),
    offer: (content) => ({
      offer: {
        amount: parseFloat(content.offer.amount),
        currency: content.offer.currency,
        description: content.offer.description || "",
        expiresAt:
          content.offer.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours default
        status: "pending",
      },
    }),
    system: (content) => content,
  };

  const sanitizer = sanitizers[messageType];
  return sanitizer ? sanitizer(content) : content;
};

// ============ SUPPORT TICKET UTILITIES ============

/**
 * Generate ticket number
 */
const generateTicketNumber = async (SupportTicketModel) => {
  const count = await SupportTicketModel.countDocuments();
  return `TKT-${String(count + 1).padStart(6, "0")}`;
};

/**
 * Assign ticket to admin based on category
 */
const getAdminByCategory = (category) => {
  const categoryAssignments = {
    technical_issue: "tech",
    account_verification: "customer_support",
    payment_dispute: "finance",
    business_inquiry: "business_development",
    product_issue: "customer_support",
    subscription_support: "customer_support",
    general_support: "customer_support",
    report_abuse: "content_moderation",
  };

  return categoryAssignments[category] || "customer_support";
};

/**
 * Calculate priority based on category and user type
 */
const calculatePriority = (category, userType, customPriority = null) => {
  if (customPriority) return customPriority;

  const urgentCategories = [
    "payment_dispute",
    "technical_issue",
    "report_abuse",
  ];
  const highCategories = ["account_verification", "business_inquiry"];

  if (urgentCategories.includes(category)) return "urgent";
  if (highCategories.includes(category)) return "high";

  return "medium";
};

// ============ NOTIFICATION UTILITIES ============

/**
 * Create notification template based on type and user role
 */
const getNotificationTemplate = (type, recipientType, data = {}) => {
  const templates = {
    message: {
      Buyer: {
        title: "New message from seller",
        template: "new_message_buyer",
        message: `You have a new message from ${data.senderName || "seller"}`,
      },
      Seller: {
        title: "New message from buyer",
        template: "new_message_seller",
        message: `You have a new message from ${data.senderName || "buyer"}`,
      },
      Admin: {
        title: "New message",
        template: "new_message_admin",
        message: `You have a new message from ${data.senderName || "user"}`,
      },
    },
    support_ticket: {
      Admin: {
        title: "New support ticket",
        template: "support_ticket_created",
        message: `New ${data.category || "support"} ticket: ${
          data.subject || "No subject"
        }`,
      },
      Seller: {
        title: "Support ticket created",
        template: "support_ticket_confirmation",
        message: `Your support ticket ${
          data.ticketNumber || ""
        } has been created`,
      },
    },
    support_response: {
      Seller: {
        title: "Support ticket update",
        template: "support_ticket_response",
        message: `You have a new response on ticket ${data.ticketNumber || ""}`,
      },
    },
  };

  return (
    templates[type]?.[recipientType] || {
      title: "Notification",
      template: "generic",
      message: "You have a new notification",
    }
  );
};

/**
 * Get user notification preferences
 */
const getUserNotificationChannels = async (userType, userId) => {
  const UserModel = getUserModel(userType);
  const user = await UserModel.findById(userId).select("preferences");

  if (!user || !user.preferences) return ["push"]; // Default to push only

  const channels = [];
  const prefs = user.preferences.notifications || user.preferences;

  if (prefs.push?.newMessage !== false) channels.push("push");
  if (prefs.email?.newMessage !== false || prefs.emailNotifications !== false)
    channels.push("email");
  if (prefs.sms?.newMessage !== false) channels.push("sms");

  return channels.length > 0 ? channels : ["push"];
};

// ============ VALIDATION UTILITIES ============

/**
 * Validate user existence
 */
const validateUser = async (userType, userId) => {
  const UserModel = getUserModel(userType);
  if (!UserModel) return false;

  const user = await UserModel.findById(userId).select("isActive status");
  return (
    user &&
    user.isActive &&
    (user.status === "active" || user.status === "pending")
  );
};

/**
 * Validate product existence and status
 */
const validateProduct = async (productId, ProductModel) => {
  if (!productId) return true; // Product is optional

  const product = await ProductModel.findById(productId).select(
    "status seller"
  );
  return product && product.status === "active";
};

// ============ ERROR HANDLING UTILITIES ============

/**
 * Create standardized error response
 */
const createErrorResponse = (message, statusCode = 400, details = null) => ({
  success: false,
  message,
  statusCode,
  details,
  timestamp: new Date().toISOString(),
});

/**
 * Create standardized success response
 */
const createSuccessResponse = (data, message = "Success", meta = {}) => ({
  success: true,
  message,
  data,
  meta,
  timestamp: new Date().toISOString(),
});

// ============ PAGINATION UTILITIES ============

/**
 * Create pagination info
 */
const createPaginationInfo = (page, limit, total) => ({
  currentPage: parseInt(page),
  totalPages: Math.ceil(total / limit),
  totalItems: total,
  itemsPerPage: parseInt(limit),
  hasNext: parseInt(page) < Math.ceil(total / limit),
  hasPrev: parseInt(page) > 1,
});

/**
 * Calculate skip value for pagination
 */
const calculateSkip = (page, limit) => (parseInt(page) - 1) * parseInt(limit);

// ============ COMPOSE UTILITIES ============

/**
 * Compose functions (right to left)
 */
const compose =
  (...fns) =>
  (value) =>
    fns.reduceRight((acc, fn) => fn(acc), value);

/**
 * Pipe functions (left to right)
 */
const pipe =
  (...fns) =>
  (value) =>
    fns.reduce((acc, fn) => fn(acc), value);

/**
 * Async compose
 */
const composeAsync =
  (...fns) =>
  (value) =>
    fns.reduceRight((acc, fn) => acc.then(fn), Promise.resolve(value));

/**
 * Async pipe
 */
const pipeAsync =
  (...fns) =>
  (value) =>
    fns.reduce((acc, fn) => acc.then(fn), Promise.resolve(value));

module.exports = {
  // User utilities
  getUserModel,
  createUserRef,
  extractUserInfo,
  isParticipant,
  getOtherParticipants,
  getParticipant,

  // Conversation utilities
  conversationExists,
  createParticipants,
  updateUnreadCount,
  resetUnreadCount,

  // Message utilities
  createRecipients,
  validateMessageContent,
  sanitizeContent,

  // Support utilities
  generateTicketNumber,
  getAdminByCategory,
  calculatePriority,

  // Notification utilities
  getNotificationTemplate,
  getUserNotificationChannels,

  // Validation utilities
  validateUser,
  validateProduct,

  // Response utilities
  createErrorResponse,
  createSuccessResponse,

  // Pagination utilities
  createPaginationInfo,
  calculateSkip,

  // Functional composition
  compose,
  pipe,
  composeAsync,
  pipeAsync,
};

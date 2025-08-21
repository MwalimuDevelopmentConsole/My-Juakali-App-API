const  Admin  = require('../models/Admin');
const  Conversation  = require('../models/Conversation');
const  Message  = require('../models/Message');
const  SupportTicket  = require('../models/SupportTicket');
const  Notification  = require('../models/Notification');
const {
  createUserRef,
  isParticipant,
  getOtherParticipants,
  getParticipant,
  createParticipants,
  updateUnreadCount,
  resetUnreadCount,
  createRecipients,
  validateMessageContent,
  sanitizeContent,
  validateUser,
  generateTicketNumber,
  getAdminByCategory,
  calculatePriority,
  createErrorResponse,
  createSuccessResponse,
  createPaginationInfo,
  calculateSkip,
  getUserNotificationChannels,
  getNotificationTemplate,
  pipeAsync
} = require('../utils/fpHelpers');

const {
  deliverSupportMessage,
  sendDirectNotification,
  notifyAvailableAdmins,
  joinSupportRoom,
  leaveSupportRoom
} = require('../utils/socketHelpers');


/**
 * Find available admin for support category
 */
const findAvailableAdmin = async (category) => {
  const department = getAdminByCategory(category);
  
  // Find online admin in the department
  const availableAdmin = await Admin.findOne({
    department,
    isActive: true,
    status: 'active'
  }).sort({ 'activity.lastActive': -1 });

  return availableAdmin;
};

/**
 * Create support conversation
 */
const createSupportConversation = async (ticketId, requesterId, requesterType, adminId = null) => {
  const participants = [
    { userType: requesterType, userId: requesterId }
  ];

  if (adminId) {
    participants.push({ userType: 'Admin', userId: adminId });
  }

  const conversation = await Conversation.create({
    participants: createParticipants(participants),
    type: 'support',
    status: 'active',
    settings: {
      allowFileSharing: true,
      allowImageSharing: true,
      isTypingEnabled: true
    }
  });

  // Update ticket with conversation reference
  await SupportTicket.findByIdAndUpdate(ticketId, {
    conversation: conversation._id
  });

  return conversation;
};

/**
 * Auto-assign ticket to admin
 */
const autoAssignTicket = async (ticket) => {
  const availableAdmin = await findAvailableAdmin(ticket.category);
  
  if (availableAdmin) {
    ticket.assignedTo = {
      userType: 'Admin',
      userId: availableAdmin._id
    };
    ticket.status = 'in_progress';
    await ticket.save();

    // Add admin to conversation if it exists
    if (ticket.conversation) {
      await Conversation.findByIdAndUpdate(ticket.conversation, {
        $push: {
          participants: {
            user: createUserRef('Admin', availableAdmin._id),
            unreadCount: 1,
            isDeleted: false,
            joinedAt: new Date()
          }
        }
      });
    }

    return availableAdmin;
  }
  
  return null;
};

/**
 * Validate support ticket access
 */
const validateSupportTicketAccess = async (ticketId, userId, userType) => {
  const ticket = await SupportTicket.findById(ticketId)
    .populate('requester.userId', 'firstName lastName businessInfo.businessName')
    .populate('assignedTo.userId', 'firstName lastName department')
    .populate('conversation');

  if (!ticket) {
    return { valid: false, error: createErrorResponse('Support ticket not found', 404) };
  }

  // Check access permissions
  const hasAccess = 
    (ticket.requester.userId._id.toString() === userId && ticket.requester.userType === userType) ||
    (ticket.assignedTo?.userId?._id.toString() === userId && userType === 'Admin') ||
    (userType === 'Admin'); // All admins can access tickets

  if (!hasAccess) {
    return { valid: false, error: createErrorResponse('Access denied to this support ticket', 403) };
  }

  return { valid: true, ticket };
};

/**
 * Create support notifications
 */
const createSupportNotifications = async (ticket, type, additionalData = {}, io) => {
  const notifications = [];

  try {
    if (type === 'ticket_created') {
      // Notify assigned admin or all admins
      if (ticket.assignedTo?.userId) {
        const template = getNotificationTemplate('support_ticket', 'Admin', {
          category: ticket.category,
          subject: ticket.subject,
          ticketNumber: ticket.ticketNumber
        });

        const notification = await Notification.create({
          recipient: {
            userType: 'Admin',
            userId: ticket.assignedTo.userId
          },
          type: 'support_ticket',
          template: template.template,
          title: template.title,
          message: template.message,
          data: {
            ticketId: ticket._id,
            ticketNumber: ticket.ticketNumber,
            category: ticket.category,
            priority: ticket.priority
          },
          channels: ['push', 'email'],
          priority: ticket.priority,
          relatedEntities: [
            { entityType: 'SupportTicket', entityId: ticket._id }
          ]
        });

        if (io) {
          sendDirectNotification(io)('Admin', ticket.assignedTo.userId, notification);
        }
      } else {
        // Notify all available admins
        if (io) {
          notifyAvailableAdmins(io)(ticket, ticket.category);
        }
      }

      // Confirm to requester
      const requesterTemplate = getNotificationTemplate('support_ticket', ticket.requester.userType, {
        ticketNumber: ticket.ticketNumber
      });

      const requesterNotification = await Notification.create({
        recipient: {
          userType: ticket.requester.userType,
          userId: ticket.requester.userId
        },
        type: 'support_ticket',
        template: requesterTemplate.template,
        title: requesterTemplate.title,
        message: requesterTemplate.message,
        data: {
          ticketId: ticket._id,
          ticketNumber: ticket.ticketNumber
        },
        channels: ['push', 'email'],
        priority: 'medium'
      });

      if (io) {
        sendDirectNotification(io)(ticket.requester.userType, ticket.requester.userId, requesterNotification);
      }
    }

    if (type === 'message_received') {
      const { senderId, senderType, message } = additionalData;
      
      // Notify the other party
      const recipientType = senderType === 'Admin' ? ticket.requester.userType : 'Admin';
      const recipientId = senderType === 'Admin' ? ticket.requester.userId : ticket.assignedTo?.userId;

      if (recipientId) {
        const template = getNotificationTemplate('support_response', recipientType, {
          ticketNumber: ticket.ticketNumber,
          senderName: senderId?.firstName || 'Support'
        });

        const notification = await Notification.create({
          recipient: {
            userType: recipientType,
            userId: recipientId
          },
          type: 'support_response',
          template: template.template,
          title: template.title,
          message: template.message,
          data: {
            ticketId: ticket._id,
            ticketNumber: ticket.ticketNumber,
            messageId: message._id
          },
          channels: ['push', 'email'],
          priority: ticket.priority
        });

        if (io) {
          sendDirectNotification(io)(recipientType, recipientId, notification);
        }
      }
    }

  } catch (error) {
    console.error('Error creating support notifications:', error);
  }

  return notifications;
};

// ============ CONTROLLER FUNCTIONS ============

/**
 * Create support ticket
 */
const createSupportTicket = async (req, res) => {
  try {
    const { category, subject, description, priority, attachments = [] } = req.body;
    const { id: userId, role: userType } = req.user;

    // Validation
    if (!category || !subject || !description) {
      return res.status(400).json(createErrorResponse('Category, subject, and description are required'));
    }

    if (userType !== 'Seller' && userType !== 'Admin') {
      return res.status(403).json(createErrorResponse('Only sellers and admins can create support tickets'));
    }

    // Create ticket
    const ticketData = {
      requester: createUserRef(userType, userId),
      category,
      subject: subject.trim(),
      description: description.trim(),
      priority: calculatePriority(category, userType, priority),
      attachments
    };

    const ticket = await SupportTicket.create(ticketData);

    // Create support conversation
    const conversation = await createSupportConversation(ticket._id, userId, userType);

    // Auto-assign to available admin
    const assignedAdmin = await autoAssignTicket(ticket);

    // Create initial system message
    const systemMessage = await Message.create({
      conversation: conversation._id,
      sender: createUserRef('Admin', null), // System message
      recipients: [createUserRef(userType, userId)],
      messageType: 'system',
      content: {
        system: {
          type: 'conversation_created',
          data: {
            ticketNumber: ticket.ticketNumber,
            category: ticket.category,
            assignedAdmin: assignedAdmin ? assignedAdmin.fullName : null
          }
        }
      },
      status: 'delivered'
    });

    // Update conversation with first message
    conversation.lastMessage = systemMessage._id;
    conversation.lastActivity = new Date();
    await conversation.save();

    // Create notifications
    await createSupportNotifications(ticket, 'ticket_created', {}, req.io);

    res.status(201).json(createSuccessResponse({
      ticket: {
        ...ticket.toObject(),
        conversation: conversation._id
      },
      assignedAdmin: assignedAdmin ? {
        id: assignedAdmin._id,
        name: assignedAdmin.fullName,
        department: assignedAdmin.department
      } : null
    }, 'Support ticket created successfully'));

  } catch (error) {
    console.error('Error creating support ticket:', error);
    res.status(500).json(createErrorResponse('Failed to create support ticket', 500));
  }
};

/**
 * Get user's support tickets
 */
const getSupportTickets = async (req, res) => {
  try {
    const { id: userId, role: userType } = req.user;
    const { page = 1, limit = 20, status = 'all', category = 'all' } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = calculateSkip(pageNum, limitNum);

    // Build query based on user type
    let query = {};
    
    if (userType === 'Admin') {
      // Admins can see assigned tickets or all tickets
      const { assigned = 'assigned' } = req.query;
      if (assigned === 'assigned') {
        query['assignedTo.userId'] = userId;
      }
      // If 'all', no additional filter (admin sees all)
    } else {
      // Sellers see only their own tickets
      query = {
        'requester.userId': userId,
        'requester.userType': userType
      };
    }

    if (status !== 'all') {
      query.status = status;
    }

    if (category !== 'all') {
      query.category = category;
    }

    const tickets = await SupportTicket.find(query)
      .populate('requester.userId', 'firstName lastName businessInfo.businessName')
      .populate('assignedTo.userId', 'firstName lastName department')
      .populate('conversation', 'lastMessage lastActivity')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    const totalTickets = await SupportTicket.countDocuments(query);

    res.json(createSuccessResponse({
      tickets,
      pagination: createPaginationInfo(pageNum, limitNum, totalTickets)
    }, 'Support tickets retrieved successfully'));

  } catch (error) {
    console.error('Error getting support tickets:', error);
    res.status(500).json(createErrorResponse('Failed to get support tickets', 500));
  }
};

/**
 * Get support ticket details
 */
const getSupportTicketDetails = async (req, res) => {
  try {
    const { id: ticketId } = req.params;
    const { id: userId, role: userType } = req.user;

    const { valid, error, ticket } = await validateSupportTicketAccess(ticketId, userId, userType);
    if (!valid) {
      return res.status(error.statusCode).json(error);
    }

    res.json(createSuccessResponse({
      ticket
    }, 'Support ticket details retrieved successfully'));

  } catch (error) {
    console.error('Error getting support ticket details:', error);
    res.status(500).json(createErrorResponse('Failed to get support ticket details', 500));
  }
};

/**
 * Send support message
 */
const sendSupportMessage = async (req, res) => {
  try {
    const { id: ticketId } = req.params;
    const { messageType = 'text', content, isInternalNote = false } = req.body;
    const { id: senderId, role: senderType } = req.user;

    // Validate ticket access
    const { valid, error, ticket } = await validateSupportTicketAccess(ticketId, senderId, senderType);
    if (!valid) {
      return res.status(error.statusCode).json(error);
    }

    // Validate message content
    if (!validateMessageContent(messageType, content)) {
      return res.status(400).json(createErrorResponse('Invalid message content for type: ' + messageType));
    }

    // Handle internal notes (admin only)
    if (isInternalNote && senderType === 'Admin') {
      await SupportTicket.findByIdAndUpdate(ticketId, {
        $push: {
          internalNotes: {
            admin: senderId,
            note: content.text,
            createdAt: new Date()
          }
        }
      });

      return res.json(createSuccessResponse({}, 'Internal note added successfully'));
    }

    // Create or get conversation
    let conversation = ticket.conversation;
    if (!conversation) {
      conversation = await createSupportConversation(ticketId, ticket.requester.userId, ticket.requester.userType, 
        ticket.assignedTo?.userId);
    }

    // Determine recipients
    const conversationDoc = await Conversation.findById(conversation._id || conversation);
    const recipients = createRecipients(senderId, senderType)(conversationDoc);

    // Create message
    const messageData = {
      conversation: conversation._id || conversation,
      sender: createUserRef(senderType, senderId),
      recipients,
      messageType,
      content: sanitizeContent(messageType, content),
      status: 'sent'
    };

    const message = await Message.create(messageData);
    
    // Populate sender info
    await message.populate('sender.userId', 'firstName lastName businessInfo.businessName department');

    // Update conversation
    await Conversation.findByIdAndUpdate(conversation._id || conversation, {
      lastMessage: message._id,
      lastActivity: new Date(),
      $inc: {
        'participants.$[elem].unreadCount': 1
      }
    }, {
      arrayFilters: [{ 
        'elem.user.userId': { $ne: senderId },
        'elem.user.userType': { $ne: senderType }
      }]
    });

    // Update ticket status if needed
    if (ticket.status === 'open' || ticket.status === 'waiting_response') {
      ticket.status = senderType === 'Admin' ? 'waiting_response' : 'in_progress';
      await ticket.save();
    }

    // Create notifications
    await createSupportNotifications(ticket, 'message_received', {
      senderId: message.sender.userId,
      senderType,
      message
    }, req.io);

    // Deliver message via socket
    if (req.io) {
      deliverSupportMessage(req.io)(message, ticketId);
    }

    res.status(201).json(createSuccessResponse({
      message
    }, 'Support message sent successfully'));

  } catch (error) {
    console.error('Error sending support message:', error);
    res.status(500).json(createErrorResponse('Failed to send support message', 500));
  }
};

/**
 * Get support conversation messages
 */
const getSupportMessages = async (req, res) => {
  try {
    const { id: ticketId } = req.params;
    const { id: userId, role: userType } = req.user;
    const { page = 1, limit = 50, includeInternal = false } = req.query;

    // Validate access
    const { valid, error, ticket } = await validateSupportTicketAccess(ticketId, userId, userType);
    if (!valid) {
      return res.status(error.statusCode).json(error);
    }

    if (!ticket.conversation) {
      return res.json(createSuccessResponse({
        messages: [],
        internalNotes: [],
        pagination: createPaginationInfo(1, parseInt(limit), 0)
      }, 'No messages found'));
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = calculateSkip(pageNum, limitNum);

    // Get messages
    const messages = await Message.find({
      conversation: ticket.conversation,
      isDeleted: false
    })
    .populate('sender.userId', 'firstName lastName businessInfo.businessName department')
    .populate('replyTo')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limitNum);

    const totalMessages = await Message.countDocuments({
      conversation: ticket.conversation,
      isDeleted: false
    });

    // Get internal notes if requested and user is admin
    let internalNotes = [];
    if (includeInternal === 'true' && userType === 'Admin') {
      const ticketWithNotes = await SupportTicket.findById(ticketId)
        .populate('internalNotes.admin', 'firstName lastName');
      internalNotes = ticketWithNotes.internalNotes || [];
    }

    // Mark messages as read
    await Message.updateMany({
      conversation: ticket.conversation,
      'recipients.userId': userId,
      'recipients.userType': userType,
      'recipients.readAt': { $exists: false }
    }, {
      $set: {
        'recipients.$.readAt': new Date(),
        status: 'read'
      }
    });

    // Reset unread count
    await Conversation.findOneAndUpdate(
      { 
        _id: ticket.conversation,
        'participants.user.userId': userId,
        'participants.user.userType': userType
      },
      { 
        $set: { 
          'participants.$.unreadCount': 0,
          'participants.$.lastRead': new Date()
        }
      }
    );

    res.json(createSuccessResponse({
      messages: messages.reverse(),
      internalNotes,
      pagination: createPaginationInfo(pageNum, limitNum, totalMessages)
    }, 'Support messages retrieved successfully'));

  } catch (error) {
    console.error('Error getting support messages:', error);
    res.status(500).json(createErrorResponse('Failed to get support messages', 500));
  }
};

/**
 * Update ticket status
 */
const updateTicketStatus = async (req, res) => {
  try {
    const { id: ticketId } = req.params;
    const { status, resolutionNotes } = req.body;
    const { id: userId, role: userType } = req.user;

    // Only admins can update ticket status
    if (userType !== 'Admin') {
      return res.status(403).json(createErrorResponse('Only admins can update ticket status'));
    }

    const { valid, error, ticket } = await validateSupportTicketAccess(ticketId, userId, userType);
    if (!valid) {
      return res.status(error.statusCode).json(error);
    }

    ticket.status = status;

    if (status === 'resolved' && resolutionNotes) {
      ticket.resolution = {
        resolvedBy: userId,
        resolvedAt: new Date(),
        resolutionNotes
      };
      
      // Set auto-close date (7 days)
      ticket.autoCloseAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }

    await ticket.save();

    res.json(createSuccessResponse({
      ticket
    }, 'Ticket status updated successfully'));

  } catch (error) {
    console.error('Error updating ticket status:', error);
    res.status(500).json(createErrorResponse('Failed to update ticket status', 500));
  }
};

/**
 * Assign ticket to admin
 */
const assignTicket = async (req, res) => {
  try {
    const { id: ticketId } = req.params;
    const { adminId } = req.body;
    const { id: userId, role: userType } = req.user;

    // Only admins can assign tickets
    if (userType !== 'Admin') {
      return res.status(403).json(createErrorResponse('Only admins can assign tickets'));
    }

    // Validate admin exists
    const adminExists = await validateUser('Admin', adminId);
    if (!adminExists) {
      return res.status(400).json(createErrorResponse('Invalid admin ID'));
    }

    const { valid, error, ticket } = await validateSupportTicketAccess(ticketId, userId, userType);
    if (!valid) {
      return res.status(error.statusCode).json(error);
    }

    ticket.assignedTo = createUserRef('Admin', adminId);
    ticket.status = 'in_progress';
    await ticket.save();

    // Add admin to conversation if exists
    if (ticket.conversation) {
      await Conversation.findByIdAndUpdate(ticket.conversation, {
        $addToSet: {
          participants: {
            user: createUserRef('Admin', adminId),
            unreadCount: 0,
            isDeleted: false,
            joinedAt: new Date()
          }
        }
      });
    }

    res.json(createSuccessResponse({
      ticket
    }, 'Ticket assigned successfully'));

  } catch (error) {
    console.error('Error assigning ticket:', error);
    res.status(500).json(createErrorResponse('Failed to assign ticket', 500));
  }
};

module.exports = {
  createSupportTicket,
  getSupportTickets,
  getSupportTicketDetails,
  sendSupportMessage,
  getSupportMessages,
  updateTicketStatus,
  assignTicket
};
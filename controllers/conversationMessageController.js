const Message = require('../models/Message');
const Product = require('../models/Product');
const Conversation = require('../models/Conversation');

// @desc    Get user's conversations
// @route   GET /api/conversations
// @access  Authenticated users
const getConversations = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    const conversations = await Conversation.find({
      'participants.user': userId,
      'participants.isDeleted': false
    })
    .populate('lastMessage')
    .populate('product', 'title media.images')
    .populate({
      path: 'participants.user',
      select: 'firstName lastName businessInfo.businessName avatar'
    })
    .sort({ lastActivity: -1 })
    .skip(skip)
    .limit(limitNum);
    
    // Add unread count for each conversation
    const conversationsWithUnread = conversations.map(conv => {
      const participant = conv.participants.find(p => p.user._id.toString() === userId);
      return {
        ...conv.toObject(),
        unreadCount: participant ? participant.unreadCount : 0
      };
    });
    
    const totalConversations = await Conversation.countDocuments({
      'participants.user': userId,
      'participants.isDeleted': false
    });
    
    res.status(200).json({
      success: true,
      count: conversationsWithUnread.length,
      totalConversations,
      conversations: conversationsWithUnread,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalConversations / limitNum),
        hasNext: pageNum < Math.ceil(totalConversations / limitNum),
        hasPrev: pageNum > 1
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
};

// @desc    Get conversation messages
// @route   GET /api/conversations/:id/messages
// @access  Authenticated users (participants only)
const getConversationMessages = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const userId = req.user.id;
    
    // Verify user is participant
    const conversation = await Conversation.findOne({
      _id: id,
      'participants.user': userId
    });
    
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found or access denied'
      });
    }
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    const messages = await Message.find({
      conversation: id,
      isDeleted: false
    })
    .populate('sender', 'firstName lastName businessInfo.businessName avatar')
    .populate('replyTo')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limitNum);
    
    // Mark messages as read
    await Message.updateMany({
      conversation: id,
      recipient: userId,
      status: { $ne: 'read' }
    }, {
      status: 'read',
      readAt: new Date()
    });
    
    // Reset unread count for this user
    await Conversation.findOneAndUpdate(
      { _id: id, 'participants.user': userId },
      { $set: { 'participants.$.unreadCount': 0, 'participants.$.lastRead': new Date() } }
    );
    
    const totalMessages = await Message.countDocuments({
      conversation: id,
      isDeleted: false
    });
    
    res.status(200).json({
      success: true,
      count: messages.length,
      totalMessages,
      messages: messages.reverse(), // Reverse to show oldest first
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalMessages / limitNum),
        hasNext: pageNum < Math.ceil(totalMessages / limitNum),
        hasPrev: pageNum > 1
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
};

// @desc    Start conversation about a product
// @route   POST /api/conversations/start
// @access  Authenticated users
const startConversation = async (req, res) => {
  try {
    const { productId, message } = req.body;
    const buyerId = req.user.id;
    
    // Validation
    if (!productId || !message) {
      return res.status(400).json({
        success: false,
        message: 'Product ID and message are required'
      });
    }
    
    // Get product and seller
    const product = await Product.findById(productId).populate('seller');
    
    if (!product || product.status !== 'active') {
      return res.status(404).json({
        success: false,
        message: 'Product not found or not available'
      });
    }
    
    const sellerId = product.seller._id;
    
    // Check if user is trying to message themselves
    if (buyerId === sellerId.toString()) {
      return res.status(400).json({
        success: false,
        message: 'You cannot start a conversation with yourself'
      });
    }
    
    // Check if conversation already exists
    let conversation = await Conversation.findOne({
      product: productId,
      'participants.user': { $all: [buyerId, sellerId] }
    });
    
    if (!conversation) {
      // Create new conversation
      conversation = await Conversation.create({
        participants: [
          { user: buyerId, unreadCount: 0 },
          { user: sellerId, unreadCount: 1 }
        ],
        product: productId,
        type: 'product_inquiry'
      });
    }
    
    // Create message
    const newMessage = await Message.create({
      conversation: conversation._id,
      sender: buyerId,
      recipient: sellerId,
      messageType: 'text',
      content: { text: message },
      relatedProduct: productId
    });
    
    // Update conversation
    conversation.lastMessage = newMessage._id;
    conversation.lastActivity = new Date();
    
    // Increment unread count for recipient
    const recipientIndex = conversation.participants.findIndex(p => p.user.toString() === sellerId.toString());
    if (recipientIndex !== -1) {
      conversation.participants[recipientIndex].unreadCount += 1;
    }
    
    await conversation.save();
    
    // Increment product inquiry count
    await Product.findByIdAndUpdate(productId, {
      $inc: { 'stats.inquiries': 1 }
    });
    
    await newMessage.populate('sender', 'firstName lastName');
    
    res.status(201).json({
      success: true,
      message: 'Conversation started successfully',
      conversation: conversation._id,
      messageData: newMessage
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
};

// @desc    Send message
// @route   POST /api/conversations/:id/messages
// @access  Authenticated users (participants only)
const sendMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { messageType = 'text', content, replyTo } = req.body;
    const senderId = req.user.id;
    
    // Verify conversation exists and user is participant
    const conversation = await Conversation.findOne({
      _id: id,
      'participants.user': senderId
    });
    
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found or access denied'
      });
    }
    
    // Get recipient
    const recipient = conversation.participants.find(p => p.user.toString() !== senderId);
    
    if (!recipient) {
      return res.status(400).json({
        success: false,
        message: 'Recipient not found'
      });
    }
    
    // Validate message content
    if (messageType === 'text' && !content?.text) {
      return res.status(400).json({
        success: false,
        message: 'Text message content is required'
      });
    }
    
    // Handle file uploads for image messages
    let messageContent = content;
    if (messageType === 'image' && req.files && req.files.length > 0) {
      const images = [];
      for (const file of req.files) {
        const result = await cloudinary.uploader.upload(file.path, {
          folder: 'myjuakali/messages',
          transformation: [
            { width: 800, height: 600, crop: 'limit' },
            { quality: 'auto:good' }
          ]
        });
        
        images.push({
          url: result.secure_url,
          publicId: result.public_id,
          alt: 'Message image'
        });
      }
      messageContent = { images };
    }
    
    // Create message
    const newMessage = await Message.create({
      conversation: id,
      sender: senderId,
      recipient: recipient.user,
      messageType,
      content: messageContent,
      replyTo: replyTo || undefined
    });
    
    // Update conversation
    conversation.lastMessage = newMessage._id;
    conversation.lastActivity = new Date();
    
    // Increment unread count for recipient
    const recipientIndex = conversation.participants.findIndex(p => p.user.toString() === recipient.user.toString());
    if (recipientIndex !== -1) {
      conversation.participants[recipientIndex].unreadCount += 1;
    }
    
    await conversation.save();
    
    await newMessage.populate('sender', 'firstName lastName businessInfo.businessName avatar');
    
    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      messageData: newMessage
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
};

// @desc    Delete conversation
// @route   DELETE /api/conversations/:id
// @access  Authenticated users (participants only)
const deleteConversation = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    const conversation = await Conversation.findOneAndUpdate(
      { _id: id, 'participants.user': userId },
      { $set: { 'participants.$.isDeleted': true } },
      { new: true }
    );
    
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found or access denied'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Conversation deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
};

module.exports = {
  getConversations,
  getConversationMessages,
  startConversation,
  sendMessage,
  deleteConversation
};

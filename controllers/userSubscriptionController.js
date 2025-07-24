const Commission = require("../models/Commission")
const Marketer = require("../models/Marketer")
const Seller = require("../models/Seller")
const SubscriptionPlan = require("../models/SubscriptionPlan")
const UserSubscription = require("../models/UserSubscription")

// @desc    Get user's current subscription
// @route   GET /api/subscriptions/current
// @access  Seller/Marketer only
const getCurrentSubscription = async (req, res) => {
  try {
    const userId = req.user.id;
    const userType = req.user.userType;
    
    if (!['seller', 'marketer'].includes(userType)) {
      return res.status(403).json({
        success: false,
        message: 'Only sellers and marketers can have subscriptions'
      });
    }
    
    const subscription = await UserSubscription.findOne({
      user: userId,
      userType: userType === 'seller' ? 'Seller' : 'Marketer',
      status: { $in: ['active', 'trial', 'past_due'] }
    }).populate('plan');
    
    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'No active subscription found'
      });
    }
    
    res.status(200).json({
      success: true,
      subscription
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
};

// @desc    Subscribe to a plan
// @route   POST /api/subscriptions/subscribe
// @access  Seller/Marketer only
const subscribeToPlan = async (req, res) => {
  try {
    const { planId, billingCycle, paymentMethod, promotionCode } = req.body;
    const userId = req.user.id;
    const userType = req.user.userType;
    
    if (!['seller', 'marketer'].includes(userType)) {
      return res.status(403).json({
        success: false,
        message: 'Only sellers and marketers can subscribe to plans'
      });
    }
    
    // Validation
    if (!planId || !billingCycle || !paymentMethod) {
      return res.status(400).json({
        success: false,
        message: 'Plan ID, billing cycle, and payment method are required'
      });
    }
    
    // Get plan
    const plan = await SubscriptionPlan.findById(planId);
    if (!plan || plan.status !== 'active') {
      return res.status(404).json({
        success: false,
        message: 'Plan not found or not available'
      });
    }
    
    // Check if user already has an active subscription
    const existingSubscription = await UserSubscription.findOne({
      user: userId,
      userType: userType === 'seller' ? 'Seller' : 'Marketer',
      status: { $in: ['active', 'trial'] }
    });
    
    if (existingSubscription) {
      return res.status(400).json({
        success: false,
        message: 'You already have an active subscription. Cancel or let it expire first.'
      });
    }
    
    // Get user for referral tracking
    const UserModel = userType === 'seller' ? Seller : Marketer;
    const user = await UserModel.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Calculate pricing
    let amount = plan.pricing.amount;
    let appliedPromotion = null;
    
    // Check for promotion
    if (promotionCode) {
      const promotion = plan.promotions.find(promo => 
        promo.isActive && 
        promo.conditions.couponCode === promotionCode &&
        promo.startDate <= new Date() &&
        promo.endDate >= new Date() &&
        (promo.maxUses === undefined || promo.currentUses < promo.maxUses)
      );
      
      if (promotion) {
        switch (promotion.discountType) {
          case 'percentage':
            amount = amount * (1 - promotion.discountValue / 100);
            break;
          case 'fixed_amount':
            amount = Math.max(0, amount - promotion.discountValue);
            break;
        }
        appliedPromotion = promotion;
      }
    }
    
    // Calculate billing dates
    const startDate = new Date();
    let endDate = new Date(startDate);
    
    switch (billingCycle) {
      case 'monthly':
        endDate.setMonth(endDate.getMonth() + 1);
        break;
      case 'quarterly':
        endDate.setMonth(endDate.getMonth() + 3);
        break;
      case 'yearly':
        endDate.setFullYear(endDate.getFullYear() + 1);
        break;
    }
    
    // Create subscription
    const subscriptionData = {
      user: userId,
      userType: userType === 'seller' ? 'Seller' : 'Marketer',
      plan: planId,
      billing: {
        amount,
        cycle: billingCycle,
        nextBillingDate: endDate
      },
      startDate,
      endDate,
      paymentMethod,
      subscribedFeatures: plan.features,
      appliedPromotion: appliedPromotion ? {
        promotionId: appliedPromotion._id,
        promotionName: appliedPromotion.name,
        discountType: appliedPromotion.discountType,
        discountValue: appliedPromotion.discountValue,
        appliedAt: new Date()
      } : undefined,
      referredBy: user.referredBy
    };
    
    const subscription = await UserSubscription.create(subscriptionData);
    
    // Update user's current subscription
    user.currentSubscription = subscription._id;
    if (!user.subscriptionHistory) user.subscriptionHistory = [];
    user.subscriptionHistory.push(subscription._id);
    await user.save();
    
    // Update promotion usage
    if (appliedPromotion) {
      await SubscriptionPlan.findOneAndUpdate(
        { _id: planId, 'promotions._id': appliedPromotion._id },
        { $inc: { 'promotions.$.currentUses': 1 } }
      );
    }
    
    // Create commission record if referred
    if (user.referredBy) {
      const marketer = await Marketer.findById(user.referredBy);
      if (marketer && marketer.status === 'active') {
        const commissionAmount = marketer.calculateCommission(amount);
        
        await Commission.create({
          marketer: user.referredBy,
          referredUser: userId,
          subscription: subscription._id,
          commissionAmount,
          commissionRate: marketer.marketerInfo.commission.rate,
          subscriptionAmount: amount,
          period: billingCycle,
          earnedDate: new Date(),
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
        });
      }
    }
    
    // TODO: Process payment
    // const paymentResult = await processPayment({
    //   amount,
    //   paymentMethod,
    //   subscriptionId: subscription._id
    // });
    
    await subscription.populate('plan');
    
    res.status(201).json({
      success: true,
      message: 'Subscription created successfully',
      subscription
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
};

// @desc    Cancel subscription
// @route   POST /api/subscriptions/cancel
// @access  Seller/Marketer only
const cancelSubscription = async (req, res) => {
  try {
    const { reason, feedback } = req.body;
    const userId = req.user.id;
    const userType = req.user.userType;
    
    const subscription = await UserSubscription.findOne({
      user: userId,
      userType: userType === 'seller' ? 'Seller' : 'Marketer',
      status: { $in: ['active', 'trial'] }
    });
    
    if (!subscription) {
      return res.status(404).json({
        success: false,
        message: 'No active subscription found'
      });
    }
    
    // Update subscription
    subscription.status = 'cancelled';
    subscription.autoRenew = false;
    subscription.cancellation = {
      requestedAt: new Date(),
      reason,
      feedback,
      cancelledBy: userId,
      cancelledByType: userType === 'seller' ? 'Seller' : 'Marketer',
      effectiveDate: subscription.endDate // Cancel at end of current period
    };
    
    await subscription.save();
    
    // Add to change history
    subscription.changeHistory.push({
      changeType: 'cancellation',
      reason,
      effectiveDate: subscription.endDate,
      changedBy: userId,
      changedByType: userType === 'seller' ? 'Seller' : 'Marketer'
    });
    
    await subscription.save();
    
    res.status(200).json({
      success: true,
      message: 'Subscription cancelled successfully. It will remain active until the end of your current billing period.',
      subscription
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
};

// @desc    Get subscription history
// @route   GET /api/subscriptions/history
// @access  Seller/Marketer only
const getSubscriptionHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const userType = req.user.userType;
    const { page = 1, limit = 10 } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    const subscriptions = await UserSubscription.find({
      user: userId,
      userType: userType === 'seller' ? 'Seller' : 'Marketer'
    })
    .populate('plan', 'name planType')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limitNum);
    
    const totalSubscriptions = await UserSubscription.countDocuments({
      user: userId,
      userType: userType === 'seller' ? 'Seller' : 'Marketer'
    });
    
    res.status(200).json({
      success: true,
      count: subscriptions.length,
      totalSubscriptions,
      subscriptions,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalSubscriptions / limitNum),
        hasNext: pageNum < Math.ceil(totalSubscriptions / limitNum),
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

module.exports = {
  getCurrentSubscription,
  subscribeToPlan,
  cancelSubscription,
  getSubscriptionHistory
};
const UserSubscription = require("../models/UserSubscription");
const SubscriptionPlan = require("../models/SubscriptionPlan");

// @desc    Get all subscription plans
// @route   GET /api/subscription-plans
// @access  Public
const getSubscriptionPlans = async (req, res) => {
  try {
    const { planType, targetAudience, isPublic = true } = req.query;

    let filter = { status: "active" };

    if (isPublic === "true") {
      filter.isPublic = true;
    }

    if (planType) {
      filter.planType = planType;
    }

    if (targetAudience) {
      filter.targetAudience = targetAudience;
    }

    const plans = await SubscriptionPlan.find(filter)
      .sort({ "metadata.displayOrder": 1, "pricing.amount": 1 })
      .select("-previousVersions -metadata.internalNotes");

    // Calculate effective prices and add active promotions
    const plansWithPricing = plans.map((plan) => {
      const planObj = plan.toObject();
      planObj.effectivePrice = plan.effectivePrice;
      planObj.activePromotion = plan.activePromotion;
      return planObj;
    });

    res.status(200).json({
      success: true,
      count: plansWithPricing.length,
      subscriptionPlans: plansWithPricing,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// @desc    Get single subscription plan
// @route   GET /api/subscription-plans/:id
// @access  Public
const getSubscriptionPlan = async (req, res) => {
  try {
    const plan = await SubscriptionPlan.findById(req.params.id).select(
      "-previousVersions -metadata.internalNotes"
    );

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Subscription plan not found",
      });
    }

    if (!plan.isPublic && req.user?.userType !== "admin") {
      return res.status(403).json({
        success: false,
        message: "This plan is not publicly available",
      });
    }

    const planObj = plan.toObject();
    planObj.effectivePrice = plan.effectivePrice;
    planObj.activePromotion = plan.activePromotion;

    res.status(200).json({
      success: true,
      subscriptionPlan: planObj,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// @desc    Create subscription plan
// @route   POST /api/subscription-plans
// @access  Admin only
const createSubscriptionPlan = async (req, res) => {
  try {
    const {
      name,
      displayName,
      description,
      shortDescription,
      planType,
      targetAudience,
      pricing,
      features,
      commission,
      trial,
      promotions,
      availability,
      metadata,
    } = req.body;

    // Validation
    if (!name || !planType || !pricing.amount || !pricing.billingCycle) {
      return res.status(400).json({
        success: false,
        message:
          "Required fields: name, planType, pricing amount and billing cycle",
      });
    }

    // Generate slug
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    // Check if slug exists
    const existingPlan = await SubscriptionPlan.findOne({ slug });
    if (existingPlan) {
      return res.status(400).json({
        success: false,
        message: "Plan with this name already exists",
      });
    }

    const planData = {
      name,
      slug,
      displayName: displayName || name,
      description,
      shortDescription,
      planType,
      targetAudience: targetAudience || "individual",
      pricing,
      features: features || {},
      commission: commission || { rate: 0.05, type: "percentage" },
      trial,
      promotions: promotions || [],
      availability,
      metadata: metadata || {},
      createdBy: req.user.id,
    };

    const plan = await SubscriptionPlan.create(planData);

    res.status(201).json({
      success: true,
      message: "Subscription plan created successfully",
      subscriptionPlan: plan,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// @desc    Update subscription plan
// @route   PUT /api/subscription-plans/:id
// @access  Admin only
const updateSubscriptionPlan = async (req, res) => {
  try {
    const plan = await SubscriptionPlan.findById(req.params.id);

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Subscription plan not found",
      });
    }

    // Save current version to history
    const currentVersion = {
      version: plan.version,
      changes: req.body.changeReason || "Plan updated",
      updatedAt: new Date(),
      updatedBy: req.user.id,
    };

    plan.previousVersions.push(currentVersion);

    // Update fields
    const updateFields = [
      "name",
      "displayName",
      "description",
      "shortDescription",
      "planType",
      "targetAudience",
      "pricing",
      "features",
      "commission",
      "status",
      "isPublic",
      "isPopular",
      "isBestValue",
      "availability",
      "trial",
      "promotions",
      "metadata",
    ];

    updateFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        plan[field] = req.body[field];
      }
    });

    // Update version
    const versionParts = plan.version.split(".");
    versionParts[1] = parseInt(versionParts[1]) + 1;
    plan.version = versionParts.join(".");

    plan.lastUpdatedBy = req.user.id;

    await plan.save();

    res.status(200).json({
      success: true,
      message: "Subscription plan updated successfully",
      subscriptionPlan: plan,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// @desc    Delete subscription plan
// @route   DELETE /api/subscription-plans/:id
// @access  Admin only
const deleteSubscriptionPlan = async (req, res) => {
  try {
    const plan = await SubscriptionPlan.findById(req.params.id);

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Subscription plan not found",
      });
    }

    // Check if plan has active subscriptions
    const activeSubscriptions = await UserSubscription.countDocuments({
      plan: plan._id,
      status: { $in: ["active", "trial"] },
    });

    if (activeSubscriptions > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete plan with ${activeSubscriptions} active subscriptions. Deactivate the plan instead.`,
      });
    }

    await plan.deleteOne();

    res.status(200).json({
      success: true,
      message: "Subscription plan deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

module.exports = {
  getSubscriptionPlans,
  getSubscriptionPlan,
  createSubscriptionPlan,
  updateSubscriptionPlan,
  deleteSubscriptionPlan,
};

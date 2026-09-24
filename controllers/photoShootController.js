const PhotoShootRequest = require("../models/PhotoShootRequest");
const Seller = require("../models/Seller");

// @desc    Create a photo shoot booking request
// @route   POST /api/photoshoots
// @access  Seller
const createRequest = async (req, res) => {
  try {
    const sellerId = req.user.id;
    const seller = await Seller.findById(sellerId);

    if (!seller) {
      return res.status(404).json({
        success: false,
        message: "Seller not found",
      });
    }

    const {
      preferredDate,
      alternativeDate,
      preferredTimeSlot,
      estimatedProductCount,
      productCategories,
      notes,
    } = req.body;

    if (!preferredDate) {
      return res.status(400).json({
        success: false,
        message: "Preferred date is required",
      });
    }

    const sellerName = `${seller.firstName || ""} ${seller.lastName || ""}`.trim() || "Artisan";
    const businessName = req.body.businessName || seller.businessInfo?.businessName || sellerName;
    const contactPerson = req.body.contactPerson || sellerName;
    const contactPhone = req.body.contactPhone || seller.phone;
    const contactEmail = req.body.contactEmail || seller.email || "";

    const sellerLocation = {
      address: req.body.location?.address || seller.location?.address || seller.businessInfo?.address?.street || seller.location?.landmark || "",
      city: req.body.location?.city || seller.location?.city || seller.businessInfo?.address?.city || "",
      county: req.body.location?.county || seller.location?.county || seller.businessInfo?.address?.county || "",
      landmark: req.body.location?.landmark || seller.location?.landmark || "",
    };

    const newRequest = new PhotoShootRequest({
      seller: sellerId,
      businessName,
      contactPerson,
      contactPhone,
      contactEmail,
      location: sellerLocation,
      preferredDate: new Date(preferredDate),
      alternativeDate: alternativeDate ? new Date(alternativeDate) : undefined,
      preferredTimeSlot: preferredTimeSlot || "flexible",
      estimatedProductCount: Number(estimatedProductCount) || 1,
      productCategories: Array.isArray(productCategories)
        ? productCategories
        : typeof productCategories === "string"
        ? productCategories.split(",").map((c) => c.trim()).filter(Boolean)
        : [],
      notes,
      status: "pending",
      statusHistory: [
        {
          status: "pending",
          changedAt: new Date(),
          changedBy: {
            id: req.user.id,
            name: sellerName,
            role: "seller",
          },
          note: "Request submitted by seller",
        },
      ],
    });

    await newRequest.save();

    res.status(201).json({
      success: true,
      message: "Photo shoot request submitted successfully. Craftory team will review and contact you.",
      request: newRequest,
    });
  } catch (error) {
    console.error("Create photoshoot request error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to submit photo shoot request",
      error: error.message,
    });
  }
};

// @desc    Get photo shoot requests for logged-in seller
// @route   GET /api/photoshoots/my-requests
// @access  Seller
const getMyRequests = async (req, res) => {
  try {
    const sellerId = req.user.id;
    const requests = await PhotoShootRequest.find({ seller: sellerId })
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      count: requests.length,
      requests,
    });
  } catch (error) {
    console.error("Get seller photoshoot requests error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve photo shoot requests",
      error: error.message,
    });
  }
};

// @desc    Get single photo shoot request by ID
// @route   GET /api/photoshoots/:id
// @access  Seller / Admin
const getRequestById = async (req, res) => {
  try {
    const request = await PhotoShootRequest.findById(req.params.id).populate(
      "seller",
      "firstName lastName phone email businessInfo"
    );

    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Photo shoot request not found",
      });
    }

    // If user is seller, verify ownership
    if (
      req.user.role?.toLowerCase() === "seller" &&
      request.seller._id.toString() !== req.user.id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    res.status(200).json({
      success: true,
      request,
    });
  } catch (error) {
    console.error("Get photoshoot request error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve request",
      error: error.message,
    });
  }
};

// @desc    Get all photo shoot requests (Admin)
// @route   GET /api/photoshoots/admin/all
// @access  Admin
const getAllRequests = async (req, res) => {
  try {
    const { status, page = 1, limit = 20, search } = req.query;

    const query = {};
    if (status && status !== "all") {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { businessName: { $regex: search, $options: "i" } },
        { contactPerson: { $regex: search, $options: "i" } },
        { contactPhone: { $regex: search, $options: "i" } },
        { "location.county": { $regex: search, $options: "i" } },
        { "location.city": { $regex: search, $options: "i" } },
      ];
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const skip = (pageNum - 1) * limitNum;

    const [requests, total] = await Promise.all([
      PhotoShootRequest.find(query)
        .populate("seller", "firstName lastName phone email businessInfo location avatar verification status")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      PhotoShootRequest.countDocuments(query),
    ]);

    // Count statistics
    const stats = await PhotoShootRequest.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const statCounts = {
      total: 0,
      pending: 0,
      confirmed: 0,
      in_progress: 0,
      completed: 0,
      cancelled: 0,
      rescheduled: 0,
    };

    stats.forEach((s) => {
      if (statCounts[s._id] !== undefined) {
        statCounts[s._id] = s.count;
      }
      statCounts.total += s.count;
    });

    res.status(200).json({
      success: true,
      requests,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
      stats: statCounts,
    });
  } catch (error) {
    console.error("Get all photoshoot requests error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve requests",
      error: error.message,
    });
  }
};

// @desc    Update photo shoot request status & schedule (Admin)
// @route   PATCH /api/photoshoots/admin/:id/status
// @access  Admin
const updateRequestStatus = async (req, res) => {
  try {
    const { status, scheduledDate, assignedTeamMember, adminNotes, note } = req.body;

    const request = await PhotoShootRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Photo shoot request not found",
      });
    }

    if (status) request.status = status;
    if (scheduledDate) request.scheduledDate = new Date(scheduledDate);
    if (assignedTeamMember !== undefined) request.assignedTeamMember = assignedTeamMember;
    if (adminNotes !== undefined) request.adminNotes = adminNotes;

    const adminName = req.user.firstName
      ? `${req.user.firstName} ${req.user.lastName || ""}`.trim()
      : req.user.email || "Admin";

    request.statusHistory.push({
      status: status || request.status,
      changedAt: new Date(),
      changedBy: {
        id: req.user.id,
        name: adminName,
        role: req.user.role || "admin",
      },
      note: note || adminNotes || `Status updated to ${status || request.status}`,
    });

    await request.save();

    res.status(200).json({
      success: true,
      message: "Photo shoot request updated successfully",
      request,
    });
  } catch (error) {
    console.error("Update photoshoot status error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update request",
      error: error.message,
    });
  }
};

// @desc    Cancel request (Seller)
// @route   PATCH /api/photoshoots/:id/cancel
// @access  Seller
const cancelRequest = async (req, res) => {
  try {
    const request = await PhotoShootRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({
        success: false,
        message: "Request not found",
      });
    }

    if (request.seller.toString() !== req.user.id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized",
      });
    }

    if (["completed", "cancelled"].includes(request.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel a request that is already ${request.status}`,
      });
    }

    request.status = "cancelled";
    request.statusHistory.push({
      status: "cancelled",
      changedAt: new Date(),
      changedBy: {
        id: req.user.id,
        name: req.user.firstName || "Seller",
        role: "seller",
      },
      note: req.body.reason || "Cancelled by seller",
    });

    await request.save();

    res.status(200).json({
      success: true,
      message: "Photo shoot request cancelled",
      request,
    });
  } catch (error) {
    console.error("Cancel photoshoot error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to cancel request",
      error: error.message,
    });
  }
};

module.exports = {
  createRequest,
  getMyRequests,
  getRequestById,
  getAllRequests,
  updateRequestStatus,
  cancelRequest,
};

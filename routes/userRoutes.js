// routes/userRoutes.js
const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/auth");
const Admin = require("../models/Admin");
const Seller = require("../models/Seller");
const Marketer = require("../models/Marketer");
const Buyer = require("../models/Buyer");

// @desc    Get current authenticated user profile
// @route   GET /api/users/profile/own
// @access  Authenticated (Admin, Seller, Marketer, Buyer)
router.get("/profile/own", authenticateToken, async (req, res) => {
  try {
    const userType = (req.user?.userType || req.user?.role || "").toLowerCase();
    let userData = null;

    if (userType === "admin") {
      const admin = await Admin.findById(req.user.id).select("-password");
      if (admin) {
        userData = {
          ...admin.toObject(),
          profile: {
            firstName: admin.firstName,
            lastName: admin.lastName,
            phone: admin.phone,
            company: "Craftory",
          },
        };
      }
    } else if (userType === "seller") {
      const seller = await Seller.findById(req.user.id).select("-password");
      if (seller) {
        userData = {
          ...seller.toObject(),
          profile: {
            firstName: seller.fullName?.split(" ")[0] || seller.businessInfo?.businessName,
            lastName: seller.fullName?.split(" ").slice(1).join(" ") || "",
            phone: seller.phone,
            company: seller.businessInfo?.businessName,
          },
        };
      }
    } else if (["marketer", "agent"].includes(userType)) {
      const agent = await Marketer.findById(req.user.id).select("-password");
      if (agent) {
        userData = {
          ...agent.toObject(),
          profile: {
            firstName: agent.fullName?.split(" ")[0] || "",
            lastName: agent.fullName?.split(" ").slice(1).join(" ") || "",
            phone: agent.phone,
            company: "Craftory Field Agent",
          },
        };
      }
    } else {
      const buyer = await Buyer.findById(req.user.id).select("-password");
      if (buyer) {
        userData = {
          ...buyer.toObject(),
          profile: {
            firstName: buyer.firstName,
            lastName: buyer.lastName,
            phone: buyer.phone,
          },
        };
      }
    }

    if (!userData) {
      return res.status(404).json({
        success: false,
        message: "User profile not found",
      });
    }

    res.status(200).json({
      success: true,
      data: userData,
      user: userData,
    });
  } catch (error) {
    console.error("Error in /users/profile/own:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
});

// @desc    Update current authenticated user profile
// @route   PATCH /api/users/update-own/profile or /api/users/profile/own
// @access  Authenticated
const handleUpdateProfile = async (req, res) => {
  try {
    const userType = (req.user?.userType || req.user?.role || "").toLowerCase();
    const { firstName, lastName, phone, profile } = req.body;

    let updatedUser = null;

    if (userType === "admin") {
      const admin = await Admin.findById(req.user.id);
      if (admin) {
        if (firstName) admin.firstName = firstName.trim();
        if (lastName) admin.lastName = lastName.trim();
        if (phone) admin.phone = phone.trim();

        if (profile) {
          if (profile.firstName) admin.firstName = profile.firstName.trim();
          if (profile.lastName) admin.lastName = profile.lastName.trim();
          if (profile.phone) admin.phone = profile.phone.trim();
        }

        await admin.save();
        updatedUser = {
          ...admin.toObject(),
          profile: {
            firstName: admin.firstName,
            lastName: admin.lastName,
            phone: admin.phone,
            company: "Craftory",
          },
        };
      }
    } else if (userType === "seller") {
      const seller = await Seller.findById(req.user.id);
      if (seller) {
        const newFirst = profile?.firstName || firstName;
        const newLast = profile?.lastName || lastName;
        if (newFirst || newLast) {
          seller.fullName = `${newFirst || ""} ${newLast || ""}`.trim();
        }
        if (profile?.phone || phone) {
          seller.phone = (profile?.phone || phone).trim();
        }
        await seller.save();
        updatedUser = seller.toObject();
      }
    } else if (["marketer", "agent"].includes(userType)) {
      const agent = await Marketer.findById(req.user.id);
      if (agent) {
        const newFirst = profile?.firstName || firstName;
        const newLast = profile?.lastName || lastName;
        if (newFirst || newLast) {
          agent.fullName = `${newFirst || ""} ${newLast || ""}`.trim();
        }
        if (profile?.phone || phone) {
          agent.phone = (profile?.phone || phone).trim();
        }
        await agent.save();
        updatedUser = agent.toObject();
      }
    }

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: updatedUser,
      user: updatedUser,
    });
  } catch (error) {
    console.error("Error updating user profile:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

router.patch("/update-own/profile", authenticateToken, handleUpdateProfile);
router.patch("/profile/own", authenticateToken, handleUpdateProfile);

module.exports = router;

const express = require("express");
const router = express.Router();
const { authenticateToken, isClient, isAdmin } = require("../middleware/auth");

const adminController = require("../controllers/adminController");

router
  .post("/", authenticateToken, isAdmin, adminController.registerAdmin)
  .get("/", authenticateToken, isAdmin, adminController.getAllAdmins)
  .get(
    "/dashboard",
    authenticateToken,
    isAdmin,
    adminController.getAdminDashboard
  )
  .post(
    "/update-reviews",
    authenticateToken,
    isAdmin,
    adminController.updateReviewStatus
  )
  .patch(
    "/product-status",
    authenticateToken,
    isAdmin,
    adminController.updateProductStatus
  )
  .get("/:id", authenticateToken, isAdmin, adminController.getAdminById)
  .patch(
    "/:id/status",
    authenticateToken,
    isAdmin,
    adminController.updateAdminAccountStatus
  )
  .delete("/:id", authenticateToken, isAdmin, adminController.deleteAdmin);

module.exports = router;

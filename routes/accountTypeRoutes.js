const express = require("express");
const router = express.Router();
const accountTypeController = require("../controllers/accountTypeController");
const subAccountCategoryController = require("../controllers/subAccountCategoryController");
const { authenticateToken } = require("../middleware/auth");

router.use(authenticateToken);

router
  .post("/", accountTypeController.createAccountType)
  .post("/subcategory", subAccountCategoryController.createSubAccoutCategory)
  .get("/subcategory", subAccountCategoryController.getAllSubAccoutCategories)
  .get("/", accountTypeController.getAllAccountTypes)
  .patch("/", accountTypeController.editAccountType)
  .delete(
    "/:deleteType/:deletedBy/:accountTypeId",
    accountTypeController.deleteAccountTypeById
  );

module.exports = router;

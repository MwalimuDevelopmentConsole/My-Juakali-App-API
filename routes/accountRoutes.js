const express = require("express");
const {
  createUserAccount,
  getAccounts,
  updateAccount,
  deleteAccount,
  createSystemAccount,
  searchAccounts,
  createBusinessAccount,
  updateAccountRemark,
  getAccountById,
} = require("../controllers/accountController");
const { authenticateToken } = require("../middleware/auth");

const router = express.Router();
router.use(authenticateToken);

router
  .post("/", createUserAccount)
  .post("/system", createSystemAccount)
  .post("/business", createBusinessAccount)
  .get("/", getAccounts)
  .get("/search", searchAccounts)
  .get("/one/:accountId",getAccountById )
  .patch("/:id", updateAccount)
  .patch("/add/remark", updateAccountRemark)
  .delete("/:id/:deletedById", deleteAccount)

module.exports = router;
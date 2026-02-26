const express = require("express");
const router = express.Router();
const blogController = require("../controllers/postController");
const {
  upload,
  handleMulterError,
  processUploadedImages,
} = require("../config/multer");

router
  .post(
    "/",
    upload.single("file"),
    processUploadedImages,
    handleMulterError,
    blogController.uploadBlog,
  )
  .get("/", blogController.getAllBlogs)
  .get("/one/:slug", blogController.getBlogById)
  .patch(
    "/:blogId",
    upload.single("file"),
    processUploadedImages,
    handleMulterError,
    blogController.editBlog,
  )
  .patch("/:status/:postId", blogController.updateBlogStatus)
  .delete("/:postId", blogController.deletePost);

module.exports = router;

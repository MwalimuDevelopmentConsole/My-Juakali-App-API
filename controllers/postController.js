const Post = require("../models/Post");
const asyncHandler = require("express-async-handler");

const uploadBlog = async (req, res) => {
  try {
    const { title, summary, content, slug, author, category, date } = req.body;
    const post = await Post.findOne({ slug: slug }).lean().exec();

    if (post) return res.status(401).json({ message: "Duplicate slug" });
    if (!req.file)
      return res
        .status(400)
        .json({ message: "Please upload blog thumbnail image" });

    if (
      !title ||
      !summary ||
      !content ||
      !slug ||
      !author ||
      !category ||
      !date
    )
      return res.status(400).json({ message: "all fields are required" });
    let imageLink = "";
    if (req.file) {
      // Generate the optimized path that will exist after processing
      const optimizedPath = req.file.path
        .replace("/temp/", "/optimized/")
        .replace(/\.[^.]+$/, ".webp");

      const fileName = require("path").basename(optimizedPath);
      // Use BunnyCDN Pull Zone URL
      const pullZone = process.env.BUNNY_PULL_ZONE
        ? process.env.BUNNY_PULL_ZONE.replace(/\/$/, "")
        : process.env.API_DOMAIN;
      // Default folder is 'uploads'
      const imageUrl = process.env.BUNNY_PULL_ZONE
        ? `${pullZone}/uploads/${fileName}`
        : `${process.env.API_DOMAIN}/${optimizedPath}`;

      imageLink = imageUrl;
    }

    const blogObject = {
      content: content,
      summary: summary,
      title: title,
      slug: slug,
      img: imageLink,
      author: author,
      category: category,
      date: date,
      status: "Submitted",
    };

    const blog = await Post.create(blogObject);

    if (blog) {
      res.status(201).json({ message: ` Blog  created` });
    } else {
      res.status(400).json({ message: "Invalid file data received" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const getAllBlogs = asyncHandler(async (req, res) => {
  const page = req?.query?.page || 1;
  const perPage = req?.query?.perPage || 100;

  const { category, status } = req.query;

  const filters = {
    category: { $regex: category || "", $options: "i" },
    status: { $regex: status || "", $options: "i" },
  };

  const [blogs, count] = await Promise.all([
    Post.find(filters)
      .skip((page - 1) * parseInt(perPage))
      .limit(parseInt(perPage))
      .lean()
      .exec(),

    Post.countDocuments(filters),
  ]);

  if (!blogs?.length) {
    return res.status(204).json({ message: "No blogs found" });
  }
  res.json({ blogs, count });
});

const getBlogById = async (req, res) => {
  const slug = req.params.slug;

  if (!slug) return res.status(400).json({ message: "blog id is required" });

  const blog = await Post.findOne({ slug: slug }).lean().exec();

  if (!blog) {
    return res.status(404).json({ message: "No blog found" });
  }
  res.json(blog);
};

const updateBlogStatus = async (req, res) => {
  const { status, postId } = req.params;

  if (!status || !postId)
    return res.status(400).json({ message: "blog id is required" });

  const blog = await Post.findOneAndUpdate({ _id: postId }, { status: status })
    .lean()
    .exec();

  if (!blog) {
    return res.status(409).json({ message: "Something went wrong!" });
  }
  res.status(200).json({ message: "Updated Successfully" });
};

const editBlog = async (req, res) => {
  const { blogId } = req?.params;
  const { title, summary, content, slug, author, category, date } = req.body;

  if (
    !title ||
    !summary ||
    !content ||
    !blogId ||
    !slug ||
    !author ||
    !category ||
    !date
  )
    return res.status(400).json({ message: "all fields are required" });

  try {
    const blog = await Post.findById({ _id: blogId }).exec();

    if (!blog) {
      return res.status(400).json({ message: "blog not found" });
    }

    let imageLink = "";
    if (req.file) {
      // Generate the optimized path that will exist after processing
      const optimizedPath = req.file.path
        .replace("/temp/", "/optimized/")
        .replace(/\.[^.]+$/, ".webp");

      const fileName = require("path").basename(optimizedPath);
      // Use BunnyCDN Pull Zone URL
      const pullZone = process.env.BUNNY_PULL_ZONE
        ? process.env.BUNNY_PULL_ZONE.replace(/\/$/, "")
        : process.env.API_DOMAIN;
      // Default folder is 'uploads'
      const imageUrl = process.env.BUNNY_PULL_ZONE
        ? `${pullZone}/uploads/${fileName}`
        : `${process.env.API_DOMAIN}/${optimizedPath}`;

      imageLink = imageUrl;
    }

    blog.title = title;
    blog.summary = summary;
    blog.content = content;
    blog.slug = slug;
    blog.author = author;
    blog.category = category;
    blog.date = date;
    blog.status = "Submitted";

    if (req.file) {
      blog.img = imageLink;
    }

    await blog.save();
    res.status(200).json({ message: "Blog updated successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const deletePost = async (req, res) => {
  const { postId } = req.params;

  if (!postId) return res.status(400).json({ message: "blog id is required" });

  const post = await Post.findById({ _id: postId }).exec();

  if (!post)
    return res.status(400).json({
      message: "Something went wrong, refresh the page and try again",
    });

  await Post.findOneAndDelete({ _id: postId }).exec();

  res.status(200).json({ message: "Blog deleted successfully" });
};

module.exports = {
  uploadBlog,
  getAllBlogs,
  getBlogById,
  editBlog,
  deletePost,
  updateBlogStatus,
};

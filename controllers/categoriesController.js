const Category = require("../models/Category");
const cloudinary = require("cloudinary").v2;

// @desc    Get all categories with subcategories
const getCategories = async (req, res) => {
  try {
    const { level, parent, includeInactive = false } = req.query;

    let filter = {};

    // Filter by level (0 = parent, 1 = subcategory, etc.)
    if (level !== undefined) {
      filter.level = parseInt(level);
    }

    // Filter by parent category
    if (parent) {
      filter.parentCategory = parent;
    } else if (level === undefined) {
      // If no level specified and no parent, get only parent categories
      filter.parentCategory = null;
    }

    // Include inactive categories only for admins
    if (!includeInactive) {
      filter.isActive = true;
    }

    const categories = await Category.find(filter)
      .populate("subcategories")
      .sort({ sortOrder: 1, name: 1 });

    res.status(200).json({
      success: true,
      count: categories.length,
      categories,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// @desc    Get single category with subcategories
const getCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id)
      .populate("subcategories")
      .populate("parentCategory");

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    res.status(200).json({
      success: true,
      category,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// @desc    Create new category
// @access  Admin only
const createCategory = async (req, res) => {
  try {
    const {
      name,
      description,
      parentCategory,
      dynamicFields,
      metaTitle,
      metaDescription,
      keywords,
    } = req.body;

    // Validation
    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Category name is required",
      });
    }

    // Generate slug
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    // Check if slug already exists
    const existingCategory = await Category.findOne({ slug });
    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: "Category with this name already exists",
      });
    }

    // Determine level
    let level = 0;
    if (parentCategory) {
      const parent = await Category.findById(parentCategory);
      if (!parent) {
        return res.status(404).json({
          success: false,
          message: "Parent category not found",
        });
      }
      level = parent.level + 1;
    }

    // Handle image upload
    let imageData = {};
    if (req.file) {
      imageData = {
        url: `${process.env.API_DOMAIN}/${req.file.path}`,
        alt: req.file.originalname,
      };
    }

    const categoryData = {
      name,
      slug,
      description,
      image: imageData,
      parentCategory: parentCategory || null,
      level,
      dynamicFields: JSON.parse(dynamicFields) || [],
      metaTitle,
      metaDescription,
      keywords: keywords ? keywords.split(",").map((k) => k.trim()) : [],
    };

    const category = await Category.create(categoryData);

    res.status(201).json({
      success: true,
      message: "Category created successfully",
      category,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// @desc    Update category
// @access  Admin only
const updateCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    const {
      name,
      description,
      dynamicFields,
      isActive,
      sortOrder,
      metaTitle,
      metaDescription,
      keywords,
    } = req.body;

    // Update slug if name changed
    if (name && name !== category.name) {
      const newSlug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      const existingCategory = await Category.findOne({
        slug: newSlug,
        _id: { $ne: category._id },
      });
      if (existingCategory) {
        return res.status(400).json({
          success: false,
          message: "Category with this name already exists",
        });
      }
      category.slug = newSlug;
    }

    // Handle image upload
    let imageData = {};
    if (req.file) {
      imageData = {
        url: `${process.env.API_DOMAIN}/${req.file.path}`,
        alt: req.file.originalname,
      };

      category.image = imageData;
    }

    // Update fields
    if (name) category.name = name;
    if (description) category.description = description;
    if (dynamicFields) category.dynamicFields = dynamicFields;
    if (isActive !== undefined) category.isActive = isActive;
    if (sortOrder !== undefined) category.sortOrder = sortOrder;
    if (metaTitle) category.metaTitle = metaTitle;
    if (metaDescription) category.metaDescription = metaDescription;
    if (keywords) category.keywords = keywords.split(",").map((k) => k.trim());

    await category.save();

    res.status(200).json({
      success: true,
      message: "Category updated successfully",
      category,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server Error",
      error: error.message,
    });
  }
};

// @desc    Delete category
// @access  Admin only
const deleteCategory = async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    // Check if category has subcategories
    const subcategories = await Category.find({ parentCategory: category._id });
    if (subcategories.length > 0) {
      return res.status(400).json({
        success: false,
        message:
          "Cannot delete category with subcategories. Delete subcategories first.",
      });
    }

    // Delete image from cloudinary
    if (category.image && category.image.publicId) {
      await cloudinary.uploader.destroy(category.image.publicId);
    }

    await category.deleteOne();

    res.status(200).json({
      success: true,
      message: "Category deleted successfully",
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
  getCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
};

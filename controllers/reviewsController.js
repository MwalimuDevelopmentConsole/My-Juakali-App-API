const Review = require('../models/Review');
const Product = require('../models/Product');
const Seller = require('../models/Seller');

// @desc    Get reviews for a seller
// @route   GET /api/reviews/seller/:sellerId
// @access  Public
const getSellerReviews = async (req, res) => {
  try {
    const { sellerId } = req.params;
    const { page = 1, limit = 10, rating } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    let filter = { 
      reviewee: sellerId,
      status: 'approved'
    };
    
    // Filter by rating if specified
    if (rating) {
      filter['ratings.overall'] = parseInt(rating);
    }
    
    const reviews = await Review.find(filter)
      .populate('reviewer', 'firstName lastName')
      .populate('product', 'title')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);
    
    const totalReviews = await Review.countDocuments(filter);
    const totalPages = Math.ceil(totalReviews / limitNum);
    
    // Get rating breakdown
    const ratingBreakdown = await Review.aggregate([
      { $match: { reviewee: mongoose.Types.ObjectId(sellerId), status: 'approved' } },
      {
        $group: {
          _id: '$ratings.overall',
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: -1 } }
    ]);
    
    res.status(200).json({
      success: true,
      count: reviews.length,
      totalReviews,
      reviews,
      ratingBreakdown,
      pagination: {
        currentPage: pageNum,
        totalPages,
        hasNext: pageNum < totalPages,
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

// @desc    Create a review
// @route   POST /api/reviews
// @access  Buyer only
const createReview = async (req, res) => {
  try {
    const {
      reviewee, // seller ID
      product,
      ratings,
      title,
      comment
    } = req.body;
    
    // Validation
    if (!reviewee || !ratings?.overall) {
      return res.status(400).json({
        success: false,
        message: 'Reviewee and overall rating are required'
      });
    }
    
    if (ratings.overall < 1 || ratings.overall > 5) {
      return res.status(400).json({
        success: false,
        message: 'Overall rating must be between 1 and 5'
      });
    }
    
    // Check if buyer has already reviewed this seller for this product
    const existingReview = await Review.findOne({
      reviewer: req.user.id,
      reviewee,
      product: product || null
    });
    
    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: 'You have already reviewed this seller for this product'
      });
    }
    
    // Verify the seller exists
    const seller = await Seller.findById(reviewee);
    if (!seller) {
      return res.status(404).json({
        success: false,
        message: 'Seller not found'
      });
    }
    
    // Verify product exists if provided
    if (product) {
      const productDoc = await Product.findById(product);
      if (!productDoc || productDoc.seller.toString() !== reviewee) {
        return res.status(400).json({
          success: false,
          message: 'Invalid product or product does not belong to this seller'
        });
      }
    }
    
    // Handle image uploads
    let images = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const result = await cloudinary.uploader.upload(file.path, {
          folder: 'myjuakali/reviews',
          transformation: [
            { width: 600, height: 400, crop: 'fill' },
            { quality: 'auto:good' }
          ]
        });
        
        images.push({
          url: result.secure_url,
          publicId: result.public_id,
          alt: title || 'Review image'
        });
      }
    }
    
    const reviewData = {
      reviewer: req.user.id,
      reviewee,
      product,
      ratings,
      title,
      comment,
      images,
      status: 'pending' // Reviews need approval
    };
    
    const review = await Review.create(reviewData);
    
    res.status(201).json({
      success: true,
      message: 'Review submitted successfully and is pending approval',
      review
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
};

// @desc    Update seller ratings (internal function called after review approval)
const updateSellerRatings = async (sellerId) => {
  try {
    const ratingsAgg = await Review.aggregate([
      { $match: { reviewee: mongoose.Types.ObjectId(sellerId), status: 'approved' } },
      {
        $group: {
          _id: null,
          averageOverall: { $avg: '$ratings.overall' },
          averageCommunication: { $avg: '$ratings.communication' },
          averageQuality: { $avg: '$ratings.quality' },
          averageTimeliness: { $avg: '$ratings.timeliness' },
          averageProfessionalism: { $avg: '$ratings.professionalism' },
          count: { $sum: 1 }
        }
      }
    ]);
    
    if (ratingsAgg.length > 0) {
      const ratings = ratingsAgg[0];
      await Seller.findByIdAndUpdate(sellerId, {
        'ratings.average': Math.round(ratings.averageOverall * 10) / 10,
        'ratings.count': ratings.count,
        'ratings.breakdown.communication': Math.round((ratings.averageCommunication || 0) * 10) / 10,
        'ratings.breakdown.quality': Math.round((ratings.averageQuality || 0) * 10) / 10,
        'ratings.breakdown.timeliness': Math.round((ratings.averageTimeliness || 0) * 10) / 10,
        'ratings.breakdown.professionalism': Math.round((ratings.averageProfessionalism || 0) * 10) / 10
      });
    }
  } catch (error) {
    console.error('Error updating seller ratings:', error);
  }
};

// @desc    Respond to review (seller)
// @route   POST /api/reviews/:id/respond
// @access  Seller only
const respondToReview = async (req, res) => {
  try {
    const { comment } = req.body;
    
    if (!comment) {
      return res.status(400).json({
        success: false,
        message: 'Response comment is required'
      });
    }
    
    const review = await Review.findById(req.params.id);
    
    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }
    
    // Check if the seller owns this review
    if (review.reviewee.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You can only respond to reviews about your business'
      });
    }
    
    // Check if already responded
    if (review.response) {
      return res.status(400).json({
        success: false,
        message: 'You have already responded to this review'
      });
    }
    
    review.response = {
      comment,
      date: new Date()
    };
    
    await review.save();
    
    res.status(200).json({
      success: true,
      message: 'Response added successfully',
      review
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message
    });
  }
};

// @desc    Vote review as helpful
// @route   POST /api/reviews/:id/vote
// @access  Authenticated users
const voteReviewHelpful = async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    
    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found'
      });
    }
    
    // Check if user already voted
    if (review.votedBy.includes(req.user.id)) {
      return res.status(400).json({
        success: false,
        message: 'You have already voted on this review'
      });
    }
    
    review.helpfulVotes += 1;
    review.votedBy.push(req.user.id);
    
    await review.save();
    
    res.status(200).json({
      success: true,
      message: 'Vote recorded successfully',
      helpfulVotes: review.helpfulVotes
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
  getSellerReviews,
  createReview,
  respondToReview,
  voteReviewHelpful,
  updateSellerRatings // Export for use in admin controllers
};
const express = require('express');
const router = express.Router();
const Mongoose = require('mongoose');

// Bring in Models & Utils
const Order = require('../../models/order');
const Cart = require('../../models/cart');
const Product = require('../../models/product');
const Address = require('../../models/address'); // Add Address model
const auth = require('../../middleware/auth');

const store = require('../../utils/store');
const { ROLES, CART_ITEM_STATUS } = require('../../constants');

const { sendEmail } = require('../../utils/email');

router.post('/add', auth, async (req, res) => {
  try {
    const { cartId, total, addressId } = req.body; // Add addressId
    const userId = req.user._id;

    if (!cartId) return res.status(400).json({ error: 'cartId is required' });
    if (!total) return res.status(400).json({ error: 'total is required' });
    if (!addressId) return res.status(400).json({ error: 'addressId is required' });

    // Verify address belongs to user
    const address = await Address.findOne({ _id: addressId, user: userId });
    if (!address) {
      return res.status(400).json({ error: 'Invalid address selected' });
    }

    const order = new Order({
      cart: cartId,
      user: userId,
      total,
      address: addressId, // Add address reference
    });

    const orderDoc = await order.save();

    const cartDoc = await Cart.findById(cartId).populate({
      path: 'products.product',
      populate: { path: 'brand' },
    });

    if (!cartDoc) return res.status(404).json({ error: 'Cart not found' });

    const newOrder = {
      _id: orderDoc._id,
      created: orderDoc.created,
      user: userId,
      total: orderDoc.total,
      products: cartDoc.products,
      address: address, // Include address in response
    };

    // 📩 Send email to Admin
    await sendEmail({
      to: process.env.ADMIN_EMAIL,
      subject: `🛒 New Order Received - ${newOrder._id}`,
      text: `A new order has been placed by user ${req.user.email}.`,
      html: `
        <h2>New Order Received</h2>
        <p><b>Order ID:</b> ${newOrder._id}</p>
        <p><b>User:</b> ${req.user.email}</p>
        <p><b>Total:</b> ₹${newOrder.total}</p>
        <p><b>Delivery Address:</b> ${address.address}, ${address.city}, ${address.state} ${address.zipCode}</p>
      `,
    });

    // 📩 Send confirmation email to User
    await sendEmail({
      to: req.user.email,
      subject: `✅ Order Confirmation - ${newOrder._id}`,
      text: `Your order has been placed successfully!`,
      html: `
        <h2>Order Confirmed</h2>
        <p>Hi ${req.user.name || 'User'},</p>
        <p>Your order <b>${newOrder._id}</b> has been placed successfully.</p>
        <p><b>Total:</b> ₹${newOrder.total}</p>
        <p><b>Delivery Address:</b> ${address.address}, ${address.city}, ${address.state} ${address.zipCode}</p>
        <p>We'll notify you once it's shipped.</p>
      `,
    });

    res.status(200).json({
      success: true,
      message: 'Your order has been placed successfully!',
      order: newOrder,
    });
  } catch (error) {
    console.error('Add Order Error:', error);
    res.status(400).json({
      error: 'Your request could not be processed. Please try again.',
    });
  }
});

// search orders api
router.get('/search', auth, async (req, res) => {
  try {
    const { search } = req.query;

    if (!Mongoose.Types.ObjectId.isValid(search)) {
      return res.status(200).json({
        orders: []
      });
    }

    let ordersDoc = null;

    if (req.user.role === ROLES.Admin) {
      ordersDoc = await Order.find({
        _id: Mongoose.Types.ObjectId(search)
      })
      .populate('address') // Add address population
      .populate({
        path: 'cart',
        populate: {
          path: 'products.product',
          populate: {
            path: 'brand'
          }
        }
      });
    } else {
      const user = req.user._id;
      ordersDoc = await Order.find({
        _id: Mongoose.Types.ObjectId(search),
        user
      })
      .populate('address') // Add address population
      .populate({
        path: 'cart',
        populate: {
          path: 'products.product',
          populate: {
            path: 'brand'
          }
        }
      });
    }

    ordersDoc = ordersDoc.filter(order => order.cart);

    if (ordersDoc.length > 0) {
      const newOrders = ordersDoc.map(o => {
        return {
          _id: o._id,
          total: parseFloat(Number(o.total.toFixed(2))),
          created: o.created,
          products: o.cart?.products,
          address: o.address // Include address
        };
      });

      let orders = newOrders.map(o => store.caculateTaxAmount(o));
      orders.sort((a, b) => b.created - a.created);
      res.status(200).json({
        orders
      });
    } else {
      res.status(200).json({
        orders: []
      });
    }
  } catch (error) {
    res.status(400).json({
      error: 'Your request could not be processed. Please try again.'
    });
  }
});

// fetch orders api
router.get('/', auth, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const ordersDoc = await Order.find()
      .sort('-created')
      .populate('address') // Add address population
      .populate({
        path: 'cart',
        populate: {
          path: 'products.product',
          populate: {
            path: 'brand'
          }
        }
      })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const count = await Order.countDocuments();
    const orders = store.formatOrders(ordersDoc);

    res.status(200).json({
      orders,
      totalPages: Math.ceil(count / limit),
      currentPage: Number(page),
      count
    });
  } catch (error) {
    res.status(400).json({
      error: 'Your request could not be processed. Please try again.'
    });
  }
});

// fetch my orders api
router.get('/me', auth, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const user = req.user._id;
    const query = { user };

    const ordersDoc = await Order.find(query)
      .sort('-created')
      .populate('address') // Add address population
      .populate({
        path: 'cart',
        populate: {
          path: 'products.product',
          populate: {
            path: 'brand'
          }
        }
      })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const count = await Order.countDocuments(query);
    const orders = store.formatOrders(ordersDoc);

    res.status(200).json({
      orders,
      totalPages: Math.ceil(count / limit),
      currentPage: Number(page),
      count
    });
  } catch (error) {
    res.status(400).json({
      error: 'Your request could not be processed. Please try again.'
    });
  }
});

// fetch order api
router.get('/:orderId', auth, async (req, res) => {
  try {
    const orderId = req.params.orderId;

    let orderDoc = null;

    if (req.user.role === ROLES.Admin) {
      orderDoc = await Order.findOne({ _id: orderId })
        .populate('address') // Add address population
        .populate({
          path: 'cart',
          populate: {
            path: 'products.product',
            populate: {
              path: 'brand'
            }
          }
        });
    } else {
      const user = req.user._id;
      orderDoc = await Order.findOne({ _id: orderId, user })
        .populate('address') // Add address population
        .populate({
          path: 'cart',
          populate: {
            path: 'products.product',
            populate: {
              path: 'brand'
            }
          }
        });
    }

    if (!orderDoc || !orderDoc.cart) {
      return res.status(404).json({
        message: `Cannot find order with the id: ${orderId}.`
      });
    }

    let order = {
      _id: orderDoc._id,
      total: orderDoc.total,
      created: orderDoc.created,
      totalTax: 0,
      products: orderDoc?.cart?.products,
      cartId: orderDoc.cart._id,
      address: orderDoc.address // Include address
    };

    order = store.caculateTaxAmount(order);

    res.status(200).json({
      order
    });
  } catch (error) {
    res.status(400).json({
      error: 'Your request could not be processed. Please try again.'
    });
  }
});

router.delete('/cancel/:orderId', auth, async (req, res) => {
  try {
    const orderId = req.params.orderId;

    const order = await Order.findOne({ _id: orderId });
    const foundCart = await Cart.findOne({ _id: order.cart });

    increaseQuantity(foundCart.products);

    await Order.deleteOne({ _id: orderId });
    await Cart.deleteOne({ _id: order.cart });

    res.status(200).json({
      success: true
    });
  } catch (error) {
    res.status(400).json({
      error: 'Your request could not be processed. Please try again.'
    });
  }
});

router.put('/status/item/:itemId', auth, async (req, res) => {
  try {
    const itemId = req.params.itemId;
    const orderId = req.body.orderId;
    const cartId = req.body.cartId;
    const status = req.body.status || CART_ITEM_STATUS.Cancelled;

    const foundCart = await Cart.findOne({ 'products._id': itemId });
    const foundCartProduct = foundCart.products.find(p => p._id == itemId);

    await Cart.updateOne(
      { 'products._id': itemId },
      {
        'products.$.status': status
      }
    );

    if (status === CART_ITEM_STATUS.Cancelled) {
      await Product.updateOne(
        { _id: foundCartProduct.product },
        { $inc: { quantity: foundCartProduct.quantity } }
      );

      const cart = await Cart.findOne({ _id: cartId });
      const items = cart.products.filter(
        item => item.status === CART_ITEM_STATUS.Cancelled
      );

      // All items are cancelled => Cancel order
      if (cart.products.length === items.length) {
        await Order.deleteOne({ _id: orderId });
        await Cart.deleteOne({ _id: cartId });

        return res.status(200).json({
          success: true,
          orderCancelled: true,
          message: `${
            req.user.role === ROLES.Admin ? 'Order' : 'Your order'
          } has been cancelled successfully`
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Item has been cancelled successfully!'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Item status has been updated successfully!'
    });
  } catch (error) {
    res.status(400).json({
      error: 'Your request could not be processed. Please try again.'
    });
  }
});

const increaseQuantity = products => {
  let bulkOptions = products.map(item => {
    return {
      updateOne: {
        filter: { _id: item.product },
        update: { $inc: { quantity: item.quantity } }
      }
    };
  });

  Product.bulkWrite(bulkOptions);
};

module.exports = router;
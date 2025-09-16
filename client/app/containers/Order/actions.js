/*
 *
 * Order actions with address validation
 *
 */

import { push } from 'connected-react-router';
import axios from 'axios';
import { success, warning } from 'react-notification-system-redux';

import {
  FETCH_ORDERS,
  FETCH_SEARCHED_ORDERS,
  FETCH_ORDER,
  UPDATE_ORDER_STATUS,
  SET_ORDERS_LOADING,
  SET_ADVANCED_FILTERS,
  CLEAR_ORDERS
} from './constants';

import { clearCart, getCartId } from '../Cart/actions';
import { toggleCart } from '../Navigation/actions';
import { fetchAddresses } from '../Address/actions';
import handleError from '../../utils/error';
import { API_URL } from '../../constants';

export const updateOrderStatus = value => {
  return {
    type: UPDATE_ORDER_STATUS,
    payload: value
  };
};

export const setOrderLoading = value => {
  return {
    type: SET_ORDERS_LOADING,
    payload: value
  };
};

export const fetchOrders = (page = 1) => {
  return async (dispatch, getState) => {
    try {
      dispatch(setOrderLoading(true));

      const response = await axios.get(`${API_URL}/order`, {
        params: {
          page: page ?? 1,
          limit: 20
        }
      });

      const { orders, totalPages, currentPage, count } = response.data;

      dispatch({
        type: FETCH_ORDERS,
        payload: orders
      });

      dispatch({
        type: SET_ADVANCED_FILTERS,
        payload: { totalPages, currentPage, count }
      });
    } catch (error) {
      dispatch(clearOrders());
      handleError(error, dispatch);
    } finally {
      dispatch(setOrderLoading(false));
    }
  };
};

export const fetchAccountOrders = (page = 1) => {
  return async (dispatch, getState) => {
    try {
      dispatch(setOrderLoading(true));

      const response = await axios.get(`${API_URL}/order/me`, {
        params: {
          page: page ?? 1,
          limit: 20
        }
      });

      const { orders, totalPages, currentPage, count } = response.data;

      dispatch({
        type: FETCH_ORDERS,
        payload: orders
      });

      dispatch({
        type: SET_ADVANCED_FILTERS,
        payload: { totalPages, currentPage, count }
      });
    } catch (error) {
      dispatch(clearOrders());
      handleError(error, dispatch);
    } finally {
      dispatch(setOrderLoading(false));
    }
  };
};

export const searchOrders = filter => {
  return async (dispatch, getState) => {
    try {
      dispatch(setOrderLoading(true));

      const response = await axios.get(`${API_URL}/order/search`, {
        params: {
          search: filter.value
        }
      });

      dispatch({
        type: FETCH_SEARCHED_ORDERS,
        payload: response.data.orders
      });
    } catch (error) {
      handleError(error, dispatch);
    } finally {
      dispatch(setOrderLoading(false));
    }
  };
};

export const fetchOrder = (id, withLoading = true) => {
  return async (dispatch, getState) => {
    try {
      if (withLoading) {
        dispatch(setOrderLoading(true));
      }

      const response = await axios.get(`${API_URL}/order/${id}`);

      dispatch({
        type: FETCH_ORDER,
        payload: response.data.order
      });
    } catch (error) {
      handleError(error, dispatch);
    } finally {
      if (withLoading) {
        dispatch(setOrderLoading(false));
      }
    }
  };
};

export const cancelOrder = () => {
  return async (dispatch, getState) => {
    try {
      const order = getState().order.order;

      await axios.delete(`${API_URL}/order/cancel/${order._id}`);

      dispatch(push(`/dashboard/orders`));
    } catch (error) {
      handleError(error, dispatch);
    }
  };
};

export const updateOrderItemStatus = (itemId, status) => {
  return async (dispatch, getState) => {
    try {
      const order = getState().order.order;

      const response = await axios.put(
        `${API_URL}/order/status/item/${itemId}`,
        {
          orderId: order._id,
          cartId: order.cartId,
          status
        }
      );

      if (response.data.orderCancelled) {
        dispatch(push(`/dashboard/orders`));
      } else {
        dispatch(updateOrderStatus({ itemId, status }));
        dispatch(fetchOrder(order._id, false));
      }

      const successfulOptions = {
        title: `${response.data.message}`,
        position: 'tr',
        autoDismiss: 1
      };

      dispatch(success(successfulOptions));
    } catch (error) {
      handleError(error, dispatch);
    }
  };
};

// Helper function to validate if user has addresses
export const validateUserAddress = () => {
  return async (dispatch, getState) => {
    try {
      // Fetch user addresses if not already available
      const addresses = getState().address?.addresses || [];
      
      if (addresses.length === 0) {
        // Fetch addresses to make sure we have the latest data
        await dispatch(fetchAddresses());
        const updatedAddresses = getState().address?.addresses || [];
        
        if (updatedAddresses.length === 0) {
          // No addresses found
          const warningOptions = {
            title: 'Address Required',
            message: 'Please add a delivery address before placing your order.',
            position: 'tr',
            autoDismiss: 3
          };
          dispatch(warning(warningOptions));
          dispatch(push('/dashboard/address/add'));
          return false;
        }
      }
      
      // Check if user has a default address or at least one address
      const hasDefaultAddress = addresses.some(addr => addr.isDefault);
      
      if (!hasDefaultAddress && addresses.length > 0) {
        // User has addresses but no default one
        const warningOptions = {
          title: 'Default Address Required',
          message: 'Please select a default delivery address.',
          position: 'tr',
          autoDismiss: 3
        };
        dispatch(warning(warningOptions));
        dispatch(push('/dashboard/address'));
        return false;
      }
      
      return true;
    } catch (error) {
      handleError(error, dispatch);
      return false;
    }
  };
};

export const addOrder = () => {
  return async (dispatch, getState) => {
    try {
      const cartId = localStorage.getItem('cart_id');
      const total = getState().cart.cartTotal;
      const addresses = getState().address?.addresses || [];
      
      // Get the default address or first available address
      const defaultAddress = addresses.find(addr => addr.isDefault) || addresses[0];

      if (cartId && defaultAddress) {
        const response = await axios.post(`${API_URL}/order/add`, {
          cartId,
          total,
          addressId: defaultAddress._id, // Send address ID to backend
          address: defaultAddress        // Send full address object for immediate use
        });

        dispatch(push(`/order/success/${response.data.order._id}`));
        dispatch(clearCart());
      } else if (cartId) {
        // Fallback if no address found (shouldn't happen due to validation)
        const response = await axios.post(`${API_URL}/order/add`, {
          cartId,
          total
        });

        dispatch(push(`/order/success/${response.data.order._id}`));
        dispatch(clearCart());
      }
    } catch (error) {
      handleError(error, dispatch);
    }
  };
};

// Updated placeOrder with address validation
export const placeOrder = () => {
  return async (dispatch, getState) => {
    const token = localStorage.getItem('token');
    const cartItems = getState().cart.cartItems;

    if (token && cartItems.length > 0) {
      try {
        // First validate if user has address
        const hasValidAddress = await dispatch(validateUserAddress());
        
        if (hasValidAddress) {
          // Proceed with order placement
          await Promise.all([dispatch(getCartId())]);
          dispatch(addOrder());
          dispatch(toggleCart());
        }
        // If address validation fails, the user will be redirected to address page
        // and cart will remain open
      } catch (error) {
        handleError(error, dispatch);
      }
    } else {
      dispatch(toggleCart());
    }
  };
};

export const clearOrders = () => {
  return {
    type: CLEAR_ORDERS
  };
};
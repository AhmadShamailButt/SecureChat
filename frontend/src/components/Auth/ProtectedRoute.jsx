import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { setUserDetails } from '../../store/slices/userSlice';

const ProtectedRoute = ({ children }) => {
  const dispatch = useDispatch();
  const location = useLocation();
  const { userDetails } = useSelector((state) => state.user);

  // Check authentication status from sessionStorage/localStorage
  useEffect(() => {
    const token = sessionStorage.getItem("token");
    const userStr = sessionStorage.getItem("user");
    
    // If token exists but userDetails is not in Redux, restore it from sessionStorage
    if (token && userStr && !userDetails) {
      try {
        const user = JSON.parse(userStr);
        dispatch(setUserDetails(user));
      } catch (error) {
        console.error("Error parsing user from sessionStorage:", error);
        // Clear invalid data
        sessionStorage.removeItem("token");
        sessionStorage.removeItem("user");
      }
    }
  }, [dispatch, userDetails]);

  // Check if user is authenticated
  const isAuthenticated = sessionStorage.getItem("token") || userDetails;

  if (!isAuthenticated) {
    // Redirect to login page with return url
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

export default ProtectedRoute;


import React, { useState } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const VerifyAccount = ({ email, onSuccess }) => {
  const [code, setCode] = useState('');

  const handleVerify = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${API_URL}/api/auth/verify`, { email, code });
      toast.success("Account verified! Please sign in.");
      if (res.data.token) {
        sessionStorage.setItem("token", res.data.token);
        sessionStorage.setItem("user", JSON.stringify(res.data.user));
      }
      if (onSuccess) onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.error || "Verification failed.");
      console.log(err);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-white dark:bg-gray-800 p-6 rounded-md shadow-md w-96">
        <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Verify Your Account</h2>
        <form onSubmit={handleVerify}>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Enter 6-digit code"
            className="w-full p-2 border rounded-md mb-4 bg-white dark:bg-gray-700 text-black dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
            required
          />
          <button
            type="submit"
            className="w-full bg-blue-500 text-white py-2 px-4 rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Verify Account
          </button>
        </form>
      </div>
    </div>
  );
};

export default VerifyAccount;


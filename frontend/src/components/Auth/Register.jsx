import React, { useState } from "react";
import axios from "axios";
import { toast } from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { Button } from "../ui/Button";
import axiosInstance from "../../store/axiosInstance";

const Register = ({ onClose, onSwitchToSignIn }) => {
  const [formData, setFormData] = useState({
    fullName: "",
    department: "",
    email: "",
    password: "",
    gender: "",
  });

  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData((prevData) => ({
      ...prevData,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { email, gender } = formData;

    if (!email.endsWith("@lhr.nu.edu.pk")) {
      toast.error("Only FAST NUCES Lahore emails are allowed.");
      return;
    }

    if (!["male", "female", "other"].includes(gender.toLowerCase())) {
      toast.error("Please select a valid gender.");
      return;
    }

    try {
      setLoading(true);
      const res = await axiosInstance.post("/auth/signup", formData);
      toast.success(`Welcome, ${res.data.user.fullName || 'User'}! Account created successfully.`);
      
      if (res.data.token) {
        sessionStorage.setItem("token", res.data.token);
        sessionStorage.setItem("user", JSON.stringify(res.data.user));
      }

      if (onClose) onClose();
      navigate("/chat");
    } catch (err) {
      toast.error(err.response?.data?.error || "Signup failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
      <div className="relative bg-white dark:bg-gray-800 p-6 rounded-md shadow-md w-[400px]">
        {/* Close Icon */}
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-gray-600 dark:text-gray-300 hover:text-black dark:hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-2xl font-bold mb-4 text-center text-gray-900 dark:text-white">Sign Up</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            name="fullName"
            placeholder="Full Name"
            value={formData.fullName}
            onChange={handleChange}
            className="w-full p-2 border rounded-md mb-3 bg-white dark:bg-gray-700 text-black dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
            required
          />
          <select
            name="department"
            value={formData.department}
            onChange={handleChange}
            className="w-full p-2 border rounded-md mb-3 bg-white dark:bg-gray-700 text-black dark:text-white"
            required
          >
            <option value="">Select Department</option>
            <option value="Computer Science">Computer Science</option>
            <option value="Electrical Engineering">Electrical Engineering</option>
            <option value="Civil Engineering">Civil Engineering</option>
            <option value="Management">Management</option>
            <option value="Science and Humanities">Science and Humanities</option>
          </select>

          <input
            type="email"
            name="email"
            placeholder="FAST Email"
            value={formData.email}
            onChange={handleChange}
            className="w-full p-2 border rounded-md mb-3 bg-white dark:bg-gray-700 text-black dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
            required
          />
          <input
            type="password"
            name="password"
            placeholder="Password"
            value={formData.password}
            onChange={handleChange}
            className="w-full p-2 border rounded-md mb-3 bg-white dark:bg-gray-700 text-black dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
            required
          />
          <select
            name="gender"
            value={formData.gender}
            onChange={handleChange}
            className="w-full p-2 border rounded-md mb-4 bg-white dark:bg-gray-700 text-black dark:text-white"
            required
          >
            <option value="">Select Gender</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>

          <Button
            type="submit"
            disabled={loading}
            isLoading={loading}
            variant="primary"
            className="w-full"
          >
            Sign Up
          </Button>
        </form>

        <p className="mt-4 text-sm text-center text-gray-600 dark:text-gray-300">
          Already have an account?{" "}
          <span
            onClick={onSwitchToSignIn}
            className="text-blue-600 cursor-pointer hover:underline dark:text-blue-400"
          >
            Sign In
          </span>
        </p>
      </div>
    </div>
  );
};

export default Register;


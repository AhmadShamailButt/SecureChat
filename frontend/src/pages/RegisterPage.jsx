import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { toast } from 'react-hot-toast';
import { Button } from '../components/ui/Button';
import { signUp } from '../store/slices/userSlice';

export default function RegisterPage() {
  const [formData, setFormData] = useState({
    fullName: "",
    department: "",
    email: "",
    password: "",
    gender: "",
  });
  const dispatch = useDispatch();
  const { loading, error, userDetails } = useSelector((state) => state.user);
  const navigate = useNavigate();

  // Redirect if already authenticated
  useEffect(() => {
    const token = sessionStorage.getItem("token");
    const isAuthenticated = token || userDetails;
    if (isAuthenticated) {
      navigate("/", { replace: true });
    }
  }, [userDetails, navigate]);

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

    const response = await dispatch(signUp(formData));
    
    if (response.meta.requestStatus === "fulfilled") {
      toast.success(`Welcome, ${response.payload.user.fullName || 'User'}! Account created successfully.`);
      navigate("/");
    } else {
      toast.error(response.payload || "Signup failed.");
    }
  };

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center bg-background px-4 py-16 w-full" style={{ margin: 0, paddingTop: '4rem' }}>
      <div className="max-w-md w-full bg-card p-8 rounded-lg shadow-elevated border border-border">
        <h2 className="text-3xl font-bold mb-6 text-center text-foreground">
          Sign Up
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="text"
              name="fullName"
              placeholder="Full Name"
              value={formData.fullName}
              onChange={handleChange}
              className="w-full p-3 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              required
            />
          </div>
          <div>
            <select
              name="department"
              value={formData.department}
              onChange={handleChange}
              className="w-full p-3 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              required
            >
              <option value="">Select Department</option>
              <option value="Computer Science">Computer Science</option>
              <option value="Electrical Engineering">Electrical Engineering</option>
              <option value="Civil Engineering">Civil Engineering</option>
              <option value="Management">Management</option>
              <option value="Science and Humanities">Science and Humanities</option>
            </select>
          </div>
          <div>
            <input
              type="email"
              name="email"
              placeholder="FAST Email"
              value={formData.email}
              onChange={handleChange}
              className="w-full p-3 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              required
            />
          </div>
          <div>
            <input
              type="password"
              name="password"
              placeholder="Password"
              value={formData.password}
              onChange={handleChange}
              className="w-full p-3 border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              required
            />
          </div>
          <div>
            <select
              name="gender"
              value={formData.gender}
              onChange={handleChange}
              className="w-full p-3 border border-input rounded-md bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              required
            >
              <option value="">Select Gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>

          <Button
            type="submit"
            disabled={loading}
            isLoading={loading}
            variant="primary"
            className="w-full"
            size="lg"
          >
            Sign Up
          </Button>
        </form>

        <p className="mt-6 text-sm text-center text-muted-foreground">
          Already have an account?{" "}
          <Link
            to="/login"
            className="text-primary hover:underline font-semibold"
          >
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
}


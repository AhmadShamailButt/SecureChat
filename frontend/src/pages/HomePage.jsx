import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Button } from '../components/ui/Button';
import { MessageSquare } from 'lucide-react';

export default function HomePage() {
  const navigate = useNavigate();
  const { userDetails } = useSelector((state) => state.user);
  const isAuthenticated = sessionStorage.getItem("token") || userDetails;

  return (
    <div className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center bg-background px-4 py-16" style={{ margin: 0 }}>
      <div className="max-w-2xl w-full text-center space-y-8">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="relative flex items-center justify-center h-20 w-20 bg-primary rounded-full shadow-elevated">
            <MessageSquare className="h-12 w-12 text-primary-foreground" />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-5xl md:text-6xl font-bold text-foreground mb-4">
          SecureChat
        </h1>

        {/* Description */}
        <p className="text-xl md:text-2xl text-muted-foreground mb-12 max-w-xl mx-auto">
          End-to-end encrypted messaging for secure conversations within the FAST NUCES community
        </p>

        {/* CTA Buttons - Only show if not logged in */}
        {!isAuthenticated && (
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button
              onClick={() => navigate("/register")}
              variant="primary"
              size="lg"
              className="text-lg px-8 py-6 w-full sm:w-auto"
            >
              Get Started
            </Button>
            <Button
              onClick={() => navigate("/login")}
              variant="outline"
              size="lg"
              className="text-lg px-8 py-6 w-full sm:w-auto"
            >
              Sign In
            </Button>
          </div>
        )}

        {/* Welcome message if logged in */}
        {isAuthenticated && userDetails && (
          <div className="flex flex-col gap-4 justify-center items-center">
            <p className="text-lg text-muted-foreground">
              Welcome back, <span className="font-semibold text-foreground">{userDetails.fullName}</span>!
            </p>
            <Button
              onClick={() => navigate("/chat")}
              variant="primary"
              size="lg"
              className="text-lg px-8 py-6 w-full sm:w-auto"
            >
              Go to Chat
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

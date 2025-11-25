import React from 'react';
import { Link } from 'react-router-dom';

const Footer = () => {
  return (
    <footer className="bg-card border-t border-border mt-auto">
      <div className="w-full px-4 py-8 md:py-10">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 md:gap-8">
          {/* Logo and description */}
          <div className="flex flex-col gap-2">
            <Link to="/" className="flex items-center gap-2">
              <div className="relative flex items-center justify-center h-9 w-9 bg-primary rounded-full overflow-hidden">
                <span className="text-primary-foreground font-bold text-lg">S</span>
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-primary to-primary-700 bg-clip-text text-transparent">
                SecureChat
              </span>
            </Link>
            <p className="text-sm text-muted-foreground max-w-md leading-snug">
              End-to-end encrypted messaging for secure conversations.
            </p>
          </div>

          {/* Quick Links */}
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-foreground">Quick Links</h3>
            <ul className="flex flex-wrap gap-4 md:gap-6">
              <li>
                <Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Home
                </Link>
              </li>
              <li>
                <Link to="/chat" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Chat
                </Link>
              </li>
              <li>
                <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Login
                </Link>
              </li>
              <li>
                <Link to="/register" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Register
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-foreground">Contact</h3>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <li>FAST NUCES Lahore</li>
              <li>support@securechat.com</li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-border">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              &copy; {new Date().getFullYear()} SecureChat. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;


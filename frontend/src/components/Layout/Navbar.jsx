import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, User, Moon, Sun, MessageSquare, LogOut, Settings } from 'lucide-react';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';
import { useSelector, useDispatch } from 'react-redux';
import { logout } from '../../store/slices/userSlice';

const Navbar = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const dispatch = useDispatch();
  const { userDetails: user } = useSelector((state) => state.user);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (
      localStorage.theme === 'dark' ||
      (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)
    ) {
      document.documentElement.classList.add('dark');
      setIsDarkMode(true);
    } else {
      document.documentElement.classList.remove('dark');
      setIsDarkMode(false);
    }
  }, []);

  const toggleDarkMode = () => {
    if (isDarkMode) {
      document.documentElement.classList.remove('dark');
      localStorage.theme = 'light';
      setIsDarkMode(false);
    } else {
      document.documentElement.classList.add('dark');
      localStorage.theme = 'dark';
      setIsDarkMode(true);
    }
  };

  const handleLogout = () => {
    dispatch(logout());
    navigate('/login', { replace: true });
  };

  const navLinks = [
    { name: 'Home', path: '/' },
    { name: 'Chat', path: '/chat' },
  ];

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <>
      <header 
        className={cn(
          'fixed top-0 left-0 right-0 z-40 transition-all duration-300 w-full border-b border-border',
          isScrolled ? 'bg-white/80 dark:bg-black/80 backdrop-blur-md shadow-sm' : 'bg-background/80 backdrop-blur-sm'
        )}
        style={{ margin: 0, padding: 0 }}
      >
        <div className="w-full px-4 sm:px-6 lg:px-8" style={{ margin: 0 }}>
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2">
              <div className="relative flex items-center justify-center h-8 w-8 bg-primary rounded-full overflow-hidden">
                <MessageSquare className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-primary to-primary-700 bg-clip-text text-transparent">
                SecureChat
              </span>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center space-x-8">
              <Link
                to="/"
                className={cn(
                  "text-sm font-medium transition-colors duration-200 hover:text-primary relative py-2 px-1",
                  location.pathname === "/"
                    ? "text-primary"
                    : "text-foreground/80 hover:text-foreground"
                )}
              >
                Home
                {location.pathname === "/" && (
                  <span className="absolute left-0 right-0 bottom-0 h-0.5 bg-primary rounded-full transform transition-transform duration-300"></span>
                )}
              </Link>
              {user && (
                <Link
                  to="/chat"
                  className={cn(
                    "text-sm font-medium transition-colors duration-200 hover:text-primary relative py-2 px-1",
                    location.pathname === "/chat"
                      ? "text-primary"
                      : "text-foreground/80 hover:text-foreground"
                  )}
                >
                  Chat
                  {location.pathname === "/chat" && (
                    <span className="absolute left-0 right-0 bottom-0 h-0.5 bg-primary rounded-full transform transition-transform duration-300"></span>
                  )}
                </Link>
              )}
            </nav>

            {/* Right Actions */}
            <div className="hidden md:flex items-center space-x-4">
              <button 
                onClick={toggleDarkMode} 
                className="p-2 rounded-full hover:bg-muted transition-colors"
                aria-label="Toggle dark mode"
              >
                {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>

              {!user ? (
                <>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => navigate('/login')}
                  >
                    <User className="mr-2 h-4 w-4" /> Sign In
                  </Button>
                  <Button 
                    size="sm" 
                    onClick={() => navigate('/register')}
                    className="dark:bg-muted dark:hover:bg-button-hover dark:text-white"
                  >
                    Get Started
                  </Button>
                </>
              ) : (
                <>
                  <span
                    onClick={() => navigate('/profile')}
                    className="text-sm font-semibold flex items-center gap-2 cursor-pointer hover:text-primary transition-colors"
                  >
                    <User className="h-5 w-5" />
                    {user.fullName}
                    <Settings className="h-5 w-5" />
                  </span>
                  <Button variant="destructive" size="sm" onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" /> Logout
                  </Button>
                </>
              )}
            </div>

            {/* Mobile Menu Button */}
            <div className="flex md:hidden items-center gap-4">
              <button 
                onClick={toggleDarkMode} 
                className="p-2 rounded-full hover:bg-muted transition-colors"
                aria-label="Toggle dark mode"
              >
                {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>
              <button 
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)} 
                className="p-2 rounded-md"
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            </div>
          </div>
        </div>

         {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="md:hidden border-t border-border bg-card">
              <div className="px-4 py-3 space-y-3">
                <Link
                  to="/"
                  onClick={closeMobileMenu}
                  className={cn(
                    "block text-sm font-medium transition-colors py-2",
                    location.pathname === "/"
                      ? "text-primary"
                      : "text-foreground/80 hover:text-foreground"
                  )}
                >
                  Home
                </Link>
                {user && (
                  <Link
                    to="/chat"
                    onClick={closeMobileMenu}
                    className={cn(
                      "block text-sm font-medium transition-colors py-2",
                      location.pathname === "/chat"
                        ? "text-primary"
                        : "text-foreground/80 hover:text-foreground"
                    )}
                  >
                    Chat
                  </Link>
                )}
              {!user ? (
                <div className="flex flex-col gap-2 pt-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => {
                      closeMobileMenu();
                      navigate('/login');
                    }}
                    className="w-full"
                  >
                    Sign In
                  </Button>
                  <Button 
                    size="sm" 
                    onClick={() => {
                      closeMobileMenu();
                      navigate('/register');
                    }}
                    className="w-full"
                  >
                    Get Started
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-2 pt-2 border-t border-border">
                  <button
                    onClick={() => {
                      closeMobileMenu();
                      navigate('/profile');
                    }}
                    className="text-sm font-semibold flex items-center gap-2 py-2 hover:text-primary transition-colors"
                  >
                    <User className="h-5 w-5" />
                    {user.fullName}
                  </button>
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    onClick={() => {
                      closeMobileMenu();
                      handleLogout();
                    }}
                    className="w-full"
                  >
                    <LogOut className="mr-2 h-4 w-4" /> Logout
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </header>
    </>
  );
};

export default Navbar;


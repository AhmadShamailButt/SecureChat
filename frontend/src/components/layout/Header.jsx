import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, User, Moon, Sun, Car, LogOut } from 'lucide-react';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';
import SignIn from '../Authentication/SignIn';
import SignUp from '../Authentication/SignUp';


const Header = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState('signin');
  const [user, setUser] = useState(null); // ⬅️ user state
  const location = useLocation();
  const navigate = useNavigate();
  

  // Load user from localStorage
  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) setUser(JSON.parse(storedUser));
  }, []);
  useEffect(() => {
  if (authModalOpen) window.scrollTo({ top: 0, behavior: 'smooth' });
}, [authModalOpen]);

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
  useEffect(() => {
  if (location.state?.openSignUp) {
    setAuthMode('signup');
    setAuthModalOpen(true);
    // clear the state so it doesn't trigger again on reload
    navigate(location.pathname, { replace: true, state: {} });
  }
}, [location, navigate]);

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

  const navLinks = [
    { name: 'Home', path: '/' },
    { name: 'Dashboard', path: '/dashboard' },
    { name: 'Find Carpool', path: '/carpools' },
    { name: 'Messages', path: '/messages' },
  ];

  const closeMobileMenu = () => setMobileMenuOpen(false);

  const openSignIn = () => {
    setAuthMode('signin');
    setAuthModalOpen(true);
  };

  const openSignUp = () => {
    setAuthMode('signup');
    setAuthModalOpen(true);
  };

  const logout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    setUser(null);
    navigate('/');
  };

  return (
    <>
      <header className={cn(
        'fixed top-0 left-0 right-0 z-40 transition-all duration-300 w-full',
        isScrolled ? 'bg-white/80 dark:bg-black/80 backdrop-blur-md shadow-sm' : 'bg-transparent'
      )}>
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2">
              <div className="relative flex items-center justify-center h-8 w-8 bg-primary rounded-full overflow-hidden">
                <Car className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-primary to-primary-700 bg-clip-text text-transparent">
                GoFAST
              </span>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center space-x-8">
              {user && navLinks.map((link) => (
                <Link
                  key={link.name}
                  to={link.path}
                  className={cn(
                    "text-sm font-medium transition-colors duration-200 hover:text-primary relative py-2 px-1",
                    location.pathname === link.path 
                      ? "text-primary" 
                      : "text-foreground/80 hover:text-foreground"
                  )}
                >
                  {link.name}
                  {location.pathname === link.path && (
                    <span className="absolute left-0 right-0 bottom-0 h-0.5 bg-primary rounded-full transform transition-transform duration-300"></span>
                  )}
                </Link>
              ))}
            </nav>

            {/* Right Actions */}
            <div className="hidden md:flex items-center space-x-4">
              <button onClick={toggleDarkMode} className="p-2 rounded-full hover:bg-muted transition-colors">
                {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>

              {!user ? (
                <>
                  <Button variant="outline" size="sm" onClick={openSignIn}>
                    <User className="mr-2 h-4 w-4" /> Sign In
                  </Button>
                  <Button size="sm" onClick={openSignUp} className="dark:bg-muted dark:hover:bg-button-hover dark:text-white">
                    Get Started
                  </Button>
                </>
              ) : (
                <>
                <span
  onClick={() => navigate('/profile-settings')}
  className="text-sm font-semibold flex items-center gap-2 cursor-pointer hover:text-primary transition-colors"
>
  <User className="h-5 w-5" />
  {user.fullName}
</span>

                  <Button variant="destructive" size="sm" onClick={logout}>
                    <LogOut className="mr-2 h-4 w-4" /> Logout
                  </Button>
                </>
              )}
            </div>

            {/* Mobile Menu Button */}
            <div className="flex md:hidden items-center gap-4">
              <button onClick={toggleDarkMode} className="p-2 rounded-full hover:bg-muted transition-colors">
                {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>
              <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 rounded-md">
                {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Auth Modals */}
      {authModalOpen && (
  authMode === 'signin' ? 
    <SignIn 
      onClose={() => { setAuthModalOpen(false); setUser(JSON.parse(localStorage.getItem('user'))); }} 
      onSwitchToSignUp={() => setAuthMode('signup')}
    /> 
    : 
    <SignUp 
      onClose={() => { setAuthModalOpen(false); setUser(JSON.parse(localStorage.getItem('user'))); }} 
      onSwitchToSignIn={() => setAuthMode('signin')}
    />
)}

    </>
  );
};

export default Header;

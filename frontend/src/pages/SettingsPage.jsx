import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { User, Mail, Building2, Shield, Bell, Key, Moon, Sun, LogOut } from 'lucide-react';
import { cn } from '../lib/utils';
import { logout } from '../store/slices/userSlice';
import { Button } from '../components/ui/Button';
import NavigationSidebar from '../components/Chat/NavigationSidebar';
import ContactsSidebar from '../components/Chat/ContactsSidebar';
import { fetchContacts, getFriendRequests, fetchGroups, getGroupRequests } from '../store/slices/chatSlice';

export default function SettingsPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { userDetails: user } = useSelector((state) => state.user);
  const { contacts } = useSelector((state) => state.chat);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [activeView, setActiveView] = useState('messages');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Load contacts on mount
  useEffect(() => {
    if (user) {
      dispatch(fetchContacts());
      dispatch(getFriendRequests());
      dispatch(fetchGroups());
      dispatch(getGroupRequests());
    }
  }, [user, dispatch]);

  // Check dark mode on mount
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

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Please log in to view settings</p>
      </div>
    );
  }

  return (
    <div className="w-full h-screen flex overflow-hidden" style={{ margin: 0, padding: 0 }}>
      {/* Navigation Sidebar - Always visible */}
      <NavigationSidebar
        activeView={activeView}
        onViewChange={setActiveView}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />
      
      {/* Contacts Sidebar - Always visible */}
      <ContactsSidebar
        contacts={contacts}
        activeId={null}
        setActiveId={() => {}}
        isCollapsed={isSidebarCollapsed}
      />

      {/* Settings Content */}
      <div className="flex-1 overflow-y-auto bg-background">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Settings</h1>
          <p className="text-muted-foreground">Manage your account settings and preferences</p>
        </div>

        {/* Account Information Section */}
        <div className="bg-card border border-border rounded-lg shadow-elevated p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
              <User className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">Account Information</h2>
              <p className="text-sm text-muted-foreground">Your personal account details</p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Full Name */}
            <div className="flex items-start gap-4 p-4 bg-background rounded-lg border border-border">
              <div className="flex-shrink-0 mt-1">
                <User className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <label className="text-sm font-medium text-muted-foreground mb-1 block">
                  Full Name
                </label>
                <p className="text-base text-foreground">{user.fullName || 'Not set'}</p>
              </div>
            </div>

            {/* Email */}
            <div className="flex items-start gap-4 p-4 bg-background rounded-lg border border-border">
              <div className="flex-shrink-0 mt-1">
                <Mail className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <label className="text-sm font-medium text-muted-foreground mb-1 block">
                  Email Address
                </label>
                <p className="text-base text-foreground break-all">{user.email || 'Not set'}</p>
              </div>
            </div>

            {/* Department */}
            {user.department && (
              <div className="flex items-start gap-4 p-4 bg-background rounded-lg border border-border">
                <div className="flex-shrink-0 mt-1">
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <label className="text-sm font-medium text-muted-foreground mb-1 block">
                    Department
                  </label>
                  <p className="text-base text-foreground">{user.department}</p>
                </div>
              </div>
            )}

            {/* User ID */}
            <div className="flex items-start gap-4 p-4 bg-background rounded-lg border border-border">
              <div className="flex-shrink-0 mt-1">
                <Shield className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <label className="text-sm font-medium text-muted-foreground mb-1 block">
                  User ID
                </label>
                <p className="text-base text-foreground font-mono text-sm break-all">
                  {user.id || user._id || 'Not available'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Security Section */}
        <div className="bg-card border border-border rounded-lg shadow-elevated p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
              <Key className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">Security</h2>
              <p className="text-sm text-muted-foreground">Manage your account security</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-background rounded-lg border border-border">
              <div className="flex items-center gap-3">
                <Key className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-base font-medium text-foreground">Change Password</p>
                  <p className="text-sm text-muted-foreground">Update your account password</p>
                </div>
              </div>
              <button
                className="px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10 rounded-lg transition-colors"
                disabled
              >
                Coming Soon
              </button>
            </div>
          </div>
        </div>

        {/* Preferences Section */}
        <div className="bg-card border border-border rounded-lg shadow-elevated p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
              <Bell className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">Preferences</h2>
              <p className="text-sm text-muted-foreground">Customize your experience</p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Theme Toggle */}
            <div className="flex items-center justify-between p-4 bg-background rounded-lg border border-border">
              <div className="flex items-center gap-3">
                {isDarkMode ? (
                  <Moon className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <Sun className="h-5 w-5 text-muted-foreground" />
                )}
                <div>
                  <p className="text-base font-medium text-foreground">Theme</p>
                  <p className="text-sm text-muted-foreground">
                    {isDarkMode ? 'Dark mode' : 'Light mode'}
                  </p>
                </div>
              </div>
              <button
                onClick={toggleDarkMode}
                className={cn(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                  isDarkMode ? "bg-primary" : "bg-muted"
                )}
                aria-label="Toggle theme"
              >
                <span
                  className={cn(
                    "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                    isDarkMode ? "translate-x-6" : "translate-x-1"
                  )}
                />
              </button>
            </div>

            <div className="flex items-center justify-between p-4 bg-background rounded-lg border border-border">
              <div className="flex items-center gap-3">
                <Bell className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-base font-medium text-foreground">Notifications</p>
                  <p className="text-sm text-muted-foreground">Manage notification preferences</p>
                </div>
              </div>
              <button
                className="px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10 rounded-lg transition-colors"
                disabled
              >
                Coming Soon
              </button>
            </div>
          </div>
        </div>

        {/* Logout Section */}
        <div className="bg-card border border-border rounded-lg shadow-elevated p-6 mt-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-12 w-12 rounded-full bg-destructive/20 flex items-center justify-center">
              <LogOut className="h-6 w-6 text-destructive" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">Account Actions</h2>
              <p className="text-sm text-muted-foreground">Manage your account</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-background rounded-lg border border-border">
              <div className="flex items-center gap-3">
                <LogOut className="h-5 w-5 text-destructive" />
                <div>
                  <p className="text-base font-medium text-foreground">Logout</p>
                  <p className="text-sm text-muted-foreground">Sign out of your account</p>
                </div>
              </div>
              <Button
                onClick={handleLogout}
                variant="destructive"
                className="px-4 py-2"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}



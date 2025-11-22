// Export all authentication components from a single file
import SignIn from './SignIn';
import SignUp from './SignUp';
import AuthModal, { useAuthModal } from './AuthModal';

export {
  SignIn,
  SignUp,
  AuthModal,
  useAuthModal
};
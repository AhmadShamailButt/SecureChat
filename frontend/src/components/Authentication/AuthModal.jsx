import React, { useState } from "react";
import SignIn from "./SignIn";
import SignUp from "./SignUp";

const AuthModal = ({ onClose }) => {
  const [showSignIn, setShowSignIn] = useState(true);

  const switchToSignUp = () => setShowSignIn(false);
  const switchToSignIn = () => setShowSignIn(true);

  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        {showSignIn ? (
          <SignIn onSwitchToSignUp={switchToSignUp} onClose={onClose} />
        ) : (
          <SignUp onSwitchToSignIn={switchToSignIn} onClose={onClose} />
        )}
      </div>
    </div>
  );
};

export default AuthModal;

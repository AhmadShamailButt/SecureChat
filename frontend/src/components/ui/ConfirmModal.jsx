import React from "react";
import ReactDOM from "react-dom";
import { Button } from "./Button";

const ConfirmModal = ({ isOpen, onClose, onConfirm, message }) => {
  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div
      className="confirm-modal-wrapper fixed inset-0 z-50 flex items-center justify-center bg-black/50 pointer-events-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 w-[90%] max-w-md pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
          {message || "Are you sure?"}
        </h2>
        <div className="flex justify-end space-x-3">
          <Button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            variant="outline"
          >
            No
          </Button>
          <Button
            onClick={(e) => {
              e.stopPropagation();
              onConfirm();
            }}
            variant="destructive"
          >
            Yes
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ConfirmModal;


import React from "react";
import { AlertTriangle } from "lucide-react";

const AlertBox = ({ message, onClose }) => {
  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 w-full max-w-md z-50">
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded shadow-md flex items-start gap-2">
        <AlertTriangle className="w-5 h-5 mt-0.5 text-red-600" />
        <div className="flex-1">
          <strong className="font-bold">Alert:</strong>
          <span className="block sm:inline ml-1">{message}</span>
        </div>
        {onClose && (
          <button
            className="text-sm ml-auto text-red-600 hover:text-red-800"
            onClick={onClose}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
};

export default AlertBox;

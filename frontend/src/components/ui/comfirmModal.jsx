import React from "react";
import ReactDOM from "react-dom";

const ConfirmModal = ({ isOpen, onClose, onConfirm, message }) => {
    if (!isOpen) return null;

    return ReactDOM.createPortal(
        <div
            className="confirm-modal-wrapper fixed inset-0 z-50 flex items-center justify-center bg-black/50 pointer-events-auto"
            onClick={(e) => e.stopPropagation()} // Prevent modal click from closing
        >
            <div
                className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 w-[90%] max-w-md pointer-events-auto"
                onClick={(e) => e.stopPropagation()} // Prevent click event from closing the modal
            >
                <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                    {message || "Are you sure?"}
                </h2>
                <div className="flex justify-end space-x-3">
                    <button
                        onClick={(e) => { e.stopPropagation(); onClose(); }} // Prevent click propagation
                        className="px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-800 rounded"
                    >
                        No
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); onConfirm(); }} // Prevent click propagation
                        className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded"
                    >
                        Yes
                    </button>
                </div>
            </div>
        </div>,
        document.body // Mount outside modal stack
    );
};

export default ConfirmModal;

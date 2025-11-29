import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/Button';
import { Filter } from 'lucide-react';
import { fetchCallHistory, deleteCallFromHistory, initiateCall } from '../../store/slices/voiceCallSlice';
import CallHistoryList from './CallHistoryList';
import { cn } from '../../lib/utils';
import { toast } from 'react-hot-toast';

const STATUS_FILTERS = [
  { value: 'all', label: 'All Calls' },
  { value: 'answered', label: 'Answered' },
  { value: 'missed', label: 'Missed' },
  { value: 'declined', label: 'Declined' }
];

export default function CallHistory({ isOpen, onOpenChange }) {
  const dispatch = useDispatch();
  const { callHistory, isHistoryLoading } = useSelector((state) => state.voiceCall);
  const { userDetails: user } = useSelector((state) => state.user);
  const [statusFilter, setStatusFilter] = useState('all');
  const [deletingCallId, setDeletingCallId] = useState(null);

  // Fetch call history when dialog opens
  useEffect(() => {
    if (isOpen) {
      dispatch(fetchCallHistory({ limit: 100, offset: 0 }));
    }
  }, [isOpen, dispatch]);

  // Filter calls by status
  const filteredCalls = React.useMemo(() => {
    if (!callHistory || callHistory.length === 0) return [];
    if (statusFilter === 'all') return callHistory;
    return callHistory.filter(call => call.status === statusFilter);
  }, [callHistory, statusFilter]);

  const handleDeleteCall = async (callId, e) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this call from history?')) {
      setDeletingCallId(callId);
      try {
        await dispatch(deleteCallFromHistory(callId)).unwrap();
        // State is updated by the reducer, no need to refetch
      } catch (error) {
        console.error('Error deleting call:', error);
      } finally {
        setDeletingCallId(null);
      }
    }
  };

  const handleCallClick = (contact) => {
    if (!contact) {
      toast.error('Contact information not available');
      return;
    }

    // Allow calling even if user is offline

    if (!user?.id) {
      toast.error('User information not available');
      return;
    }

    // Use contact.id (which is the user ID from call history)
    const contactId = contact.id;
    if (!contactId) {
      toast.error('Contact ID not available');
      return;
    }

    dispatch(initiateCall({
      contactId: contactId,
      contactName: contact.name,
      conversationId: null
    }));
    onOpenChange(false); // Close history modal
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Call History</DialogTitle>
          <DialogDescription>
            View and manage your call history
          </DialogDescription>
        </DialogHeader>

        {/* Filter buttons */}
        <div className="flex gap-2 pb-4 border-b border-border overflow-x-auto">
          {STATUS_FILTERS.map((filter) => (
            <Button
              key={filter.value}
              onClick={() => setStatusFilter(filter.value)}
              variant={statusFilter === filter.value ? 'default' : 'outline'}
              size="sm"
              className={cn(
                "whitespace-nowrap",
                statusFilter === filter.value && "bg-primary text-primary-foreground"
              )}
            >
              <Filter className="h-3 w-3 mr-1" />
              {filter.label}
            </Button>
          ))}
        </div>

        {/* Call history list */}
        <div className="flex-1 overflow-y-auto mt-4">
          <CallHistoryList
            calls={filteredCalls}
            onCallClick={handleCallClick}
            isLoading={isHistoryLoading}
            onDelete={handleDeleteCall}
            deletingCallId={deletingCallId}
          />
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-4 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}


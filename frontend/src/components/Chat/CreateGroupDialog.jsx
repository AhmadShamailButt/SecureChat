import React, { useState } from 'react';
import { Users, X, Loader2 } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import { toast } from 'react-hot-toast';
import { createGroup, fetchGroups } from '../../store/slices/chatSlice';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';
import { initializeGroupEncryption } from '../../utils/groupEncryption';

export default function CreateGroupDialog({ open, onOpenChange, onGroupCreated }) {
  const [groupName, setGroupName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedFriends, setSelectedFriends] = useState([]);
  const [isCreating, setIsCreating] = useState(false);
  const dispatch = useDispatch();
  const { contacts } = useSelector((state) => state.chat);
  const { userDetails: user } = useSelector((state) => state.user);

  const handleToggleFriend = (friendId) => {
    setSelectedFriends(prev => 
      prev.includes(friendId)
        ? prev.filter(id => id !== friendId)
        : [...prev, friendId]
    );
  };

  const handleCreate = async () => {
    if (!groupName.trim()) {
      toast.error("Group name is required");
      return;
    }

    setIsCreating(true);
    try {
      // Create the group
      const result = await dispatch(createGroup({
        name: groupName.trim(),
        description: description.trim(),
        memberIds: selectedFriends
      }));

      // Check if group creation was successful
      if (result.meta.requestStatus === 'fulfilled' && result.payload?.group) {
        const newGroup = result.payload.group;

        console.log('[CREATE GROUP] Group created:', newGroup);
        console.log('[CREATE GROUP] Members:', newGroup.members);
        console.log('[CREATE GROUP] Creator ID:', user.id || user._id);

        // Initialize encryption for the group
        toast.loading('Setting up encryption...', { id: 'group-encryption' });
        try {
          // Ensure we have all the members including the creator
          const allMembers = newGroup.members || [];

          console.log('[CREATE GROUP] Initializing encryption for members:', allMembers.map(m => m.id || m._id));

          await initializeGroupEncryption(
            newGroup.id,
            allMembers,
            user.id || user._id
          );
          toast.success('Group created with encryption!', { id: 'group-encryption' });
        } catch (encryptError) {
          console.error('[CREATE GROUP] Failed to initialize group encryption:', encryptError);
          console.error('[CREATE GROUP] Error details:', {
            message: encryptError.message,
            stack: encryptError.stack,
            groupId: newGroup.id,
            memberCount: newGroup.members?.length
          });
          toast.error('Group created but encryption setup failed', { id: 'group-encryption' });
        }
      }

      await dispatch(fetchGroups());
      setGroupName('');
      setDescription('');
      setSelectedFriends([]);
      onOpenChange(false);

      // Callback to switch to groups tab after creation
      if (onGroupCreated) {
        onGroupCreated();
      }
    } catch (error) {
      // Error is already handled in the thunk
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    setGroupName('');
    setDescription('');
    setSelectedFriends([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Group</DialogTitle>
          <DialogDescription>
            Create a new group and add friends to start group conversations.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">
              Group Name *
            </label>
            <input
              type="text"
              placeholder="Enter group name..."
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring transition"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">
              Description (Optional)
            </label>
            <textarea
              placeholder="Enter group description..."
              rows={3}
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring transition resize-none"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              Add Friends ({selectedFriends.length} selected)
            </label>
            <div className="max-h-48 overflow-y-auto border border-input rounded-lg p-2 space-y-2">
              {contacts.length > 0 ? (
                contacts.map((friend) => (
                  <label
                    key={friend.userId}
                    className={cn(
                      "flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors",
                      selectedFriends.includes(friend.userId)
                        ? "bg-primary/10 border border-primary/20"
                        : "hover:bg-muted/50"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selectedFriends.includes(friend.userId)}
                      onChange={() => handleToggleFriend(friend.userId)}
                      className="rounded border-input"
                    />
                    <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-sm font-medium text-primary flex-shrink-0">
                      {friend.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{friend.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{friend.email}</p>
                    </div>
                  </label>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No friends to add. Add friends first.
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button
              onClick={handleClose}
              variant="outline"
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              variant="primary"
              disabled={isCreating || !groupName.trim()}
            >
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Users className="h-4 w-4 mr-2" />
                  Create Group
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


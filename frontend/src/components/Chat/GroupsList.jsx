import React, { useState } from 'react';
import { Users, UserPlus } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useDispatch, useSelector } from 'react-redux';
import { searchGlobalUsers, addGroupMember, sendGroupRequest, getGroupRequests } from '../../store/slices/chatSlice';
import { toast } from 'react-hot-toast';
import AddFriendDialog from './AddFriendDialog';
import { addMemberEncryptionKey } from '../../utils/groupEncryption';

export default function GroupsList({ groups, activeGroupId, setActiveGroupId }) {
  const dispatch = useDispatch();
  const { userDetails: user } = useSelector((state) => state.user);
  const [isAddMemberDialogOpen, setIsAddMemberDialogOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);

  const handleAddMember = (group) => {
    setSelectedGroup(group);
    setIsAddMemberDialogOpen(true);
  };

  const handleAddFriendToGroup = async (targetUser) => {
    if (!selectedGroup) return;

    const currentUserId = user?.id || user?._id;
    const targetUserId = targetUser?.id || targetUser?._id;
    
    if (targetUserId === currentUserId || targetUserId === currentUserId?.toString()) {
      toast.error("Cannot add yourself");
      return;
    }

    // Try to add as friend first (if they are friends)
    const addMemberResult = await dispatch(addGroupMember({ groupId: selectedGroup.id, userId: targetUser.id }));
    
    // Check if it failed because they're not friends
    if (addMemberResult.meta.requestStatus === 'rejected') {
      const errorMessage = addMemberResult.payload || '';
      // If the error is about not being friends, automatically send a group request
      if (errorMessage.includes('only add friends') || errorMessage.includes('group request')) {
        // Silently send group request instead
        await dispatch(sendGroupRequest({ groupId: selectedGroup.id, userId: targetUser.id }));
        dispatch(getGroupRequests());
        setIsAddMemberDialogOpen(false);
        setSelectedGroup(null);
        return;
      }
      // For other errors, they're already shown in the thunk
      return;
    }

    // Successfully added friend to group
    if (addMemberResult.meta.requestStatus === 'fulfilled') {
      // Distribute encryption key to new member
      toast.loading('Setting up encryption for new member...', { id: 'member-encryption' });
      try {
        await addMemberEncryptionKey(
          selectedGroup.id,
          targetUserId,
          currentUserId,
          selectedGroup.createdBy.id
        );
        toast.success('Member added with encryption!', { id: 'member-encryption' });
      } catch (encryptError) {
        console.error('Failed to add member encryption key:', encryptError);
        toast.error('Member added but encryption setup failed', { id: 'member-encryption' });
      }

      dispatch(getGroupRequests());
      setIsAddMemberDialogOpen(false);
      setSelectedGroup(null);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {groups.length > 0 ? (
        <div className="space-y-2">
          {groups.map((group) => (
            <div
              key={group.id}
              className={cn(
                "flex items-center justify-between p-3 rounded-lg transition-colors cursor-pointer",
                activeGroupId === group.id ? "bg-primary/10 border border-primary/20" : "hover:bg-muted/50"
              )}
              onClick={() => setActiveGroupId(group.id)}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{group.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'}
                  </p>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddMember(group);
                }}
                className="p-1.5 rounded-full hover:bg-muted transition-colors"
                title="Add member"
              >
                <UserPlus className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center p-4 text-center text-muted-foreground">
          <p className="text-sm">No groups yet. Create one to get started!</p>
        </div>
      )}

      {/* Add Member Dialog - reuse AddFriendDialog but with different handler */}
      {isAddMemberDialogOpen && selectedGroup && (
        <AddFriendDialog 
          open={isAddMemberDialogOpen} 
          onOpenChange={setIsAddMemberDialogOpen}
          onAddUser={handleAddFriendToGroup}
        />
      )}
    </div>
  );
}


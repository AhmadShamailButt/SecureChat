import React, { useState } from 'react';
import { Users, UserPlus, X, Crown, Mail, Shield } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';
import { useDispatch, useSelector } from 'react-redux';
import { addGroupMember, sendGroupRequest, getGroupRequests, fetchGroups } from '../../store/slices/chatSlice';
import { toast } from 'react-hot-toast';
import AddFriendDialog from './AddFriendDialog';
import { addMemberEncryptionKey } from '../../utils/groupEncryption';

export default function GroupDetailsModal({ open, onOpenChange, group }) {
  const dispatch = useDispatch();
  const { userDetails: user } = useSelector((state) => state.user);
  const [isAddMemberDialogOpen, setIsAddMemberDialogOpen] = useState(false);

  if (!group) return null;

  const isCreator = group.createdBy?.id === (user?.id || user?._id);
  const currentUserId = user?.id || user?._id;

  const handleAddMember = async (targetUser) => {
    const targetUserId = targetUser?.id || targetUser?._id;

    if (targetUserId === currentUserId || targetUserId === currentUserId?.toString()) {
      toast.error("Cannot add yourself");
      return;
    }

    // Try to add as friend first (if they are friends)
    const addMemberResult = await dispatch(addGroupMember({
      groupId: group.id,
      userId: targetUser.id
    }));

    // Check if it failed because they're not friends
    if (addMemberResult.meta.requestStatus === 'rejected') {
      const errorMessage = addMemberResult.payload || '';
      // If the error is about not being friends, automatically send a group request
      if (errorMessage.includes('only add friends') || errorMessage.includes('group request')) {
        // Silently send group request instead
        await dispatch(sendGroupRequest({ groupId: group.id, userId: targetUser.id }));
        dispatch(getGroupRequests());
        setIsAddMemberDialogOpen(false);
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
          group.id,
          targetUserId,
          currentUserId,
          group.createdBy.id
        );
        toast.success('Member added with encryption!', { id: 'member-encryption' });
      } catch (encryptError) {
        console.error('Failed to add member encryption key:', encryptError);
        toast.error('Member added but encryption setup failed', { id: 'member-encryption' });
      }

      dispatch(getGroupRequests());
      dispatch(fetchGroups()); // Refresh to get updated member list
      setIsAddMemberDialogOpen(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Group Details</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-6">
            {/* Group Icon and Name */}
            <div className="flex flex-col items-center text-center pb-4 border-b border-border">
              <div className="h-24 w-24 rounded-full bg-primary/20 flex items-center justify-center mb-4">
                <Users className="h-12 w-12 text-primary" />
              </div>
              <h2 className="text-2xl font-semibold text-foreground mb-2">{group.name}</h2>
              {group.description && (
                <p className="text-sm text-muted-foreground max-w-xs">{group.description}</p>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                Created {new Date(group.createdAt).toLocaleDateString()}
              </p>
            </div>

            {/* Group Stats */}
            <div className="grid grid-cols-2 gap-4 pb-4 border-b border-border">
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <Users className="h-5 w-5 text-primary mx-auto mb-1" />
                <p className="text-2xl font-bold text-foreground">{group.memberCount || group.members?.length || 0}</p>
                <p className="text-xs text-muted-foreground">Members</p>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <Shield className="h-5 w-5 text-green-500 mx-auto mb-1" />
                <p className="text-sm font-semibold text-foreground">Encrypted</p>
                <p className="text-xs text-muted-foreground">E2E Enabled</p>
              </div>
            </div>

            {/* Members List */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground">
                  Members ({group.memberCount || group.members?.length || 0})
                </h3>
                <Button
                  onClick={() => setIsAddMemberDialogOpen(true)}
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1"
                >
                  <UserPlus className="h-4 w-4" />
                  Add
                </Button>
              </div>

              <div className="space-y-2">
                {group.members && group.members.length > 0 ? (
                  group.members.map((member) => {
                    const isMemberCreator = member.id === group.createdBy?.id;
                    const isCurrentUser = member.id === currentUserId;

                    return (
                      <div
                        key={member.id}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg transition-colors",
                          isCurrentUser ? "bg-primary/5 border border-primary/20" : "bg-muted/30"
                        )}
                      >
                        {/* Avatar */}
                        <div className="relative">
                          <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-sm font-medium text-primary flex-shrink-0">
                            {member.name?.charAt(0).toUpperCase() || 'U'}
                          </div>
                          {member.isOnline && (
                            <div className="absolute bottom-0 right-0 h-3 w-3 bg-green-500 border-2 border-background rounded-full"></div>
                          )}
                        </div>

                        {/* Member Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-foreground truncate">
                              {member.name}
                              {isCurrentUser && <span className="text-primary"> (You)</span>}
                            </p>
                            {isMemberCreator && (
                              <Crown className="h-4 w-4 text-yellow-500 flex-shrink-0" title="Group Creator" />
                            )}
                          </div>
                          {member.email && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <Mail className="h-3 w-3 text-muted-foreground" />
                              <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                            </div>
                          )}
                          {member.department && (
                            <p className="text-xs text-muted-foreground mt-0.5">{member.department}</p>
                          )}
                        </div>

                        {/* Status */}
                        <div className="flex-shrink-0">
                          {member.isOnline ? (
                            <span className="text-xs text-green-500 font-medium">Online</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">Offline</span>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No members found</p>
                  </div>
                )}
              </div>
            </div>

            {/* Group Creator Info */}
            {group.createdBy && (
              <div className="pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground mb-2">Group Creator</p>
                <div className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg">
                  <Crown className="h-4 w-4 text-yellow-500" />
                  <p className="text-sm font-medium text-foreground">
                    {group.createdBy.name || group.createdBy.fullName || 'Unknown'}
                  </p>
                </div>
              </div>
            )}

            {/* Encryption Info */}
            <div className="pt-4 border-t border-border">
              <div className="flex items-start gap-3 p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-900">
                <Shield className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-green-900 dark:text-green-100 mb-1">
                    End-to-End Encrypted
                  </p>
                  <p className="text-xs text-green-700 dark:text-green-300">
                    Messages in this group are secured with end-to-end encryption.
                    Only members can read them.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Close Button */}
          <div className="pt-4 border-t border-border">
            <Button
              onClick={() => onOpenChange(false)}
              variant="outline"
              className="w-full"
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Member Dialog */}
      {isAddMemberDialogOpen && (
        <AddFriendDialog
          open={isAddMemberDialogOpen}
          onOpenChange={setIsAddMemberDialogOpen}
          onAddUser={handleAddMember}
        />
      )}
    </>
  );
}

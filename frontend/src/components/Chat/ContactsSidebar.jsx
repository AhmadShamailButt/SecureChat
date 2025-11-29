import React, { useState, useEffect } from 'react';
import { Search, MessageSquare, UserCheck, RefreshCw, UserPlus, Users } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { fetchContacts, getFriendRequests, fetchGroups, getGroupRequests } from '../../store/slices/chatSlice';
import { fetchCallHistory, deleteCallFromHistory, initiateCall } from '../../store/slices/voiceCallSlice';
import FriendRequests from './FriendRequests';
import GroupRequests from './GroupRequests';
import AddFriendDialog from './AddFriendDialog';
import CreateGroupDialog from './CreateGroupDialog';
import GroupsList from './GroupsList';
import CallHistoryList from '../VoiceCall/CallHistoryList';

export default function ContactsSidebar({ contacts, activeId, setActiveId, isCollapsed, activeView }) {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState('');
  const isCallsRoute = location.pathname === '/calls';
  
  // Get activeTab from URL, default to 'messages' when activeView is 'messages'
  const viewParam = searchParams.get('view') || 'messages';
  const subTab = searchParams.get('subTab');
  const activeTab = activeView === 'calls' ? 'messages' : 
    (viewParam === 'requests' ? (subTab || 'friend-requests') : 
     viewParam === 'groups' ? 'groups' : 'messages');
  const [isAddFriendDialogOpen, setIsAddFriendDialogOpen] = useState(false);
  const [isCreateGroupDialogOpen, setIsCreateGroupDialogOpen] = useState(false);
  const [deletingCallId, setDeletingCallId] = useState(null);
  const dispatch = useDispatch();
  const navigate = useNavigate();

  // Redux state
  const { friendRequests, groupRequests, groups, isFriendRequestsLoading, isContactsLoading, isGroupsLoading } = useSelector(state => state.chat);
  const { userDetails: user } = useSelector((state) => state.user);
  const { callHistory, isHistoryLoading } = useSelector((state) => state.voiceCall);
  
  // Count of pending received requests for badges
  const pendingFriendRequestsCount = friendRequests?.received?.length || 0;
  const pendingGroupRequestsCount = groupRequests?.received?.length || 0;

  // Local Filter Logic - only filter existing contacts
  const localFiltered = searchTerm
    ? contacts.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()))
    : contacts;

  // Filter call history by search term (UI-level filtering, no API calls)
  const filteredCallHistory = React.useMemo(() => {
    if (!callHistory || callHistory.length === 0) return [];
    if (!searchTerm.trim()) return callHistory;
    const searchLower = searchTerm.toLowerCase();
    // Filter existing call history data without making API calls
    return callHistory.filter(call => 
      call.contact?.name?.toLowerCase().includes(searchLower)
    );
  }, [callHistory, searchTerm]);

  const handleSearchChange = (e) => {
    // Only update search term state - no API calls triggered
    setSearchTerm(e.target.value);
  };

  const selectContact = (id) => {
    setActiveId(id);
    // Always navigate to chat route when selecting a contact
    navigate(`/chat/${id}?view=messages`, { replace: true });
  };

  const selectGroup = (groupId) => {
    setActiveId(groupId);
    // Always navigate to chat route when selecting a group
    navigate(`/chat/group/${groupId}?view=messages`, { replace: true });
  };

  const handleRefreshMessages = () => {
    if (user) {
      dispatch(fetchContacts());
    }
  };

  const handleAddFriend = () => {
    setIsAddFriendDialogOpen(true);
  };


  // Fetch call history when activeView is 'calls'
  useEffect(() => {
    if (activeView === 'calls') {
      dispatch(fetchCallHistory({ limit: 100, offset: 0 }));
    }
  }, [activeView, dispatch]);

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
      return;
    }

    // Allow calling even if user is offline
    // Use contact.id (which is the user ID from call history)
    const contactId = contact.id;
    if (!contactId) {
      return;
    }

    dispatch(initiateCall({
      contactId: contactId,
      contactName: contact.name,
      conversationId: null
    }));
  };

  return (
    <aside className={cn(
      "bg-card border-r border-border flex flex-col h-full overflow-hidden transition-all duration-300",
      isCollapsed ? "w-0 opacity-0 pointer-events-none" : "w-80 opacity-100"
    )}>
      {/* Header */}
      <div className="p-3 bg-card border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-medium text-foreground m-0 leading-tight">
            {activeView === 'calls' ? 'Call History' : 'Chats'}
          </h2>
          {/* Action buttons */}
          {activeView === 'calls' ? (
            <button
              onClick={() => dispatch(fetchCallHistory({ limit: 100, offset: 0 }))}
              className="p-2 rounded-full hover:bg-muted transition-colors"
              title="Refresh call history"
              disabled={isHistoryLoading}
            >
              <RefreshCw className={cn("h-4 w-4 text-muted-foreground", isHistoryLoading && "animate-spin")} />
            </button>
          ) : (
            <div className="flex items-center gap-1">
              {/* Add Friend button - show on both tabs */}
              <button
                onClick={handleAddFriend}
                className="p-2 rounded-full hover:bg-muted transition-colors"
                title="Add Friend"
              >
                <UserPlus className="h-4 w-4 text-muted-foreground" />
              </button>
              {/* Refresh button for all tabs */}
              {activeTab === 'friend-requests' || activeTab === 'group-requests' ? (
                <button
                  onClick={() => {
                    dispatch(getFriendRequests());
                    dispatch(getGroupRequests());
                  }}
                  className="p-2 rounded-full hover:bg-muted transition-colors"
                  title="Refresh requests"
                  disabled={isFriendRequestsLoading}
                >
                  <RefreshCw className={cn("h-4 w-4 text-muted-foreground", isFriendRequestsLoading && "animate-spin")} />
                </button>
              ) : activeTab === 'groups' ? (
                <button
                  onClick={() => dispatch(fetchGroups())}
                  className="p-2 rounded-full hover:bg-muted transition-colors"
                  title="Refresh groups"
                  disabled={isGroupsLoading}
                >
                  <RefreshCw className={cn("h-4 w-4 text-muted-foreground", isGroupsLoading && "animate-spin")} />
                </button>
              ) : (
                <button
                  onClick={handleRefreshMessages}
                  className="p-2 rounded-full hover:bg-muted transition-colors"
                  title="Refresh contacts"
                  disabled={isContactsLoading}
                >
                  <RefreshCw className={cn("h-4 w-4 text-muted-foreground", isContactsLoading && "animate-spin")} />
                </button>
              )}
            </div>
          )}
        </div>
        
        {/* Tabs - Only show if not in calls view */}
        {activeView !== 'calls' && (
        <div className="flex gap-1 mb-3 border-b border-border">
          <button
            onClick={() => {
              setSearchParams({ view: 'messages' }, { replace: true });
            }}
            className={cn(
              "flex-1 py-2 px-2 text-xs font-medium transition-colors relative",
              activeTab === 'messages'
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <div className="flex items-center justify-center gap-1">
              <MessageSquare className="h-3.5 w-3.5" />
              <span>Messages</span>
            </div>
            {activeTab === 'messages' && (
              <span className="absolute left-0 right-0 bottom-0 h-0.5 bg-primary rounded-full"></span>
            )}
          </button>
          <button
            onClick={() => {
              setSearchParams({ view: 'requests' }, { replace: true });
              dispatch(getFriendRequests());
              dispatch(getGroupRequests());
            }}
            className={cn(
              "flex-1 py-2 px-2 text-xs font-medium transition-colors relative",
              activeTab === 'requests' || activeTab === 'friend-requests' || activeTab === 'group-requests'
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <div className="flex items-center justify-center gap-1">
              <UserCheck className="h-3.5 w-3.5" />
              <span>Requests</span>
              {(pendingFriendRequestsCount > 0 || pendingGroupRequestsCount > 0) && (
                <span className="h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">
                  {pendingFriendRequestsCount + pendingGroupRequestsCount}
                </span>
              )}
            </div>
            {(activeTab === 'requests' || activeTab === 'friend-requests' || activeTab === 'group-requests') && (
              <span className="absolute left-0 right-0 bottom-0 h-0.5 bg-primary rounded-full"></span>
            )}
          </button>
          <button
            onClick={() => {
              setSearchParams({ view: 'groups' }, { replace: true });
              dispatch(fetchGroups());
            }}
            className={cn(
              "flex-1 py-2 px-2 text-xs font-medium transition-colors relative",
              activeTab === 'groups'
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <div className="flex items-center justify-center gap-1">
              <Users className="h-3.5 w-3.5" />
              <span>Groups</span>
            </div>
            {activeTab === 'groups' && (
              <span className="absolute left-0 right-0 bottom-0 h-0.5 bg-primary rounded-full"></span>
            )}
          </button>
        </div>
        )}

        {/* Search bar and Create Group button */}
        {activeView === 'calls' ? (
          /* Search bar for call history */
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search calls by contact name..."
              className="w-full pl-10 pr-3 py-2 bg-background border border-input rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
              value={searchTerm}
              onChange={handleSearchChange}
            />
          </div>
        ) : (
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder={
                  activeTab === 'messages' ? "Search or start new chat" : 
                  activeTab === 'requests' || activeTab === 'friend-requests' || activeTab === 'group-requests' ? "Search requests..." : 
                  "Search groups..."
                }
                className="w-full pl-10 pr-3 py-2 bg-background border border-input rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
                value={searchTerm}
                onChange={handleSearchChange}
              />
            </div>
            {activeTab === 'groups' && (
              <button
                onClick={() => setIsCreateGroupDialogOpen(true)}
                className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                title="Create Group"
              >
                <Users className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* List Area */}
      <div className="flex-1 overflow-y-auto divide-y divide-border">
        {activeView === 'calls' ? (
          /* Call History View */
          <CallHistoryList
            calls={filteredCallHistory}
            onCallClick={handleCallClick}
            isLoading={isHistoryLoading}
            onDelete={handleDeleteCall}
            deletingCallId={deletingCallId}
          />
        ) : (
        <>
        {activeTab === 'requests' || activeTab === 'friend-requests' || activeTab === 'group-requests' ? (
          /* Requests Tab - Show both friend and group requests */
          <div className="flex flex-col h-full">
            <div className="flex gap-2 mb-2 px-2 border-b border-border">
              <button
                onClick={() => {
                  setSearchParams({ view: 'requests', subTab: 'friend-requests' }, { replace: true });
                }}
                className={cn(
                  "flex-1 py-2 px-2 text-xs font-medium transition-colors relative",
                  activeTab === 'friend-requests' ? "text-primary" : "text-muted-foreground"
                )}
              >
                Friend Requests
                {pendingFriendRequestsCount > 0 && (
                  <span className="ml-1 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] inline-flex items-center justify-center">
                    {pendingFriendRequestsCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => {
                  setSearchParams({ view: 'requests', subTab: 'group-requests' }, { replace: true });
                }}
                className={cn(
                  "flex-1 py-2 px-2 text-xs font-medium transition-colors relative",
                  activeTab === 'group-requests' ? "text-primary" : "text-muted-foreground"
                )}
              >
                Group Requests
                {pendingGroupRequestsCount > 0 && (
                  <span className="ml-1 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] inline-flex items-center justify-center">
                    {pendingGroupRequestsCount}
                  </span>
                )}
              </button>
            </div>
            {/* Show appropriate requests based on sub-tab */}
            {activeTab === 'friend-requests' ? (
              <FriendRequests searchTerm={searchTerm} />
            ) : (
              <GroupRequests searchTerm={searchTerm} />
            )}
          </div>
        ) : activeTab === 'groups' ? (
          /* Groups Tab */
          <GroupsList 
            groups={groups} 
            activeGroupId={activeId} 
            setActiveGroupId={selectGroup}
          />
        ) : (
          /* Existing Contacts (Default) */
          <>
            {localFiltered.length > 0 ? localFiltered.map(contact => (
          <button
            key={contact.id}
            onClick={() => selectContact(contact.id)}
            className={cn(
                  "w-full flex items-center gap-3 px-4 py-2 transition-colors text-left",
                  activeId === contact.id ? "bg-muted" : "hover:bg-muted/50"
            )}
          >
            <div className="relative flex-shrink-0">
                  <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center text-lg font-medium text-primary-foreground">
                {contact.name.charAt(0).toUpperCase()}
              </div>
              {contact.isOnline && (
                    <span className="absolute bottom-0 right-0 block h-3 w-3 rounded-full ring-2 ring-background bg-success" />
              )}
            </div>
            <div className="flex-1 overflow-hidden min-w-0">
                  <div className="flex justify-between items-baseline">
                    <p className="text-sm font-medium text-foreground truncate">{contact.name}</p>
                    <span className="text-[11px] text-muted-foreground ml-2 flex-shrink-0">
                      {contact.isOnline ? (
                        'Online'
                      ) : contact.lastSeen ? (
                        (() => {
                          try {
                            const lastSeenDate = new Date(contact.lastSeen);
                            if (isNaN(lastSeenDate.getTime())) {
                              return '';
                            }
                            const now = new Date();
                            const diffMs = now - lastSeenDate;
                            const diffMins = Math.floor(diffMs / 60000);
                            const diffHours = Math.floor(diffMs / 3600000);
                            const diffDays = Math.floor(diffMs / 86400000);

                            if (diffMins < 1) return 'Just now';
                            if (diffMins < 60) return `${diffMins}m ago`;
                            if (diffHours < 24) return `${diffHours}h ago`;
                            if (diffDays < 7) return `${diffDays}d ago`;
                            return lastSeenDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
                          } catch (e) {
                            return '';
                          }
                        })()
                      ) : (
                        ''
                      )}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {contact.lastMessage || "Tap to chat"}
              </p>
            </div>
          </button>
        )) : (
              <div className="p-8 text-center">
                <p className="text-muted-foreground">
                  {searchTerm ? `No contacts found matching "${searchTerm}"` : "No contacts found."}
                </p>
          </div>
            )}
          </>
        )}
        </>
        )}
      </div>

      {/* Add Friend Dialog */}
      <AddFriendDialog 
        open={isAddFriendDialogOpen} 
        onOpenChange={setIsAddFriendDialogOpen} 
      />

      {/* Create Group Dialog */}
      <CreateGroupDialog 
        open={isCreateGroupDialogOpen} 
        onOpenChange={setIsCreateGroupDialogOpen}
        onGroupCreated={() => {
          setActiveTab('groups');
          dispatch(fetchGroups());
        }}
      />
    </aside>
  );
}

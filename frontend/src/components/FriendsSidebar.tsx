"use client";

import { useState, useMemo } from 'react';
import { useFriendsStore, Friend } from '@/store/useFriendsStore';
import { useAuthStore } from '@/store/useAuthStore';
import { Search, UserPlus, X, UserMinus, Mail, ChevronLeft, Check, Lock, Unlock, Phone } from 'lucide-react';
import { getContrastColor } from '@/lib/colors';

interface FriendsSidebarProps {
    /** Current room ID when user is in a room — enables invite buttons */
    currentRoomId?: string;
    /** Is the current room open? */
    isRoomOpen?: boolean;
    /** Callback to send invitation via socket */
    onInvite?: (friendId: string) => void;
    /** Callback to open the friend requests modal */
    onOpenRequests: () => void;
    /** Callback to fully close/dismiss the sidebar (used in room overlay mode) */
    onClose?: () => void;
    /** Callback to toggle room open state */
    onToggleOpen?: (isOpen: boolean) => void;
    /** Callback to initiate a direct call */
    onCall?: (friendId: string) => void;
    /** IDs of users already in the current room */
    inRoomUserIds?: Set<string>;
}

export function FriendsSidebar({ currentRoomId, isRoomOpen, onInvite, onOpenRequests, onClose, onToggleOpen, onCall, inRoomUserIds }: FriendsSidebarProps) {
    const { friends, onlineUserIds, incomingRequests, removeFriend } = useFriendsStore();
    const { token } = useAuthStore();
    const [search, setSearch] = useState('');
    const [collapsed, setCollapsed] = useState(false);
    const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
    const [invitedFriendIds, setInvitedFriendIds] = useState<Set<string>>(new Set());

    // Filter friends by search query (client-side)
    const filteredFriends = useMemo(() => {
        const q = search.toLowerCase().trim();
        if (!q) return friends;
        return friends.filter(f => f.name.toLowerCase().includes(q));
    }, [friends, search]);

    // Sort: online friends first, then alphabetical
    const sortedFriends = useMemo(() => {
        return [...filteredFriends].sort((a, b) => {
            const aOnline = onlineUserIds.has(a.id);
            const bOnline = onlineUserIds.has(b.id);
            if (aOnline !== bOnline) return aOnline ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
    }, [filteredFriends, onlineUserIds]);

    const onlineCount = friends.filter(f => onlineUserIds.has(f.id)).length;

    const handleRemoveFriend = async (friend: Friend) => {
        await removeFriend(token ?? '', friend.id);
        setConfirmRemove(null);
    };

    const getInitials = (name: string) =>
        name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

    const handleInvite = (friendId: string) => {
        onInvite?.(friendId);
        setInvitedFriendIds(prev => new Set(prev).add(friendId));
        // Revert after 2 seconds
        setTimeout(() => {
            setInvitedFriendIds(prev => {
                const next = new Set(prev);
                next.delete(friendId);
                return next;
            });
        }, 2000);
    };

    // Handle collapse: if onClose is provided (overlay mode), fully dismiss
    const handleCollapse = () => {
        if (onClose) {
            onClose();
        } else {
            setCollapsed(true);
        }
    };

    const handleToggleOpenRoom = () => {
        onToggleOpen?.(!isRoomOpen);
    };

    if (collapsed && !onClose) {
        return (
            <div className="friends-sidebar friends-sidebar--collapsed">
                <button
                    onClick={() => setCollapsed(false)}
                    className="friends-sidebar__toggle"
                    aria-label="Open friends sidebar"
                >
                    <ChevronLeft className="w-4 h-4 rotate-180" />
                </button>
                {incomingRequests.length > 0 && (
                    <div className="friends-sidebar__badge-collapsed animate-pulse-soft">{incomingRequests.length}</div>
                )}
            </div>
        );
    }

    return (
        <aside className="friends-sidebar" aria-label="Friends">
            {/* Header */}
            <div className="friends-sidebar__header">
                <div className="friends-sidebar__title-row">
                    <h2 className="friends-sidebar__title">Friends</h2>
                    <span className="friends-sidebar__count">{onlineCount} online</span>
                </div>
                <div className="friends-sidebar__actions">
                    <button
                        onClick={onOpenRequests}
                        className="friends-sidebar__btn"
                        aria-label="Friend requests"
                        title="Friend Requests"
                    >
                        <UserPlus className="w-4 h-4" />
                        {incomingRequests.length > 0 && (
                            <span className="friends-sidebar__badge animate-pulse-soft">{incomingRequests.length}</span>
                        )}
                    </button>
                    <button
                        onClick={handleCollapse}
                        className="friends-sidebar__btn friends-sidebar__btn--collapse"
                        aria-label="Collapse sidebar"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Open Room Toggle (only visible in room) */}
            {currentRoomId && (
                <div className="px-4 py-3 border-b border-[rgba(0,0,0,0.05)] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {isRoomOpen ? <Unlock className="w-4 h-4 text-primary" /> : <Lock className="w-4 h-4 text-text-muted" />}
                        <div className="flex flex-col">
                            <span className="text-sm font-medium text-text-main">Open Room</span>
                            <span className="text-[10px] text-text-muted">Allow friends to join</span>
                        </div>
                    </div>
                    <button
                        onClick={handleToggleOpenRoom}
                        className={`relative w-9 h-5 rounded-full transition-colors duration-200 ${isRoomOpen ? 'bg-primary' : 'bg-gray-200'}`}
                    >
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${isRoomOpen ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                </div>
            )}

            {/* Search */}
            <div className="friends-sidebar__search">
                <Search className="friends-sidebar__search-icon" />
                <input
                    type="text"
                    placeholder="Search friends..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="friends-sidebar__search-input"
                    aria-label="Search friends"
                />
                {search && (
                    <button onClick={() => setSearch('')} className="friends-sidebar__search-clear" aria-label="Clear search">
                        <X className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>

            {/* Friends list */}
            <div className="friends-sidebar__list scrollbar-hide">
                {sortedFriends.length === 0 ? (
                    <div className="friends-sidebar__empty">
                        {friends.length === 0
                            ? <><UserPlus className="w-8 h-8 text-text-muted opacity-40 mb-2" /><p>No friends yet</p><p className="text-xs">Add friends from the menu above</p></>
                            : <p>No matching friends</p>
                        }
                    </div>
                ) : (
                    sortedFriends.map(friend => {
                        const isOnline = onlineUserIds.has(friend.id);
                        return (
                            <div key={friend.id} className="friends-sidebar__item">
                                {/* Avatar + status dot */}
                                <div className="friends-sidebar__avatar-wrap">
                                    <div
                                        className="friends-sidebar__avatar"
                                        style={{
                                            backgroundColor: friend.avatarColor || '#FF5A5F',
                                            color: getContrastColor(friend.avatarColor || '#FF5A5F')
                                        }}
                                    >
                                        {getInitials(friend.name)}
                                    </div>
                                    <span
                                        className={`friends-sidebar__status-dot ${isOnline ? 'friends-sidebar__status-dot--online' : ''}`}
                                        aria-label={isOnline ? 'Online' : 'Offline'}
                                    />
                                </div>

                                {/* Name */}
                                <span className={`friends-sidebar__name ${isOnline ? '' : 'friends-sidebar__name--offline'}`}>
                                    {friend.name}
                                </span>

                                {/* Actions */}
                                <div className="friends-sidebar__item-actions">
                                    {isOnline && onCall && !inRoomUserIds?.has(friend.id) && (
                                        <button
                                            onClick={() => onCall(friend.id)}
                                            className="friends-sidebar__call-btn"
                                            title="Room invite"
                                            aria-label={`Room invite with ${friend.name}`}
                                        >
                                            <Phone className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                    {currentRoomId && isOnline && onInvite && !inRoomUserIds?.has(friend.id) && (
                                        invitedFriendIds.has(friend.id) ? (
                                            <span className="friends-sidebar__invited-indicator" title="Invited!">
                                                <Check className="w-3.5 h-3.5 text-green-500" />
                                            </span>
                                        ) : (
                                            <button
                                                onClick={() => handleInvite(friend.id)}
                                                className="friends-sidebar__invite-btn"
                                                title="Invite to room"
                                                aria-label={`Invite ${friend.name} to room`}
                                            >
                                                <Mail className="w-3.5 h-3.5" />
                                            </button>
                                        )
                                    )}
                                    {confirmRemove === friend.id ? (
                                        <div className="friends-sidebar__confirm-remove">
                                            <button onClick={() => handleRemoveFriend(friend)} className="friends-sidebar__confirm-yes" aria-label="Confirm remove">
                                                ✓
                                            </button>
                                            <button onClick={() => setConfirmRemove(null)} className="friends-sidebar__confirm-no" aria-label="Cancel remove">
                                                ✗
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => setConfirmRemove(friend.id)}
                                            className="friends-sidebar__remove-btn"
                                            title="Remove friend"
                                            aria-label={`Remove ${friend.name}`}
                                        >
                                            <UserMinus className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </aside>
    );
}

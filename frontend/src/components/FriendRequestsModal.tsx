"use client";

import { useState } from 'react';
import { useFriendsStore } from '@/store/useFriendsStore';
import { useAuthStore } from '@/store/useAuthStore';
import { X, UserPlus, Inbox, Send, Check, XIcon, Loader2 } from 'lucide-react';

interface FriendRequestsModalProps {
    onClose: () => void;
}

type Tab = 'send' | 'incoming' | 'outgoing';

export function FriendRequestsModal({ onClose }: FriendRequestsModalProps) {
    const [tab, setTab] = useState<Tab>('send');
    const [username, setUsername] = useState('');
    const [loading, setLoading] = useState(false);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const { token } = useAuthStore();
    const { incomingRequests, outgoingRequests, sendRequest, acceptRequest, declineRequest } = useFriendsStore();

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username.trim() || !token) return;

        setLoading(true);
        setFeedback(null);

        const result = await sendRequest(token, username.trim());
        setLoading(false);

        if (result.error) {
            setFeedback({ type: 'error', text: result.error });
        } else {
            setFeedback({ type: 'success', text: `Friend request sent to "${username.trim()}"` });
            setUsername('');
        }
    };

    const handleAccept = async (requestId: string) => {
        if (!token) return;
        setLoading(true);
        const result = await acceptRequest(token, requestId);
        setLoading(false);
        if (result.error) {
            setFeedback({ type: 'error', text: result.error });
        }
    };

    const handleDecline = async (requestId: string) => {
        if (!token) return;
        setLoading(true);
        const result = await declineRequest(token, requestId);
        setLoading(false);
        if (result.error) {
            setFeedback({ type: 'error', text: result.error });
        }
    };

    const tabs: { key: Tab; label: string; icon: React.ReactNode; count?: number }[] = [
        { key: 'send', label: 'Send', icon: <UserPlus className="w-4 h-4" /> },
        { key: 'incoming', label: 'Incoming', icon: <Inbox className="w-4 h-4" />, count: incomingRequests.length },
        { key: 'outgoing', label: 'Outgoing', icon: <Send className="w-4 h-4" />, count: outgoingRequests.length },
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
            <div
                className="friend-modal"
                onClick={e => e.stopPropagation()}
                role="dialog"
                aria-label="Friend Requests"
            >
                {/* Header */}
                <div className="friend-modal__header">
                    <h2 className="friend-modal__title">Friend Requests</h2>
                    <button onClick={onClose} className="friend-modal__close" aria-label="Close">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="friend-modal__tabs">
                    {tabs.map(t => (
                        <button
                            key={t.key}
                            onClick={() => { setTab(t.key); setFeedback(null); }}
                            className={`friend-modal__tab ${tab === t.key ? 'friend-modal__tab--active' : ''}`}
                        >
                            {t.icon}
                            <span>{t.label}</span>
                            {t.count !== undefined && t.count > 0 && (
                                <span className="friend-modal__tab-badge">{t.count}</span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Feedback */}
                {feedback && (
                    <div className={`friend-modal__feedback ${feedback.type === 'error' ? 'friend-modal__feedback--error' : 'friend-modal__feedback--success'}`}>
                        {feedback.text}
                    </div>
                )}

                {/* Tab content */}
                <div className="friend-modal__content">
                    {/* Send request */}
                    {tab === 'send' && (
                        <form onSubmit={handleSend} className="friend-modal__send-form">
                            <p className="friend-modal__hint">Enter the exact username to send a friend request.</p>
                            <div className="friend-modal__input-row">
                                <input
                                    type="text"
                                    placeholder="Username"
                                    value={username}
                                    onChange={e => setUsername(e.target.value)}
                                    className="friend-modal__input"
                                    maxLength={50}
                                    required
                                    autoFocus
                                    aria-label="Username"
                                />
                                <button
                                    type="submit"
                                    disabled={loading || !username.trim()}
                                    className="friend-modal__send-btn"
                                >
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                                    Send
                                </button>
                            </div>
                        </form>
                    )}

                    {/* Incoming requests */}
                    {tab === 'incoming' && (
                        <div className="friend-modal__list">
                            {incomingRequests.length === 0 ? (
                                <div className="friend-modal__empty">
                                    <Inbox className="w-8 h-8 text-text-muted opacity-40 mb-2" />
                                    <p>No incoming requests</p>
                                </div>
                            ) : (
                                incomingRequests.map(req => (
                                    <div key={req.id} className="friend-modal__request-item">
                                        <div className="friend-modal__request-avatar">
                                            {req.sender.name.charAt(0).toUpperCase()}
                                        </div>
                                        <span className="friend-modal__request-name">{req.sender.name}</span>
                                        <div className="friend-modal__request-actions">
                                            <button
                                                onClick={() => handleAccept(req.id)}
                                                disabled={loading}
                                                className="friend-modal__accept-btn"
                                                aria-label={`Accept ${req.sender.name}`}
                                                title="Accept"
                                            >
                                                <Check className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDecline(req.id)}
                                                disabled={loading}
                                                className="friend-modal__decline-btn"
                                                aria-label={`Decline ${req.sender.name}`}
                                                title="Decline"
                                            >
                                                <XIcon className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {/* Outgoing requests */}
                    {tab === 'outgoing' && (
                        <div className="friend-modal__list">
                            {outgoingRequests.length === 0 ? (
                                <div className="friend-modal__empty">
                                    <Send className="w-8 h-8 text-text-muted opacity-40 mb-2" />
                                    <p>No pending requests</p>
                                </div>
                            ) : (
                                outgoingRequests.map(req => (
                                    <div key={req.id} className="friend-modal__request-item">
                                        <div className="friend-modal__request-avatar">
                                            {req.receiver.name.charAt(0).toUpperCase()}
                                        </div>
                                        <span className="friend-modal__request-name">{req.receiver.name}</span>
                                        <button
                                            onClick={() => handleDecline(req.id)}
                                            disabled={loading}
                                            className="friend-modal__cancel-btn"
                                            aria-label={`Cancel request to ${req.receiver.name}`}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

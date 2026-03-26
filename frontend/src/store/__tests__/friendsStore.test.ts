import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useFriendsStore, UserStatus } from '../useFriendsStore';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('useFriendsStore', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset store to initial state
        useFriendsStore.setState({
            friends: [],
            userStatuses: new Map<string, UserStatus>(),
            myStatus: 'online',
            incomingRequests: [],
            outgoingRequests: [],
            pendingInvitation: null,
            openRooms: [],
            incomingCall: null,
            outgoingCall: null,
            isSidebarCollapsed: false,
        });
    });

    it('should have initial state', () => {
        const state = useFriendsStore.getState();
        expect(state.friends).toEqual([]);
        expect(state.userStatuses.size).toBe(0);
        expect(state.myStatus).toBe('online');
        expect(state.isSidebarCollapsed).toBe(false);
    });

    describe('Online Presence', () => {
        it('should update online list with statuses', () => {
            const users = [{ id: 'user1', status: 'online' }, { id: 'user2', status: 'away' }];
            useFriendsStore.getState().setOnlineList(users);
            
            const state = useFriendsStore.getState();
            expect(state.userStatuses.get('user1')).toBe('online');
            expect(state.userStatuses.get('user2')).toBe('away');
            expect(state.userStatuses.size).toBe(2);
        });

        it('should set user online and offline', () => {
            const store = useFriendsStore.getState();
            store.setUserOnline('userA', 'online');
            expect(useFriendsStore.getState().userStatuses.get('userA')).toBe('online');
            
            store.setUserOffline('userA');
            expect(useFriendsStore.getState().userStatuses.has('userA')).toBe(false);
        });

        it('should set user status', () => {
            const store = useFriendsStore.getState();
            store.setUserOnline('userB', 'online');
            store.setUserStatus('userB', 'away');
            expect(useFriendsStore.getState().userStatuses.get('userB')).toBe('away');
        });

        it('should set my status', () => {
            useFriendsStore.getState().setMyStatus('away');
            expect(useFriendsStore.getState().myStatus).toBe('away');
            
            useFriendsStore.getState().setMyStatus('invisible');
            expect(useFriendsStore.getState().myStatus).toBe('invisible');
        });
    });

    describe('Real-time Sync Actions (Sockets)', () => {
        it('should add an incoming request', () => {
            const request = { id: 'req1', senderId: 's1', sender: { id: 's1', name: 'Al', avatarColor: 'red' }, createdAt: '' };
            useFriendsStore.getState().addIncomingRequest(request);
            
            expect(useFriendsStore.getState().incomingRequests[0]).toEqual(request);
        });

        it('should remove an incoming request by id', () => {
            useFriendsStore.setState({
                incomingRequests: [
                    { id: 'req1', senderId: 's1', sender: { id: 's1', name: 'Al', avatarColor: 'red' }, createdAt: '' }
                ]
            });
            
            useFriendsStore.getState().removeIncomingRequest('req1');
            expect(useFriendsStore.getState().incomingRequests.length).toBe(0);
        });

        it('should add a friend', () => {
            const friend = { id: 'f1', name: 'Bob', avatarColor: 'green' };
            useFriendsStore.getState().addFriend(friend);
            
            expect(useFriendsStore.getState().friends[0]).toEqual(friend);
        });

        it('should remove a friend and their online status', () => {
            useFriendsStore.setState({
                friends: [{ id: 'f1', name: 'Bob', avatarColor: 'green' }],
                userStatuses: new Map<string, UserStatus>([['f1', 'online'], ['other', 'away']])
            });

            useFriendsStore.getState().removeFriendById('f1');
            
            const state = useFriendsStore.getState();
            expect(state.friends.length).toBe(0);
            expect(state.userStatuses.has('f1')).toBe(false);
            expect(state.userStatuses.has('other')).toBe(true);
        });

        it('should update friend profile', () => {
            useFriendsStore.setState({
                friends: [{ id: 'f1', name: 'Bob', avatarColor: 'green' }]
            });

            useFriendsStore.getState().updateFriendProfile('f1', { name: 'Bobby' });
            expect(useFriendsStore.getState().friends[0].name).toBe('Bobby');
        });
    });

    describe('API Actions', () => {
        it('should fetch friends successfully', async () => {
            const friends = [{ id: '1', name: 'Alice', avatarColor: 'red' }];
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ friends }),
            });

            await useFriendsStore.getState().fetchFriends('fake-token');

            expect(useFriendsStore.getState().friends).toEqual(friends);
            expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/friends'), expect.anything());
        });

        it('should fetch requests successfully', async () => {
            const incoming = [{ id: 'r1', senderId: 's1', sender: { id: 's1', name: 'A', avatarColor: 'b' }, createdAt: '' }];
            const outgoing = [{ id: 'r2', receiverId: 'u2', receiver: { id: 'u2', name: 'B', avatarColor: 'c' }, createdAt: '' }];
            
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ incoming, outgoing }),
            });

            await useFriendsStore.getState().fetchRequests('token');

            const state = useFriendsStore.getState();
            expect(state.incomingRequests).toEqual(incoming);
            expect(state.outgoingRequests).toEqual(outgoing);
        });

        it('should handle sendRequest success', async () => {
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ success: true }),
            });
            // mock the follow-up fetchRequests call
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ incoming: [], outgoing: [] }),
            });

            const result = await useFriendsStore.getState().sendRequest('token', 'Alice');
            
            expect(result.error).toBeUndefined();
            expect(mockFetch).toHaveBeenCalledTimes(2);
        });

        it('should handle acceptRequest success and refresh data', async () => {
            mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });
            // mock the follow-up refreshes (fetchFriends, fetchRequests)
            mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

            const result = await useFriendsStore.getState().acceptRequest('token', 'req1');
            
            expect(result.error).toBeUndefined();
            expect(mockFetch).toHaveBeenCalledTimes(3); // accept + friends + requests
        });
    });

    it('should toggle sidebar collision state', () => {
        useFriendsStore.getState().setSidebarCollapsed(true);
        expect(useFriendsStore.getState().isSidebarCollapsed).toBe(true);
        
        useFriendsStore.getState().setSidebarCollapsed(false);
        expect(useFriendsStore.getState().isSidebarCollapsed).toBe(false);
    });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAuthStore } from '../useAuthStore';

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('useAuthStore', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset store to initial state
        useAuthStore.setState({
            user: null,
            token: null,
            isLoading: true,
        });
    });

    it('should have initial state', () => {
        const state = useAuthStore.getState();
        expect(state.user).toBeNull();
        expect(state.token).toBeNull();
        expect(state.isLoading).toBe(true);
    });

    it('should update state via setAuth', () => {
        const user = { id: '1', name: 'Test User', avatarColor: 'blue' };
        const token = 'fake-token';
        
        useAuthStore.getState().setAuth(user, token);
        
        const state = useAuthStore.getState();
        expect(state.user).toEqual(user);
        expect(state.token).toBe(token);
    });

    it('should checkAuth and set user on success', async () => {
        const user = { id: '1', name: 'Test User', avatarColor: 'blue' };
        const token = 'fake-token';
        
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ user, token }),
        });

        await useAuthStore.getState().checkAuth();

        const state = useAuthStore.getState();
        expect(state.user).toEqual(user);
        expect(state.token).toBe(token);
        expect(state.isLoading).toBe(false);
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/auth/me'), expect.anything());
    });

    it('should set isLoading to false even if checkAuth fails', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
        });

        await useAuthStore.getState().checkAuth();

        const state = useAuthStore.getState();
        expect(state.user).toBeNull();
        expect(state.isLoading).toBe(false);
    });

    it('should clear state on logout', async () => {
        useAuthStore.setState({
            user: { id: '1', name: 'Test User', avatarColor: 'blue' },
            token: 'fake-token',
        });

        mockFetch.mockResolvedValueOnce({ ok: true });

        await useAuthStore.getState().logout();

        const state = useAuthStore.getState();
        expect(state.user).toBeNull();
        expect(state.token).toBeNull();
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/auth/logout'), expect.anything());
    });

    it('should update user on updateProfile success', async () => {
        useAuthStore.setState({
            user: { id: '1', name: 'Old Name', avatarColor: 'blue' },
            token: 'fake-token',
        });

        const updatedUser = { id: '1', name: 'New Name', avatarColor: 'red' };
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ user: updatedUser }),
        });

        const result = await useAuthStore.getState().updateProfile({ name: 'New Name' });

        expect(result.success).toBe(true);
        expect(useAuthStore.getState().user).toEqual(updatedUser);
    });

    it('should return error on updateProfile failure', async () => {
        useAuthStore.setState({ token: 'fake-token' });
        
        mockFetch.mockResolvedValueOnce({
            ok: false,
            json: async () => ({ error: 'Invalid name' }),
        });

        const result = await useAuthStore.getState().updateProfile({ name: '' });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid name');
    });
});

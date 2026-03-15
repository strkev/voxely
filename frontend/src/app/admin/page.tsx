"use client";

import { useState, useEffect, useCallback } from "react";
import { Trash2, Shield, Users, Loader2, Download } from "lucide-react";

interface AdminUser {
    id: string;
    name: string;
    createdAt: string;
}

export default function AdminPage() {
    const [secret, setSecret] = useState("");
    const [authenticated, setAuthenticated] = useState(false);
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

    const fetchUsers = useCallback(async (adminSecret: string) => {
        setLoading(true);
        setError("");
        try {
            const res = await fetch(`${apiUrl}/api/admin/users`, {
                headers: { "x-admin-secret": adminSecret },
            });
            if (!res.ok) throw new Error("Invalid Admin Secret");
            const data = await res.json();
            setUsers(data.users);
            setAuthenticated(true);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Error");
            setAuthenticated(false);
        } finally {
            setLoading(false);
        }
    }, [apiUrl]);

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        fetchUsers(secret);
    };

    const handleDelete = async (userId: string) => {
        setDeleting(true);
        try {
            const res = await fetch(`${apiUrl}/api/admin/users/${userId}`, {
                method: "DELETE",
                headers: { "x-admin-secret": secret },
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Deletion failed");
            }
            setUsers((prev) => prev.filter((u) => u.id !== userId));
            setDeleteConfirm(null);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Error");
        } finally {
            setDeleting(false);
        }
    };

    const handleExport = async (userId: string, userName: string) => {
        try {
            const res = await fetch(`${apiUrl}/api/admin/users/${userId}/export`, {
                headers: { "x-admin-secret": secret },
            });
            if (!res.ok) throw new Error("Export failed");
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `dsgvo-export-${userName.replace(/\s+/g, "_")}-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Export Error");
        }
    };

    // Re-fetch users periodically while authenticated
    useEffect(() => {
        if (!authenticated) return;
        const interval = setInterval(() => fetchUsers(secret), 30000);
        return () => clearInterval(interval);
    }, [authenticated, secret, fetchUsers]);

    /* ── LOGIN GATE ─────────────────────────────────────────── */
    if (!authenticated) {
        return (
            <div className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4">
                <div className="bg-surface border border-gray-100 rounded-2xl shadow-flat p-8 max-w-sm w-full">
                    <div className="flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mx-auto mb-4">
                        <Shield className="w-7 h-7 text-primary" />
                    </div>
                    <h1 className="text-xl font-semibold text-text-main text-center mb-1">
                        Admin Access
                    </h1>
                    <p className="text-text-muted text-sm text-center mb-6">
                        Enter the admin secret to continue.
                    </p>

                    {error && (
                        <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-xl text-sm text-center">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleLogin} className="space-y-4">
                        <input
                            type="password"
                            value={secret}
                            onChange={(e) => setSecret(e.target.value)}
                            placeholder="Admin Secret"
                            className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-white text-sm text-text-main placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                            required
                            autoFocus
                        />
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full h-11 rounded-xl bg-primary text-white text-sm font-medium hover:bg-[#E0484D] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                "Sign In"
                            )}
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    /* ── DASHBOARD ──────────────────────────────────────────── */
    return (
        <div className="min-h-[calc(100vh-64px)] flex flex-col items-center px-4 py-10">
            <div className="max-w-3xl w-full">
                {/* Header */}
                <div className="flex items-center gap-3 mb-8">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Users className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-xl sm:text-2xl font-bold text-text-main">
                            User Management
                        </h1>
                        <p className="text-text-muted text-sm">
                            {users.length} users registered
                        </p>
                    </div>
                </div>

                {error && (
                    <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-xl text-sm text-center">
                        {error}
                    </div>
                )}

                {/* User list */}
                <div className="bg-surface border border-gray-100 rounded-2xl shadow-flat overflow-hidden">
                    {users.length === 0 ? (
                        <div className="p-8 text-center text-text-muted text-sm">
                            No users found.
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {users.map((user) => (
                                <div
                                    key={user.id}
                                    className="flex items-center justify-between px-3 sm:px-5 py-3 sm:py-4 hover:bg-gray-50 transition-colors"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold shrink-0">
                                            {user.name
                                                .split(" ")
                                                .map((w) => w[0])
                                                .join("")
                                                .toUpperCase()
                                                .slice(0, 2)}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-text-main truncate">
                                                {user.name}
                                            </p>
                                            <p className="text-xs text-text-muted truncate">
                                                {new Date(user.createdAt).toLocaleDateString()}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 shrink-0 ml-4">
                                        <span className="text-xs text-text-muted hidden sm:block">
                                            {new Date(user.createdAt).toLocaleDateString()}
                                        </span>

                                        {deleteConfirm === user.id ? (
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => setDeleteConfirm(null)}
                                                    className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-text-main hover:bg-gray-50 transition-colors"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(user.id)}
                                                    disabled={deleting}
                                                    className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:bg-[#E0484D] transition-colors disabled:opacity-60 flex items-center gap-1"
                                                >
                                                    {deleting ? (
                                                        <Loader2 className="w-3 h-3 animate-spin" />
                                                    ) : (
                                                        "Delete"
                                                    )}
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => handleExport(user.id, user.name)}
                                                    className="p-2 rounded-lg text-text-muted hover:text-blue-600 hover:bg-blue-50 transition-colors"
                                                    title="Export data (GDPR Art. 15)"
                                                >
                                                    <Download className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => setDeleteConfirm(user.id)}
                                                    className="p-2 rounded-lg text-text-muted hover:text-primary hover:bg-red-50 transition-colors"
                                                    title="Delete user (GDPR Art. 17)"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <p className="mt-4 text-xs text-text-muted text-center">
                    <Download className="w-3 h-3 inline mr-1" /> Data Export (Art. 15) · <Trash2 className="w-3 h-3 inline mr-1" /> Deletion (Art. 17)
                </p>
            </div>

            {/* Delete all confirmation modal — if needed in the future */}
        </div>
    );
}

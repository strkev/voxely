"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, RotateCcw, Home } from "lucide-react";

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    const router = useRouter();

    useEffect(() => {
        console.error("[ErrorBoundary]", error);
    }, [error]);

    return (
        <div className="min-h-[60vh] flex items-center justify-center px-4">
            <div className="bg-surface border border-gray-100 rounded-2xl shadow-flat p-8 max-w-md w-full text-center flex flex-col items-center gap-5">
                <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
                    <AlertCircle className="w-7 h-7 text-primary" />
                </div>

                <div>
                    <h2 className="text-xl font-semibold text-text-main mb-1">
                        Something went wrong
                    </h2>
                    <p className="text-sm text-text-muted leading-relaxed">
                        An unexpected error occurred. Try again or return to the dashboard.
                    </p>
                </div>

                {process.env.NODE_ENV === "development" && (
                    <pre className="w-full text-left text-xs text-red-600 bg-red-50 rounded-xl p-3 overflow-auto max-h-32">
                        {error.message}
                    </pre>
                )}

                <div className="flex gap-3 w-full mt-1">
                    <button
                        onClick={() => router.push("/dashboard")}
                        className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl border border-gray-200 text-text-main text-sm font-medium hover:bg-gray-50 transition-colors"
                    >
                        <Home className="w-4 h-4" />
                        Dashboard
                    </button>
                    <button
                        onClick={() => reset()}
                        className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl bg-primary text-white text-sm font-medium hover:bg-[#E0484D] transition-colors"
                    >
                        <RotateCcw className="w-4 h-4" />
                        Try Again
                    </button>
                </div>
            </div>
        </div>
    );
}

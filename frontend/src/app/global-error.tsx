"use client";

import { useEffect } from "react";
import { AlertCircle, RotateCcw } from "lucide-react";

/**
 * Next.js root-level error boundary.
 * Catches errors in the root layout itself. Must include <html> + <body>.
 */
export default function RootError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error("[RootErrorBoundary]", error);
    }, [error]);

    return (
        <html lang="en">
            <body
                style={{
                    margin: 0,
                    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
                    minHeight: "100vh",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#F7F7F7",
                    padding: "1rem",
                }}
            >
                <div
                    style={{
                        background: "white",
                        border: "1px solid #eee",
                        borderRadius: "16px",
                        padding: "2rem",
                        maxWidth: "400px",
                        width: "100%",
                        textAlign: "center",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "1.25rem",
                    }}
                >
                    <div
                        style={{
                            width: 56,
                            height: 56,
                            borderRadius: "50%",
                            background: "#FEF2F2",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        <AlertCircle style={{ width: 28, height: 28, color: "#FF5A5F" }} />
                    </div>

                    <div>
                        <h2 style={{ fontSize: "1.25rem", fontWeight: 600, color: "#222", margin: "0 0 4px" }}>
                            Critical Error
                        </h2>
                        <p style={{ fontSize: "0.875rem", color: "#5E5E5E", margin: 0, lineHeight: 1.6 }}>
                            The application could not be loaded.
                        </p>
                    </div>

                    <button
                        onClick={() => reset()}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 8,
                            width: "100%",
                            height: 44,
                            borderRadius: 12,
                            background: "#FF5A5F",
                            color: "white",
                            fontSize: "0.875rem",
                            fontWeight: 500,
                            border: "none",
                            cursor: "pointer",
                        }}
                    >
                        <RotateCcw style={{ width: 16, height: 16 }} />
                        Try Again
                    </button>
                </div>
            </body>
        </html>
    );
}

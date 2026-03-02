import * as React from "react"
import { cn } from "@/lib/utils"

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
    size?: "default" | "sm" | "lg" | "icon";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = "primary", size = "default", ...props }, ref) => {
        return (
            <button
                ref={ref}
                className={cn(
                    "inline-flex items-center justify-center whitespace-nowrap rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50",
                    {
                        "bg-primary text-white shadow-active-speaker hover:bg-opacity-90": variant === "primary",
                        "bg-surface text-text-main shadow-flat border border-gray-200 hover:bg-gray-50": variant === "secondary",
                        "border border-gray-200 bg-transparent shadow-sm hover:bg-gray-50 hover:text-text-main": variant === "outline",
                        "hover:bg-gray-100": variant === "ghost",
                        "bg-red-500 text-white hover:bg-red-600 shadow-active-speaker": variant === "danger",
                        "h-12 px-8": size === "default",
                        "h-10 px-4 text-xs": size === "sm",
                        "h-14 px-10 text-base": size === "lg",
                        "h-12 w-12": size === "icon",
                    },
                    className
                )}
                {...props}
            />
        )
    }
)
Button.displayName = "Button"

export { Button }

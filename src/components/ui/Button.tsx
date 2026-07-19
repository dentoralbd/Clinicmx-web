import { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  variant?: 'primary' | 'highlight' | 'secondary' | 'outline' | 'ghost' | 'destructive'
  size?: 'sm' | 'md' | 'lg'
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-medium transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none disabled:translate-y-0 disabled:shadow-none',
        {
          'rounded-xl bg-gradient-to-br from-primary to-primary-bright text-white shadow-[0_8px_20px_-8px_rgba(13,148,136,.5)] hover:shadow-[0_12px_28px_-8px_rgba(13,148,136,.6)] active:translate-y-px': variant === 'primary',
          'rounded-xl bg-gradient-to-br from-highlight to-highlight-hover text-white shadow-[0_8px_20px_-8px_rgba(233,30,140,.5)] hover:shadow-[0_12px_28px_-8px_rgba(233,30,140,.6)] active:translate-y-px': variant === 'highlight',
          'rounded-lg text-primary-deep bg-primary/5 border border-primary/15 hover:bg-primary/10': variant === 'secondary' || variant === 'ghost',
          'rounded-lg border border-gray-300 bg-white hover:bg-gray-50 hover:border-gray-400': variant === 'outline',
          'rounded-lg bg-error text-white hover:bg-error/90': variant === 'destructive',
          'px-3 py-1.5 text-sm': size === 'sm',
          'px-4 py-2 text-sm': size === 'md',
          'px-6 py-3 text-base': size === 'lg',
        },
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}

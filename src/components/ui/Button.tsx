import { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost'
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
        'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none disabled:translate-y-0 disabled:shadow-none',
        {
          'bg-gradient-to-b from-primary to-primary-hover text-white shadow-elevation-low hover:shadow-elevation-md hover:-translate-y-0.5 active:translate-y-0 active:shadow-elevation-low': variant === 'primary',
          'bg-gray-100 text-text-primary hover:bg-gray-200 shadow-elevation-low hover:shadow-elevation-md': variant === 'secondary',
          'border border-gray-300 bg-white hover:bg-gray-50 hover:border-gray-400': variant === 'outline',
          'hover:bg-gray-100': variant === 'ghost',
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

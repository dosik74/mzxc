import React from 'react'

type Props = {
  className?: string
  small?: boolean
}

export default function LoadingSpinner({ className = '', small = false }: Props) {
  const size = small ? 40 : 96

  return (
    <svg className={className} width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <defs>
        <linearGradient id="g" x1="0%" x2="100%">
          <stop offset="0%" stopColor="var(--accent-start)" />
          <stop offset="100%" stopColor="var(--accent-end)" />
        </linearGradient>
      </defs>

      <g transform="translate(20,20)">
        <rect className="bar a" x="-9" y="-12" width="6" height="24" rx="1.5" fill="url(#g)" />
        <rect className="bar b" x="3" y="-12" width="6" height="24" rx="1.5" fill="url(#g)" />
      </g>

      <style>{`
        .bar { transform-origin: center bottom; opacity: 0.28; }
        .bar.a { animation: swap 1000ms ease-in-out infinite; }
        .bar.b { animation: swap 1000ms ease-in-out infinite; animation-delay: 500ms; }

        @keyframes swap {
          0% { transform: scaleY(0.28); opacity: 0.28; }
          35% { transform: scaleY(1.02); opacity: 1; }
          65% { transform: scaleY(1); opacity: 0.95; }
          100% { transform: scaleY(0.28); opacity: 0.28; }
        }

        .bar { filter: drop-shadow(0 6px 12px rgba(99,102,241,0.12)); }
      `}</style>
    </svg>
  )
}

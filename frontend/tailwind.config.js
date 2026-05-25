module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        base:     'var(--color-base)',
        surface:  'var(--color-surface)',
        elevated: 'var(--color-elevated)',
        overlay:  'var(--color-overlay)',
        mint:     'var(--color-mint)',
        indigo:   'var(--color-indigo)',
        amber:    'var(--color-amber)',
        'mint-glow': 'var(--color-mint-glow)',
        'border-subtle': 'var(--color-border-subtle)',
        'border-default':'var(--color-border-default)',
        'border-strong': 'var(--color-border-strong)',
        'text-primary':  'var(--color-text-primary)',
        'text-secondary':'var(--color-text-secondary)',
        'text-muted':    'var(--color-text-muted)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      keyframes: {
        fadeUp: {
          '0%':   { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideRight: {
          '0%':   { opacity: '0', transform: 'translateX(12px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideLeft: {
          '0%':   { opacity: '0', transform: 'translateX(-12px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition:  '200% center' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%':     { transform: 'translateY(-10px)' },
        },
        blink: {
          '0%,100%': { opacity: '1' },
          '50%':     { opacity: '0' },
        },
        nodePulse: {
          '0%,100%': { filter: 'drop-shadow(0 0 4px rgba(245,158,11,0.4))' },
          '50%':     { filter: 'drop-shadow(0 0 16px rgba(245,158,11,1.0))' },
        },
        spin: {
          '0%':   { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        progressIn: {
          '0%':   { opacity: '0', transform: 'translateX(-8px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        themeSweep: {
          '0%':   { transform: 'translateY(-100%)' },
          '40%':  { transform: 'translateY(0)' },
          '60%':  { transform: 'translateY(0)' },
          '100%': { transform: 'translateY(100%)' },
        },
      },
      animation: {
        'fade-up':     'fadeUp 0.35s ease forwards',
        'slide-right': 'slideRight 0.2s ease forwards',
        'slide-left':  'slideLeft 0.2s ease forwards',
        'shimmer':     'shimmer 2s linear infinite',
        'float':       'float 4s ease-in-out infinite',
        'blink':       'blink 0.8s step-end infinite',
        'node-pulse':  'nodePulse 1.5s ease infinite',
        'spin-slow':   'spin 0.7s linear infinite',
        'progress-in': 'progressIn 0.4s ease forwards',
        'theme-sweep': 'themeSweep 0.7s ease-in-out forwards',
      },
      boxShadow: {
        'glow-mint':  '0 0 24px rgba(110,231,183,0.15)',
        'glow-focus': '0 0 0 1px rgba(110,231,183,0.30), 0 0 32px rgba(110,231,183,0.12)',
        'card':       '0 4px 16px rgba(0,0,0,0.5)',
      },
    },
  },
  plugins: [],
}

module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#0A0A0A',
        paper: '#111111',
        raised: '#1A1A1A',
        border: '#222222',
        'border-light': '#2A2A2A',
        'ink-primary': '#F5F5F5',
        'ink-secondary': '#888888',
        'ink-muted': '#444444',
        accent: '#E8FF8B',
        'accent-dim': 'rgba(232,255,139,0.12)',
        'accent-border': 'rgba(232,255,139,0.25)',
        success: '#4ADE80',
        danger: '#F87171',
        warning: '#FBBF24',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        serif: ['Lora', 'Georgia', 'serif'],
      },
      fontSize: {
        display: ['clamp(3rem, 8vw, 6rem)', { lineHeight: '0.95', letterSpacing: '-0.03em' }],
        headline: ['clamp(1.75rem, 4vw, 2.75rem)', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        label: ['0.6875rem', { lineHeight: '1', letterSpacing: '0.08em' }],
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        blink: {
          '0%,100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
        spin: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        nodePulse: {
          '0%,100%': { filter: 'drop-shadow(0 0 3px rgba(232,255,139,0.4))' },
          '50%': { filter: 'drop-shadow(0 0 12px rgba(232,255,139,0.9))' },
        },
      },
      animation: {
        'fade-up': 'fadeUp 0.5s cubic-bezier(0.16,1,0.3,1) forwards',
        'fade-in': 'fadeIn 0.4s ease forwards',
        'slide-down': 'slideDown 0.3s ease forwards',
        blink: 'blink 1s step-end infinite',
        'spin-slow': 'spin 0.8s linear infinite',
        'node-pulse': 'nodePulse 1.5s ease infinite',
      },
      borderWidth: { '0.5': '0.5px' },
    },
  },
  plugins: [],
};

import type { Config } from 'tailwindcss';

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'),
        surface: v('surface'),
        hover: v('hover'),
        border: v('border'),
        text: v('text'),
        muted: v('muted'),
        accent: v('accent'),
        win: v('win'),
        loss: v('loss'),
        like: v('like'),
        gold: v('gold'),
        pit: v('pit'),
        launcher: '#FFD400',
        trader: '#1D9BF0',
        scout: '#00BA7C',
        shiller: '#F91880',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        body: ['15px', '20px'],
        name: ['20px', '24px'],
        headline: ['23px', '28px'],
        meta: ['13px', '16px'],
      },
      borderRadius: { card: '16px' },
      width: { feed: '600px', rail: '350px' },
      maxWidth: { feed: '600px', rail: '350px' },
      keyframes: {
        pop: { '0%': { transform: 'scale(1)' }, '40%': { transform: 'scale(1.35)' }, '100%': { transform: 'scale(1)' } },
        floatUp: {
          '0%': { transform: 'translate(-50%, 0) scale(0.6)', opacity: '0' },
          '15%': { transform: 'translate(-50%, -20px) scale(1.1)', opacity: '1' },
          '100%': { transform: 'translate(calc(-50% + var(--dx, 0px)), -170px) scale(1)', opacity: '0' },
        },
        slideDown: { '0%': { transform: 'translateY(-8px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
        blink: { '0%, 80%, 100%': { opacity: '0.2' }, '40%': { opacity: '1' } },
        flash: { '0%': { backgroundColor: 'rgb(var(--accent) / 0.18)' }, '100%': { backgroundColor: 'transparent' } },
      },
      animation: {
        pop: 'pop 280ms ease-out',
        floatUp: 'floatUp 2.6s ease-out forwards',
        slideDown: 'slideDown 220ms ease-out',
        blink: 'blink 1.2s infinite',
        flash: 'flash 2.2s ease-out',
      },
    },
  },
  plugins: [],
};

export default config;

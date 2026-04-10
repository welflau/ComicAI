/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ComicFlow Design System
        primary: {
          50: '#f0f4ff',
          100: '#e0eaff',
          500: '#4F6EF7',
          600: '#3B57F0',
          700: '#2E45CC',
          900: '#1a2a7a',
        },
        canvas: {
          bg: '#0d0d0d',
          grid: '#1a1a1a',
          surface: '#1a1a1a',
          border: '#2e2e2e',
        },
        node: {
          input: '#3B82F6',    // blue - input nodes
          process: '#10B981',  // green - processing nodes
          output: '#EF4444',   // red - output nodes
          control: '#8B5CF6',  // purple - control nodes
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'spin-slow': 'spin 8s linear infinite',
        'float': 'float 3s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' },
        }
      }
    },
  },
  plugins: [],
}

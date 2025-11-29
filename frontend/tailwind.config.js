/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        gray: {
          750: '#374151',
          850: '#1f2937',
        },
        macos: {
          sidebar: '#262626',
          main: '#1e1e1e',
          header: '#2d2d2d',
          accent: '#0A84FF',
          success: '#30D158',
          danger: '#FF453A',
          warning: '#FFD60A',
          border: 'rgba(255, 255, 255, 0.1)',
          input: 'rgba(255, 255, 255, 0.1)',
          surface: '#333333',
        }
      },
      fontFamily: {
        'sans': ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        'mono': ['SF Mono', 'Menlo', 'Monaco', 'JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      boxShadow: {
        'macos-btn': '0 1px 0 rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.05)',
        'macos-window': '0 20px 50px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.1)',
      },
      backdropBlur: {
        'macos': '20px',
      }
    },
  },
  plugins: [],
}
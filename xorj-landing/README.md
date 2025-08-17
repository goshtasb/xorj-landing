# XORJ Landing Page

A modern, responsive landing page for XORJ - an AI-powered Solana investing platform.

## Features

- 🚀 **Modern Design**: Built with Next.js 15 and Tailwind CSS
- 📱 **Responsive**: Optimized for all device sizes
- ⚡ **Fast**: Static generation and optimized performance
- 🎨 **Beautiful UI**: Gradient backgrounds and smooth animations
- 📊 **Interactive Charts**: Real-time Solana price data with interactive charts
- 📧 **Waitlist System**: Integrated Supabase backend for email collection

## Tech Stack

- **Framework**: Next.js 15 with App Router
- **Styling**: Tailwind CSS v4
- **Icons**: Lucide React
- **Backend**: Supabase
- **TypeScript**: Full type safety
- **Fonts**: Geist Sans & Geist Mono

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Run the development server:
```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000) to view the landing page.

## Development

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Project Structure

```
src/
├── app/
│   ├── components/
│   │   └── XORJLandingPage.tsx    # Main landing page component
│   ├── globals.css                 # Global styles
│   ├── layout.tsx                  # Root layout
│   └── page.tsx                    # Home page
├── public/                         # Static assets
└── ...
```

## Environment Variables

The project uses Supabase for the waitlist functionality. Make sure to configure your Supabase credentials if needed.

## Deployment

This project is optimized for deployment on Vercel, but can be deployed to any platform that supports Next.js.

## License

Private - All rights reserved.

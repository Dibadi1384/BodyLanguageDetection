# Body Language Detection Frontend

A modern React application built with Vite, TypeScript, Tailwind CSS, and shadcn/ui for video upload and body language analysis.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Installation & Setup

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd BodyLanguageDetection
   ```

2. **Install dependencies**
   ```bash
   cd Frontend
   npm install
   ```

3. **Start development server**
   ```bash
   npm run dev
   ```

4. **Open in browser**
   - Navigate to `http://localhost:8080`
   - The app should load with the video upload interface

## 🛠️ Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## 🎯 Features

- **Video Upload**: Drag & drop or click to upload videos
- **Camera Recording**: Record videos directly in the browser
- **Real-time Progress**: Upload progress tracking
- **Modern UI**: Built with shadcn/ui components
- **Responsive Design**: Works on desktop and mobile
- **TypeScript**: Full type safety

## 🏗️ Tech Stack

- **React 18** - UI framework
- **Vite** - Build tool and dev server
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **shadcn/ui** - UI components
- **React Router** - Client-side routing
- **React Query** - Data fetching
- **Sonner** - Toast notifications

## 📁 Project Structure

```
Frontend/
├── src/
│   ├── components/     # Reusable UI components
│   ├── pages/         # Page components
│   ├── hooks/         # Custom React hooks
│   ├── lib/           # Utility functions
│   └── assets/        # Static assets
├── public/            # Public assets
└── package.json       # Dependencies
```

## 🔧 Development

The app is configured with:
- **Hot Module Replacement** for fast development
- **TypeScript strict mode** for better code quality
- **ESLint** for code linting
- **Tailwind CSS** for utility-first styling
- **Path aliases** (`@/` for `src/`)

## 🚀 Deployment

Build the app for production:
```bash
npm run build
```

The built files will be in the `dist/` directory.
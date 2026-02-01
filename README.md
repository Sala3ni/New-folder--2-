# Pastebin Lite

A simple pastebin-like application built with React and Express that allows users to create text pastes with optional expiry constraints and share them via URLs.

## Features

- Create text pastes with shareable URLs
- Optional time-based expiry (TTL)
- Optional view count limits
- RESTful API endpoints
- Web interface for creating and viewing pastes
- Deterministic time support for testing

## How to Run Locally

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   Create a `.env` file with your Neon PostgreSQL credentials:
   ```
   DATABASE_URL=postgresql://username:password@ep-xxx-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require
   ```

4. Build the React app:
   ```bash
   npm run build
   ```

5. Start the server:
   ```bash
   npm start
   ```

6. Open [http://localhost:5000](http://localhost:5000) in your browser

## Persistence Layer

This application uses **Neon PostgreSQL** as the persistence layer. Neon was chosen because:

- Serverless PostgreSQL with automatic scaling
- Generous free tier perfect for small applications
- Full SQL support with ACID compliance
- Easy integration with Node.js applications
- Built-in connection pooling and branching

## API Endpoints

- `GET /api/healthz` - Health check endpoint
- `POST /api/pastes` - Create a new paste
- `GET /api/pastes/:id` - Fetch a paste by ID
- `GET /p/:id` - View paste in HTML format

## Design Decisions

1. **React + Express**: Simple and reliable stack with clear separation of concerns
2. **PostgreSQL**: Robust relational database with ACID compliance
3. **Minimal Dependencies**: Only essential packages to keep the application lightweight
4. **Database View Counting**: Views are tracked in PostgreSQL and incremented atomically
5. **Safe HTML Rendering**: Paste content is escaped to prevent XSS attacks
6. **Deterministic Testing**: Supports `x-test-now-ms` header when `TEST_MODE=1` for reliable expiry testing

## Build Commands

- `npm run build` - Build React app for production
- `npm run start` - Start Express server
- `npm run dev` - Start React development server (frontend only)
- `npm test` - Run tests
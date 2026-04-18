# TeleClone - Telegram-like Messenger

A full-stack real-time messenger with voice messages, file sharing, and unique user IDs.

## 🚀 Quick Start (Localhost)

To run this application on your computer, follow these steps:

### 1. Prerequisites
- **Node.js** (v18 or higher)
- **npm** (comes with Node.js)

### 2. Installation
Open your terminal in the project folder and run:
```bash
npm install
```

### 3. Environment Setup
Create a `.env` file in the root directory (or copy from `.env.example`):
```bash
cp .env.example .env
```
Make sure to set a `JWT_SECRET` in your `.env` file.

### 4. Running the App
Start the development server:
```bash
npm run dev
```

The application will be available at: **http://localhost:3000**

---

## 🛠 Features
- **Real-time Messaging**: Instant delivery using Socket.io.
- **Unique IDs**: Find users by their generated 6-character unique ID.
- **Voice Messages**: Record and send audio notes.
- **File Attachments**: Upload and share documents or images.
- **SQLite Database**: Local storage for users and messages (no external DB setup required).

## 📁 Project Structure
- `server.ts`: Express server, Socket.io logic, and API endpoints.
- `src/App.tsx`: Main React frontend.
- `database.sqlite`: Local database file (created automatically).
- `uploads/`: Folder where shared files and voice messages are stored.

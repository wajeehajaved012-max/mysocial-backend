# My Social — Setup Guide

## What You Have
- **backend/** → Node.js + Express API with MySQL
- **frontend/** → HTML login page that connects to the backend

---

## Step 1: Set Up MySQL on Railway (Free)

1. Go to https://railway.app and sign up (free)
2. Click **New Project → Deploy MySQL**
3. Once created, click your MySQL service → go to **Variables** tab
4. Copy these values:
   - `MYSQL_HOST`
   - `MYSQL_PORT`
   - `MYSQL_USER`
   - `MYSQL_PASSWORD`
   - `MYSQL_DATABASE`

---

## Step 2: Deploy Backend to Render (Free)

1. Push your **backend/** folder to a GitHub repo
2. Go to https://render.com and sign up (free)
3. Click **New → Web Service → Connect your GitHub repo**
4. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Add Environment Variables (from Railway):
   - `DB_HOST` → your Railway MySQL host
   - `DB_PORT` → 3306
   - `DB_USER` → your Railway MySQL user
   - `DB_PASSWORD` → your Railway MySQL password
   - `DB_NAME` → your Railway database name
   - `JWT_SECRET` → any random string (e.g., `mysocial_secret_abc123xyz`)
6. Click **Deploy** — Render gives you a URL like:
   `https://mysocial-backend.onrender.com`

---

## Step 3: Update Frontend

Open `frontend/index.html` and find this line:

```javascript
const API_URL = 'https://YOUR-APP-NAME.onrender.com';
```

Replace it with your actual Render URL:

```javascript
const API_URL = 'https://mysocial-backend.onrender.com';
```

---

## Step 4: Deploy Frontend to Vercel (Free)

1. Go to https://vercel.com and sign up (free)
2. Click **New Project → Import GitHub repo** (or drag & drop the frontend folder)
3. Deploy — Vercel gives you a URL like:
   `https://mysocial.vercel.app`

---

## Share With Friends!
Send your friends the Vercel URL. They can:
- Create an account (stored in your MySQL database)
- Sign in and see who else has joined

---

## API Endpoints
| Method | URL | Description |
|--------|-----|-------------|
| POST | /api/signup | Create account |
| POST | /api/login | Sign in |
| GET | /api/profile | Get your profile (auth required) |
| GET | /api/users | Get all friends (auth required) |

---

## Questions?
Ask Claude for help with any step!

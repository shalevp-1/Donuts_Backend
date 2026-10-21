**Backend README**

# Donuts Backend

Backend API for **Donuts for You**, a full-stack e-commerce application. Built with Node.js, Express, and MySQL, the API handles authentication, donut management, checkout, purchase history, rewards tracking, user management, and signup email notifications.

## Features
- User registration, login, and logout
- Password hashing with bcrypt
- JWT authentication with HTTP-only cookies
- Role-based authorization for admin routes
- CRUD operations for donuts
- Checkout flow with order and purchase item records
- Rewards tracking with points, purchase count, and total spent
- Member purchase history
- Admin user management
- Database health check endpoint
- Signup confirmation emails with Nodemailer

## Tech Stack
- Node.js
- Express
- MySQL
- JWT
- bcrypt
- cookie-parser
- CORS
- dotenv
- Nodemailer

## Required environment

Copy `.env.example` to `.env` for local development and replace the placeholder values. Never commit `.env`.

Production requires `MYSQL_HOST`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DATABASE`, `MYSQL_PORT`, `JWT_SECRET`, and `FRONTEND_ORIGINS`. Use a randomly generated `JWT_SECRET` of at least 32 bytes. Set `FRONTEND_ORIGINS` to the exact browser origins, separated by commas; the current deployed frontend is `https://dountstime.netlify.app`. Local CRA uses `http://localhost:3000`.

The frontend uses the Netlify `/api/*` rewrite to reach the Render backend in production. The auth cookie is host-only, `HttpOnly`, `Secure` in production, `SameSite=Lax`, and scoped to `/`; no cookie domain is configured.

## API Endpoints
- `POST /register`
- `POST /login`
- `POST /logout`
- `GET /me`
- `GET /donuts`
- `GET /donut/:id`
- `POST /donuts`
- `PUT /donuts/:id`
- `DELETE /donuts/:id`
- `POST /checkout`
- `GET /my-purchases`
- `GET /users`
- `PUT /users/:id/role`
- `DELETE /users/:id`
- `GET /health/db`

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
- Signup confirmation emails with Nodemailer or Resend

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
- Resend

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

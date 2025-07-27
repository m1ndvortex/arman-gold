# Jeweler SaaS Platform (پلتفرم طلافروشی)

A comprehensive multi-tenant SaaS platform designed specifically for Persian-speaking jewelers, featuring RTL support, advanced inventory management, invoicing, and accounting capabilities.

## Features

- 🏢 **Multi-Tenant Architecture** - Complete tenant isolation with separate databases
- 🌐 **Persian RTL Support** - Full Farsi localization with proper RTL layout
- 📊 **Real-time Dashboard** - Live KPIs and business metrics
- 🧾 **Advanced Invoicing** - Sales, purchase, and trade invoices with gold pricing
- 👥 **Customer Management** - CRM with ledger and communication tools
- 📦 **Inventory Management** - Product tracking with barcode support
- 💰 **Accounting System** - Double-entry bookkeeping with financial reports
- 🔐 **Security** - JWT authentication, 2FA, and role-based access control

## Tech Stack

### Frontend
- React 18 with TypeScript
- Vite for build tooling
- Tailwind CSS for styling
- React Query for state management
- Socket.IO for real-time updates

### Backend
- Node.js with Express and TypeScript
- MySQL 8.0 with Prisma ORM
- Redis for caching and sessions
- Socket.IO for WebSocket connections
- JWT for authentication

### Infrastructure
- Docker & Docker Compose
- Nginx reverse proxy
- Multi-container architecture

## Quick Start

### Prerequisites
- Docker and Docker Compose
- Node.js 18+ (for local development)
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd jeweler-saas-platform
   ```

2. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start the application**
   ```bash
   # Using Docker Compose (recommended)
   npm run docker:up
   
   # Or for development
   npm run dev
   ```

4. **Access the application**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3000
   - Nginx Proxy: http://localhost:80

### Development Setup

1. **Install dependencies**
   ```bash
   # Install root dependencies
   npm install
   
   # Install frontend dependencies
   cd frontend && npm install
   
   # Install backend dependencies
   cd ../backend && npm install
   ```

2. **Start development servers**
   ```bash
   # Start all services with Docker
   npm run docker:up
   
   # Or start individually
   npm run dev:frontend  # Frontend on :5173
   npm run dev:backend   # Backend on :3000
   ```

## Project Structure

```
jeweler-saas-platform/
├── frontend/                 # React frontend application
│   ├── src/
│   │   ├── components/      # Reusable UI components
│   │   ├── pages/          # Page components
│   │   ├── hooks/          # Custom React hooks
│   │   ├── services/       # API services
│   │   ├── utils/          # Utility functions
│   │   └── types/          # TypeScript type definitions
│   ├── public/             # Static assets
│   └── Dockerfile
├── backend/                  # Node.js backend API
│   ├── src/
│   │   ├── controllers/    # Route controllers
│   │   ├── middleware/     # Express middleware
│   │   ├── services/       # Business logic
│   │   ├── models/         # Data models
│   │   ├── utils/          # Utility functions
│   │   └── config/         # Configuration files
│   └── Dockerfile
├── docker/                   # Docker configuration
│   ├── nginx/              # Nginx configuration
│   └── mysql/              # MySQL initialization
├── .kiro/                    # Kiro IDE configuration
│   └── specs/              # Feature specifications
└── docker-compose.yml       # Docker Compose configuration
```

## Environment Variables

Key environment variables (see `.env.example` for complete list):

```env
# Database
DB_HOST=localhost
DB_PORT=3306
DB_NAME=jeweler_platform
DB_USER=jeweler_user
DB_PASSWORD=jeweler_pass_2024

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=your_jwt_secret_here

# Ports
BACKEND_PORT=3000
FRONTEND_PORT=5173
NGINX_HTTP_PORT=80
```

## API Documentation

The API follows RESTful conventions with the following base structure:

- `GET /health` - Health check endpoint
- `GET /api/v1/status` - API status
- `POST /api/v1/auth/login` - User authentication
- `GET /api/v1/dashboard` - Dashboard data
- `CRUD /api/v1/invoices` - Invoice management
- `CRUD /api/v1/customers` - Customer management
- `CRUD /api/v1/products` - Product management

## Testing

```bash
# Run all tests
npm test

# Run frontend tests
npm run test:frontend

# Run backend tests
npm run test:backend

# Watch mode
npm run test:watch
```

## Docker Commands

```bash
# Start all services
npm run docker:up

# Stop all services
npm run docker:down

# Clean up (remove volumes)
npm run docker:clean

# View logs
docker-compose logs -f [service-name]

# Execute commands in containers
docker-compose exec backend npm run test
docker-compose exec frontend npm run build
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions:
- Create an issue in the repository
- Contact the development team
- Check the documentation in `.kiro/specs/`
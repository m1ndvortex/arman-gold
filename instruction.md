Definitive Project Blueprint: Professional Jeweler SaaS Platform (طلافروشی فارسی)
1. Project Overview & Core Architecture

Vision:
Build a secure, scalable, and RTL-compliant SaaS platform for Persian-speaking jewelers (طلافروش‌ها), optimized for real-world jewelry workflows such as invoicing, inventory, accounting, and CRM — all within a multi-tenant environment that guarantees data isolation, customizability, and performance.

Key Goals:

    100% Persian (Farsi) UI with perfect RTL layout.

    Isolated tenant environments for data privacy.

    Modular architecture with pluggable services.

    Clean developer experience with Dockerized setup.

User Roles:

    Super Admin: Manages platform-wide operations, tenants, billing. No access to tenant business data.

    Tenant Admin (Jeweler): Manages own workspace, team, settings, and reports.

    Tenant Employees (e.g., Cashier, Accountant): Role-based permissions. Supports custom roles defined by the Tenant Admin.

    ✅ New Feature: Session Device Tracker — View active sessions and force logout devices.

2. Technology Stack & Infrastructure

    Backend: Node.js + Express.js (TypeScript)

    Frontend: React.js + Vite + Tailwind (TypeScript)

    Database: MySQL with Prisma ORM

    Caching & Queues: Redis (for sessions, rate-limiting, KPI cache)

    CI/CD: GitHub Actions or GitLab CI pipeline for Dockerized deployments

Dependencies: Self-hosted fonts, libraries — no external CDNs for privacy and speed.

Docker Setup:

    backend: Node.js API with hot reload

    frontend: Vite server with volume mount

    db: MySQL with volume persistence

    nginx: Reverse proxy for production

    ✅ New: Redis service container for performance and async processing

3. Dashboard (داشبورد اصلی)

Your control panel for insights and actions.

Widgets:

    KPIs: Today’s Sales, Profit, New Customers, Gold Sold (MTD)

    Alerts: Overdue Invoices, Cheques Due, Low Inventory

    Sales Trend: Interactive bar/line chart

    Quick Actions: New Invoice, Add Product, Add Customer

✅ New Features:

    Drag & Drop Layout: Save personalized dashboard layout

    Number & Date Formatting: Persian and English digits supported

    Real-Time Sync: Live updates via WebSocket

4. Invoicing (فاکتور)

Comprehensive invoice generator with gold pricing logic.

Core Logic:

Final Price = Gold Weight × (Daily Gold Price + Manufacturing Fee + Jeweler’s Profit + VAT)

Key Features:

    Multi-type: Sale, Purchase, Trade

    Barcode scanning

    Split payments: Cash, Card, Cheque, Credit

    PDF Invoice Generator (customizable branding)

✅ New Features:

    Recurring Invoices

    Multi-currency support

    Auto-populate gold price daily from API

    Custom notes, attachments, and internal tags per invoice

5. Customer Management (مشتریان)

Powerful CRM and ledger in one.

Features:

    Full profile (contacts, tags, tax ID)

    Gold & currency ledger with balance history

    CSV/Excel import & export

    Opening balances and account status

✅ New Features:

    Birthday/Occasion Reminders

    WhatsApp/SMS integration for follow-ups

    Customer Groups (e.g., Wholesalers, VIPs)

    Customer credit limits and automatic invoice blocking

6. Inventory (انبار)

Multi-type product tracking with precision.

Categories:

    Raw Gold

    Finished Jewelry

    Coins

    Stones

Features:

    Barcode/QR label generator

    Manual adjustments (e.g., lost, damaged)

    Inventory Aging & Slow-Moving Report

    Real-time integration with invoice flow

✅ New Features:

    Bill of Materials (BOM) — multi-component item recipes

    Minimum quantity alerts

    Physical stock reconciliation module

    Wastage tracking in production

7. Accounting (حسابداری) – ✨ Expanded with 10 New Features

Core System:

    Double-entry system with standard CoA

    Manual Journal Entries

    Multi-ledger support per entity

    Cheque lifecycle management

    Bank reconciliation with CSV import

Financial Reports:

    Trial Balance

    Profit & Loss

    Balance Sheet

    General Ledger (with filters)

    All reports exportable to PDF/Excel

✅ 10 New Professional Accounting Features:

    Automated Recurring Journal Entries (e.g., rent, depreciation)

    Fixed Asset Management Module (track items like computers, safes, furnaces)

    Cost Center Tagging — Assign income/expenses to departments (e.g., Online vs In-Store)

    Drill-down Reporting — Click any figure to view transaction-level breakdown

    Audit Adjustments Workflow — Track fiscal year closing adjustments

    Tax Filing Report Generator — Pre-built format for local tax authority reports

    Transaction Locking by Date — Lock closed periods from edits

    Multi-Currency Ledger Support with FX gains/losses

    Payment Scheduling Calendar — See upcoming cheques, payables, and receivables visually

    Custom Accounting Templates — Save entry templates (e.g., petty cash, staff salaries)

8. Settings (تنظیمات)

Centralized configuration hub.

Modules:

    Business Identity: Name, logo, headers, footers

    Financials: Default gold price, VAT, profit %

    User & Role Manager

    One-click Backup & Restore

    Audit Logs: Who, what, when, where

    Data Import/Export for inventory, customers

✅ New: Email/SMS templates, notification triggers, and full theme customization per tenant
9. Security (امنیت) & Compliance

Baseline:

    TLS 1.3 + AES encryption

    API Role validation

    Strict tenant isolation (separate schemas or databases)

    Enforced password policy + rate limiting

    Audit logs per action

✅ Advanced Features:

    Two-Factor Authentication (2FA) for all admins

    GDPR-style data export/delete compliance

    Idle session auto-expiry

    IP Whitelisting per user

    Security Audit Logs with export

    Login anomaly detection (e.g., sudden country switch)

10. Platform-Wide Bonus Features
Feature	Description
PWA Offline Mode	Invoices and inventory usable offline
Subscription Plans	Monthly/annual plans with feature limits
Webhook Support	Zapier-style external triggers
API Access for Tenants	Developer API key & docs
Help & Support Center	Knowledgebase, tickets, onboarding
Tenant Setup Wizard	Smart onboarding after sign-up
Multi-language Support	Expand beyond Persian in future
Notification Center	Unified system logs, toast alerts
Dark/Light Mode Support	User and tenant themed interfaces
Email & SMS Automation	For invoices, birthdays, follow-ups
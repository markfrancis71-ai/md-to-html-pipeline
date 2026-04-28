---
title: DentRepair Connect — Software Design Specification
eyebrow: Document
meta: "Monday, April 27, 2026"
date: 2026-04-28
---

# DentRepair Connect — Software Design Specification

## AI Coding Agent Prompt

**Instruction to Copilot / Claude Code:** Use this document as the complete specification to build a full-stack, production-grade service marketplace web application called **DentRepair Connect**. It connects dental equipment repair service providers with dental offices and practitioners. Implement all modules, schemas, APIs, security controls, and payment flows described below. Follow the architecture decisions, tech stack, and conventions exactly as specified. Where implementation details are ambiguous, choose the most secure and maintainable option and add a `// DESIGN DECISION:` comment explaining your choice.

---

## 1. Product Overview

### 1.1 Problem Statement
Dental practices face significant difficulty finding qualified, local repair technicians for specialized equipment (handpieces, chairs, compressors, sterilizers, imaging systems, IT). The U.S. has ~200,000 practicing dentists but only ~3,200 dedicated repair professionals, creating a severe supply-demand imbalance. Practices lose $500–$2,000/day in revenue during equipment downtime.

### 1.2 Solution
A three-portal service marketplace ("broker" application) that:
- Lets **repair service providers** list their services, manage bookings, and receive payouts.
- Lets **dental offices** search for local providers, compare ratings, and book/pay for services.
- Gives **platform administrators** full back-office control over users, transactions, disputes, and platform configuration.

### 1.3 Key Business Model
- Platform collects payment from the customer at booking.
- Platform retains a configurable commission (default 15%) per transaction.
- Remaining funds are paid out to the provider after service completion and a configurable hold period (default 48 hours).
- Revenue also from optional featured provider listings and subscription tiers.

---

## 2. Architecture Overview

### 2.1 High-Level Architecture Pattern
- **Monorepo** with clear module boundaries (not microservices at launch — optimize for speed to market, refactor to microservices when scale demands it).
- **Server-Side Rendered (SSR) + SPA hybrid** using Next.js App Router.
- **API Layer:** Next.js Route Handlers (REST) + tRPC for type-safe internal API calls.
- **Database:** PostgreSQL with Prisma ORM.
- **Authentication:** Auth.js (NextAuth v5) with multi-provider support + custom RBAC.
- **Payments:** Stripe Connect (Express accounts for providers).
- **Deployment Target:** Vercel (frontend + serverless API) + managed PostgreSQL (Neon or Supabase Postgres).
- **File Storage:** AWS S3 or Cloudflare R2 (provider photos, certifications, invoices).
- **Search:** PostgreSQL full-text search initially; upgrade path to Typesense/Meilisearch.
- **Real-time:** Server-Sent Events (SSE) for notifications; upgrade path to WebSockets.
- **Background Jobs:** Inngest or Trigger.dev for async workflows (payout scheduling, email dispatch, reminders).
- **Email:** Resend (transactional) + React Email (templates).

### 2.2 System Context Diagram (Text Representation)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DentRepair Connect                          │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐        │
│  │  Customer     │  │  Provider    │  │  Admin Portal     │        │
│  │  Portal       │  │  Portal      │  │  (Internal)       │        │
│  │  (Next.js)    │  │  (Next.js)   │  │  (Next.js)        │        │
│  └──────┬───────┘  └──────┬───────┘  └────────┬──────────┘        │
│         │                  │                    │                    │
│         └──────────┬───────┴────────────────────┘                   │
│                    │                                                 │
│            ┌───────▼────────┐                                       │
│            │  API Layer     │                                       │
│            │  (tRPC + REST) │                                       │
│            └───────┬────────┘                                       │
│                    │                                                 │
│    ┌───────────────┼───────────────┐                                │
│    │               │               │                                │
│  ┌─▼──┐     ┌─────▼─────┐   ┌────▼─────┐                          │
│  │ DB  │     │  Stripe   │   │  S3/R2   │                          │
│  │Pg+  │     │  Connect  │   │  Files   │                          │
│  │Redis│     └───────────┘   └──────────┘                          │
│  └─────┘                                                            │
└─────────────────────────────────────────────────────────────────────┘

External Integrations:
  - Stripe Connect (payments, payouts, refunds)
  - Resend (transactional email)
  - Google Maps Platform (geocoding, distance calculations)
  - Twilio or Vonage (SMS for 2FA)
  - S3/R2 (file storage)
  - Inngest (background job orchestration)
```

### 2.3 Tech Stack Summary

| Layer | Technology | Rationale |
|---|---|---|
| Framework | Next.js 14+ (App Router) | SSR, API routes, middleware, edge support |
| Language | TypeScript (strict mode) | End-to-end type safety |
| API | tRPC v11 + REST Route Handlers | Type-safe internal calls + public API endpoints |
| Database | PostgreSQL 16 | Relational integrity, full-text search, PostGIS for geo |
| ORM | Prisma | Type-safe queries, migrations, seeding |
| Cache / Sessions | Redis (Upstash) | Session store, rate limiting, caching |
| Auth | Auth.js (NextAuth v5) | OAuth, credentials, MFA, session management |
| Payments | Stripe Connect (Express) | Marketplace payments, split payouts, refunds |
| File Storage | Cloudflare R2 / AWS S3 | Provider docs, images, invoices |
| Email | Resend + React Email | Transactional emails with React templates |
| Background Jobs | Inngest | Event-driven async workflows |
| Search | PostgreSQL FTS + pg_trgm | Full-text + fuzzy search (upgrade path: Meilisearch) |
| Geolocation | PostGIS + Google Maps API | Radius search, geocoding, distance calc |
| Monitoring | Sentry (errors) + Axiom (logs) | Observability |
| Testing | Vitest + Playwright + MSW | Unit, integration, E2E |
| UI Components | shadcn/ui + Tailwind CSS v4 | Accessible, composable component library |
| Forms | React Hook Form + Zod | Validation shared between client and server |
| State | Zustand (client) + TanStack Query | Client state + server state management |

---

## 3. Database Schema

### 3.1 Core Entities (Prisma Schema)

```prisma
// ─── ENUMS ───────────────────────────────────────────────

enum UserRole {
  CUSTOMER
  PROVIDER
  ADMIN
  SUPER_ADMIN
}

enum AccountStatus {
  PENDING_VERIFICATION
  ACTIVE
  SUSPENDED
  DEACTIVATED
}

enum BookingStatus {
  REQUESTED
  CONFIRMED
  IN_PROGRESS
  COMPLETED
  CANCELLED_BY_CUSTOMER
  CANCELLED_BY_PROVIDER
  DISPUTED
  REFUNDED
}

enum PaymentStatus {
  PENDING
  AUTHORIZED
  CAPTURED
  PARTIALLY_REFUNDED
  REFUNDED
  FAILED
  DISPUTED
}

enum PayoutStatus {
  PENDING
  SCHEDULED
  PROCESSING
  COMPLETED
  FAILED
}

enum ServiceCategory {
  MECHANICAL_SYSTEMS       // vacuums, compressors, amalgam separators
  OPERATORY_EQUIPMENT      // chairs, lights, dental units, handpieces
  STERILIZATION            // autoclaves, ultrasonic cleaners
  IMAGING                  // X-ray, panoramic, cone beam, sensors
  IT_AND_NETWORKING        // hardware, software, network
  PREVENTIVE_MAINTENANCE   // scheduled maintenance programs
  OTHER
}

enum VerificationStatus {
  NOT_SUBMITTED
  PENDING_REVIEW
  APPROVED
  REJECTED
}

// ─── CORE MODELS ─────────────────────────────────────────

model User {
  id                  String          @id @default(cuid())
  email               String          @unique
  emailVerified       DateTime?
  passwordHash        String?
  firstName           String
  lastName            String
  phone               String?
  phoneVerified       Boolean         @default(false)
  avatarUrl           String?
  role                UserRole
  status              AccountStatus   @default(PENDING_VERIFICATION)
  mfaEnabled          Boolean         @default(false)
  mfaSecret           String?         // encrypted TOTP secret
  mfaBackupCodes      String[]        // encrypted backup codes
  lastLoginAt         DateTime?
  loginAttempts       Int             @default(0)
  lockedUntil         DateTime?
  createdAt           DateTime        @default(now())
  updatedAt           DateTime        @updatedAt

  // Relations
  providerProfile     ProviderProfile?
  customerProfile     CustomerProfile?
  sessions            Session[]
  auditLogs           AuditLog[]
  notifications       Notification[]
  sentMessages        Message[]       @relation("SentMessages")
  receivedMessages    Message[]       @relation("ReceivedMessages")
}

model ProviderProfile {
  id                    String              @id @default(cuid())
  userId                String              @unique
  user                  User                @relation(fields: [userId], references: [id])
  businessName          String
  businessDescription   String              @db.Text
  businessLicenseNumber String?
  taxId                 String?             // encrypted
  websiteUrl            String?
  yearsInBusiness       Int?

  // Stripe Connect
  stripeConnectedAccountId  String?         @unique
  stripeOnboardingComplete  Boolean         @default(false)
  payoutsEnabled            Boolean         @default(false)

  // Verification
  verificationStatus    VerificationStatus  @default(NOT_SUBMITTED)
  verifiedAt            DateTime?
  verifiedByAdminId     String?

  // Location
  address               Address?
  serviceRadiusMiles    Int                 @default(50)
  serviceAreas          ServiceArea[]

  // Business
  services              Service[]
  certifications        Certification[]
  bookings              Booking[]
  reviews               Review[]
  payouts               Payout[]
  availability          Availability[]

  avgRating             Float               @default(0)
  totalReviews          Int                 @default(0)
  totalCompletedJobs    Int                 @default(0)
  responseTimeMinutes   Int?                // avg response time

  isActive              Boolean             @default(true)
  isFeatured            Boolean             @default(false)
  featuredUntil         DateTime?

  createdAt             DateTime            @default(now())
  updatedAt             DateTime            @updatedAt
}

model CustomerProfile {
  id                  String          @id @default(cuid())
  userId              String          @unique
  user                User            @relation(fields: [userId], references: [id])
  practiceName        String
  practiceType        String?         // General, Orthodontics, Oral Surgery, etc.
  practiceSize        String?         // Solo, Small (2-5), Medium (6-15), Large (16+)

  // Stripe
  stripeCustomerId    String?         @unique

  // Location
  address             Address?

  // Relations
  bookings            Booking[]
  reviews             Review[]
  favoriteProviders   FavoriteProvider[]

  createdAt           DateTime        @default(now())
  updatedAt           DateTime        @updatedAt
}

model Address {
  id                  String          @id @default(cuid())
  street1             String
  street2             String?
  city                String
  state               String
  zipCode             String
  country             String          @default("US")
  latitude            Float?
  longitude           Float?
  // Polymorphic relations
  providerProfileId   String?         @unique
  providerProfile     ProviderProfile? @relation(fields: [providerProfileId], references: [id])
  customerProfileId   String?         @unique
  customerProfile     CustomerProfile? @relation(fields: [customerProfileId], references: [id])

  createdAt           DateTime        @default(now())
  updatedAt           DateTime        @updatedAt
}

model ServiceArea {
  id                  String          @id @default(cuid())
  providerProfileId   String
  providerProfile     ProviderProfile @relation(fields: [providerProfileId], references: [id])
  zipCode             String
  city                String
  state               String

  @@unique([providerProfileId, zipCode])
}

model Service {
  id                  String           @id @default(cuid())
  providerProfileId   String
  providerProfile     ProviderProfile  @relation(fields: [providerProfileId], references: [id])
  name                String
  description         String           @db.Text
  category            ServiceCategory
  priceType           String           // "FIXED", "HOURLY", "ESTIMATE"
  priceAmount         Decimal?         @db.Decimal(10, 2)
  priceMin            Decimal?         @db.Decimal(10, 2)
  priceMax            Decimal?         @db.Decimal(10, 2)
  estimatedDuration   Int?             // minutes
  isActive            Boolean          @default(true)
  bookingItems        BookingItem[]

  createdAt           DateTime         @default(now())
  updatedAt           DateTime         @updatedAt
}

model Certification {
  id                  String           @id @default(cuid())
  providerProfileId   String
  providerProfile     ProviderProfile  @relation(fields: [providerProfileId], references: [id])
  name                String           // e.g., "A-dec Certified Technician"
  issuingOrganization String
  issueDate           DateTime
  expirationDate      DateTime?
  documentUrl         String?          // S3/R2 URL
  verificationStatus  VerificationStatus @default(NOT_SUBMITTED)

  createdAt           DateTime         @default(now())
  updatedAt           DateTime         @updatedAt
}

model Availability {
  id                  String           @id @default(cuid())
  providerProfileId   String
  providerProfile     ProviderProfile  @relation(fields: [providerProfileId], references: [id])
  dayOfWeek           Int              // 0=Sunday, 6=Saturday
  startTime           String           // "08:00" (24hr format)
  endTime             String           // "17:00"
  isAvailable         Boolean          @default(true)

  @@unique([providerProfileId, dayOfWeek])
}

// ─── BOOKING & TRANSACTIONS ─────────────────────────────

model Booking {
  id                    String          @id @default(cuid())
  bookingNumber         String          @unique  // human-readable: DR-20260413-XXXX
  customerProfileId     String
  customerProfile       CustomerProfile @relation(fields: [customerProfileId], references: [id])
  providerProfileId     String
  providerProfile       ProviderProfile @relation(fields: [providerProfileId], references: [id])

  status                BookingStatus   @default(REQUESTED)

  // Scheduling
  requestedDate         DateTime
  confirmedDate         DateTime?
  completedDate         DateTime?

  // Service Details
  items                 BookingItem[]
  equipmentDescription  String          @db.Text
  urgencyLevel          String          @default("STANDARD") // STANDARD, URGENT, EMERGENCY
  customerNotes         String?         @db.Text

  // Location
  serviceAddress        String
  serviceCity           String
  serviceState          String
  serviceZip            String

  // Financial
  subtotal              Decimal         @db.Decimal(10, 2)
  platformFee           Decimal         @db.Decimal(10, 2)
  platformFeePercent    Decimal         @db.Decimal(5, 2)
  taxAmount             Decimal         @db.Decimal(10, 2) @default(0)
  totalAmount           Decimal         @db.Decimal(10, 2)
  providerPayout        Decimal         @db.Decimal(10, 2)

  // Payment
  payment               Payment?
  payout                Payout?

  // Communication
  messages              Message[]

  // Review
  review                Review?

  // Dispute
  dispute               Dispute?

  // Cancellation
  cancellationReason    String?
  cancelledAt           DateTime?
  cancelledBy           String?         // userId

  createdAt             DateTime        @default(now())
  updatedAt             DateTime        @updatedAt

  @@index([customerProfileId])
  @@index([providerProfileId])
  @@index([status])
  @@index([requestedDate])
}

model BookingItem {
  id                  String          @id @default(cuid())
  bookingId           String
  booking             Booking         @relation(fields: [bookingId], references: [id])
  serviceId           String
  service             Service         @relation(fields: [serviceId], references: [id])
  quantity            Int             @default(1)
  unitPrice           Decimal         @db.Decimal(10, 2)
  totalPrice          Decimal         @db.Decimal(10, 2)
}

model Payment {
  id                      String          @id @default(cuid())
  bookingId               String          @unique
  booking                 Booking         @relation(fields: [bookingId], references: [id])
  stripePaymentIntentId   String          @unique
  stripeChargeId          String?
  status                  PaymentStatus   @default(PENDING)
  amount                  Decimal         @db.Decimal(10, 2)
  currency                String          @default("usd")
  refundedAmount          Decimal         @db.Decimal(10, 2) @default(0)
  metadata                Json?

  createdAt               DateTime        @default(now())
  updatedAt               DateTime        @updatedAt
}

model Payout {
  id                      String          @id @default(cuid())
  bookingId               String          @unique
  booking                 Booking         @relation(fields: [bookingId], references: [id])
  providerProfileId       String
  providerProfile         ProviderProfile @relation(fields: [providerProfileId], references: [id])
  stripeTransferId        String?         @unique
  stripePayoutId          String?
  status                  PayoutStatus    @default(PENDING)
  amount                  Decimal         @db.Decimal(10, 2)
  currency                String          @default("usd")
  scheduledFor            DateTime
  processedAt             DateTime?
  failureReason           String?

  createdAt               DateTime        @default(now())
  updatedAt               DateTime        @updatedAt
}

model Refund {
  id                      String          @id @default(cuid())
  paymentId               String
  stripeRefundId          String          @unique
  amount                  Decimal         @db.Decimal(10, 2)
  reason                  String
  initiatedBy             String          // userId (admin or system)
  status                  String          // pending, succeeded, failed
  metadata                Json?

  createdAt               DateTime        @default(now())
}

// ─── REVIEWS & COMMUNICATION ────────────────────────────

model Review {
  id                  String          @id @default(cuid())
  bookingId           String          @unique
  booking             Booking         @relation(fields: [bookingId], references: [id])
  customerProfileId   String
  customerProfile     CustomerProfile @relation(fields: [customerProfileId], references: [id])
  providerProfileId   String
  providerProfile     ProviderProfile @relation(fields: [providerProfileId], references: [id])
  rating              Int             // 1-5
  title               String?
  comment             String?         @db.Text
  providerResponse    String?         @db.Text
  isVisible           Boolean         @default(true)
  flaggedForReview    Boolean         @default(false)

  createdAt           DateTime        @default(now())
  updatedAt           DateTime        @updatedAt

  @@index([providerProfileId])
}

model Message {
  id                  String          @id @default(cuid())
  bookingId           String?
  booking             Booking?        @relation(fields: [bookingId], references: [id])
  senderId            String
  sender              User            @relation("SentMessages", fields: [senderId], references: [id])
  receiverId          String
  receiver            User            @relation("ReceivedMessages", fields: [receiverId], references: [id])
  content             String          @db.Text
  isRead              Boolean         @default(false)
  attachmentUrl       String?

  createdAt           DateTime        @default(now())
}

model Notification {
  id                  String          @id @default(cuid())
  userId              String
  user                User            @relation(fields: [userId], references: [id])
  type                String          // BOOKING_REQUEST, PAYMENT_RECEIVED, REVIEW_POSTED, etc.
  title               String
  body                String
  actionUrl           String?
  isRead              Boolean         @default(false)
  metadata            Json?

  createdAt           DateTime        @default(now())

  @@index([userId, isRead])
}

// ─── DISPUTES ───────────────────────────────────────────

model Dispute {
  id                  String          @id @default(cuid())
  bookingId           String          @unique
  booking             Booking         @relation(fields: [bookingId], references: [id])
  initiatedBy         String          // userId
  reason              String          @db.Text
  status              String          // OPEN, UNDER_REVIEW, RESOLVED_CUSTOMER, RESOLVED_PROVIDER, CLOSED
  resolution          String?         @db.Text
  resolvedBy          String?         // admin userId
  resolvedAt          DateTime?
  evidence            Json?           // array of file URLs + descriptions

  createdAt           DateTime        @default(now())
  updatedAt           DateTime        @updatedAt
}

// ─── FAVORITES ──────────────────────────────────────────

model FavoriteProvider {
  id                  String          @id @default(cuid())
  customerProfileId   String
  customerProfile     CustomerProfile @relation(fields: [customerProfileId], references: [id])
  providerProfileId   String

  @@unique([customerProfileId, providerProfileId])
}

// ─── ADMIN & AUDIT ──────────────────────────────────────

model AuditLog {
  id                  String          @id @default(cuid())
  userId              String?
  user                User?           @relation(fields: [userId], references: [id])
  action              String          // e.g., "USER_SUSPENDED", "REFUND_ISSUED"
  entityType          String          // e.g., "User", "Booking", "Payment"
  entityId            String
  details             Json?
  ipAddress           String?
  userAgent           String?

  createdAt           DateTime        @default(now())

  @@index([userId])
  @@index([entityType, entityId])
  @@index([createdAt])
}

model PlatformConfig {
  id                  String          @id @default(cuid())
  key                 String          @unique
  value               String
  description         String?
  updatedBy           String?
  updatedAt           DateTime        @updatedAt
}

model Session {
  id                  String          @id @default(cuid())
  userId              String
  user                User            @relation(fields: [userId], references: [id])
  sessionToken        String          @unique
  expiresAt           DateTime
  ipAddress           String?
  userAgent           String?
  createdAt           DateTime        @default(now())
}
```

---

## 4. Portal Specifications

### 4.1 Customer Portal

**Route prefix:** `/` (public-facing root)

#### Pages & Features

| Route | Feature | Auth Required |
|---|---|---|
| `/` | Landing page with search, featured providers, categories | No |
| `/search` | Search results with filters (location, category, rating, price, availability) | No |
| `/providers/:id` | Provider profile (services, reviews, certifications, availability calendar) | No |
| `/auth/login` | Email/password + OAuth (Google) login | No |
| `/auth/register` | Customer registration with practice info | No |
| `/auth/verify-email` | Email verification flow | No |
| `/auth/mfa-setup` | TOTP 2FA setup (optional for customers, recommended) | Yes |
| `/dashboard` | Customer dashboard — upcoming bookings, recent activity | Yes |
| `/dashboard/bookings` | All bookings with status filters | Yes |
| `/dashboard/bookings/:id` | Booking detail — status timeline, messaging, receipt, review | Yes |
| `/dashboard/bookings/new` | Multi-step booking form (select service → schedule → confirm → pay) | Yes |
| `/dashboard/messages` | In-app messaging with providers (booking-scoped) | Yes |
| `/dashboard/reviews` | Reviews written by this customer | Yes |
| `/dashboard/favorites` | Saved/favorite providers | Yes |
| `/dashboard/profile` | Edit practice info, manage addresses | Yes |
| `/dashboard/payments` | Payment history, receipts, invoices | Yes |
| `/dashboard/settings` | Account settings, password change, MFA, notification prefs | Yes |

#### Search & Discovery
- **Geo-based search:** Customer enters zip code or city; results sorted by distance using PostGIS `ST_DWithin`.
- **Filters:** Category, sub-category, rating (min), price range, availability (date), response time, verified only.
- **Sort options:** Distance, rating, price (low/high), number of completed jobs.
- **Provider cards:** Business name, avatar, rating, review count, categories, distance, starting price, "verified" badge.

#### Booking Flow
1. Customer selects service(s) from provider's catalog.
2. Customer selects preferred date/time from provider's availability calendar.
3. Customer enters equipment description, urgency level, service address, notes.
4. System calculates subtotal + platform fee + estimated tax → displays total.
5. Customer enters payment (Stripe Elements — card, Apple Pay, Google Pay).
6. Stripe PaymentIntent created with `capture_method: 'manual'` (authorize only).
7. Provider receives booking request notification.
8. Provider confirms → Stripe captures payment.
9. Provider declines or 24hr timeout → authorization voided, customer notified.
10. After service completion, provider marks complete → 48hr hold → payout scheduled.

### 4.2 Provider Portal

**Route prefix:** `/provider`

#### Pages & Features

| Route | Feature | Auth Required |
|---|---|---|
| `/provider/auth/register` | Multi-step provider registration | No |
| `/provider/auth/login` | Provider login | No |
| `/provider/onboarding` | Guided setup wizard (profile → services → Stripe → verification) | Yes |
| `/provider/dashboard` | Dashboard — today's bookings, pending requests, earnings summary, alerts | Yes |
| `/provider/bookings` | Booking management with status tabs | Yes |
| `/provider/bookings/:id` | Booking detail — accept/decline, update status, messaging, upload completion photos | Yes |
| `/provider/services` | Manage service catalog (CRUD) | Yes |
| `/provider/availability` | Weekly availability schedule + date-specific overrides (vacation, blackout) | Yes |
| `/provider/reviews` | Reviews received, ability to respond | Yes |
| `/provider/earnings` | Earnings dashboard — totals, per-booking breakdown, payout history | Yes |
| `/provider/earnings/payouts` | Payout schedule, bank account management (via Stripe Express dashboard) | Yes |
| `/provider/profile` | Edit public profile, upload certifications, photos, service areas | Yes |
| `/provider/messages` | Messaging center (booking-scoped) | Yes |
| `/provider/settings` | Account settings, MFA management, notification preferences | Yes |

#### Provider Onboarding Flow
1. **Account creation:** Email, password, basic info.
2. **Email verification:** Mandatory.
3. **MFA setup:** Mandatory for providers (TOTP via authenticator app).
4. **Business profile:** Business name, description, license number, years in business.
5. **Service catalog:** Add at least one service with pricing.
6. **Service area:** Set primary address + service radius OR select specific zip codes.
7. **Certifications:** Upload certification documents (PDF/image) — optional but improves visibility.
8. **Stripe Connect onboarding:** Redirect to Stripe Express onboarding (bank account, identity verification, tax info). Use Stripe Account Links API.
9. **Admin review:** Profile enters `PENDING_REVIEW` status. Admin verifies business legitimacy.
10. **Activation:** Admin approves → provider profile goes live on marketplace.

### 4.3 Admin Portal

**Route prefix:** `/admin`

**Access:** ADMIN and SUPER_ADMIN roles only. Requires MFA. IP allowlisting optional (configurable).

#### Pages & Features

| Route | Feature | Roles |
|---|---|---|
| `/admin/dashboard` | Key metrics: revenue, bookings, new users, disputes, provider pipeline | ADMIN, SUPER_ADMIN |
| `/admin/users` | User management — search, filter, view, suspend, deactivate | ADMIN, SUPER_ADMIN |
| `/admin/users/:id` | User detail — edit info, view activity, impersonate (SUPER_ADMIN only) | ADMIN, SUPER_ADMIN |
| `/admin/providers` | Provider management — approval queue, active/suspended | ADMIN, SUPER_ADMIN |
| `/admin/providers/:id` | Provider detail — verify certifications, edit profile, adjust commission | ADMIN, SUPER_ADMIN |
| `/admin/bookings` | All bookings — search, filter, export | ADMIN, SUPER_ADMIN |
| `/admin/bookings/:id` | Booking detail — full timeline, override status, issue refund | ADMIN, SUPER_ADMIN |
| `/admin/disputes` | Dispute queue — open, under review, resolved | ADMIN, SUPER_ADMIN |
| `/admin/disputes/:id` | Dispute detail — evidence, communication, resolve with action | ADMIN, SUPER_ADMIN |
| `/admin/finance` | Financial dashboard — revenue, payouts, refunds, Stripe balance | ADMIN, SUPER_ADMIN |
| `/admin/finance/transactions` | Transaction ledger with export (CSV) | ADMIN, SUPER_ADMIN |
| `/admin/finance/payouts` | Payout management — pending, process, retry failed | ADMIN, SUPER_ADMIN |
| `/admin/finance/refunds` | Refund history and initiate refunds | ADMIN, SUPER_ADMIN |
| `/admin/reviews` | Review moderation — flagged reviews, remove inappropriate content | ADMIN, SUPER_ADMIN |
| `/admin/content` | CMS for FAQ, terms of service, privacy policy, help articles | ADMIN, SUPER_ADMIN |
| `/admin/config` | Platform configuration — commission rates, hold periods, feature flags | SUPER_ADMIN |
| `/admin/audit-log` | Full audit trail — searchable, filterable, exportable | SUPER_ADMIN |
| `/admin/team` | Admin user management — invite, assign roles, deactivate | SUPER_ADMIN |
| `/admin/reports` | Reporting — custom date ranges, revenue by category/region, provider performance | ADMIN, SUPER_ADMIN |

#### Admin Capabilities
- **User impersonation** (SUPER_ADMIN): View the platform as any user for support purposes. All impersonation sessions are logged in the audit trail.
- **Manual refunds:** Full or partial refunds with reason; triggers Stripe refund + provider payout adjustment.
- **Provider commission override:** Set custom commission per provider (e.g., promotional rates).
- **Feature flags:** Toggle platform features (e.g., emergency bookings, featured listings).
- **Bulk operations:** Bulk suspend users, bulk export data.

---

## 5. Security & Authorization

### 5.1 Authentication

#### Multi-Factor Authentication (MFA)
- **Method:** Time-Based One-Time Password (TOTP) — compatible with Google Authenticator, Authy, 1Password, etc.
- **Provider portal:** MFA is **mandatory** (enforced at onboarding; cannot access provider dashboard without MFA).
- **Customer portal:** MFA is **optional but recommended** (prompted after registration, can enable/disable in settings).
- **Admin portal:** MFA is **mandatory** (enforced before any admin access is granted).
- **Backup codes:** 10 single-use backup codes generated at MFA setup. Stored encrypted (AES-256-GCM). Can be regenerated (invalidates old codes).
- **MFA recovery:** If user loses device and backup codes, they must contact support. Admin verifies identity manually before resetting MFA. All MFA resets logged in audit trail.

#### Password Policy
- Minimum 12 characters.
- Must include: uppercase, lowercase, digit, special character.
- Checked against HaveIBeenPwned breach database (k-anonymity API — no full password sent).
- bcrypt hashing with cost factor 12.
- Password rotation not enforced (per NIST 800-63B guidance) but encouraged.

#### Session Management
- Server-side sessions stored in Redis with signed, HttpOnly, Secure, SameSite=Lax cookies.
- Session duration: 24 hours (customers), 8 hours (providers), 4 hours (admins).
- Absolute timeout: 7 days (customers), 24 hours (providers/admins).
- Idle timeout: 30 minutes (admins), 60 minutes (providers), none (customers).
- Concurrent session limit: 5 per user. New login beyond limit invalidates oldest session.
- Session revocation on password change or MFA reset.

#### Account Lockout
- 5 failed login attempts → account locked for 15 minutes.
- 10 failed attempts → account locked for 1 hour + email notification sent.
- 20 failed attempts → account locked indefinitely + requires admin unlock or password reset.
- Lockout state tracked in Redis (not DB) to prevent enumeration timing attacks.

#### OAuth Support
- Google OAuth for customers (convenience login).
- Providers and admins: email/password + MFA only (no OAuth — ensures MFA is always enforced).

### 5.2 Authorization — Role-Based Access Control (RBAC)

```typescript
// Permission definition
type Permission =
  // Customer permissions
  | 'booking:create' | 'booking:read:own' | 'booking:cancel:own'
  | 'review:create' | 'review:read' | 'review:update:own'
  | 'message:send' | 'message:read:own'
  | 'profile:read:own' | 'profile:update:own'
  | 'payment:read:own'
  // Provider permissions
  | 'booking:read:assigned' | 'booking:update:assigned'
  | 'service:create' | 'service:read:own' | 'service:update:own' | 'service:delete:own'
  | 'availability:manage' | 'earnings:read:own'
  | 'review:respond:own'
  | 'provider-profile:update:own'
  // Admin permissions
  | 'user:read:all' | 'user:update:all' | 'user:suspend' | 'user:delete'
  | 'booking:read:all' | 'booking:update:all'
  | 'payment:read:all' | 'refund:create' | 'payout:manage'
  | 'review:moderate' | 'review:delete'
  | 'dispute:read:all' | 'dispute:resolve'
  | 'provider:verify' | 'provider:adjust-commission'
  | 'report:generate' | 'audit-log:read'
  | 'content:manage'
  // Super Admin only
  | 'admin:manage' | 'config:manage' | 'impersonate'

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  CUSTOMER: [
    'booking:create', 'booking:read:own', 'booking:cancel:own',
    'review:create', 'review:read', 'review:update:own',
    'message:send', 'message:read:own',
    'profile:read:own', 'profile:update:own',
    'payment:read:own',
  ],
  PROVIDER: [
    'booking:read:assigned', 'booking:update:assigned',
    'service:create', 'service:read:own', 'service:update:own', 'service:delete:own',
    'availability:manage', 'earnings:read:own',
    'review:respond:own', 'review:read',
    'message:send', 'message:read:own',
    'provider-profile:update:own',
  ],
  ADMIN: [
    'user:read:all', 'user:update:all', 'user:suspend',
    'booking:read:all', 'booking:update:all',
    'payment:read:all', 'refund:create', 'payout:manage',
    'review:moderate', 'review:delete', 'review:read',
    'dispute:read:all', 'dispute:resolve',
    'provider:verify', 'provider:adjust-commission',
    'report:generate', 'audit-log:read',
    'content:manage',
  ],
  SUPER_ADMIN: ['*'], // all permissions
}
```

#### Authorization Middleware (Next.js)

```typescript
// middleware.ts — route protection
import { withAuth } from 'next-auth/middleware'

export default withAuth({
  callbacks: {
    authorized: ({ token, req }) => {
      const path = req.nextUrl.pathname

      // Admin routes: require ADMIN or SUPER_ADMIN + MFA verified
      if (path.startsWith('/admin')) {
        return token?.role === 'ADMIN' || token?.role === 'SUPER_ADMIN'
          && token?.mfaVerified === true
      }

      // Provider routes: require PROVIDER role + MFA verified
      if (path.startsWith('/provider') && !path.startsWith('/provider/auth')) {
        return token?.role === 'PROVIDER' && token?.mfaVerified === true
      }

      // Customer dashboard routes
      if (path.startsWith('/dashboard')) {
        return token?.role === 'CUSTOMER'
      }

      return true // public routes
    },
  },
})

export const config = {
  matcher: ['/dashboard/:path*', '/provider/:path*', '/admin/:path*'],
}
```

### 5.3 API Security

- **Rate limiting:** Redis-backed sliding window rate limiter.
  - Public endpoints: 60 requests/minute per IP.
  - Authenticated endpoints: 120 requests/minute per user.
  - Auth endpoints (login, register): 10 requests/minute per IP.
  - Webhook endpoints: IP allowlist (Stripe IPs only).
- **Input validation:** Zod schemas on every API endpoint. Shared between client and server.
- **CORS:** Strict origin allowlist. No wildcard origins.
- **CSP:** Strict Content-Security-Policy headers.
- **CSRF:** SameSite cookies + CSRF token for state-changing operations.
- **SQL injection:** Prisma parameterized queries (never raw SQL without `$queryRawUnsafe` — and that's banned in the codebase).
- **XSS:** React's default escaping + DOMPurify for any user-generated HTML content.
- **File upload validation:** MIME type verification (server-side), max 10MB, only allow: JPG, PNG, PDF. Virus scanning via ClamAV or cloud-based scanner.
- **Secrets management:** All secrets in environment variables, never in code. Use Vercel's encrypted environment variables.
- **Dependency security:** Dependabot / Renovate for automated dependency updates. `npm audit` in CI pipeline.

### 5.4 Data Protection

- **Encryption at rest:** PostgreSQL with disk encryption (provided by managed DB — Neon/Supabase). Sensitive fields (tax IDs, MFA secrets) encrypted at the application layer using AES-256-GCM with key rotation capability.
- **Encryption in transit:** TLS 1.3 enforced. HSTS with 1-year max-age and includeSubDomains.
- **PII handling:** Personal data (name, email, phone, address) accessible only via authenticated endpoints with appropriate role. Admin access to PII is logged.
- **Data retention:** Audit logs retained for 7 years. User data deleted upon account deactivation after 90-day grace period. Payment records retained per IRS requirements.
- **Backup:** Automated daily database backups with 30-day retention. Point-in-time recovery enabled.

### 5.5 Compliance Considerations

- **PCI DSS:** Platform never stores, processes, or transmits raw card numbers. All card handling delegated to Stripe (PCI Level 1 certified). Stripe Elements / Payment Element used for card collection.
- **SOC 2:** Architecture supports SOC 2 Type II audit trail requirements via comprehensive AuditLog model.
- **HIPAA note:** While dental practices may have HIPAA obligations, this platform does not store protected health information (PHI). Service descriptions should be limited to equipment details, not patient information. Terms of service must explicitly prohibit PHI in messages and descriptions.

---

## 6. Payment & Financial System

### 6.1 Stripe Connect Architecture

#### Account Structure
- **Platform account:** DentRepair Connect's main Stripe account. Receives platform fees.
- **Connected accounts (Express):** One per provider. Stripe handles identity verification, tax forms (1099), bank account management, and compliance.

#### Payment Flow

```
Customer books service
       │
       ▼
┌──────────────────────────────────┐
│ Create PaymentIntent             │
│ - amount: total (subtotal + fee) │
│ - capture_method: 'manual'       │
│ - transfer_data:                 │
│     destination: provider_acct   │
│ - application_fee_amount: fee    │
│ - metadata: { bookingId }        │
└──────────┬───────────────────────┘
           │
           ▼
   Customer authorizes payment
   (Stripe Payment Element)
           │
           ▼
  Provider confirms booking
           │
           ▼
┌──────────────────────────────────┐
│ Capture PaymentIntent            │
│ (full or partial amount)         │
└──────────┬───────────────────────┘
           │
           ▼
  Service completed + 48hr hold
           │
           ▼
┌──────────────────────────────────┐
│ Stripe automatically transfers   │
│ provider's share to their        │
│ connected account balance        │
│                                  │
│ Stripe pays out to provider's    │
│ bank on configured schedule      │
│ (default: daily rolling, T+2)    │
└──────────────────────────────────┘
```

#### Payment Methods Supported
- Credit/debit cards (Visa, Mastercard, Amex, Discover)
- Apple Pay, Google Pay (via Stripe Payment Element)
- ACH bank transfers (for larger invoices — optional, Phase 2)

### 6.2 Refund Logic

| Scenario | Refund Type | Platform Fee | Provider Payout |
|---|---|---|---|
| Customer cancels before provider confirms | Full automatic | Refunded | N/A |
| Customer cancels after confirmation, >24hr before service | Full automatic minus cancellation fee (5%) | Platform keeps cancellation fee | N/A |
| Customer cancels <24hr before service | 50% refund | Platform keeps fee on refunded amount | Provider receives 50% |
| Provider cancels | Full refund | Refunded to customer | N/A — provider may receive penalty |
| Dispute resolved in customer's favor | Full or partial (admin decides) | Adjusted proportionally | Clawed back from provider |
| Service quality issue (admin mediated) | Partial refund (admin sets amount) | Adjusted proportionally | Adjusted proportionally |

#### Refund Implementation

```typescript
// Refund service (simplified)
async function processRefund(params: {
  bookingId: string
  amount: number        // in cents
  reason: string
  initiatedBy: string   // admin userId
  isFullRefund: boolean
}) {
  const booking = await prisma.booking.findUnique({
    where: { id: params.bookingId },
    include: { payment: true, payout: true },
  })

  // Stripe refund
  const refund = await stripe.refunds.create({
    payment_intent: booking.payment.stripePaymentIntentId,
    amount: params.amount,
    reason: 'requested_by_customer',
    reverse_transfer: true,              // reverses the provider transfer
    refund_application_fee: true,        // refunds the platform fee proportionally
    metadata: { bookingId: params.bookingId },
  })

  // Record in database
  await prisma.refund.create({ ... })
  await prisma.payment.update({
    where: { id: booking.payment.id },
    data: {
      status: params.isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
      refundedAmount: { increment: params.amount / 100 },
    },
  })

  // Adjust payout if not yet processed
  if (booking.payout?.status === 'PENDING') {
    await prisma.payout.update({ ... })
  }

  // Audit log
  await createAuditLog({ ... })

  // Notifications
  await notify(booking.customerProfile.userId, 'REFUND_PROCESSED', { ... })
  await notify(booking.providerProfile.userId, 'PAYOUT_ADJUSTED', { ... })
}
```

### 6.3 Provider Payouts

- **Schedule:** Configurable per provider — daily (default), weekly, or monthly.
- **Hold period:** 48 hours after service marked complete (configurable by admin).
- **Minimum payout:** $1.00 (Stripe minimum).
- **Payout method:** Direct to provider's bank account via Stripe Express.
- **Instant payouts:** Available for eligible providers (additional Stripe fee passed to provider).
- **Failed payouts:** Automatic retry (3 attempts). After 3 failures, admin notified and payout held for manual intervention.

### 6.4 Platform Fee / Commission

- **Default:** 15% of service subtotal.
- **Configurable:** Admin can set global default or per-provider override.
- **Stored in `PlatformConfig`:** Key `default_commission_rate`.
- **Promotional rates:** Time-limited reduced rates for new providers (e.g., 10% for first 90 days).
- **Fee displayed to customer:** Transparently shown at checkout as "service fee."

### 6.5 Financial Reporting

- **Revenue dashboard:** Daily/weekly/monthly revenue, broken down by category and region.
- **Payout reporting:** Total payouts, pending payouts, failed payouts.
- **Tax reporting:** Stripe handles 1099-K generation for providers. Platform exports transaction data for accounting.
- **Reconciliation:** Daily automated reconciliation between Stripe balance and platform database via background job.
- **Export:** CSV export for all financial data (transactions, payouts, refunds).

### 6.6 Stripe Webhook Events to Handle

| Event | Action |
|---|---|
| `payment_intent.succeeded` | Update payment status, send confirmation |
| `payment_intent.payment_failed` | Update status, notify customer |
| `charge.refunded` | Update refund record, notify parties |
| `charge.dispute.created` | Create dispute record, notify admin, freeze payout |
| `charge.dispute.closed` | Update dispute status, process resolution |
| `account.updated` | Update provider's Stripe onboarding status |
| `payout.paid` | Update payout status to COMPLETED |
| `payout.failed` | Update payout status, notify admin + provider |
| `transfer.created` | Log transfer confirmation |

---

## 7. API Design

### 7.1 tRPC Router Structure

```
src/server/routers/
├── _app.ts                    # root router
├── auth.router.ts             # login, register, mfa, password reset
├── customer/
│   ├── booking.router.ts      # create, read, cancel bookings
│   ├── search.router.ts       # search providers, services
│   ├── review.router.ts       # create, update reviews
│   ├── message.router.ts      # send, read messages
│   ├── payment.router.ts      # payment history, receipts
│   └── profile.router.ts      # manage customer profile
├── provider/
│   ├── booking.router.ts      # manage assigned bookings
│   ├── service.router.ts      # CRUD services
│   ├── availability.router.ts # manage schedule
│   ├── earnings.router.ts     # earnings, payout history
│   ├── profile.router.ts      # manage provider profile
│   └── onboarding.router.ts   # Stripe Connect, verification
├── admin/
│   ├── user.router.ts         # user management
│   ├── provider.router.ts     # provider approval, verification
│   ├── booking.router.ts      # all bookings, override status
│   ├── finance.router.ts      # transactions, refunds, payouts
│   ├── dispute.router.ts      # dispute management
│   ├── review.router.ts       # review moderation
│   ├── report.router.ts       # reporting, analytics
│   ├── config.router.ts       # platform configuration
│   └── audit.router.ts        # audit log
└── webhook/
    └── stripe.router.ts       # Stripe webhook handler (REST, not tRPC)
```

### 7.2 Key API Endpoints (REST — for external/webhook use)

```
POST   /api/webhooks/stripe          # Stripe webhook receiver
GET    /api/health                    # Health check
GET    /api/v1/providers/public       # Public provider listing (for SEO/embed)
```

### 7.3 Search Query Example

```typescript
// search.router.ts
export const searchRouter = router({
  providers: publicProcedure
    .input(z.object({
      query: z.string().optional(),
      latitude: z.number(),
      longitude: z.number(),
      radiusMiles: z.number().min(1).max(200).default(50),
      category: z.nativeEnum(ServiceCategory).optional(),
      minRating: z.number().min(1).max(5).optional(),
      priceMin: z.number().optional(),
      priceMax: z.number().optional(),
      sortBy: z.enum(['distance', 'rating', 'price_asc', 'price_desc', 'jobs_completed']).default('distance'),
      page: z.number().min(1).default(1),
      pageSize: z.number().min(10).max(50).default(20),
    }))
    .query(async ({ input }) => {
      // Uses PostGIS ST_DWithin for radius search
      // Combines with full-text search on provider name + service descriptions
      // Returns paginated results with distance calculated
    }),
})
```

---

## 8. Background Jobs & Async Workflows

Implement with **Inngest** (event-driven background job framework).

| Job | Trigger | Action |
|---|---|---|
| `booking.auto-expire` | BookingStatus = REQUESTED for 24hrs | Void authorization, cancel booking, notify both parties |
| `payout.schedule` | BookingStatus → COMPLETED + 48hr | Create Stripe transfer to provider |
| `payout.retry` | Payout failed | Retry up to 3 times with exponential backoff |
| `reconciliation.daily` | Cron: 2:00 AM UTC daily | Compare Stripe balance with DB records, flag discrepancies |
| `notification.email` | Any notification event | Send email via Resend |
| `notification.sms` | MFA code request | Send TOTP or verification code via Twilio |
| `review.aggregate` | New review created | Recalculate provider avgRating and totalReviews |
| `provider.response-time` | Booking confirmed/declined | Recalculate provider average response time |
| `report.generate` | Admin request or cron | Generate and cache financial/operational reports |
| `cleanup.expired-sessions` | Cron: hourly | Purge expired sessions from Redis and DB |
| `user.deactivation-cleanup` | 90 days after deactivation | Permanently delete user data per retention policy |

---

## 9. Project Structure

```
dentrepair-connect/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── (public)/                 # Public routes (landing, search, provider profiles)
│   │   │   ├── page.tsx              # Landing page
│   │   │   ├── search/
│   │   │   └── providers/[id]/
│   │   ├── (customer)/               # Customer portal (route group)
│   │   │   ├── dashboard/
│   │   │   └── layout.tsx            # Customer layout with sidebar
│   │   ├── (provider)/               # Provider portal (route group)
│   │   │   ├── provider/
│   │   │   └── layout.tsx            # Provider layout with sidebar
│   │   ├── (admin)/                  # Admin portal (route group)
│   │   │   ├── admin/
│   │   │   └── layout.tsx            # Admin layout with sidebar
│   │   ├── auth/                     # Auth pages (login, register, verify, mfa)
│   │   ├── api/
│   │   │   ├── trpc/[trpc]/route.ts  # tRPC handler
│   │   │   ├── webhooks/stripe/route.ts
│   │   │   └── health/route.ts
│   │   ├── layout.tsx                # Root layout
│   │   └── globals.css
│   ├── server/
│   │   ├── routers/                  # tRPC routers (see §7.1)
│   │   ├── services/                 # Business logic layer
│   │   │   ├── auth.service.ts
│   │   │   ├── booking.service.ts
│   │   │   ├── payment.service.ts
│   │   │   ├── payout.service.ts
│   │   │   ├── refund.service.ts
│   │   │   ├── search.service.ts
│   │   │   ├── notification.service.ts
│   │   │   ├── review.service.ts
│   │   │   └── audit.service.ts
│   │   ├── db/
│   │   │   └── prisma.ts             # Prisma client singleton
│   │   ├── auth/
│   │   │   ├── config.ts             # Auth.js config
│   │   │   ├── mfa.ts                # TOTP generation, verification
│   │   │   └── permissions.ts        # RBAC definitions
│   │   ├── stripe/
│   │   │   ├── client.ts             # Stripe SDK initialization
│   │   │   ├── connect.ts            # Connect account management
│   │   │   ├── payments.ts           # PaymentIntent management
│   │   │   ├── refunds.ts            # Refund handling
│   │   │   └── webhooks.ts           # Webhook verification + routing
│   │   ├── jobs/                     # Inngest job definitions
│   │   │   ├── booking-jobs.ts
│   │   │   ├── payout-jobs.ts
│   │   │   ├── notification-jobs.ts
│   │   │   └── reconciliation-jobs.ts
│   │   └── lib/
│   │       ├── encryption.ts         # AES-256-GCM encrypt/decrypt
│   │       ├── rate-limiter.ts       # Redis-backed rate limiter
│   │       ├── geo.ts                # PostGIS helpers
│   │       └── validation.ts         # Shared Zod schemas
│   ├── components/
│   │   ├── ui/                       # shadcn/ui components
│   │   ├── shared/                   # Cross-portal shared components
│   │   ├── customer/                 # Customer-specific components
│   │   ├── provider/                 # Provider-specific components
│   │   └── admin/                    # Admin-specific components
│   ├── hooks/                        # Custom React hooks
│   ├── lib/
│   │   ├── trpc.ts                   # tRPC client setup
│   │   ├── utils.ts                  # General utilities
│   │   └── constants.ts              # App constants
│   └── types/                        # Shared TypeScript types
├── public/
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── .env.example
├── .env.local
├── docker-compose.yml                # Local dev: Postgres + Redis
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── vitest.config.ts
├── playwright.config.ts
└── package.json
```

---

## 10. Non-Functional Requirements

### 10.1 Performance
- Page load (LCP): < 2.5 seconds.
- API response: < 200ms (p95) for read operations, < 500ms for writes.
- Search results: < 300ms for geo-radius query with filters.
- Database: Connection pooling via PgBouncer or Prisma Accelerate.

### 10.2 Scalability
- Stateless application tier — horizontal scaling via Vercel serverless.
- Database: Read replicas for search-heavy queries when needed.
- Cache: Redis for session data, rate limits, hot provider profiles.
- CDN: Static assets via Vercel Edge Network.

### 10.3 Reliability
- Target: 99.9% uptime.
- Health check endpoint: `/api/health` (checks DB, Redis, Stripe connectivity).
- Graceful degradation: If Stripe is down, allow browsing but disable booking/payment.
- Webhook idempotency: Every webhook handler checks for duplicate event processing using `stripeEventId`.

### 10.4 Monitoring & Alerting
- **Error tracking:** Sentry for runtime errors, with source maps.
- **Logging:** Structured JSON logging via Axiom. Log levels: error, warn, info, debug.
- **Metrics:** Custom metrics for booking conversion rate, payment success rate, payout failure rate.
- **Alerts:** PagerDuty/Slack integration for: payout failures, high error rates, Stripe webhook failures, suspicious login patterns.

### 10.5 Testing Strategy

| Type | Tool | Coverage Target | What to Test |
|---|---|---|---|
| Unit | Vitest | 80%+ | Services, utilities, validation schemas |
| Integration | Vitest + Prisma (test DB) | Key flows | API routes, database operations, Stripe mocks |
| E2E | Playwright | Critical paths | Registration, booking flow, payment, refund, admin actions |
| Security | OWASP ZAP (CI) | All endpoints | OWASP Top 10 2025 vulnerabilities |
| Load | k6 | Baseline | Search endpoint, booking creation under concurrent load |

---

## 11. Deployment & DevOps

### 11.1 Environments
- **Local:** Docker Compose (Postgres + Redis) + Next.js dev server.
- **Preview:** Vercel preview deployments per PR. Shared staging DB (seeded).
- **Production:** Vercel production + Neon Postgres (production branch) + Upstash Redis.

### 11.2 CI/CD Pipeline (GitHub Actions)

```yaml
# .github/workflows/ci.yml
on: [push, pull_request]
jobs:
  lint-and-type-check:
    - ESLint + Prettier check
    - TypeScript strict compilation
  test:
    - Vitest unit + integration tests (with test Postgres via Docker)
  e2e:
    - Playwright E2E tests (against preview deployment)
  security:
    - npm audit
    - OWASP dependency check
  deploy:
    - Vercel auto-deploy (preview on PR, production on main merge)
  db-migrate:
    - Prisma migrate deploy (on production deploy)
```

### 11.3 Environment Variables

```bash
# .env.example
DATABASE_URL=
DIRECT_DATABASE_URL=
REDIS_URL=

# Auth
NEXTAUTH_SECRET=
NEXTAUTH_URL=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_CONNECT_WEBHOOK_SECRET=

# File Storage
S3_BUCKET=
S3_REGION=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=

# Email
RESEND_API_KEY=
EMAIL_FROM=

# Encryption
ENCRYPTION_KEY=          # 256-bit key for AES-256-GCM

# External Services
GOOGLE_MAPS_API_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# Monitoring
SENTRY_DSN=
AXIOM_TOKEN=
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
```

---

## 12. Implementation Phases

### Phase 1 — MVP (Weeks 1–6)
- [ ] Project setup: Next.js, Prisma, DB, Auth.js, Tailwind, shadcn/ui
- [ ] Authentication: registration, login, email verification, MFA (TOTP)
- [ ] Customer portal: search, provider profiles, booking creation
- [ ] Provider portal: registration, onboarding, service CRUD, booking management
- [ ] Stripe Connect: onboarding, payment collection, basic payouts
- [ ] Admin portal: user management, provider approval, booking overview
- [ ] Basic email notifications (Resend)
- [ ] Seed data and demo accounts

### Phase 2 — Core Features (Weeks 7–10)
- [ ] Reviews and ratings system
- [ ] In-app messaging (booking-scoped)
- [ ] Refund processing (full and partial)
- [ ] Dispute management workflow
- [ ] Provider earnings dashboard
- [ ] Admin financial dashboard and transaction ledger
- [ ] Audit logging
- [ ] Provider availability calendar with overrides

### Phase 3 — Polish & Scale (Weeks 11–14)
- [ ] Advanced search (fuzzy matching, category facets)
- [ ] Real-time notifications (SSE)
- [ ] Featured provider listings (paid placement)
- [ ] Provider subscription tiers
- [ ] Admin reporting and CSV export
- [ ] Performance optimization (caching, query optimization)
- [ ] E2E test suite (Playwright)
- [ ] Security audit (OWASP Top 10 review)

### Phase 4 — Growth (Post-Launch)
- [ ] Mobile-responsive PWA optimization
- [ ] SMS notifications
- [ ] ACH payment support
- [ ] Provider analytics (conversion rates, view-to-book)
- [ ] Customer loyalty / referral program
- [ ] API for third-party integrations
- [ ] AI-powered matching (recommend providers based on equipment type + history)

---

## 13. Seed Data

Generate realistic seed data for development and demo:

```typescript
// prisma/seed.ts
// Create:
// - 3 admin users (1 SUPER_ADMIN, 2 ADMIN)
// - 20 provider accounts (various specialties, locations in TX, CA, NY, FL)
//   - Each with 3-8 services across categories
//   - Each with realistic availability
//   - Each with certifications (mix of verified/pending)
//   - Randomized ratings (3.5-5.0) and review counts
// - 50 customer accounts (dental practices of varying sizes)
// - 100 bookings across all statuses
// - 200 reviews with realistic content
// - Audit log entries
// All passwords: "DemoPassword123!" (only for seed data)
// MFA: disabled for seed accounts (enable manually for testing)
```

---

## 14. Key Design Decisions & Constraints

1. **Monorepo over microservices:** Optimize for development speed. The three portals are route groups in a single Next.js app, sharing the same API layer and database. Extract to microservices only when specific scaling bottlenecks emerge.

2. **Stripe Express over Custom:** Express accounts reduce compliance burden and onboarding complexity. Providers use Stripe's hosted dashboard for bank/tax management. Trade-off: less UI customization for payout management.

3. **Auth hold (manual capture):** Payment is authorized at booking, captured only when provider confirms. Protects customers from charges on declined bookings. Authorization window: 7 days (Stripe default).

4. **No PHI storage:** The platform explicitly does not store patient health information. Terms of service and input validation discourage PHI entry. This avoids HIPAA compliance requirements for the platform itself.

5. **PostGIS for geo-search:** Avoids the cost and complexity of a separate search service at launch. PostgreSQL with PostGIS handles radius queries efficiently for the expected data volumes (< 100K providers).

6. **tRPC for internal, REST for external:** Type-safe API calls between Next.js frontend and backend. REST only for Stripe webhooks, health checks, and any future public API.

---

*This specification is complete and ready for implementation by an AI coding agent (GitHub Copilot, Claude Code, Cursor, etc.). Begin with Phase 1. Implement module by module, writing tests alongside feature code. Commit frequently with conventional commit messages.*

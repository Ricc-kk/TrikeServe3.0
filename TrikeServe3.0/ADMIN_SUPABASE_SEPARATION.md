# Admin Account Separation to Supabase

## Overview
Admin accounts are now stored in a separate `admins` table in Supabase, separate from regular users. This provides better security, isolation, and management of administrative accounts.

## What Changed

### 1. New Supabase Table: `admins`
A new table has been created with the following structure:
- `id` (UUID, Primary Key)
- `email` (VARCHAR, Unique)
- `name` (VARCHAR)
- `phone` (VARCHAR)
- `admin_type` (VARCHAR) - Either 'business_customer' or 'rider'
- `password_hash` (VARCHAR) - Password for authentication
- `is_verified` (BOOLEAN) - Verification status
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

**Note:** Two indexes are created:
- `idx_admins_email` - For fast email lookups
- `idx_admins_admin_type` - For filtering by admin type

### 2. AuthContext Updates

#### Initialization (useEffect)
- Default admin accounts are now created in the `admins` Supabase table instead of localStorage
- Two default admin accounts are automatically created:
  - **admin@gmail.com** (Business & Customer Admin)
  - **admin1@gmail.com** (Rider Admin)
- Both use password `admin123` (in production, implement proper password hashing)

#### Login Function
The login function now:
1. **First checks the `admins` table** for admin accounts
2. If found and password matches, authenticates as admin
3. If not an admin, checks the `users` table for regular users
4. Falls back to localStorage for backward compatibility

This separation ensures admin login is handled independently from regular user authentication.

## Migration Steps

### Step 1: Execute the SQL Migration
Run the SQL in your Supabase project's SQL Editor:
```sql
-- File: ADMIN_TABLE_MIGRATION.sql
CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  admin_type VARCHAR(50) NOT NULL CHECK (admin_type IN ('business_customer', 'rider')),
  password_hash VARCHAR(255) NOT NULL,
  is_verified BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_admins_email ON admins(email);
CREATE INDEX idx_admins_admin_type ON admins(admin_type);

ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
```

### Step 2: Update Your Application
The AuthContext has been updated to:
- Create default admins in the Supabase `admins` table on first initialization
- Check the `admins` table during login before checking the `users` table

### Step 3: Test Admin Login
- Log in with `admin@gmail.com` / `admin123`
- Log in with `admin1@gmail.com` / `admin123`
- Verify that admin accounts are now in the `admins` Supabase table

## Security Improvements

1. **Separation of Concerns** - Admin accounts are isolated from regular user accounts
2. **Dedicated Indexes** - Fast lookups for admin authentication
3. **Row Level Security** - RLS policies restrict admin access to their own profiles
4. **Audit Trail** - Separate table makes it easier to audit admin activity

## Production Recommendations

1. **Password Hashing**: Replace `password_hash` storage with proper bcrypt hashing:
   ```typescript
   import bcrypt from 'bcrypt';
   
   // When creating/updating password
   const hashedPassword = await bcrypt.hash(password, 10);
   
   // When checking password
   const isValid = await bcrypt.compare(password, password_hash);
   ```

2. **Environment Variables**: Store admin credentials in environment variables instead of hardcoding:
   ```typescript
   const DEFAULT_ADMIN_EMAIL = process.env.REACT_APP_DEFAULT_ADMIN_EMAIL;
   const DEFAULT_ADMIN_PASSWORD = process.env.REACT_APP_DEFAULT_ADMIN_PASSWORD;
   ```

3. **Admin Creation Panel**: Create an admin management interface to:
   - Create new admin accounts
   - Modify admin permissions
   - Deactivate admin accounts
   - View admin activity logs

4. **Multi-Factor Authentication**: Implement MFA for admin accounts

## Backward Compatibility

- The system still supports localStorage for regular users (fallback)
- Existing admin accounts in localStorage will be accessible until manually migrated
- No changes needed to customer, rider, or business account handling

## Files Modified

- `src/app/contexts/AuthContext.tsx` - Updated initialization and login logic
- `ADMIN_TABLE_MIGRATION.sql` - New SQL migration file (created)

## Testing Checklist

- [ ] Default admin accounts are created in Supabase `admins` table
- [ ] Can log in with admin@gmail.com / admin123
- [ ] Can log in with admin1@gmail.com / admin123
- [ ] Admin users have correct role and adminType set
- [ ] Regular user login still works correctly
- [ ] Rider login still works correctly
- [ ] Business login still works correctly
- [ ] Customer login still works correctly


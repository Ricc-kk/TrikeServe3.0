# Admin System Quick Reference

## 🚀 Quick Start

### 1. Execute SQL Migration
Copy this into your Supabase SQL Editor:

```sql
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

### 2. Test Default Admins
- Login 1: `admin@gmail.com` / `admin123`
- Login 2: `admin1@gmail.com` / `admin123`

---

## 📊 Admin Table Schema

```
admins table
├── id (UUID) - Primary Key
├── email (VARCHAR) - UNIQUE
├── name (VARCHAR)
├── phone (VARCHAR)
├── admin_type (VARCHAR) - 'business_customer' or 'rider'
├── password_hash (VARCHAR)
├── is_verified (BOOLEAN)
├── created_at (TIMESTAMP)
└── updated_at (TIMESTAMP)
```

---

## 🔑 Admin Types

| Type | Purpose | Access |
|------|---------|--------|
| `business_customer` | Manage business & customer features | Dashboard, Users, Orders |
| `rider` | Manage rider features | Rider management, Ride management |

---

## 🔄 Authentication Flow

```
Login Request
    ↓
Check admins table
    ├─ YES → Auth as Admin → Set User Role = 'admin'
    └─ NO → Check users table
           ├─ YES → Auth as Regular User
           └─ NO → Check localStorage (fallback)
```

---

## 📝 Common Operations

### Create New Admin (via SQL)
```sql
INSERT INTO admins (email, name, phone, admin_type, password_hash, is_verified)
VALUES (
  'newadmin@gmail.com',
  'New Admin',
  '09171234569',
  'business_customer',
  'hashedpassword123', -- Use bcrypt in production!
  true
);
```

### Update Admin Password
```sql
UPDATE admins 
SET password_hash = 'newhashedpassword'
WHERE email = 'admin@gmail.com';
```

### View All Admins
```sql
SELECT id, email, name, admin_type, is_verified, created_at 
FROM admins 
ORDER BY created_at DESC;
```

### Deactivate Admin
```sql
UPDATE admins 
SET is_verified = false 
WHERE email = 'admin@gmail.com';
```

### Delete Admin
```sql
DELETE FROM admins 
WHERE email = 'admin@gmail.com';
```

---

## 🛡️ Production Security Checklist

- [ ] Replace plain text password with bcrypt hashing
- [ ] Move default admin credentials to .env variables
- [ ] Implement password reset flow
- [ ] Add admin activity logging
- [ ] Enable multi-factor authentication
- [ ] Create admin management UI
- [ ] Implement role-based access control (RBAC)
- [ ] Add audit logging for admin actions
- [ ] Set up admin alerts for suspicious activity
- [ ] Regular security audits

---

## ⚙️ Code Changes

### AuthContext.tsx Changes

**Initialization:**
```typescript
// Now creates admins in Supabase automatically
const initializeAuth = async () => {
  const { data: existingAdmins } = await supabase
    .from('admins')
    .select('email')
    .in('email', ['admin@gmail.com', 'admin1@gmail.com']);
  // ... creates if not exist
}
```

**Login:**
```typescript
// Check admins table first
const { data: adminUser } = await supabase
  .from('admins')
  .select('*')
  .eq('email', email.toLowerCase())
  .single();

if (adminUser && !adminError) {
  // Authenticate as admin
}
```

---

## 🐛 Troubleshooting

### Problem: Admin login not working
**Solution:** 
1. Verify `admins` table exists in Supabase
2. Check that default admin accounts were created
3. Use SQL: `SELECT * FROM admins;` to see admin records
4. Verify password matches exactly (case-sensitive)

### Problem: Admin table not created
**Solution:**
1. Copy the SQL migration from `ADMIN_TABLE_MIGRATION.sql`
2. Paste into Supabase SQL Editor
3. Execute and verify no errors

### Problem: Regular users can't login
**Solution:**
1. Admin changes only affect admin table
2. Regular user auth still uses `users` table
3. Check `users` table for user records
4. Verify user is marked as `is_verified = true`

---

## 📚 Related Files

- `AuthContext.tsx` - Main authentication logic
- `ADMIN_TABLE_MIGRATION.sql` - Table creation SQL
- `ADMIN_SUPABASE_SEPARATION.md` - Full documentation
- `ADMIN_IMPLEMENTATION_SUMMARY.md` - Implementation details

---

## 🎯 Key Points

✅ Admins stored separately from users in Supabase
✅ Default admins auto-created on first app run
✅ Admins checked first during login
✅ Compatible with existing user system
✅ Ready for production enhancements
✅ Backward compatible with localStorage

---

**Last Updated:** April 4, 2026
**Version:** 1.0


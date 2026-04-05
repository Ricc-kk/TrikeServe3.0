#!/bin/bash
# BUSINESS USER ISOLATION FIX - TESTING SCRIPT
# This script helps verify the fix is working correctly

set -e

echo "=========================================="
echo "Business User Isolation Fix - Test Suite"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

test_case() {
    echo -e "${BLUE}Test: $1${NC}"
}

test_pass() {
    echo -e "${GREEN}✅ PASS: $1${NC}"
    ((TESTS_PASSED++))
}

test_fail() {
    echo -e "${RED}❌ FAIL: $1${NC}"
    ((TESTS_FAILED++))
}

test_warning() {
    echo -e "${YELLOW}⚠️  WARNING: $1${NC}"
}

echo ""
echo "=========================================="
echo "PART 1: FILE VERIFICATION"
echo "=========================================="
echo ""

# Check if modified files exist
test_case "Check AuthContext.tsx exists"
if [ -f "src/app/contexts/AuthContext.tsx" ]; then
    test_pass "AuthContext.tsx found"
else
    test_fail "AuthContext.tsx not found"
fi

test_case "Check BusinessOrders.tsx exists"
if [ -f "src/app/components/business/BusinessOrders.tsx" ]; then
    test_pass "BusinessOrders.tsx found"
else
    test_fail "BusinessOrders.tsx not found"
fi

echo ""
echo "=========================================="
echo "PART 2: CODE VERIFICATION"
echo "=========================================="
echo ""

# Check AuthContext has been updated
test_case "Check AuthContext fetches from Supabase"
if grep -q "\.from('restaurants')" src/app/contexts/AuthContext.tsx; then
    test_pass "AuthContext uses Supabase query"
else
    test_fail "AuthContext still using old method"
fi

test_case "Check AuthContext doesn't use localStorage keys"
if ! grep -q "businessOrdersKeys\[0\]" src/app/contexts/AuthContext.tsx; then
    test_pass "AuthContext no longer reads localStorage keys"
else
    test_fail "AuthContext still reads localStorage keys"
fi

# Check BusinessOrders has been updated
test_case "Check BusinessOrders fetches from Supabase"
if grep -q "const loadOrders = async ()" src/app/components/business/BusinessOrders.tsx; then
    test_pass "BusinessOrders is async and fetches from Supabase"
else
    test_fail "BusinessOrders not updated to async"
fi

test_case "Check BusinessOrders queries restaurant_id"
if grep -q "\.eq('restaurant_id'" src/app/components/business/BusinessOrders.tsx; then
    test_pass "BusinessOrders filters by restaurant_id"
else
    test_fail "BusinessOrders doesn't filter by restaurant_id"
fi

echo ""
echo "=========================================="
echo "PART 3: ENVIRONMENT SETUP"
echo "=========================================="
echo ""

test_case "Check .env.local exists"
if [ -f ".env.local" ]; then
    test_pass ".env.local found"

    test_case "Check VITE_SUPABASE_URL is set"
    if grep -q "VITE_SUPABASE_URL" .env.local; then
        test_pass "VITE_SUPABASE_URL is configured"
    else
        test_fail "VITE_SUPABASE_URL not configured"
    fi

    test_case "Check VITE_SUPABASE_ANON_KEY is set"
    if grep -q "VITE_SUPABASE_ANON_KEY" .env.local; then
        test_pass "VITE_SUPABASE_ANON_KEY is configured"
    else
        test_fail "VITE_SUPABASE_ANON_KEY not configured"
    fi
else
    test_fail ".env.local not found - Supabase won't connect"
fi

echo ""
echo "=========================================="
echo "PART 4: DEPENDENCY CHECK"
echo "=========================================="
echo ""

test_case "Check Supabase dependency installed"
if grep -q "@supabase/supabase-js" package.json; then
    test_pass "Supabase package found in package.json"
else
    test_fail "Supabase package not in package.json"
fi

if [ -d "node_modules/@supabase" ]; then
    test_pass "Supabase package installed (node_modules exists)"
else
    test_warning "node_modules/@supabase not found - run 'npm install'"
fi

echo ""
echo "=========================================="
echo "PART 5: MANUAL TESTING CHECKLIST"
echo "=========================================="
echo ""

echo "To complete the testing, perform these manual tests:"
echo ""
echo "1. START THE APPLICATION"
echo "   Run: npm run dev"
echo ""
echo "2. TEST BUSINESS USER A"
echo "   ✓ Login with Business User A credentials"
echo "   ✓ Navigate to Orders page"
echo "   ✓ Verify you see only Restaurant A's orders"
echo "   ✓ Check browser console for Supabase logs"
echo ""
echo "3. TEST BUSINESS USER B"
echo "   ✓ Logout from User A"
echo "   ✓ Login with Business User B credentials"
echo "   ✓ Navigate to Orders page"
echo "   ✓ Verify you see only Restaurant B's orders"
echo "   ✓ Verify User A's orders are NOT visible"
echo ""
echo "4. VERIFY DATABASE SECURITY"
echo "   ✓ Open browser DevTools → Network tab"
echo "   ✓ Look for Supabase API calls"
echo "   ✓ Verify response contains only this user's orders"
echo ""
echo "5. TEST ORDER UPDATES"
echo "   ✓ Change an order status"
echo "   ✓ Verify it updates in Supabase"
echo "   ✓ Refresh page and verify status persists"
echo ""
echo "6. TEST RLS ENFORCEMENT (OPTIONAL - ADVANCED)"
echo "   ✓ Open Supabase dashboard"
echo "   ✓ Run verification SQL queries"
echo "   ✓ Confirm RLS policies are active"
echo ""

echo ""
echo "=========================================="
echo "TEST SUMMARY"
echo "=========================================="
echo ""
echo -e "Tests Passed: ${GREEN}${TESTS_PASSED}${NC}"
echo -e "Tests Failed: ${RED}${TESTS_FAILED}${NC}"

if [ $TESTS_FAILED -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ All verification tests passed!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Run 'npm run dev' to start development server"
    echo "2. Perform manual testing (see checklist above)"
    echo "3. Check browser console for logs"
    echo "4. Verify Supabase RLS policies are working"
    exit 0
else
    echo ""
    echo -e "${RED}❌ Some tests failed. Please review the issues above.${NC}"
    exit 1
fi


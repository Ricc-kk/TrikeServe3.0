@echo off
REM BUSINESS USER ISOLATION FIX - TESTING SCRIPT (WINDOWS)
REM This script helps verify the fix is working correctly

setlocal enabledelayedexpansion

echo ==========================================
echo Business User Isolation Fix - Test Suite
echo ==========================================
echo.

set TESTS_PASSED=0
set TESTS_FAILED=0

REM ==========================================
REM PART 1: FILE VERIFICATION
REM ==========================================

echo.
echo ==========================================
echo PART 1: FILE VERIFICATION
echo ==========================================
echo.

echo Test: Check AuthContext.tsx exists
if exist "src\app\contexts\AuthContext.tsx" (
    echo [OK] AuthContext.tsx found
    set /a TESTS_PASSED+=1
) else (
    echo [FAIL] AuthContext.tsx not found
    set /a TESTS_FAILED+=1
)

echo Test: Check BusinessOrders.tsx exists
if exist "src\app\components\business\BusinessOrders.tsx" (
    echo [OK] BusinessOrders.tsx found
    set /a TESTS_PASSED+=1
) else (
    echo [FAIL] BusinessOrders.tsx not found
    set /a TESTS_FAILED+=1
)

REM ==========================================
REM PART 2: CODE VERIFICATION
REM ==========================================

echo.
echo ==========================================
echo PART 2: CODE VERIFICATION
echo ==========================================
echo.

echo Test: Check AuthContext fetches from Supabase
findstr /M "\.from\('restaurants'\)" src\app\contexts\AuthContext.tsx >nul 2>&1
if !errorlevel! equ 0 (
    echo [OK] AuthContext uses Supabase query
    set /a TESTS_PASSED+=1
) else (
    echo [FAIL] AuthContext still using old method
    set /a TESTS_FAILED+=1
)

echo Test: Check AuthContext doesn't use localStorage keys
findstr /M "businessOrdersKeys\[0\]" src\app\contexts\AuthContext.tsx >nul 2>&1
if !errorlevel! equ 0 (
    echo [FAIL] AuthContext still reads localStorage keys
    set /a TESTS_FAILED+=1
) else (
    echo [OK] AuthContext no longer reads localStorage keys
    set /a TESTS_PASSED+=1
)

echo Test: Check BusinessOrders fetches from Supabase
findstr /M "const loadOrders = async" src\app\components\business\BusinessOrders.tsx >nul 2>&1
if !errorlevel! equ 0 (
    echo [OK] BusinessOrders is async and fetches from Supabase
    set /a TESTS_PASSED+=1
) else (
    echo [FAIL] BusinessOrders not updated to async
    set /a TESTS_FAILED+=1
)

echo Test: Check BusinessOrders queries restaurant_id
findstr /M "\.eq\('restaurant_id'" src\app\components\business\BusinessOrders.tsx >nul 2>&1
if !errorlevel! equ 0 (
    echo [OK] BusinessOrders filters by restaurant_id
    set /a TESTS_PASSED+=1
) else (
    echo [FAIL] BusinessOrders doesn't filter by restaurant_id
    set /a TESTS_FAILED+=1
)

REM ==========================================
REM PART 3: ENVIRONMENT SETUP
REM ==========================================

echo.
echo ==========================================
echo PART 3: ENVIRONMENT SETUP
echo ==========================================
echo.

echo Test: Check .env.local exists
if exist ".env.local" (
    echo [OK] .env.local found
    set /a TESTS_PASSED+=1

    echo Test: Check VITE_SUPABASE_URL is set
    findstr /M "VITE_SUPABASE_URL" .env.local >nul 2>&1
    if !errorlevel! equ 0 (
        echo [OK] VITE_SUPABASE_URL is configured
        set /a TESTS_PASSED+=1
    ) else (
        echo [FAIL] VITE_SUPABASE_URL not configured
        set /a TESTS_FAILED+=1
    )

    echo Test: Check VITE_SUPABASE_ANON_KEY is set
    findstr /M "VITE_SUPABASE_ANON_KEY" .env.local >nul 2>&1
    if !errorlevel! equ 0 (
        echo [OK] VITE_SUPABASE_ANON_KEY is configured
        set /a TESTS_PASSED+=1
    ) else (
        echo [FAIL] VITE_SUPABASE_ANON_KEY not configured
        set /a TESTS_FAILED+=1
    )
) else (
    echo [FAIL] .env.local not found - Supabase won't connect
    set /a TESTS_FAILED+=1
)

REM ==========================================
REM PART 4: DEPENDENCY CHECK
REM ==========================================

echo.
echo ==========================================
echo PART 4: DEPENDENCY CHECK
echo ==========================================
echo.

echo Test: Check Supabase dependency installed
findstr /M "@supabase/supabase-js" package.json >nul 2>&1
if !errorlevel! equ 0 (
    echo [OK] Supabase package found in package.json
    set /a TESTS_PASSED+=1
) else (
    echo [FAIL] Supabase package not in package.json
    set /a TESTS_FAILED+=1
)

if exist "node_modules\@supabase" (
    echo [OK] Supabase package installed (node_modules exists)
    set /a TESTS_PASSED+=1
) else (
    echo [WARN] node_modules\@supabase not found - run 'npm install'
)

REM ==========================================
REM PART 5: MANUAL TESTING CHECKLIST
REM ==========================================

echo.
echo ==========================================
echo PART 5: MANUAL TESTING CHECKLIST
echo ==========================================
echo.

echo To complete the testing, perform these manual tests:
echo.
echo 1. START THE APPLICATION
echo    Run: npm run dev
echo.
echo 2. TEST BUSINESS USER A
echo    - Login with Business User A credentials
echo    - Navigate to Orders page
echo    - Verify you see only Restaurant A's orders
echo    - Check browser console for Supabase logs
echo.
echo 3. TEST BUSINESS USER B
echo    - Logout from User A
echo    - Login with Business User B credentials
echo    - Navigate to Orders page
echo    - Verify you see only Restaurant B's orders
echo    - Verify User A's orders are NOT visible
echo.
echo 4. VERIFY DATABASE SECURITY
echo    - Open browser DevTools - Network tab
echo    - Look for Supabase API calls
echo    - Verify response contains only this user's orders
echo.
echo 5. TEST ORDER UPDATES
echo    - Change an order status
echo    - Verify it updates in Supabase
echo    - Refresh page and verify status persists
echo.
echo 6. TEST RLS ENFORCEMENT (OPTIONAL - ADVANCED)
echo    - Open Supabase dashboard
echo    - Run verification SQL queries
echo    - Confirm RLS policies are active
echo.

REM ==========================================
REM TEST SUMMARY
REM ==========================================

echo.
echo ==========================================
echo TEST SUMMARY
echo ==========================================
echo.
echo Tests Passed: %TESTS_PASSED%
echo Tests Failed: %TESTS_FAILED%

if %TESTS_FAILED% equ 0 (
    echo.
    echo [SUCCESS] All verification tests passed!
    echo.
    echo Next steps:
    echo 1. Run 'npm run dev' to start development server
    echo 2. Perform manual testing (see checklist above)
    echo 3. Check browser console for logs
    echo 4. Verify Supabase RLS policies are working
    exit /b 0
) else (
    echo.
    echo [ERROR] Some tests failed. Please review the issues above.
    exit /b 1
)


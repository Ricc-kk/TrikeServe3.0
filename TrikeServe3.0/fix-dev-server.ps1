#!/usr/bin/env powershell
# Automated Dev Server Restart and Cache Clear
# Run this script to fix "supabaseKey is required" error

Write-Host "`n" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host "  TRIKESERVE DEV SERVER FIXER  " -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host "`n"

# Get project directory
$projectDir = "C:\Users\Mayo\Desktop\TrikeServe3.0\TrikeServe3.0"
$envFile = Join-Path $projectDir ".env.local"
$viteCache = Join-Path $projectDir "node_modules\.vite"

# Step 1: Verify .env.local exists and has content
Write-Host "STEP 1: Checking .env.local configuration..." -ForegroundColor Yellow
if (Test-Path $envFile) {
    $envContent = Get-Content $envFile
    $hasUrl = $envContent | Select-String "VITE_SUPABASE_URL"
    $hasKey = $envContent | Select-String "VITE_SUPABASE_ANON_KEY"

    if ($hasUrl -and $hasKey) {
        Write-Host "✅ .env.local is properly configured" -ForegroundColor Green
    } else {
        Write-Host "❌ .env.local is missing environment variables" -ForegroundColor Red
        Write-Host "   Missing:" -ForegroundColor Red
        if (!$hasUrl) { Write-Host "   - VITE_SUPABASE_URL" -ForegroundColor Red }
        if (!$hasKey) { Write-Host "   - VITE_SUPABASE_ANON_KEY" -ForegroundColor Red }
        exit 1
    }
} else {
    Write-Host "❌ .env.local not found at: $envFile" -ForegroundColor Red
    exit 1
}

Write-Host "`n"

# Step 2: Kill any existing Node processes
Write-Host "STEP 2: Stopping existing Node processes..." -ForegroundColor Yellow
$nodeProcesses = Get-Process node -ErrorAction SilentlyContinue
if ($nodeProcesses) {
    $nodeProcesses | Stop-Process -Force
    Write-Host "✅ Stopped existing Node processes" -ForegroundColor Green
} else {
    Write-Host "ℹ️  No Node processes running" -ForegroundColor Cyan
}

Write-Host "`n"

# Step 3: Delete Vite cache
Write-Host "STEP 3: Clearing Vite cache..." -ForegroundColor Yellow
if (Test-Path $viteCache) {
    Remove-Item -Recurse -Force $viteCache -ErrorAction SilentlyContinue
    Write-Host "✅ Vite cache deleted" -ForegroundColor Green
} else {
    Write-Host "ℹ️  Vite cache already cleaned" -ForegroundColor Cyan
}

Write-Host "`n"

# Step 4: Verify node_modules exists
Write-Host "STEP 4: Verifying dependencies..." -ForegroundColor Yellow
$nodeModules = Join-Path $projectDir "node_modules"
if (!(Test-Path $nodeModules)) {
    Write-Host "⚠️  node_modules not found, installing dependencies..." -ForegroundColor Yellow
    Set-Location $projectDir
    npm install
    Write-Host "✅ Dependencies installed" -ForegroundColor Green
} else {
    Write-Host "✅ Dependencies already installed" -ForegroundColor Green
}

Write-Host "`n"

# Step 5: Start dev server
Write-Host "STEP 5: Starting development server..." -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "`nStarting: npm run dev`n" -ForegroundColor Cyan
Write-Host "Watch for these messages in the console:" -ForegroundColor Green
Write-Host "  ✅ [Supabase Init] VITE_SUPABASE_URL: ✅ Set" -ForegroundColor Green
Write-Host "  ✅ [Supabase Init] VITE_SUPABASE_ANON_KEY: ✅ Set" -ForegroundColor Green
Write-Host "  ✅ [Supabase Init] ✅ All credentials loaded successfully" -ForegroundColor Green
Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`n" -ForegroundColor Cyan

Set-Location $projectDir
npm run dev

# Instructions when dev server is running
Write-Host "`n" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host "✅ DEV SERVER IS RUNNING" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host "`nNow do this in your browser:" -ForegroundColor Cyan
Write-Host "1. Clear browser cache: Ctrl+Shift+Delete" -ForegroundColor Cyan
Write-Host "2. Go to: http://localhost:5173" -ForegroundColor Cyan
Write-Host "3. Login as business user" -ForegroundColor Cyan
Write-Host "4. Go to Orders page" -ForegroundColor Cyan
Write-Host "5. Verify orders appear without errors" -ForegroundColor Cyan
Write-Host "`nIf you see orders loading successfully, the fix is complete! ✅`n" -ForegroundColor Green


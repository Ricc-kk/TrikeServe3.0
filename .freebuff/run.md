# Run doc — TrikeServe3.0 (React frontend + geoserver repo)

The repo has two parts: a Node/Express/SQLite geoserver at the repo root (`server.js`,
`src/`) and the React/Vite frontend app at `TrikeServe3.0/` — the frontend
app is what the Preview shows.

**Node.js is not installed system-wide on this machine.** Use the portable (no-admin)
Node 22 kept in the sibling project's scratch dir:

    C:\Users\mayoi\Downloads\TrikeServeNew\.freebuff\tools\node-v22.23.2-win-x64

If that is missing, download and extract a fresh copy into `.freebuff/tools/`:
`https://nodejs.org/dist/v22.23.2/node-v22.23.2-win-x64.zip` → `node-v22.23.2-win-x64/`.

## Reproduce the artifacts a fresh checkout needs

1. Copy the env config from the main checkout (values may need adapting per worktree —
   never commit it; it is gitignored):

       cp <main-checkout>/TrikeServe3.0/.env.local TrikeServe3.0/.env.local

   **Note:** The `BusinessProfile` and `DeliveryTracker` components may be missing from
   `TrikeServe3.0/src/app/components/` — create stub files if Vite reports import errors.

   The file holds `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and
   `VITE_GOOGLE_MAPS_API_KEY`, which the app reads at startup.

2. Install dependencies with npm (the frontend app is npm-based — `package-lock.json`):

       export PATH="<portable-node-dir>:$PATH"
       cd TrikeServe3.0
       npm install --no-audit --no-fund

## Run the server (frontend dev server, Preview)

The Freebuff shell injects `PORT=<app port>`, but this app's `vite.config.ts` ignores it,
so pass the port explicitly. **8443 is the established preview port for this project.**

```powershell
powershell -NoProfile -Command '$env:Path="<portable-node-dir>;"+$env:Path; (Start-Process -FilePath "<portable-node-dir>\npm.cmd" -ArgumentList "run","dev","--","--port","8443","--strictPort" -WorkingDirectory "<worktree>\TrikeServe3.0" -RedirectStandardOutput "<log>" -RedirectStandardError "<log>.err" -WindowStyle Hidden -PassThru).Id'
```

Notes:   - The portable node dir **must be on PATH** before starting: npm's child `vite.cmd`
     shim falls back to a bare `node` lookup and fails with `'node' is not recognized`
     otherwise. This is why the command prepends it to `$env:Path`. Use single-quoted
     PowerShell strings to avoid bash interpreting `$env:PATH`.
- stdout and stderr must go to **different** files (PowerShell restriction).
- The pid printed by `Start-Process` is the `npm.cmd` parent; the real server pid is the
  `node.exe` owning the port. Find it with
  `netstat -ano | grep ":8443" | grep LISTEN` and register that one.
- Verify it is up: `curl -s -o /dev/null -w "%{http_code}" http://localhost:8443/` → `200`.
- Stop: `taskkill //PID <listener-pid> //F`.

The geoserver (`npm run dev` at the repo root) is NOT required for the frontend preview.

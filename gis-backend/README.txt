SIMITI External API Management - Tahap 1 (DEMO only)

Files:
- externalApiManagement.js : isolated Express router for application request, admin approval, API key issue/revoke, and audit.
- externalApiManagement.sql: creates three new external_api_* tables only.
- INSTALL-DEMO.ps1: targeted backup + mount patch to server.js after requireAdminMemberRegistration.

Safety notes:
1. Do not use against simiti.id production.
2. Extract the files to C:\sikma-main2\gis-backend.
3. Confirm the backend's .env points to the DEMO database before running SQL.
4. The admin endpoints deliberately return HTTP 503 unless JWT_SECRET is configured to a strong non-default value in .env.
5. Run INSTALL-DEMO.ps1 only after checking Git status and confirming this is the demo working copy. It backs up server.js before changing it.
6. Run externalApiManagement.sql manually against the DEMO database only after checking the DB connection settings. This package does not execute SQL automatically.
7. Service endpoints for Model Mitigasi, Inventarisasi Lokasi Mitigasi, and My Lokasi are not exposed yet. /api/external-management/catalog reports them as disabled until API-key authentication/scope enforcement is implemented and tested.
8. API key plaintext is returned only once at issuance. Only SHA-256 hashes are stored.

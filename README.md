# Vendor Portal (SAP OData Chat UI)

A runnable project for a chat-based Vendor Portal integrated with SAP OData service `ZVENDOR_ODATA_SRV`.

## Features

- Chat-first UX for:
  - **GET** vendor by number
  - **POST** vendor creation (sequential question flow)
- Dedicated OData endpoint usage:
  - `/sap/opu/odata/sap/ZVENDOR_ODATA_SRV/VendorSet`
- Backend proxy to SAP Gateway with:
  - Basic/Bearer auth support
  - CSRF token fetch for POST
  - Timeout + diagnostics for network/auth/TLS failures
  - Automatic **mock fallback** mode to keep the UI functional when SAP is unreachable
- Includes mapping awareness for key SAP fields:
  - `LIFNR` (Vendor ID)
  - `SMTPADR` (Email)
  - `NAME1` (Name)

## Quick start

```bash
cp .env.example .env
# edit .env with SAP credentials
npm start
```

Open: `http://localhost:3000`

## API endpoints (local app)

- `GET /health`
- `GET /api/vendor-service-info`
- `GET /api/vendors`
- `GET /api/vendors/:id`
- `POST /api/vendors`

## OData points consumed

- Base Service: `/sap/opu/odata/sap/ZVENDOR_ODATA_SRV`
- Entity Set: `/sap/opu/odata/sap/ZVENDOR_ODATA_SRV/VendorSet`
- Single vendor: `/sap/opu/odata/sap/ZVENDOR_ODATA_SRV/VendorSet('<VendorId>')`

## Environment notes

- `ALLOW_INSECURE_TLS=true` is useful for non-production SAP endpoints with self-signed certs.
- `USE_MOCK_ON_FAILURE=true` lets the app return sample vendor data when SAP cannot be reached.
- For production, prefer:
  - valid TLS certificates,
  - `ALLOW_INSECURE_TLS=false`,
  - `USE_MOCK_ON_FAILURE=false`.

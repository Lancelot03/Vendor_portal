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

## Notes

- For SAP systems with self-signed certs in non-production, set `ALLOW_INSECURE_TLS=true`.
- Keep `ALLOW_INSECURE_TLS=false` for production.

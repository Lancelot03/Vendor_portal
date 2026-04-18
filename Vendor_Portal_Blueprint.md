# Vendor Portal

## 1) Dedicated points to consume SAP OData services

Use this **single base endpoint** in the portal and build all read/create calls from it:

- **Base OData service URL**:  
  `/sap/opu/odata/sap/ZVENDOR_ODATA_SRV`
- **EntitySet URL**:  
  `/sap/opu/odata/sap/ZVENDOR_ODATA_SRV/VendorSet`
- **Single vendor (GET by key)**:  
  `/sap/opu/odata/sap/ZVENDOR_ODATA_SRV/VendorSet('1')`

> Recommended production form: `https://<sap-gateway-host>:<port>/sap/opu/odata/sap/ZVENDOR_ODATA_SRV/VendorSet`

### OData operations

- **GET all vendors (v2 JSON)**  
  `GET /sap/opu/odata/sap/ZVENDOR_ODATA_SRV/VendorSet?$format=json`
- **GET one vendor by VendorId**  
  `GET /sap/opu/odata/sap/ZVENDOR_ODATA_SRV/VendorSet('<VendorId>')?$format=json`
- **POST create vendor (future service)**  
  `POST /sap/opu/odata/sap/ZVENDOR_ODATA_SRV/VendorSet`

### Auth + headers

- Auth between Portal and SAP Gateway: **OAuth 2.0** (preferred) or **Basic Auth**.
- For create/update/delete, fetch CSRF token first:
  - `X-CSRF-Token: Fetch` on a GET
  - send returned token in POST request.

---

## 2) JSON structure for GET response (as received)

```json
{
  "d": {
    "results": [
      {
        "__metadata": {
          "id": "https://NPSAP01.NAMDHARISEEDS.COM:44310/sap/opu/odata/sap/ZVENDOR_ODATA_SRV/VendorSet('1')",
          "uri": "https://NPSAP01.NAMDHARISEEDS.COM:44310/sap/opu/odata/sap/ZVENDOR_ODATA_SRV/VendorSet('1')",
          "type": "ZVENDOR_ODATA_SRV.Vendor"
        },
        "VendorId": "1",
        "VendorName": "Harsh Singh",
        "Email": "harshsinghop3@gmail.com",
        "PhoneNumber": "9999999999",
        "GstNumber": "123456789098765",
        "PanNumber": "PV1234AB",
        "CompanyCode": "100",
        "Address": "",
        "Status": "A"
      }
    ]
  }
}
```

### What to parse in portal

- Root array: `d.results`
- Metadata fields: `__metadata.id`, `__metadata.uri`, `__metadata.type`
- Business fields:
  - `VendorId`
  - `VendorName`
  - `Email`
  - `PhoneNumber`
  - `GstNumber`
  - `PanNumber`
  - `CompanyCode`
  - `Address`
  - `Status`

---

## 3) SAP field mapping schematic (SE11 table `ZVENDOR_TABLE`)

Required key fields to render:

- **LIFNR (Vendor ID)**
- **SMTPADR (Email)**
- **NAME1 (Name)**

Expanded mapping from your screenshots:

- `VENDOR_ID` → `LIFNR` → `VendorId`
- `VENDOR_NAME` → `NAME1` → `VendorName`
- `EMAIL` → `AD_SMTPADR`/`SMTPADR` → `Email`
- `PHONE_NUMBER` → `TELF1` → `PhoneNumber`
- `GST_NUMBER` → `STCEG` → `GstNumber`
- `PAN_NUMBER` → `STCD1` → `PanNumber`
- `COMPANY_CODE` → `BUKRS` → `CompanyCode`
- `ADDRESS` → `AD_ADDRNUM` → `Address`
- `STATUS` → `ZSTATUS_CUST` → `Status`

---

## 4) System Architecture Blueprint (technical + UX)

```mermaid
flowchart LR
  %% =========================
  %% Title
  %% =========================
  T["Vendor Portal"]

  %% =========================
  %% Left: User / Portal
  %% =========================
  subgraph L[User / Portal Side]
    U1[User on Laptop]
    U2[User on Tablet]
    UI["Responsive Web Portal\n(React / Angular / SAPUI5)\nChat-first interface"]
    CARD["Chat Summary Card\nVendor Found: Harsh Singh\nEmail: harsh...\nPhone: 999...\nStatus: Active"]
    U1 --> UI
    U2 --> UI
    UI --> CARD
  end

  %% =========================
  %% Center: Integration
  %% =========================
  subgraph C[Integration Layer]
    BTP["SAP BTP / API Gateway"]
    REST["REST API"]
    ODATA["<odata/> OData v2/v4"]
    AUTH["OAuth 2.0 / Basic Auth"]
    BTP --> REST
    BTP --> ODATA
    BTP --> AUTH
  end

  %% =========================
  %% Right: SAP Backend
  %% =========================
  subgraph R[SAP Backend (S/4HANA or ECC)]
    GW["SAP Gateway\nZVENDOR_ODATA_SRV"]
    SEGW["SEGW Service Builder\nEntity: Vendor\nProperties: VendorId, VendorName, Email, ..."]
    SE11["SE11 Transparent Table\nZVENDOR_TABLE"]
    MAP["Field Mapping\nLIFNR (Vendor ID)\nSMTPADR (Email)\nNAME1 (Name)"]
    DB[("Vendor Data")]
    GW --> SEGW
    SEGW --> SE11
    SE11 --> MAP
    MAP --> DB
  end

  %% =========================
  %% Data path labels
  %% =========================
  UI -- "GET/POST /sap/opu/odata/sap/ZVENDOR_ODATA_SRV/VendorSet" --> BTP
  BTP -- "Secure OData Calls" --> GW

  %% =========================
  %% UX Flow Panels
  %% =========================
  subgraph P[User Experience: Vendor Chatbot Flow]
    A1["Panel A: Querying (GET)\nBot: Welcome. Please enter a Vendor Number"]
    A2["User enters: 1"]
    A3["System calls:\n/sap/opu/odata/sap/ZVENDOR_ODATA_SRV/VendorSet('1')"]
    A4["Bot responds with structured vendor card"]

    B1["Panel B: Creation (POST - To be built)\nUser: Create new vendor"]
    B2["Bot asks sequentially:\nName, Email, Phone, Company Code, ..."]
    B3["System sends POST /VendorSet\nwith full JSON payload"]
    B4["Result: Success/Failure + New Vendor ID"]

    A1 --> A2 --> A3 --> A4
    B1 --> B2 --> B3 --> B4
  end

  %% =========================
  %% Technical callouts
  %% =========================
  CALL1["Portal Technology:\nUI framework consumes REST APIs"]
  CALL2["OData Protocol:\nParse JSON + __metadata.id + __metadata.uri"]
  CALL3["Authentication:\nOAuth 2.0 or Basic between Portal & Gateway"]

  UI -.-> CALL1
  ODATA -.-> CALL2
  AUTH -.-> CALL3

  T --> L
  T --> C
  T --> R
  T --> P
```

---

## 5) Example portal request templates

### GET vendor by ID

```http
GET /sap/opu/odata/sap/ZVENDOR_ODATA_SRV/VendorSet('1')?$format=json HTTP/1.1
Host: NPSAP01.NAMDHARISEEDS.COM:44310
Authorization: Basic <base64>  (or Bearer <token>)
Accept: application/json
```

### POST vendor create (future)

```http
POST /sap/opu/odata/sap/ZVENDOR_ODATA_SRV/VendorSet HTTP/1.1
Host: NPSAP01.NAMDHARISEEDS.COM:44310
Authorization: Bearer <token>
X-CSRF-Token: <token>
Content-Type: application/json
Accept: application/json

{
  "VendorId": "",
  "VendorName": "New Vendor Pvt Ltd",
  "Email": "vendor@company.com",
  "PhoneNumber": "9876543210",
  "GstNumber": "29ABCDE1234F1Z5",
  "PanNumber": "ABCDE1234F",
  "CompanyCode": "100",
  "Address": "Bangalore",
  "Status": "A"
}
```

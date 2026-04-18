const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const SAP_BASE_URL =
  process.env.SAP_BASE_URL ||
  'https://NPSAP01.NAMDHARISEEDS.COM:44310/sap/opu/odata/sap/ZVENDOR_ODATA_SRV';
const SAP_AUTH_TYPE = process.env.SAP_AUTH_TYPE || 'basic';
const SAP_BASIC_USER = process.env.SAP_BASIC_USER || '';
const SAP_BASIC_PASSWORD = process.env.SAP_BASIC_PASSWORD || '';
const SAP_BEARER_TOKEN = process.env.SAP_BEARER_TOKEN || '';
const ALLOW_INSECURE_TLS =
  (process.env.ALLOW_INSECURE_TLS || 'false').toLowerCase() === 'true';
const USE_MOCK_ON_FAILURE =
  (process.env.USE_MOCK_ON_FAILURE || 'true').toLowerCase() === 'true';
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 15000);

if (ALLOW_INSECURE_TLS) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const mockVendors = [
  {
    __metadata: {
      id: "https://NPSAP01.NAMDHARISEEDS.COM:44310/sap/opu/odata/sap/ZVENDOR_ODATA_SRV/VendorSet('1')",
      uri: "https://NPSAP01.NAMDHARISEEDS.COM:44310/sap/opu/odata/sap/ZVENDOR_ODATA_SRV/VendorSet('1')",
      type: 'ZVENDOR_ODATA_SRV.Vendor',
    },
    VendorId: '1',
    VendorName: 'Harsh Singh',
    Email: 'harshsinghop3@gmail.com',
    PhoneNumber: '9999999999',
    GstNumber: '123456789098765',
    PanNumber: 'PV1234AB',
    CompanyCode: '100',
    Address: '',
    Status: 'A',
  },
];

function buildAuthHeader() {
  if (SAP_AUTH_TYPE.toLowerCase() === 'bearer' && SAP_BEARER_TOKEN) {
    return `Bearer ${SAP_BEARER_TOKEN}`;
  }

  if (SAP_BASIC_USER && SAP_BASIC_PASSWORD) {
    const encoded = Buffer.from(`${SAP_BASIC_USER}:${SAP_BASIC_PASSWORD}`).toString(
      'base64'
    );
    return `Basic ${encoded}`;
  }

  return '';
}

const SAP_AUTH_HEADER = buildAuthHeader();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) {
        req.socket.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function getSapHeaders(extraHeaders = {}) {
  return {
    Accept: 'application/json',
    ...(SAP_AUTH_HEADER ? { Authorization: SAP_AUTH_HEADER } : {}),
    ...extraHeaders,
  };
}

function withTimeout(ms) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout),
  };
}

async function sapRequest(method, relativePath, options = {}) {
  const url = `${SAP_BASE_URL}${relativePath}`;
  const timeoutControl = withTimeout(REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method,
      headers: getSapHeaders(options.headers || {}),
      body: options.body,
      signal: timeoutControl.signal,
    });

    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    return { ok: true, response, data };
  } catch (error) {
    return {
      ok: false,
      error,
      diagnostics: {
        message: error.message,
        endpoint: url,
        timeoutMs: REQUEST_TIMEOUT_MS,
        authConfigured: Boolean(SAP_AUTH_HEADER),
        allowInsecureTls: ALLOW_INSECURE_TLS,
      },
    };
  } finally {
    timeoutControl.clear();
  }
}

async function fetchCsrfToken() {
  const tokenRes = await sapRequest('GET', '/VendorSet?$top=1&$format=json', {
    headers: { 'X-CSRF-Token': 'Fetch' },
  });

  if (!tokenRes.ok) {
    throw new Error(`Unable to connect for CSRF fetch. ${tokenRes.diagnostics.message}`);
  }

  const csrfToken = tokenRes.response.headers.get('x-csrf-token');
  const cookie = tokenRes.response.headers.get('set-cookie') || '';

  if (!csrfToken) {
    throw new Error('Unable to fetch X-CSRF-Token from SAP Gateway');
  }

  return { csrfToken, cookie };
}

function mapVendor(vendor) {
  if (!vendor) {
    return null;
  }

  const statusMap = {
    A: 'Active',
    a: 'Active',
    I: 'Inactive',
    i: 'Inactive',
    B: 'Blocked',
    b: 'Blocked',
  };

  return {
    metadata: vendor.__metadata || {},
    vendorId: vendor.VendorId,
    vendorName: vendor.VendorName,
    email: vendor.Email,
    phoneNumber: vendor.PhoneNumber,
    gstNumber: vendor.GstNumber,
    panNumber: vendor.PanNumber,
    companyCode: vendor.CompanyCode,
    address: vendor.Address,
    statusCode: vendor.Status,
    statusText: statusMap[vendor.Status] || vendor.Status || 'Unknown',
    raw: vendor,
  };
}

function fallbackPayload(reason) {
  return {
    warning:
      'SAP endpoint is currently unreachable. Returning mock response so UI flow remains usable.',
    reason,
    hint:
      'Set SAP credentials in .env and (for self-signed non-prod certs) set ALLOW_INSECURE_TLS=true.',
  };
}

async function handleGetVendorById(res, vendorId) {
  const sapResult = await sapRequest(
    'GET',
    `/VendorSet('${encodeURIComponent(vendorId)}')?$format=json`
  );

  if (!sapResult.ok) {
    if (USE_MOCK_ON_FAILURE) {
      const vendor = mockVendors.find(item => item.VendorId === vendorId) || null;
      sendJson(res, 200, {
        source: { mode: 'mock-fallback', endpoint: `${SAP_BASE_URL}/VendorSet('${vendorId}')` },
        vendor: mapVendor(vendor),
        diagnostics: fallbackPayload(sapResult.diagnostics),
      });
      return;
    }

    sendJson(res, 502, {
      error: 'Failed to fetch vendor from SAP OData service',
      diagnostics: sapResult.diagnostics,
    });
    return;
  }

  if (!sapResult.response.ok) {
    sendJson(res, sapResult.response.status, {
      error: 'Failed to fetch vendor from SAP OData service',
      details: sapResult.data,
    });
    return;
  }

  const vendor = sapResult.data?.d?.results?.[0] || sapResult.data?.d;
  sendJson(res, 200, {
    source: {
      mode: 'sap-live',
      endpoint: `${SAP_BASE_URL}/VendorSet('${vendorId}')`,
      odataService: 'ZVENDOR_ODATA_SRV',
      entitySet: 'VendorSet',
    },
    vendor: mapVendor(vendor),
  });
}

async function handleListVendors(res) {
  const sapResult = await sapRequest('GET', '/VendorSet?$format=json');

  if (!sapResult.ok) {
    if (USE_MOCK_ON_FAILURE) {
      sendJson(res, 200, {
        source: { mode: 'mock-fallback', endpoint: `${SAP_BASE_URL}/VendorSet` },
        count: mockVendors.length,
        vendors: mockVendors.map(mapVendor),
        diagnostics: fallbackPayload(sapResult.diagnostics),
      });
      return;
    }

    sendJson(res, 502, {
      error: 'Failed to list vendors from SAP OData service',
      diagnostics: sapResult.diagnostics,
    });
    return;
  }

  if (!sapResult.response.ok) {
    sendJson(res, sapResult.response.status, {
      error: 'Failed to list vendors from SAP OData service',
      details: sapResult.data,
    });
    return;
  }

  const results = sapResult.data?.d?.results || [];
  sendJson(res, 200, {
    source: { mode: 'sap-live', endpoint: `${SAP_BASE_URL}/VendorSet` },
    count: results.length,
    vendors: results.map(mapVendor),
  });
}

async function handleCreateVendor(req, res) {
  const payload = await parseBody(req);

  try {
    const { csrfToken, cookie } = await fetchCsrfToken();

    const createResult = await sapRequest('POST', '/VendorSet', {
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!createResult.ok) {
      throw new Error(createResult.diagnostics.message);
    }

    if (!createResult.response.ok) {
      sendJson(res, createResult.response.status, {
        error: 'Failed to create vendor in SAP OData service',
        details: createResult.data,
      });
      return;
    }

    const vendor = createResult.data?.d || createResult.data;
    sendJson(res, 201, {
      message: 'Vendor created successfully',
      source: { mode: 'sap-live', endpoint: `${SAP_BASE_URL}/VendorSet` },
      vendor: mapVendor(vendor),
    });
  } catch (error) {
    if (USE_MOCK_ON_FAILURE) {
      const generatedId = String(Date.now()).slice(-6);
      const fallbackVendor = {
        ...payload,
        VendorId: payload.VendorId || generatedId,
        __metadata: {
          id: `${SAP_BASE_URL}/VendorSet('${payload.VendorId || generatedId}')`,
          uri: `${SAP_BASE_URL}/VendorSet('${payload.VendorId || generatedId}')`,
          type: 'ZVENDOR_ODATA_SRV.Vendor',
        },
      };

      sendJson(res, 201, {
        message: 'Vendor created in mock mode (SAP unreachable)',
        source: { mode: 'mock-fallback', endpoint: `${SAP_BASE_URL}/VendorSet` },
        diagnostics: fallbackPayload({ message: error.message }),
        vendor: mapVendor(fallbackVendor),
      });
      return;
    }

    sendJson(res, 502, {
      error: 'Failed to create vendor in SAP OData service',
      details: error.message,
    });
  }
}

function serveStaticFile(res, pathname) {
  const safePath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.join(__dirname, 'public', safePath);

  if (!filePath.startsWith(path.join(__dirname, 'public'))) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = requestUrl.pathname;

  try {
    if (req.method === 'GET' && pathname === '/health') {
      sendJson(res, 200, {
        status: 'ok',
        sapBaseUrl: SAP_BASE_URL,
        authConfigured: Boolean(SAP_AUTH_HEADER),
        allowInsecureTls: ALLOW_INSECURE_TLS,
        useMockOnFailure: USE_MOCK_ON_FAILURE,
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/vendor-service-info') {
      sendJson(res, 200, {
        projectTitle: 'Vendor Portal',
        baseService: '/sap/opu/odata/sap/ZVENDOR_ODATA_SRV',
        vendorSetUrl: '/sap/opu/odata/sap/ZVENDOR_ODATA_SRV/VendorSet',
        keyFields: ['LIFNR (Vendor ID)', 'SMTPADR (Email)', 'NAME1 (Name)'],
      });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/vendors') {
      await handleListVendors(res);
      return;
    }

    const vendorByIdMatch = pathname.match(/^\/api\/vendors\/([^/]+)$/);
    if (req.method === 'GET' && vendorByIdMatch) {
      await handleGetVendorById(res, vendorByIdMatch[1]);
      return;
    }

    if (req.method === 'POST' && pathname === '/api/vendors') {
      await handleCreateVendor(req, res);
      return;
    }

    if (req.method === 'GET') {
      serveStaticFile(res, pathname);
      return;
    }

    sendJson(res, 404, { error: 'Route not found' });
  } catch (error) {
    sendJson(res, 500, {
      error: error.message || 'Unexpected server error',
    });
  }
});

server.listen(PORT, () => {
  console.log(`Vendor Portal running on http://localhost:${PORT}`);
});

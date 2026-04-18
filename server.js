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
const ALLOW_INSECURE_TLS = (process.env.ALLOW_INSECURE_TLS || 'false').toLowerCase() === 'true';

if (ALLOW_INSECURE_TLS) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

function buildAuthHeader() {
  if (SAP_AUTH_TYPE.toLowerCase() === 'bearer' && SAP_BEARER_TOKEN) {
    return `Bearer ${SAP_BEARER_TOKEN}`;
  }

  if (SAP_BASIC_USER && SAP_BASIC_PASSWORD) {
    const encoded = Buffer.from(`${SAP_BASIC_USER}:${SAP_BASIC_PASSWORD}`).toString('base64');
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
      } catch (err) {
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

async function sapGet(relativePath, headers = {}) {
  const url = `${SAP_BASE_URL}${relativePath}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: getSapHeaders(headers),
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  return { response, data };
}

async function fetchCsrfToken() {
  const { response } = await sapGet('/VendorSet?$top=1&$format=json', {
    'X-CSRF-Token': 'Fetch',
  });

  const csrfToken = response.headers.get('x-csrf-token');
  const cookie = response.headers.get('set-cookie') || '';

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
    I: 'Inactive',
    B: 'Blocked',
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

async function handleGetVendorById(req, res, vendorId) {
  const { response, data } = await sapGet(`/VendorSet('${encodeURIComponent(vendorId)}')?$format=json`);

  if (!response.ok) {
    sendJson(res, response.status, {
      error: 'Failed to fetch vendor from SAP OData service',
      details: data,
    });
    return;
  }

  const vendor = data?.d?.results?.[0] || data?.d;
  sendJson(res, 200, {
    source: {
      endpoint: `${SAP_BASE_URL}/VendorSet('${vendorId}')`,
      odataService: 'ZVENDOR_ODATA_SRV',
      entitySet: 'VendorSet',
    },
    vendor: mapVendor(vendor),
  });
}

async function handleListVendors(req, res) {
  const { response, data } = await sapGet('/VendorSet?$format=json');

  if (!response.ok) {
    sendJson(res, response.status, {
      error: 'Failed to list vendors from SAP OData service',
      details: data,
    });
    return;
  }

  const results = data?.d?.results || [];
  sendJson(res, 200, {
    count: results.length,
    vendors: results.map(mapVendor),
  });
}

async function handleCreateVendor(req, res) {
  const payload = await parseBody(req);
  const { csrfToken, cookie } = await fetchCsrfToken();

  const response = await fetch(`${SAP_BASE_URL}/VendorSet`, {
    method: 'POST',
    headers: getSapHeaders({
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken,
      ...(cookie ? { Cookie: cookie } : {}),
    }),
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    sendJson(res, response.status, {
      error: 'Failed to create vendor in SAP OData service',
      details: data,
    });
    return;
  }

  const vendor = data?.d || data;
  sendJson(res, 201, {
    message: 'Vendor created successfully',
    vendor: mapVendor(vendor),
  });
}

function serveStaticFile(req, res, pathname) {
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
      await handleListVendors(req, res);
      return;
    }

    const vendorByIdMatch = pathname.match(/^\/api\/vendors\/([^/]+)$/);
    if (req.method === 'GET' && vendorByIdMatch) {
      await handleGetVendorById(req, res, vendorByIdMatch[1]);
      return;
    }

    if (req.method === 'POST' && pathname === '/api/vendors') {
      await handleCreateVendor(req, res);
      return;
    }

    if (req.method === 'GET') {
      serveStaticFile(req, res, pathname);
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

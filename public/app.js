const logEl = document.getElementById('chat-log');
const formEl = document.getElementById('chat-form');
const inputEl = document.getElementById('chat-input');
const messageTpl = document.getElementById('message-template');

const createFlow = {
  active: false,
  currentIndex: 0,
  payload: {},
  questions: [
    { key: 'VendorName', prompt: 'What is the Vendor Name?' },
    { key: 'Email', prompt: 'What is the Email?' },
    { key: 'PhoneNumber', prompt: 'What is the Phone Number?' },
    { key: 'GstNumber', prompt: 'What is the GST Number?' },
    { key: 'PanNumber', prompt: 'What is the PAN Number?' },
    { key: 'CompanyCode', prompt: 'What is the Company Code?' },
    { key: 'Address', prompt: 'What is the Address?' },
    { key: 'Status', prompt: 'What is the Status? (A/I/B)' },
  ],
};

function appendMessage(role, text) {
  const fragment = messageTpl.content.cloneNode(true);
  const root = fragment.querySelector('.message');
  root.classList.add(role);
  fragment.querySelector('.meta').textContent =
    role === 'user' ? 'You' : 'Vendor Bot';
  fragment.querySelector('.content').textContent = text;
  logEl.appendChild(fragment);
  logEl.scrollTop = logEl.scrollHeight;
}

function formatVendorCard(vendor) {
  if (!vendor) {
    return 'Vendor not found.';
  }

  return [
    'Vendor Found',
    `VendorId: ${vendor.vendorId || ''}`,
    `VendorName: ${vendor.vendorName || ''}`,
    `Email: ${vendor.email || ''}`,
    `Phone: ${vendor.phoneNumber || ''}`,
    `CompanyCode: ${vendor.companyCode || ''}`,
    `Status: ${vendor.statusText || vendor.statusCode || ''}`,
  ].join('\n');
}

async function fetchVendorById(vendorId) {
  const response = await fetch(`/api/vendors/${encodeURIComponent(vendorId)}`);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Vendor fetch failed');
  }
  return data.vendor;
}

async function createVendor(payload) {
  const response = await fetch('/api/vendors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Vendor creation failed');
  }

  return data.vendor;
}

function startCreateFlow() {
  createFlow.active = true;
  createFlow.currentIndex = 0;
  createFlow.payload = {};
  appendMessage('bot', 'Okay, let\'s collect details. What is the Vendor Name?');
}

async function handleCreateFlowAnswer(answer) {
  const question = createFlow.questions[createFlow.currentIndex];
  createFlow.payload[question.key] = answer;
  createFlow.currentIndex += 1;

  if (createFlow.currentIndex >= createFlow.questions.length) {
    appendMessage(
      'bot',
      'Submitting POST request to /sap/opu/odata/sap/ZVENDOR_ODATA_SRV/VendorSet ...'
    );

    try {
      const created = await createVendor(createFlow.payload);
      appendMessage('bot', `Success. New Vendor Created.\n${formatVendorCard(created)}`);
    } catch (error) {
      appendMessage('bot', `Creation failed: ${error.message}`);
    } finally {
      createFlow.active = false;
      createFlow.currentIndex = 0;
      createFlow.payload = {};
      appendMessage('bot', 'You can query another vendor number or type "create new vendor".');
    }

    return;
  }

  appendMessage('bot', createFlow.questions[createFlow.currentIndex].prompt);
}

async function handleUserMessage(message) {
  const normalized = message.trim();
  if (!normalized) {
    return;
  }

  appendMessage('user', normalized);

  if (createFlow.active) {
    await handleCreateFlowAnswer(normalized);
    return;
  }

  if (normalized.toLowerCase() === 'create new vendor') {
    startCreateFlow();
    return;
  }

  if (/^\d+$/.test(normalized)) {
    appendMessage(
      'bot',
      `Calling /sap/opu/odata/sap/ZVENDOR_ODATA_SRV/VendorSet('${normalized}') ...`
    );
    try {
      const vendor = await fetchVendorById(normalized);
      appendMessage('bot', formatVendorCard(vendor));
    } catch (error) {
      appendMessage('bot', `Query failed: ${error.message}`);
    }
    return;
  }

  appendMessage(
    'bot',
    'Please enter a numeric VendorId (example: 1) or type "create new vendor".'
  );
}

formEl.addEventListener('submit', async event => {
  event.preventDefault();
  const message = inputEl.value;
  inputEl.value = '';
  await handleUserMessage(message);
});

appendMessage('bot', 'Welcome. Please enter a Vendor Number.');
appendMessage(
  'bot',
  'Dedicated OData endpoint: /sap/opu/odata/sap/ZVENDOR_ODATA_SRV/VendorSet'
);

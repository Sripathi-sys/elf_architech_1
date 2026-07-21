const crypto = require('crypto');

module.exports = async (req, res) => {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, phone, email, amount, currency, status, paymentId } = req.body;

  // Basic validation
  if (status !== 'success') {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const pixelId = process.env.META_PIXEL_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;
  const testEventCode = process.env.META_TEST_EVENT_CODE;

  if (!pixelId || !accessToken) {
    console.error('Meta CAPI configuration error: META_PIXEL_ID or META_ACCESS_TOKEN is missing');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // Helper function to hash values using SHA-256 for user privacy matching
  const hash = (val) => {
    if (!val) return undefined;
    return crypto.createHash('sha256').update(val.trim().toLowerCase()).digest('hex');
  };

  // Extract client IP and user agent from request headers
  const clientIp = req.headers['x-forwarded-for'] 
    ? req.headers['x-forwarded-for'].split(',')[0].trim() 
    : req.socket.remoteAddress;
  const clientUserAgent = req.headers['user-agent'];

  // Prepare hashed user details for matching
  const userData = {
    ph: hash(phone),
    fn: hash(name?.split(' ')[0]),
    ln: hash(name?.split(' ').slice(1).join(' ')),
    em: hash(email),
    client_ip_address: clientIp,
    client_user_agent: clientUserAgent
  };

  const eventData = {
    event_name: 'Purchase',
    event_time: Math.floor(Date.now() / 1000),
    event_id: paymentId, // Deduplication key (matches client-side eventID)
    user_data: userData,
    custom_data: {
      value: parseFloat(amount) || 499.00,
      currency: currency || 'INR',
      content_name: 'Project Growth Audit'
    },
    event_source_url: req.headers.referer || '',
    action_source: 'website'
  };

  const payload = {
    data: [eventData]
  };

  // Add test event code if provided in Vercel environment variables
  if (testEventCode) {
    payload.test_event_code = testEventCode;
  }

  try {
    const response = await fetch(`https://graph.facebook.com/v16.0/${pixelId}/events?access_token=${accessToken}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Meta CAPI error response:', result);
      return res.status(response.status).json({ error: 'Meta API error', details: result });
    }

    return res.status(200).json({ success: true, result });
  } catch (error) {
    console.error('Error posting to Meta CAPI:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

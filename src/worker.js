// This is the "mailbox". It runs on Cloudflare's free network and gets a
// permanent public URL. Every request sent to it gets written down as a
// document in a Firestore collection called "requests", viewable in the
// dashboard (or the Firebase Console). It also checks the api_key/code
// query params against the expected values set in the dashboard's Settings
// panel (stored in Firestore at config/credentials), so you can test both
// valid and invalid credentials like the real endpoint would behave.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

async function getExpectedCredentials(env) {
  const url =
    `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}` +
    `/databases/(default)/documents/config/credentials?key=${env.FIREBASE_WEB_API_KEY}`;
  const resp = await fetch(url);
  if (!resp.ok) return null; // no config saved yet -> skip validation
  const doc = await resp.json();
  const fields = doc.fields || {};
  return {
    apiKey: fields.apiKey?.stringValue,
    code: fields.code?.stringValue,
  };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const body = await request.text();

    const headersObj = {};
    for (const [key, value] of request.headers.entries()) {
      headersObj[key] = value;
    }

    const expected = await getExpectedCredentials(env);
    const gotApiKey = url.searchParams.get('api_key') || '';
    const gotCode = url.searchParams.get('code') || '';
    const authOk = !expected
      ? true
      : gotApiKey === expected.apiKey && gotCode === expected.code;

    const firestoreDoc = {
      fields: {
        time: { timestampValue: new Date().toISOString() },
        method: { stringValue: request.method },
        path: { stringValue: url.pathname },
        query: { stringValue: url.search },
        headers: { stringValue: JSON.stringify(headersObj) },
        body: { stringValue: body },
        authResult: { stringValue: authOk ? 'ok' : 'invalid' },
      },
    };

    const firestoreUrl =
      `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}` +
      `/databases/(default)/documents/requests?key=${env.FIREBASE_WEB_API_KEY}`;

    const firestoreResp = await fetch(firestoreUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(firestoreDoc),
    });

    if (!firestoreResp.ok) {
      const detail = await firestoreResp.text();
      return new Response(JSON.stringify({ status: 'error', detail }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    if (!authOk) {
      return new Response(JSON.stringify({ status: 'error', message: 'invalid api_key or code' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    return new Response(JSON.stringify({ status: 'ok', received_bytes: body.length }), {
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  },
};

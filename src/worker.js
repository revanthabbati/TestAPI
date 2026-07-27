// This is the "mailbox". It runs on Cloudflare's free network and gets a
// permanent public URL. Every request sent to it gets written down as a
// document in a Firestore collection called "requests", which you can browse
// in the Firebase Console.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const body = await request.text();

    const headersObj = {};
    for (const [key, value] of request.headers.entries()) {
      headersObj[key] = value;
    }

    const firestoreDoc = {
      fields: {
        time: { timestampValue: new Date().toISOString() },
        method: { stringValue: request.method },
        path: { stringValue: url.pathname },
        query: { stringValue: url.search },
        headers: { stringValue: JSON.stringify(headersObj) },
        body: { stringValue: body },
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
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ status: 'ok', received_bytes: body.length }), {
      headers: { 'Content-Type': 'application/json' },
    });
  },
};

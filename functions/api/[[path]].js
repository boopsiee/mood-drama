const enc = new TextEncoder();
const dec = new TextDecoder();

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const method = request.method.toUpperCase();

  try {
    if (method === 'OPTIONS') return new Response(null, { status: 204 });
    if (!env.DB) return json({ error: 'D1 binding DB is missing' }, 500);

    await cleanupExpiredSessions(env);

    if (path[0] === 'register' && method === 'POST') return register(request, env);
    if (path[0] === 'login' && method === 'POST') return login(request, env);
    if (path[0] === 'logout' && method === 'POST') return logout(request, env);
    if (path[0] === 'me' && method === 'GET') return me(request, env);
    if (path[0] === 'movies' && method === 'GET') return listMovies(request, env);
    if (path[0] === 'stream-url' && path[1] && method === 'GET') return streamUrl(request, env, Number(path[1]));
    if (path[0] === 'purchases' && method === 'POST') return createPurchase(request, env);
    if (path[0] === 'purchases' && method === 'GET') return myPurchases(request, env);
    if (path[0] === 'purchases' && path[1] && path[2] === 'confirm' && method === 'POST')
  return confirmPurchase(request, env, Number(path[1]));

    if (path[0] === 'admin' && path[1] === 'upload-url' && method === 'POST') return adminUploadUrl(request, env);
    if (path[0] === 'admin' && path[1] === 'movies' && method === 'POST') return adminCreateMovie(request, env);
    if (path[0] === 'admin' && path[1] === 'movies' && path[2] && method === 'DELETE') return adminDeleteMovie(request, env, Number(path[2]));
    if (path[0] === 'admin' && path[1] === 'purchases' && method === 'GET') return adminPurchases(request, env);
    if (path[0] === 'admin' && path[1] === 'purchases' && path[2] && path[3] === 'approve' && method === 'POST') return adminApprovePurchase(request, env, Number(path[2]));
    if (path[0] === 'admin' && path[1] === 'purchases' && path[2] && path[3] === 'reject' && method === 'POST') return adminRejectPurchase(request, env, Number(path[2]));

    return json({ error: 'Not found' }, 404);
  } catch (e) {
    console.error(e);
    return json({ error: e?.message || 'Server error' }, e?.status || 500);
  }
}

async function register(request, env) {
  const body = await request.json();
  const email = String(body.email || '').trim().toLowerCase();
  const name = String(body.name || '').trim().slice(0, 80);
  const password = String(body.password || '');

  if (
    !/^\S+@\S+\.\S+$/.test(email) ||
    name.length < 2 ||
    password.length < 6
  ) {
    return json({ error: 'Мэдээллээ зөв бөглөнө үү.' }, 400);
  }

  const exists = await env.DB
    .prepare('SELECT id FROM users WHERE email=?')
    .bind(email)
    .first();

  if (exists) {
    return json({ error: 'Энэ имэйл бүртгэлтэй байна.' }, 409);
  }

  const salt = randomHex(16);
  const password_hash = await hashPassword(password, salt);

  const adminEmail = String(env.ADMIN_EMAIL || '')
    .trim()
    .toLowerCase();

  const role = adminEmail && email === adminEmail
    ? 'admin'
    : 'user';

  const now = Date.now();

  const r = await env.DB
    .prepare(
      'INSERT INTO users(email,name,password_hash,password_salt,role,created_at) VALUES(?,?,?,?,?,?)'
    )
    .bind(
      email,
      name,
      password_hash,
      salt,
      role,
      now
    )
    .run();

  const userId = r.meta.last_row_id;

  const session = await createSession(env, userId);

  return json(
    {
      ok: true,
      user: {
        id: userId,
        email,
        name,
        role
      }
    },
    201,
    sessionCookie(session)
  );
}

async function login(request, env) {
  const body = await request.json();

  const email = String(body.email || '')
    .trim()
    .toLowerCase();

  const password = String(body.password || '');

  const user = await env.DB
    .prepare('SELECT * FROM users WHERE email=?')
    .bind(email)
    .first();

  if (
    !user ||
    !await verifyPassword(
      password,
      user.password_salt,
      user.password_hash
    )
  ) {
    return json(
      { error: 'Имэйл эсвэл нууц үг буруу.' },
      401
    );
  }

  const session = await createSession(env, user.id);

  return json(
    {
      ok: true,
      user: safeUser(user)
    },
    200,
    sessionCookie(session)
  );
}

async function logout(request, env) {
  const sid = getCookie(request, 'sid');

  if (sid) {
    await env.DB
      .prepare('DELETE FROM sessions WHERE id=?')
      .bind(sid)
      .run();
  }

  return json(
    { ok: true },
    200,
    {
      'Set-Cookie':
        'sid=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'
    }
  );
}

async function me(request, env) {
  const user = await requireUser(request, env, false);

  if (!user) {
    return json({ user: null });
  }

  const sub = await env.DB
    .prepare(
      'SELECT expires_at FROM subscriptions WHERE user_id=?'
    )
    .bind(user.id)
    .first();

  return json({
    user: safeUser(user),
    subscription_expires_at: sub?.expires_at || null
  });
}

async function listMovies(request, env) {
  const user = await requireUser(request, env, false);

  const rs = await env.DB
    .prepare(
      'SELECT * FROM movies WHERE is_published=1 ORDER BY created_at DESC'
    )
    .all();

  let subActive = false;
  const entitlements = new Set();

  if (user) {
    const sub = await env.DB
      .prepare(
        'SELECT expires_at FROM subscriptions WHERE user_id=?'
      )
      .bind(user.id)
      .first();

    subActive = !!sub && sub.expires_at > Date.now();

    const er = await env.DB
      .prepare(
        'SELECT movie_id FROM movie_entitlements WHERE user_id=?'
      )
      .bind(user.id)
      .all();

    er.results.forEach(x => entitlements.add(x.movie_id));
  }

  const movies = await Promise.all(
    rs.results.map(async m => ({
      id: m.id,
      title: m.title,
      description: m.description,
      genre: m.genre,
      duration_minutes: m.duration_minutes,
      poster_url: m.poster_key
        ? await presign(env, 'GET', m.poster_key, 3600)
        : null,
      unlocked:
        !!user &&
        (
          subActive ||
          entitlements.has(m.id)
        )
    }))
  );

  return json({ movies });
}

async function streamUrl(request, env, movieId) {
  const user = await requireUser(
    request,
    env,
    true
  );

  const movie = await env.DB
    .prepare(
      'SELECT * FROM movies WHERE id=? AND is_published=1'
    )
    .bind(movieId)
    .first();

  if (!movie) {
    return json(
      { error: 'Кино олдсонгүй.' },
      404
    );
  }

  const allowed = await hasAccess(
    env,
    user.id,
    movieId
  );

  if (!allowed) {
    return json(
      { error: 'Энэ киног үзэх эрх алга.' },
      403
    );
  }

  const url = await presign(
    env,
    'GET',
    movie.video_key,
    900
  );

  return json({
    url,
    expires_in: 900
  });
}

async function createPurchase(request, env) {
  const user = await requireUser(
    request,
    env,
    true
  );

  const body = await request.json();

  const type =
    body.type === 'subscription'
      ? 'subscription'
      : 'movie';

  let movieId = null;
  let amount = 5000;

  if (type === 'movie') {
    movieId = Number(body.movie_id);

    const movie = await env.DB
      .prepare(
        'SELECT id FROM movies WHERE id=? AND is_published=1'
      )
      .bind(movieId)
      .first();

    if (!movie) {
      return json(
        { error: 'Кино олдсонгүй.' },
        404
      );
    }

    amount = 3000;
  }

  const reference =
    `MD-${Date.now().toString(36).toUpperCase()}-${randomHex(3).toUpperCase()}`;

  const r = await env.DB
    .prepare(
      'INSERT INTO purchases(user_id,type,movie_id,amount,reference_code,status,created_at) VALUES(?,?,?,?,?,\'pending\',?)'
    )
    .bind(
      user.id,
      type,
      movieId,
      amount,
      reference,
      Date.now()
    )
    .run();

  return json(
    {
      ok: true,
      purchase: {
        id: r.meta.last_row_id,
        type,
        movie_id: movieId,
        amount,
        reference_code: reference,
        status: 'pending'
      },
      payment: paymentInfo(env)
    },
    201
  );
}

async function myPurchases(request, env) {
  const user = await requireUser(
    request,
    env,
    true
  );

  const rs = await env.DB
    .prepare(
      `SELECT p.*, m.title AS movie_title
       FROM purchases p
       LEFT JOIN movies m ON m.id=p.movie_id
       WHERE p.user_id=?
       ORDER BY p.created_at DESC
       LIMIT 50`
    )
    .bind(user.id)
    .all();

  return json({
    purchases: rs.results,
    payment: paymentInfo(env)
  });
}

async function adminUploadUrl(request, env) {
  await requireAdmin(request, env);

  const body = await request.json();

  const kind =
    body.kind === 'poster'
      ? 'poster'
      : 'video';

  const fileName = sanitizeFileName(
    String(
      body.file_name ||
      (
        kind === 'video'
          ? 'video.mp4'
          : 'poster.jpg'
      )
    )
  );

  const ext = fileName.includes('.')
    ? fileName.split('.').pop().toLowerCase()
    : (
        kind === 'video'
          ? 'mp4'
          : 'jpg'
      );

  if (
    kind === 'video' &&
    !['mp4', 'm4v'].includes(ext)
  ) {
    return json(
      {
        error:
          'Видео MP4 байх шаардлагатай.'
      },
      400
    );
  }

  if (
    kind === 'poster' &&
    ![
      'jpg',
      'jpeg',
      'png',
      'webp'
    ].includes(ext)
  ) {
    return json(
      {
        error:
          'Poster JPG/PNG/WebP байна.'
      },
      400
    );
  }

  const key =
    `${kind}s/${Date.now()}-${randomHex(6)}.${ext}`;

  const url = await presign(
    env,
    'PUT',
    key,
    3600
  );

  return json({
    key,
    url,
    expires_in: 3600
  });
}

async function adminCreateMovie(request, env) {
  await requireAdmin(request, env);

  const body = await request.json();

  const title = String(body.title || '')
    .trim()
    .slice(0, 160);

  const description =
    String(body.description || '')
      .trim()
      .slice(0, 1000);

  const genre =
    String(body.genre || 'drama')
      .trim()
      .slice(0, 40);

  const duration = Math.max(
    1,
    Math.min(
      600,
      Number(body.duration_minutes || 90)
    )
  );

  const videoKey =
    String(body.video_key || '').trim();

  const posterKey =
    String(body.poster_key || '').trim() ||
    null;

  if (!title || !videoKey) {
    return json(
      {
        error:
          'Нэр болон video_key шаардлагатай.'
      },
      400
    );
  }

  const r = await env.DB
    .prepare(
      'INSERT INTO movies(title,description,genre,duration_minutes,video_key,poster_key,is_published,created_at) VALUES(?,?,?,?,?,?,1,?)'
    )
    .bind(
      title,
      description,
      genre,
      duration,
      videoKey,
      posterKey,
      Date.now()
    )
    .run();

  return json(
    {
      ok: true,
      id: r.meta.last_row_id
    },
    201
  );
}

async function adminDeleteMovie(
  request,
  env,
  movieId
) {
  await requireAdmin(request, env);

  const movie = await env.DB
    .prepare(
      'SELECT * FROM movies WHERE id=?'
    )
    .bind(movieId)
    .first();

  if (!movie) {
    return json(
      { error: 'Кино олдсонгүй.' },
      404
    );
  }

  if (env.VIDEOS) {
    if (movie.video_key) {
      await env.VIDEOS
        .delete(movie.video_key)
        .catch(() => {});
    }

    if (movie.poster_key) {
      await env.VIDEOS
        .delete(movie.poster_key)
        .catch(() => {});
    }
  }

  await env.DB
    .prepare(
      'DELETE FROM movies WHERE id=?'
    )
    .bind(movieId)
    .run();

  return json({ ok: true });
}

async function adminPurchases(request, env) {
  await requireAdmin(request, env);

  const rs = await env.DB
    .prepare(
      `SELECT
         p.*,
         u.email,
         u.name,
         m.title AS movie_title
       FROM purchases p
       JOIN users u ON u.id=p.user_id
       LEFT JOIN movies m ON m.id=p.movie_id
       ORDER BY p.created_at DESC
       LIMIT 200`
    )
    .all();

  return json({
    purchases: rs.results
  });
}

async function adminApprovePurchase(
  request,
  env,
  purchaseId
) {
  await requireAdmin(request, env);

  const p = await env.DB
    .prepare(
      'SELECT * FROM purchases WHERE id=?'
    )
    .bind(purchaseId)
    .first();

  if (!p) {
    return json(
      {
        error:
          'Төлбөрийн хүсэлт олдсонгүй.'
      },
      404
    );
  }

  if (p.status === 'approved') {
    return json({ ok: true });
  }

  const now = Date.now();

  if (p.type === 'movie') {
    await env.DB
      .prepare(
        'INSERT OR IGNORE INTO movie_entitlements(user_id,movie_id,granted_at) VALUES(?,?,?)'
      )
      .bind(
        p.user_id,
        p.movie_id,
        now
      )
      .run();
  } else {
    const existing = await env.DB
      .prepare(
        'SELECT expires_at FROM subscriptions WHERE user_id=?'
      )
      .bind(p.user_id)
      .first();

    const base =
      existing?.expires_at > now
        ? existing.expires_at
        : now;

    const expires =
      base +
      30 * 24 * 60 * 60 * 1000;

    await env.DB
      .prepare(
        'INSERT INTO subscriptions(user_id,expires_at,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET expires_at=excluded.expires_at, updated_at=excluded.updated_at'
      )
      .bind(
        p.user_id,
        expires,
        now
      )
      .run();
  }

  await env.DB
    .prepare(
      'UPDATE purchases SET status=\'approved\', approved_at=? WHERE id=?'
    )
    .bind(
      now,
      purchaseId
    )
    .run();

  return json({ ok: true });
}

async function adminRejectPurchase(
  request,
  env,
  purchaseId
) {
  await requireAdmin(request, env);

  await env.DB
    .prepare(
      'UPDATE purchases SET status=\'rejected\' WHERE id=? AND status=\'pending\''
    )
    .bind(purchaseId)
    .run();

  return json({ ok: true });
}

async function hasAccess(
  env,
  userId,
  movieId
) {
  const now = Date.now();

  const sub = await env.DB
    .prepare(
      'SELECT expires_at FROM subscriptions WHERE user_id=?'
    )
    .bind(userId)
    .first();

  if (sub?.expires_at > now) {
    return true;
  }

  const ent = await env.DB
    .prepare(
      'SELECT 1 AS ok FROM movie_entitlements WHERE user_id=? AND movie_id=?'
    )
    .bind(
      userId,
      movieId
    )
    .first();

  return !!ent;
}

async function requireAdmin(request, env) {
  const user = await requireUser(
    request,
    env,
    true
  );

  if (user.role !== 'admin') {
    throw httpError(
      403,
      'Admin эрх шаардлагатай.'
    );
  }

  return user;
}

async function requireUser(
  request,
  env,
  required = true
) {
  const sid = getCookie(request, 'sid');

  if (!sid) {
    if (required) {
      throw httpError(
        401,
        'Нэвтэрнэ үү.'
      );
    }

    return null;
  }

  const user = await env.DB
    .prepare(
      `SELECT u.*
       FROM sessions s
       JOIN users u ON u.id=s.user_id
       WHERE s.id=?
       AND s.expires_at>?`
    )
    .bind(
      sid,
      Date.now()
    )
    .first();

  if (!user && required) {
    throw httpError(
      401,
      'Нэвтрэх хугацаа дууссан.'
    );
  }

  return user || null;
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

async function cleanupExpiredSessions(env) {
  if (Math.random() < 0.03) {
    await env.DB
      .prepare(
        'DELETE FROM sessions WHERE expires_at<?'
      )
      .bind(Date.now())
      .run();
  }
}

async function createSession(
  env,
  userId
) {
  const sid = randomHex(32);

  const expires =
    Date.now() +
    30 * 24 * 60 * 60 * 1000;

  await env.DB
    .prepare(
      'INSERT INTO sessions(id,user_id,expires_at,created_at) VALUES(?,?,?,?)'
    )
    .bind(
      sid,
      userId,
      expires,
      Date.now()
    )
    .run();

  return {
    sid,
    expires
  };
}

function sessionCookie(s) {
  const maxAge = Math.floor(
    (s.expires - Date.now()) / 1000
  );

  return {
    'Set-Cookie':
      `sid=${s.sid}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`
  };
}

function safeUser(u) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role
  };
}

function paymentInfo(env) {
  return {
    bank_name:
      env.BANK_NAME ||
      'БАНКНЫ НЭР',

    account_name:
      env.BANK_ACCOUNT_NAME ||
      'ДАНС ЭЗЭМШИГЧ',

    account_number:
      env.BANK_ACCOUNT_NUMBER ||
      '0000000000'
  };
}

function getCookie(request, name) {
  const h =
    request.headers.get('cookie') || '';

  for (const p of h.split(';')) {
    const [k, ...v] =
      p.trim().split('=');

    if (k === name) {
      return v.join('=');
    }
  }

  return null;
}

async function hashPassword(
  password,
  saltHex
) {
  const salt =
    hexToBytes(saltHex);

  const key =
    await crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );

  const bits =
    await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        hash: 'SHA-256',
        salt,
        iterations: 100000
      },
      key,
      256
    );

  return bytesToHex(
    new Uint8Array(bits)
  );
}

async function verifyPassword(
  password,
  salt,
  expected
) {
  return timingSafeEqual(
    await hashPassword(
      password,
      salt
    ),
    expected
  );
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }

  let x = 0;

  for (
    let i = 0;
    i < a.length;
    i++
  ) {
    x |=
      a.charCodeAt(i) ^
      b.charCodeAt(i);
  }

  return x === 0;
}

function randomHex(bytes) {
  const a =
    new Uint8Array(bytes);

  crypto.getRandomValues(a);

  return bytesToHex(a);
}

function bytesToHex(a) {
  return [...a]
    .map(
      b =>
        b
          .toString(16)
          .padStart(2, '0')
    )
    .join('');
}

function hexToBytes(h) {
  const a =
    new Uint8Array(
      h.length / 2
    );

  for (
    let i = 0;
    i < a.length;
    i++
  ) {
    a[i] =
      parseInt(
        h.slice(
          i * 2,
          i * 2 + 2
        ),
        16
      );
  }

  return a;
}

function sanitizeFileName(s) {
  return s
    .replace(
      /[^a-zA-Z0-9._-]/g,
      '_'
    )
    .slice(-120);
}

function json(
  data,
  status = 200,
  headers = {}
) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        'content-type':
          'application/json; charset=utf-8',

        'cache-control':
          'no-store',

        ...headers
      }
    }
  );
}

async function hmac(
  key,
  data
) {
  const k =
    await crypto.subtle.importKey(
      'raw',
      key,
      {
        name: 'HMAC',
        hash: 'SHA-256'
      },
      false,
      ['sign']
    );

  return new Uint8Array(
    await crypto.subtle.sign(
      'HMAC',
      k,
      typeof data === 'string'
        ? enc.encode(data)
        : data
    )
  );
}

async function sha256Hex(s) {
  const b =
    await crypto.subtle.digest(
      'SHA-256',
      typeof s === 'string'
        ? enc.encode(s)
        : s
    );

  return bytesToHex(
    new Uint8Array(b)
  );
}

function awsEncode(s) {
  return encodeURIComponent(s)
    .replace(
      /[!'()*]/g,
      c =>
        '%' +
        c
          .charCodeAt(0)
          .toString(16)
          .toUpperCase()
    );
}

async function presign(
  env,
  method,
  key,
  expires = 900
) {
  const accountId =
    env.R2_ACCOUNT_ID;

  const accessKey =
    env.R2_ACCESS_KEY_ID;

  const secretKey =
    env.R2_SECRET_ACCESS_KEY;

  const bucket =
    env.R2_BUCKET_NAME;

  if (
    !accountId ||
    !accessKey ||
    !secretKey ||
    !bucket
  ) {
    throw new Error(
      'R2 API credentials are missing. Add R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME.'
    );
  }

  const now = new Date();

  const amzDate =
    now
      .toISOString()
      .replace(
        /[:-]|\.\d{3}/g,
        ''
      );

  const date =
    amzDate.slice(0, 8);

  const region = 'auto';
  const service = 's3';

  const host =
    `${accountId}.r2.cloudflarestorage.com`;

  const credentialScope =
    `${date}/${region}/${service}/aws4_request`;

  const canonicalUri =
    '/' +
    awsEncode(bucket) +
    '/' +
    key
      .split('/')
      .map(awsEncode)
      .join('/');

  const qp = {
    'X-Amz-Algorithm':
      'AWS4-HMAC-SHA256',

    'X-Amz-Credential':
      `${accessKey}/${credentialScope}`,

    'X-Amz-Date':
      amzDate,

    'X-Amz-Expires':
      String(expires),

    'X-Amz-SignedHeaders':
      'host'
  };

  const canonicalQuery =
    Object
      .keys(qp)
      .sort()
      .map(
        k =>
          `${awsEncode(k)}=${awsEncode(qp[k])}`
      )
      .join('&');

  const canonicalRequest =
    `${method}\n` +
    `${canonicalUri}\n` +
    `${canonicalQuery}\n` +
    `host:${host}\n\n` +
    `host\n` +
    `UNSIGNED-PAYLOAD`;

  const stringToSign =
    `AWS4-HMAC-SHA256\n` +
    `${amzDate}\n` +
    `${credentialScope}\n` +
    `${await sha256Hex(canonicalRequest)}`;

  const kDate =
    await hmac(
      enc.encode(
        'AWS4' + secretKey
      ),
      date
    );

  const kRegion =
    await hmac(
      kDate,
      region
    );

  const kService =
    await hmac(
      kRegion,
      service
    );

  const kSigning =
    await hmac(
      kService,
      'aws4_request'
    );

  const signature =
    bytesToHex(
      await hmac(
        kSigning,
        stringToSign
      )
    );

  return (
    `https://${host}` +
    `${canonicalUri}?` +
    `${canonicalQuery}` +
    `&X-Amz-Signature=${signature}`
  );
}

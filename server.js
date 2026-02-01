const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');
const session = require('express-session');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize database
async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pastes (
        id VARCHAR(20) PRIMARY KEY,
        content TEXT NOT NULL,
        ttl_seconds INTEGER,
        max_views INTEGER,
        created_at BIGINT NOT NULL,
        expires_at BIGINT,
        views INTEGER DEFAULT 0
      )
    `);
    
    // Add expires_at column if it doesn't exist
    try {
      await pool.query('ALTER TABLE pastes ADD COLUMN IF NOT EXISTS expires_at BIGINT');
    } catch (err) {
      // Column might already exist, ignore error
    }
    
    console.log('Database initialized');
  } catch (err) {
    console.error('Database initialization error:', err);
  }
}

initDB();

app.use(cors());
app.use(express.json());
app.use(session({
  secret: 'pastebin-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));
app.use(express.static(path.join(__dirname, 'build')));

function getCurrentTime(req) {
  if (process.env.TEST_MODE === '1' && req.headers['x-test-now-ms']) {
    return parseInt(req.headers['x-test-now-ms'], 10);
  }
  return Date.now();
}

function generateId() {
  return Math.random().toString(36).substring(2, 15);
}

// Health check
app.get('/api/healthz', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false });
  }
});

// Create paste
app.post('/api/pastes', async (req, res) => {
  try {
    const { content, ttl_seconds, max_views } = req.body;
    
    if (!content || typeof content !== 'string' || content.trim() === '') {
      return res.status(400).json({ error: 'Content is required and must be a non-empty string' });
    }

    // Require at least one constraint (TTL or max views)
    if (!ttl_seconds && !max_views) {
      return res.status(400).json({ error: 'At least one constraint (ttl_seconds or max_views) is required' });
    }

    if (ttl_seconds !== undefined && (!Number.isInteger(ttl_seconds) || ttl_seconds < 1)) {
      return res.status(400).json({ error: 'ttl_seconds must be an integer >= 1' });
    }

    if (max_views !== undefined && (!Number.isInteger(max_views) || max_views < 1)) {
      return res.status(400).json({ error: 'max_views must be an integer >= 1' });
    }

    const id = generateId();
    const currentTime = getCurrentTime(req);
    // Don't set expires_at during creation, set it on first access
    
    await pool.query(
      'INSERT INTO pastes (id, content, ttl_seconds, max_views, created_at, expires_at, views) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [id, content, ttl_seconds, max_views, currentTime, null, 0]
    );

    const url = `${req.protocol}://${req.get('host')}/p/${id}`;
    res.json({ id, url });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get paste
app.get('/api/pastes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const currentTime = getCurrentTime(req);
    
    const result = await pool.query('SELECT * FROM pastes WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Paste not found' });
    }

    const paste = result.rows[0];

    // Always set new expires_at on every access if TTL is set
    if (paste.ttl_seconds) {
      const expiresAt = currentTime + (paste.ttl_seconds * 1000);
      await pool.query('UPDATE pastes SET expires_at = $1 WHERE id = $2', [expiresAt, id]);
      paste.expires_at = expiresAt;
    }

    // Check TTL expiry using stored expires_at (this won't trigger on same request)
    if (paste.expires_at && currentTime > paste.expires_at) {
      return res.status(404).json({ error: 'Paste expired' });
    }

    // Check view limit
    if (paste.max_views && paste.views >= paste.max_views) {
      return res.status(404).json({ error: 'View limit exceeded' });
    }

    // Increment view count
    await pool.query('UPDATE pastes SET views = views + 1 WHERE id = $1', [id]);

    const response = {
      content: paste.content,
      remaining_views: paste.max_views ? paste.max_views - (paste.views + 1) : null,
      expires_at: paste.expires_at ? new Date(paste.expires_at).toISOString() : null
    };

    res.json(response);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve paste HTML
app.get('/p/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const currentTime = getCurrentTime(req);
    
    const result = await pool.query('SELECT * FROM pastes WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).send(`
        <html>
          <head><title>Paste Not Found</title></head>
          <body style="font-family: monospace; margin: 20px; background: #f5f5f5;">
            <div style="max-width: 800px; margin: 0 auto; text-align: center;">
              <h1>404 - Paste Not Found</h1>
              <p>The paste doesn't exist, has expired, or exceeded its view limit.</p>
            </div>
          </body>
        </html>
      `);
    }

    const paste = result.rows[0];

    // Always set new expires_at on every access if TTL is set
    if (paste.ttl_seconds) {
      const expiresAt = currentTime + (paste.ttl_seconds * 1000);
      await pool.query('UPDATE pastes SET expires_at = $1 WHERE id = $2', [expiresAt, id]);
      paste.expires_at = expiresAt;
    }

    // Check TTL expiry using stored expires_at (this won't trigger on same request)
    if (paste.expires_at && currentTime > paste.expires_at) {
      return res.status(404).send(`
        <html>
          <head><title>Paste Expired</title></head>
          <body style="font-family: monospace; margin: 20px; background: #f5f5f5;">
            <div style="max-width: 800px; margin: 0 auto; text-align: center;">
              <h1>404 - Paste Expired</h1>
              <p>This paste has expired.</p>
            </div>
          </body>
        </html>
      `);
    }

    // Always increment view count first
    await pool.query('UPDATE pastes SET views = views + 1 WHERE id = $1', [id]);
    
    const newViews = paste.views + 1;
    
    // Check view limit AFTER incrementing
    if (paste.max_views && newViews > paste.max_views) {
      return res.status(404).send(`
        <html>
          <head><title>View Limit Exceeded</title></head>
          <body style="font-family: monospace; margin: 20px; background: #f5f5f5;">
            <div style="max-width: 800px; margin: 0 auto; text-align: center;">
              <h1>404 - View Limit Exceeded</h1>
              <p>This paste has exceeded its view limit.</p>
            </div>
          </body>
        </html>
      `);
    }
    
    const content = paste.content.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    // Calculate remaining time using stored expires_at
    const remainingMs = paste.expires_at ? Math.max(0, paste.expires_at - currentTime) : null;
    
    res.send(`
      <html>
        <head>
          <title>Paste - ${id}</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
        </head>
        <body style="font-family: monospace; margin: 20px; background: #f5f5f5;">
          <div style="max-width: 800px; margin: 0 auto;">
            <h1>Paste: ${id}</h1>
            <div style="background: white; border: 1px solid #ddd; border-radius: 4px; padding: 15px; white-space: pre-wrap; word-break: break-word;">
${content}
            </div>
            <div style="margin-top: 10px; font-size: 12px; color: #666;">
              ${paste.max_views ? `Views: ${newViews}/${paste.max_views} ` : ''}
              ${paste.expires_at ? `<span id="timer">Expires in: ${Math.ceil(remainingMs / 1000)}s</span>` : ''}
            </div>
          </div>
          ${paste.expires_at ? `
          <script>
            const expiresAt = ${paste.expires_at};
            const createdAt = ${paste.created_at};
            const timer = document.getElementById('timer');
            
            function updateTimer() {
              const now = Date.now();
              const remaining = Math.max(0, expiresAt - now);
              
              if (remaining <= 0) {
                timer.textContent = 'Expired!';
                setTimeout(() => location.reload(), 1000);
              } else {
                timer.textContent = 'Expires in: ' + Math.ceil(remaining / 1000) + 's';
                setTimeout(updateTimer, 1000);
              }
            }
            
            // Start timer immediately when page loads
            updateTimer();
          </script>
          ` : ''}
        </body>
      </html>
    `);  } catch (error) {
    res.status(500).send('Internal server error');
  }
});

// Expired page
app.get('/expired', (req, res) => {
  res.send(`
    <html>
      <head><title>Paste Expired</title></head>
      <body style="font-family: monospace; margin: 20px; background: #f5f5f5;">
        <div style="max-width: 800px; margin: 0 auto; text-align: center;">
          <h1>⏰ Paste Expired</h1>
          <p>This paste has expired and is no longer available.</p>
          <a href="/" style="color: #007bff; text-decoration: none;">← Create New Paste</a>
        </div>
      </body>
    </html>
  `);
});

// Serve React app
app.get('*', (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    res.sendFile(path.join(__dirname, 'build', 'index.html'));
  } else {
    res.json({ message: 'API server running. React dev server should be on port 3000' });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
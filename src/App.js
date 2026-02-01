import React, { useState } from 'react';
import './App.css';

function App() {
  const [content, setContent] = useState('');
  const [ttlSeconds, setTtlSeconds] = useState('');
  const [maxViews, setMaxViews] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const body = { content };
      
      if (ttlSeconds) {
        body.ttl_seconds = parseInt(ttlSeconds, 10);
      }
      
      if (maxViews) {
        body.max_views = parseInt(maxViews, 10);
      }

      const response = await fetch('/api/pastes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (response.ok) {
        setResult(data);
        setContent('');
        setTtlSeconds('');
        setMaxViews('');
      } else {
        setError(data.error || 'An error occurred');
      }
    } catch (err) {
      setError('Network error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="App">
      <div className="container">
        <h1>Pastebin Lite</h1>
        
        <form onSubmit={handleSubmit} className="paste-form">
          <div className="form-group">
            <label htmlFor="content">Paste Content *</label>
            <textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Enter your text here..."
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="ttl">Expire After (seconds)</label>
              <input
                id="ttl"
                type="number"
                value={ttlSeconds}
                onChange={(e) => setTtlSeconds(e.target.value)}
                placeholder="Optional"
                min="1"
              />
            </div>

            <div className="form-group">
              <label htmlFor="maxViews">Max Views</label>
              <input
                id="maxViews"
                type="number"
                value={maxViews}
                onChange={(e) => setMaxViews(e.target.value)}
                placeholder="Optional"
                min="1"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !content.trim()}
            className="submit-btn"
          >
            {loading ? 'Creating...' : 'Create Paste'}
          </button>
        </form>

        {error && (
          <div className="error">
            Error: {error}
          </div>
        )}

        {result && (
          <div className="success">
            <h3>Paste Created Successfully!</h3>
            <p><strong>ID:</strong> {result.id}</p>
            <p><strong>URL:</strong> <a href={result.url} target="_blank" rel="noopener noreferrer">{result.url}</a></p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
import { useState, useEffect } from 'react';
import { Blueprint, Environment, AppListItem } from '@aws-vibe/shared';
import { api } from '../lib/api';

export default function Home() {
  const [tenantId, setTenantId] = useState('');
  const [defaultRegion, setDefaultRegion] = useState('us-east-1');
  const [controlPlaneAccountId, setControlPlaneAccountId] = useState('');
  const [connected, setConnected] = useState(false);
  const [roleArn, setRoleArn] = useState('');
  const [initializing, setInitializing] = useState(true);

  // Connection (now using controlPlaneAccountId from init)
  const [accountId, setAccountId] = useState('');
  const [region, setRegion] = useState('us-east-1');

  // Generate
  const [appName, setAppName] = useState('');
  const [blueprint, setBlueprint] = useState<Blueprint>(Blueprint.SERVERLESS);
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [currentAppId, setCurrentAppId] = useState('');
  const [bedrockError, setBedrockError] = useState('');
  const [generationStatus, setGenerationStatus] = useState<any[]>([]);

  // Publish
  const [publishing, setPublishing] = useState(false);
  const [prodUrl, setProdUrl] = useState('');

  // Apps
  const [apps, setApps] = useState<AppListItem[]>([]);
  const [loadingApps, setLoadingApps] = useState(false);

  // Initialize and auto-check connection
  useEffect(() => {
    api.init().then((data) => {
      setTenantId(data.tenantId);
      setDefaultRegion(data.defaultRegion);
      setRegion(data.defaultRegion);
      setControlPlaneAccountId(data.controlPlaneAccountId);
      setAccountId(data.controlPlaneAccountId);
      setConnected(data.connected);
      setRoleArn(data.roleArn || '');
      setInitializing(false);
    });
  }, []);


  const handleGenerate = async () => {
    try {
      setGenerating(true);
      setGenerateError('');
      setBedrockError('');
      setPreviewUrl('');
      setGenerationStatus([]);

      // Start generation and get job ID
      const { jobId } = await api.generate(accountId, region, blueprint, prompt, appName);

      // Poll for status updates
      const pollInterval = setInterval(async () => {
        try {
          const status = await api.getGenerateStatus(jobId);

          // Update status display
          setGenerationStatus(status.updates || []);

          // Check if job is complete
          if (status.status === 'completed') {
            clearInterval(pollInterval);
            setGenerating(false);
            setCurrentAppId(status.result.appId);
            setPreviewUrl(status.result.previewUrl);
            await loadApps();
          } else if (status.status === 'failed') {
            clearInterval(pollInterval);
            setGenerating(false);
            setGenerateError(status.error || 'Generation failed');

            // Check for Bedrock access error
            if (status.error?.includes('Bedrock') || status.error?.includes('bedrock')) {
              setBedrockError(status.error);
            }
          }
        } catch (error: any) {
          console.error('Status polling error:', error);
          // Don't clear interval on transient errors, keep polling
        }
      }, 2000); // Poll every 2 seconds

      // Cleanup interval after 30 minutes to prevent infinite polling
      setTimeout(() => {
        clearInterval(pollInterval);
        if (generating) {
          setGenerating(false);
          setGenerateError('Generation timeout - please check your AWS console');
        }
      }, 1800000);
    } catch (error: any) {
      setGenerateError(error.message);
      setGenerating(false);
    }
  };

  const handlePublish = async () => {
    if (!currentAppId) return;

    if (!confirm('Are you sure you want to publish to production?')) {
      return;
    }

    try {
      setPublishing(true);
      const result = await api.publish(accountId, region, currentAppId);
      setProdUrl(result.prodUrl);
      await loadApps();
    } catch (error: any) {
      alert(`Publish failed: ${error.message}`);
    } finally {
      setPublishing(false);
    }
  };

  const handleDestroy = async (appId: string, env: Environment) => {
    if (!confirm(`Are you sure you want to destroy the ${env} environment?`)) {
      return;
    }

    try {
      await api.destroy(accountId, region, appId, env);
      await loadApps();
    } catch (error: any) {
      alert(`Destroy failed: ${error.message}`);
    }
  };

  const loadApps = async () => {
    try {
      setLoadingApps(true);
      const data = await api.listApps();
      setApps(data);
    } catch (error: any) {
      console.error('Failed to load apps:', error);
    } finally {
      setLoadingApps(false);
    }
  };

  useEffect(() => {
    loadApps();
  }, []);

  return (
    <div className="container">
      <header>
        <h1>VibeForge</h1>
        <p>Vibe coding app</p>
        <div style={{ marginTop: '1rem' }}>
          {initializing && (
            <span className="status">Initializing...</span>
          )}
          {!initializing && connected && (
            <span className="status status-success">✓ Connected to AWS</span>
          )}
          {!initializing && !connected && (
            <span className="status status-error">✗ Not connected. Check AWS credentials in .env</span>
          )}
        </div>
      </header>

      {/* Card 1: Generate App */}
      {!initializing && connected && (
        <section className="card">
          <h2>1. Generate App</h2>

          {bedrockError && (
            <div className="alert alert-warning">
              <strong>Bedrock Access Required</strong>
              <p>{bedrockError}</p>
              <p>
                <a
                  href={`https://console.aws.amazon.com/bedrock/home?region=${region}#/model-catalog`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open Bedrock Model Catalog →
                </a>
              </p>
            </div>
          )}

          <div className="form-group">
            <label>App Name</label>
            <input
              type="text"
              value={appName}
              onChange={(e) => setAppName(e.target.value)}
              placeholder="my-awesome-app"
            />
          </div>

          <div className="form-group">
            <label>Blueprint</label>
            <div className="radio-group">
              <label>
                <input
                  type="radio"
                  value={Blueprint.SERVERLESS}
                  checked={blueprint === Blueprint.SERVERLESS}
                  onChange={(e) => setBlueprint(e.target.value as Blueprint)}
                />
                Serverless (Lambda + DynamoDB + S3)
              </label>
              <label>
                <input
                  type="radio"
                  value={Blueprint.CONTAINERS}
                  checked={blueprint === Blueprint.CONTAINERS}
                  onChange={(e) => setBlueprint(e.target.value as Blueprint)}
                />
                Containers (ECS + Aurora + ALB)
              </label>
            </div>
          </div>

          <div className="form-group">
            <label>Describe your app</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="A todo app with users and tags. Users can create, edit, and delete todos. Each todo has a title, description, and tags."
              rows={5}
            />
          </div>

          <button
            onClick={handleGenerate}
            className="btn btn-primary"
            disabled={generating || !appName || !prompt}
          >
            {generating ? 'Generating...' : 'Generate & Preview'}
          </button>

          {generating && (
            <div className="status" style={{ marginTop: '1rem', padding: '1rem', background: '#f0f9ff', border: '1px solid #0ea5e9', borderRadius: '4px' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>⏳ Deploying your app...</div>
              <div style={{ fontSize: '0.9rem', color: '#666' }}>
                {generationStatus.length === 0 ? (
                  <div>Starting generation...</div>
                ) : (
                  <div style={{ marginTop: '0.5rem' }}>
                    {generationStatus.map((update, index) => (
                      <div
                        key={index}
                        style={{
                          marginBottom: '0.5rem',
                          paddingLeft: '1rem',
                          borderLeft: update.completed ? '3px solid #10b981' : '3px solid #0ea5e9',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {update.completed ? (
                            <span style={{ color: '#10b981' }}>✓</span>
                          ) : (
                            <span style={{ color: '#0ea5e9' }}>⏳</span>
                          )}
                          <span style={{ fontWeight: update.completed ? 'normal' : 'bold' }}>
                            {update.message}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {generateError && (
            <div className="alert alert-error">{generateError}</div>
          )}

          {previewUrl && (
            <div className="result">
              <h3>Preview URL</h3>
              <a href={previewUrl} target="_blank" rel="noopener noreferrer">
                {previewUrl}
              </a>

              <button
                onClick={handlePublish}
                className="btn btn-success"
                disabled={publishing}
              >
                {publishing ? 'Publishing...' : 'Publish to Prod'}
              </button>
            </div>
          )}

          {prodUrl && (
            <div className="result">
              <h3>Production URL</h3>
              <a href={prodUrl} target="_blank" rel="noopener noreferrer">
                {prodUrl}
              </a>
            </div>
          )}
        </section>
      )}

      {/* Card 2: Your Apps */}
      <section className="card">
        <h2>2. Your Apps</h2>

        {loadingApps && <p>Loading...</p>}

        {!loadingApps && apps.length === 0 && (
          <p>No apps yet. Generate your first app above!</p>
        )}

        {apps.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Blueprint</th>
                <th>Dev URL</th>
                <th>Prod URL</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {apps.map((app) => (
                <tr key={app.appId}>
                  <td>{app.appName}</td>
                  <td>{app.blueprint}</td>
                  <td>
                    {app.devUrl ? (
                      <a href={app.devUrl} target="_blank" rel="noopener noreferrer">
                        View
                      </a>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td>
                    {app.prodUrl ? (
                      <a href={app.prodUrl} target="_blank" rel="noopener noreferrer">
                        View
                      </a>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td>
                    {app.devUrl && (
                      <button
                        onClick={() => handleDestroy(app.appId, Environment.DEV)}
                        className="btn btn-small btn-danger"
                      >
                        Destroy Dev
                      </button>
                    )}
                    {app.prodUrl && (
                      <button
                        onClick={() => handleDestroy(app.appId, Environment.PROD)}
                        className="btn btn-small btn-danger"
                      >
                        Destroy Prod
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <footer>
        <p>
          Account: {accountId} | Region: {region}
          {roleArn && <> | Role: {roleArn}</>}
        </p>
      </footer>
    </div>
  );
}

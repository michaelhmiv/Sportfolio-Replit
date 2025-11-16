import { Octokit } from '@octokit/rest'

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=github',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('GitHub not connected');
  }
  return accessToken;
}

async function getUncachableGitHubClient() {
  const accessToken = await getAccessToken();
  return new Octokit({ auth: accessToken });
}

async function createGitHubRepo() {
  try {
    const octokit = await getUncachableGitHubClient();
    
    // Get authenticated user
    const { data: user } = await octokit.users.getAuthenticated();
    console.log(`✓ Authenticated as: ${user.login}`);
    
    // Create repository
    const repoName = 'sportfolio';
    console.log(`\nCreating repository: ${repoName}...`);
    
    const { data: repo } = await octokit.repos.createForAuthenticatedUser({
      name: repoName,
      description: 'Sportfolio - Fantasy Sports Stock Market Platform',
      private: false,
      auto_init: false,
    });
    
    console.log(`✓ Repository created: ${repo.html_url}`);
    console.log(`✓ Git URL: ${repo.clone_url}`);
    
    return {
      url: repo.html_url,
      cloneUrl: repo.clone_url,
      username: user.login,
    };
  } catch (error: any) {
    if (error.status === 422 && error.message.includes('already exists')) {
      console.log('Repository "sportfolio" already exists on your GitHub account.');
      const octokit = await getUncachableGitHubClient();
      const { data: user } = await octokit.users.getAuthenticated();
      const { data: repo } = await octokit.repos.get({
        owner: user.login,
        repo: 'sportfolio',
      });
      return {
        url: repo.html_url,
        cloneUrl: repo.clone_url,
        username: user.login,
      };
    }
    throw error;
  }
}

createGitHubRepo()
  .then(repo => {
    console.log('\n=== Next Steps ===');
    console.log('Run these commands in the Shell to push your code:');
    console.log('');
    console.log(`git remote remove origin 2>/dev/null || true`);
    console.log(`git remote add origin ${repo.cloneUrl}`);
    console.log(`git add -A`);
    console.log(`git commit -m "Initial commit - Sportfolio Fantasy Sports Platform"`);
    console.log(`git push -u origin main`);
    console.log('');
    console.log(`Repository URL: ${repo.url}`);
  })
  .catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
  });

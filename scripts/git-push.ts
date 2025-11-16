import { Octokit } from '@octokit/rest'
import { execSync } from 'child_process';

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

async function pushToGitHub() {
  try {
    const token = await getAccessToken();
    const octokit = new Octokit({ auth: token });
    const { data: user } = await octokit.users.getAuthenticated();
    
    console.log(`✓ Authenticated as: ${user.login}`);
    
    // Build authenticated URL
    const repoUrl = `https://${token}@github.com/${user.login}/sportfolio.git`;
    
    console.log('\nPushing to GitHub...');
    
    try {
      // Try to push to main branch
      execSync(`git push ${repoUrl} main`, { 
        stdio: 'inherit',
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
      });
      console.log('\n✓ Successfully pushed to GitHub!');
      console.log(`\nView your repository: https://github.com/${user.login}/sportfolio`);
    } catch (error: any) {
      // If main doesn't exist, try master or create main
      console.log('Trying alternative push method...');
      try {
        execSync(`git push -u ${repoUrl} HEAD:main --force`, { 
          stdio: 'inherit',
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
        });
        console.log('\n✓ Successfully pushed to GitHub!');
        console.log(`\nView your repository: https://github.com/${user.login}/sportfolio`);
      } catch (e) {
        console.error('Push failed. Please check your repository settings.');
        throw e;
      }
    }
  } catch (error: any) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

pushToGitHub();

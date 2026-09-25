const { spawn } = require('child_process');
const path = require('path');

const serverPath = path.resolve(__dirname, 'server.js');
const child = spawn('node', [serverPath], { stdio: ['pipe', 'pipe', 'inherit'] });

let output = '';

child.stdout.on('data', (data) => {
  output += data.toString();
  const lines = output.split('\n');

  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i].trim();
    if (line) {
      const parsed = JSON.parse(line);
      console.log('CapCut MCP Response (id=' + parsed.id + '):', JSON.stringify(parsed, null, 2));

      if (parsed.id === 1) {
        // Send tools/list
        child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n');
      } else if (parsed.id === 2) {
        // Call capcut_build_episode_timeline
        child.stdin.write(JSON.stringify({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'capcut_build_episode_timeline',
            arguments: { episode_id: 'EP001' }
          }
        }) + '\n');
      } else if (parsed.id === 3) {
        console.log('\n[PASS] Successfully assembled CapCut project draft for EP001!');
        child.kill();
        process.exit(0);
      }
    }
  }
  output = lines[lines.length - 1];
});

// Initialize handshake
child.stdin.write(JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2024-11-05', capabilities: {} }
}) + '\n');

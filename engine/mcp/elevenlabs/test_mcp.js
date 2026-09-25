const { spawn } = require('child_process');
const path = require('path');

const serverPath = path.resolve(__dirname, 'server.js');
const child = spawn('node', [serverPath], {
  stdio: ['pipe', 'pipe', 'inherit']
});

let output = '';

child.stdout.on('data', (data) => {
  output += data.toString();
  const lines = output.split('\n');
  
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i].trim();
    if (line) {
      const parsed = JSON.parse(line);
      console.log('Received JSON-RPC Response:', JSON.stringify(parsed, null, 2));
      
      if (parsed.id === 1) {
        // Send tools/list request
        const listReq = {
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
          params: {}
        };
        child.stdin.write(JSON.stringify(listReq) + '\n');
      } else if (parsed.id === 2) {
        console.log('\n[PASS] Successfully initialized and listed', parsed.result.tools.length, 'tools!');
        child.kill();
        process.exit(0);
      }
    }
  }
  output = lines[lines.length - 1];
});

// Send initialize request
const initReq = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0.0' }
  }
};

child.stdin.write(JSON.stringify(initReq) + '\n');

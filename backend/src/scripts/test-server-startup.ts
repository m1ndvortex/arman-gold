import { spawn } from 'child_process';
import { logger } from '../utils/logger';

async function testServerStartup() {
  console.log('🚀 Testing server startup...');
  
  return new Promise((resolve, reject) => {
    const server = spawn('npm', ['run', 'dev'], {
      stdio: 'pipe',
      shell: true,
      env: { ...process.env, PORT: '3001' } // Use different port
    });

    let output = '';
    let hasStarted = false;

    server.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      console.log(text);
      
      if (text.includes('Server running on port') || text.includes('🚀 Server running')) {
        hasStarted = true;
        console.log('✅ Server started successfully!');
        server.kill();
        resolve(true);
      }
    });

    server.stderr.on('data', (data) => {
      const text = data.toString();
      output += text;
      console.error(text);
      
      if (text.includes('Error') || text.includes('Failed')) {
        console.log('❌ Server startup failed!');
        server.kill();
        reject(new Error(text));
      }
    });

    server.on('close', (code) => {
      if (!hasStarted && code !== 0) {
        console.log('❌ Server failed to start');
        reject(new Error(`Server exited with code ${code}`));
      } else if (hasStarted) {
        resolve(true);
      }
    });

    // Timeout after 15 seconds
    setTimeout(() => {
      if (!hasStarted) {
        console.log('❌ Server startup timeout');
        server.kill();
        reject(new Error('Server startup timeout'));
      }
    }, 15000);
  });
}

if (require.main === module) {
  testServerStartup()
    .then(() => {
      console.log('🎉 Server startup test completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Server startup test failed:', error);
      process.exit(1);
    });
}

export default testServerStartup;
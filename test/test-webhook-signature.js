// Test script to verify webhook signature generation
const crypto = require('crypto');

function generateGitHubSignature(payload, secret) {
  return '' + crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');
}

// Example usage
const secret = 'hmerCoders';
const payload = JSON.stringify({ test: 'payload' });
const signature = generateGitHubSignature(payload, secret);

console.log('Generated signature:', signature);

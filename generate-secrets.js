const crypto = require('crypto');

const accessTokenSecret = crypto.randomBytes(64).toString('hex');
const refreshTokenSecret = crypto.randomBytes(64).toString('hex');

console.log('Access Token Secret:', accessTokenSecret);
console.log('Refresh Token Secret:', refreshTokenSecret);
/**
 * generate-token.js
 * Run with: node generate-token.js
 * 
 * Generates a fake JWT token formatted perfectly for local testing.
 * The signature is invalid, but our middleware doesn't check the signature,
 * it only extracts the `sub` claim.
 */

// We just need Node's native Buffer to do base64url encoding
const header = {
    alg: "RS256",
    typ: "JWT"
};

const payload = {
    sub: "b0000000-0000-0000-0000-000000000002", // Cognito uses valid UUIDs for 'sub'
    email: "test@cococash.com",
    iat: Math.floor(Date.now() / 1000)
};

const headerEncoded = Buffer.from(JSON.stringify(header)).toString('base64url');
const payloadEncoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
const fakeSignature = "fake-signature-for-local-testing";

const token = `${headerEncoded}.${payloadEncoded}.${fakeSignature}`;

console.log("=========================================");
console.log("YOUR FAKE JWT TOKEN FOR TESTING:");
console.log("=========================================\n");
console.log(token);
console.log("\n=========================================");
console.log("To test in curl:");
console.log(`curl -H "Authorization: Bearer ${token}" http://localhost:3000/v1/accounts/me\n`);

/**
 * Bootstrap super_admin role — uses Firebase REST API with your credentials.
 * No service account key required.
 * 
 * Run: node scripts/bootstrap-admin.js
 */

const https = require('https')

const API_KEY    = 'AIzaSyAYML-htWOEHFGaPK_m03oMImHAO5S0Eqg'
const PROJECT_ID = 'festecart-22421'
const EMAIL      = 'festecartdesi@gmail.com'
const PASSWORD   = 'Krishna@36'

function post(hostname, path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const req  = https.request(
      { hostname, path, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(d) })) }
    )
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

function patch(hostname, path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const req  = https.request(
      { hostname, path, method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'Authorization': `Bearer ${body._token}` } },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(d) })) }
    )
    req.on('error', reject)
    // Remove token from body before sending
    delete body._token
    req.write(JSON.stringify(body))
    req.end()
  })
}

function patchWithToken(hostname, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const req  = https.request(
      { hostname, path, method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'Authorization': `Bearer ${token}` } },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(d) })) }
    )
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

async function run() {
  console.log('\n🔧 Festecart Bootstrap Admin Script')
  console.log('─'.repeat(50))

  // Step 1: Sign in to get ID token + UID
  console.log(`\n1️⃣  Signing in as ${EMAIL}...`)
  const signInRes = await post(
    'identitytoolkit.googleapis.com',
    `/v1/accounts:signInWithPassword?key=${API_KEY}`,
    { email: EMAIL, password: PASSWORD, returnSecureToken: true }
  )

  if (signInRes.status !== 200) {
    console.error('❌ Sign-in failed:', signInRes.body.error?.message)
    console.error('\nMake sure Email/Password auth is enabled in Firebase Console:')
    console.error('https://console.firebase.google.com/project/festecart-22421/authentication/providers')
    process.exit(1)
  }

  const { idToken, localId: uid } = signInRes.body
  console.log(`✅ Signed in — UID: ${uid}`)

  // Step 2: Write user_roles document via Firestore REST API
  console.log(`\n2️⃣  Writing user_roles/${uid} = { role: "super_admin" }...`)
  const firestoreRes = await patchWithToken(
    'firestore.googleapis.com',
    `/v1/projects/${PROJECT_ID}/databases/(default)/documents/user_roles/${uid}?updateMask.fieldPaths=role&updateMask.fieldPaths=email`,
    {
      fields: {
        role:  { stringValue: 'super_admin' },
        email: { stringValue: EMAIL },
      }
    },
    idToken
  )

  if (firestoreRes.status === 200 || firestoreRes.status === 201) {
    console.log('✅ user_roles document written successfully!')
    console.log('\n' + '─'.repeat(50))
    console.log('🎉 Done! You can now log into the admin panel.')
    console.log(`\n   Email:    ${EMAIL}`)
    console.log('   Password: Krishna@36')
    console.log('\n   Refresh the browser and sign in again.\n')
  } else {
    console.error(`❌ Firestore write failed (${firestoreRes.status}):`, JSON.stringify(firestoreRes.body, null, 2))
    console.log('\n─'.repeat(50))
    console.log('📋 MANUAL FIX — paste this in Firebase Console → Firestore:')
    console.log(`\n   Collection: user_roles`)
    console.log(`   Document ID: ${uid}`)
    console.log('   Fields:')
    console.log('     role  (string): super_admin')
    console.log(`     email (string): ${EMAIL}`)
    console.log('\n   URL: https://console.firebase.google.com/project/festecart-22421/firestore/data/user_roles\n')
  }
}

run().catch(err => {
  console.error('❌ Unexpected error:', err.message)
  process.exit(1)
})

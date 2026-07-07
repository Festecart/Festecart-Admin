/**
 * Writes super_admin role directly using Firebase Admin SDK.
 * Bypasses all Firestore security rules.
 * 
 * Run: node scripts/write-admin-role.cjs
 */

const https = require('https')
const fs    = require('fs')
const path  = require('path')

const API_KEY    = 'AIzaSyAYML-htWOEHFGaPK_m03oMImHAO5S0Eqg'
const PROJECT_ID = 'festecart-22421'
const DATABASE   = 'festecart'
const EMAIL      = 'festecartdesi@gmail.com'
const PASSWORD   = 'Krishna@36'

function post(hostname, reqPath, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    if (token) headers['Authorization'] = `Bearer ${token}`
    const req = https.request(
      { hostname, path: reqPath, method: 'POST', headers },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(d) })) }
    )
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

function patchDoc(path, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const req = https.request(
      { hostname: 'firestore.googleapis.com', path, method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'Authorization': `Bearer ${token}` }
      },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: d })) }
    )
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

// Get OAuth2 access token using Service Account if available
async function getServiceAccountToken(keyPath) {
  const key = require(keyPath)
  const jwt = require('jsonwebtoken')
  
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: key.client_email,
    sub: key.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/datastore',
  }
  
  const assertion = jwt.sign(payload, key.private_key, { algorithm: 'RS256' })
  
  const res = await post('oauth2.googleapis.com', '/token', 
    `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${assertion}`)
  return res.body.access_token
}

async function run() {
  console.log('\n🔧 Writing super_admin role to Firestore\n' + '─'.repeat(50))

  // Step 1: Get UID via sign-in
  console.log(`\n1️⃣  Signing in as ${EMAIL}...`)
  const signInRes = await post(
    'identitytoolkit.googleapis.com',
    `/v1/accounts:signInWithPassword?key=${API_KEY}`,
    { email: EMAIL, password: PASSWORD, returnSecureToken: true }
  )

  if (signInRes.status !== 200) {
    console.error('❌ Sign-in failed:', signInRes.body.error?.message)
    process.exit(1)
  }

  const { idToken, localId: uid } = signInRes.body
  console.log(`✅ UID confirmed: ${uid}`)

  // Step 2: Try with user's own token (works if rules allow create by owner)
  console.log(`\n2️⃣  Writing user_roles/${uid}...`)
  const docPath = `/v1/projects/${PROJECT_ID}/databases/${DATABASE}/documents/user_roles/${uid}?updateMask.fieldPaths=role&updateMask.fieldPaths=email`
  
  const result = await patchDoc(docPath, {
    fields: {
      role:  { stringValue: 'super_admin' },
      email: { stringValue: EMAIL },
    }
  }, idToken)

  if (result.status === 200 || result.status === 201) {
    console.log('✅ SUCCESS! user_roles document written!')
    console.log('\n' + '─'.repeat(50))
    console.log('🎉 Refresh the admin panel and log in.')
    console.log(`\n   Email:    ${EMAIL}`)
    console.log('   Password: Krishna@36\n')
    return
  }

  // Step 3: If blocked by rules, try with service account
  const keyPath = path.join(__dirname, 'serviceAccountKey.json')
  if (fs.existsSync(keyPath)) {
    console.log('⚠️  User token blocked by rules, trying service account...')
    try {
      const saToken = await getServiceAccountToken(keyPath)
      const sa = await patchDoc(docPath, {
        fields: {
          role:  { stringValue: 'super_admin' },
          email: { stringValue: EMAIL },
        }
      }, saToken)
      if (sa.status === 200 || sa.status === 201) {
        console.log('✅ SUCCESS via service account!')
        return
      }
    } catch (e) {
      console.log('Service account attempt failed:', e.message)
    }
  }

  // Step 4: Fallback — give exact manual instructions  
  console.log(`\n❌ Automatic write blocked (status: ${result.status})`)
  console.log('\n' + '═'.repeat(50))
  console.log('✋ MANUAL STEP REQUIRED — takes 30 seconds:')
  console.log('═'.repeat(50))
  console.log('\n1. Open: https://console.firebase.google.com/project/festecart-22421/firestore/databases/festecart/data')
  console.log('\n2. Click "+ Start collection"')
  console.log('   • Collection ID: user_roles')
  console.log('   • Click Next')
  console.log('\n3. Add document:')
  console.log(`   • Document ID: ${uid}`)
  console.log('   • Field 1:  role  (string)  →  super_admin')
  console.log(`   • Field 2:  email (string)  →  ${EMAIL}`)
  console.log('\n4. Click Save')
  console.log('\n5. Refresh admin panel → login works! ✅\n')
}

run().catch(err => { console.error('❌', err.message); process.exit(1) })

const https = require('https')

const API_KEY    = 'AIzaSyAYML-htWOEHFGaPK_m03oMImHAO5S0Eqg'
const PROJECT_ID = 'festecart-22421'
const EMAIL      = 'festecartdesi@gmail.com'
const PASSWORD   = 'Krishna@36'

// Try these database IDs
const DB_IDS = ['(default)', 'festecart', 'festecart-22421']

function post(hostname, path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const req = https.request(
      { hostname, path, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(d) })) }
    )
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

function getWithToken(path, token) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: 'firestore.googleapis.com', path, method: 'GET', headers: { 'Authorization': `Bearer ${token}` } },
      res => { let d = ''; res.on('data', c => d += c); res.on('end', () => resolve({ status: res.statusCode, body: d })) }
    )
    req.on('error', reject)
    req.end()
  })
}

async function run() {
  // Sign in
  const signInRes = await post('identitytoolkit.googleapis.com', `/v1/accounts:signInWithPassword?key=${API_KEY}`, { email: EMAIL, password: PASSWORD, returnSecureToken: true })
  const { idToken, localId: uid } = signInRes.body
  console.log(`UID: ${uid}\n`)

  // Try each database ID
  for (const dbId of DB_IDS) {
    const encodedDbId = encodeURIComponent(dbId)
    const res = await getWithToken(`/v1/projects/${PROJECT_ID}/databases/${encodedDbId}/documents/user_roles`, idToken)
    console.log(`Database "${dbId}" → status: ${res.status}`)
    if (res.status === 200) {
      console.log(`  ✅ Found! Use database ID: "${dbId}"`)
    } else {
      console.log(`  ❌ ${res.body.substring(0, 100)}`)
    }
  }
}

run().catch(console.error)
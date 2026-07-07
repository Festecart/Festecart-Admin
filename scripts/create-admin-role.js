/**
 * Creates the super_admin role document in Firestore using the REST API.
 * No service account key required — uses your Firebase project ID directly.
 *
 * Run ONCE after logging in for the first time:
 *   node scripts/create-admin-role.js
 *
 * OR use it with your UID directly if you know it:
 *   node scripts/create-admin-role.js YOUR_UID_HERE
 */

const https = require('https')

const PROJECT_ID = 'festecart-22421'
const ADMIN_EMAIL = 'festecartdesi@gmail.com'

// ── If UID passed as arg, use it directly ─────────────────────────
const uid = process.argv[2]

if (uid) {
  writeRoleDoc(uid)
} else {
  console.log('\n⚠️  No UID provided.')
  console.log('\nTo get your UID:')
  console.log('  1. Go to Firebase Console → Authentication → Users')
  console.log(`  2. Find ${ADMIN_EMAIL}`)
  console.log('  3. Copy the User UID')
  console.log('  4. Run: node scripts/create-admin-role.js YOUR_UID\n')
  console.log('─'.repeat(60))
  console.log('\nAlternatively, run the full setup-admin.js script with a service account key.')
  process.exit(0)
}

function writeRoleDoc(userId) {
  console.log(`\n🔧 Writing user_roles/${userId} = { role: "super_admin" }...`)

  // Firestore REST API — requires the project to be set to allow writes
  // This works during development when Firestore rules allow writes
  const body = JSON.stringify({
    fields: {
      role:  { stringValue: 'super_admin' },
      email: { stringValue: ADMIN_EMAIL },
    }
  })

  const options = {
    hostname: 'firestore.googleapis.com',
    path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents/user_roles/${userId}`,
    method: 'PATCH',
    headers: {
      'Content-Type':  'application/json',
      'Content-Length': Buffer.byteLength(body),
    }
  }

  const req = https.request(options, (res) => {
    let data = ''
    res.on('data', chunk => data += chunk)
    res.on('end', () => {
      if (res.statusCode === 200 || res.statusCode === 201) {
        console.log('✅ user_roles document created successfully!')
        console.log('\n🎉 You can now log in at the admin panel.')
        console.log(`   Email:    ${ADMIN_EMAIL}`)
        console.log('   Password: Krishna@36\n')
      } else {
        console.log(`\n❌ Failed (${res.statusCode}): ${data}`)
        console.log('\nFirestore security rules may be blocking unauthenticated writes.')
        console.log('Use the Firebase Console instead (see below).\n')
        printManualInstructions(userId)
      }
    })
  })

  req.on('error', err => {
    console.error('❌ Request failed:', err.message)
    printManualInstructions(userId)
  })

  req.write(body)
  req.end()
}

function printManualInstructions(userId) {
  console.log('─'.repeat(60))
  console.log('MANUAL SETUP via Firebase Console:')
  console.log('─'.repeat(60))
  console.log()
  console.log('1. Go to: https://console.firebase.google.com/project/festecart-22421/firestore')
  console.log('2. Click "+ Start collection"')
  console.log('   Collection ID: user_roles')
  console.log()
  console.log('3. Add a document:')
  console.log(`   Document ID: ${userId}`)
  console.log('   Field: role  (string)  Value: super_admin')
  console.log('   Field: email (string)  Value: festecartdesi@gmail.com')
  console.log()
  console.log('4. Click Save → refresh the admin panel → login!')
  console.log()
}

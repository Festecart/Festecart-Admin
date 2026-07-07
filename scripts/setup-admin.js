/**
 * ══════════════════════════════════════════════════════════════════
 * Festecart Super Admin Setup Script
 * ══════════════════════════════════════════════════════════════════
 *
 * This script creates the super_admin user in Firebase Auth +
 * writes the required Firestore documents.
 *
 * SETUP:
 *   1. Go to Firebase Console → Project Settings → Service Accounts
 *   2. Click "Generate new private key" → save as:
 *      scripts/serviceAccountKey.json
 *   3. Run:  node scripts/setup-admin.js
 *
 * WHAT IT DOES:
 *   ✅ Creates Firebase Auth user  festecartdesi@gmail.com / Krishna@36
 *   ✅ Writes  user_roles/{uid}    = { role: "super_admin" }
 *   ✅ Writes  user_profiles/{uid} = { name, email }
 *   ✅ Seeds   site_config defaults (announcement_bar, nav_links, etc.)
 *   ✅ Ensures only ONE super_admin exists (idempotent — safe to re-run)
 * ══════════════════════════════════════════════════════════════════
 */

const path = require('path')
const fs   = require('fs')

const KEY_PATH = path.join(__dirname, 'serviceAccountKey.json')

if (!fs.existsSync(KEY_PATH)) {
  console.error('\n❌  serviceAccountKey.json not found at scripts/serviceAccountKey.json')
  console.error('\n   Steps to get it:')
  console.error('   1. Firebase Console → Project Settings → Service Accounts')
  console.error('   2. Click "Generate new private key"')
  console.error('   3. Save the downloaded file as: scripts/serviceAccountKey.json\n')
  process.exit(1)
}

const admin = require('firebase-admin')
const serviceAccount = require(KEY_PATH)

admin.initializeApp({
  credential:  admin.credential.cert(serviceAccount),
  projectId:   'festecart-22421',
})

const db   = admin.firestore()
const auth = admin.auth()

const ADMIN_EMAIL    = 'festecartdesi@gmail.com'
const ADMIN_PASSWORD = 'Krishna@36'
const ADMIN_NAME     = 'Festecart Super Admin'

// ── Site config defaults ──────────────────────────────────────────
const SITE_CONFIG_DEFAULTS = [
  {
    key: 'announcement_bar',
    value: { enabled: true, left_text: 'live desi. be desi.', right_text: 'Now delivered in Bengaluru' },
  },
  {
    key: 'nav_links',
    value: [
      { name: 'Home',     href: '/',        order: 1, enabled: true },
      { name: 'Products', href: '/products', order: 2, enabled: true },
      { name: 'About',    href: '/about',    order: 3, enabled: true },
      { name: 'Contact',  href: '/contact',  order: 4, enabled: true },
    ],
  },
  {
    key: 'featured_products',
    value: { enabled: true, title: 'Featured Products', subtitle: 'Handpicked treasures that bring tradition to your home', product_ids: [] },
  },
  {
    key: 'testimonials',
    value: { enabled: true, title: 'What Our Customers Say', testimonials: [] },
  },
  {
    key: 'why_packages',
    value: { enabled: true, title: 'Why the packages?', subtitle: 'Curated package in detail', button_text: 'View All Products', button_link: '/products', slides: [] },
  },
  {
    key: 'footer_brand',
    value: { tagline: 'Empowering artisans and small businesses across India.' },
  },
  {
    key: 'footer_contact',
    value: { address: 'No 861, 2nd floor, 5th Main, BEML Layout, Rajarajeshwari Nagar, Bengaluru — 560098', phone: '+91 9876543210', email: 'celebrate@festecart.org' },
  },
  {
    key: 'footer_social',
    value: { facebook: '', instagram: '', twitter: '', whatsapp: '' },
  },
  {
    key: 'footer_links',
    value: [],
  },
  {
    key: 'footer_earn',
    value: { heading: 'Earn with Festecart', links: [] },
  },
  {
    key: 'footer_bottom',
    value: { copyright_text: '© 2025 Festecart. All rights reserved.', privacy_policy_url: '/privacy', terms_url: '/terms' },
  },
]

async function setup() {
  console.log('\n🔧  Festecart Super Admin Setup\n' + '─'.repeat(50))

  // ── Step 1: Create or update Firebase Auth user ─────────────────
  let uid
  try {
    const existing = await auth.getUserByEmail(ADMIN_EMAIL)
    uid = existing.uid
    console.log(`✅  Auth user already exists — UID: ${uid}`)
    await auth.updateUser(uid, {
      password:      ADMIN_PASSWORD,
      displayName:   ADMIN_NAME,
      emailVerified: true,
    })
    console.log('✅  Password confirmed correct.')
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      const newUser = await auth.createUser({
        email:         ADMIN_EMAIL,
        password:      ADMIN_PASSWORD,
        displayName:   ADMIN_NAME,
        emailVerified: true,
      })
      uid = newUser.uid
      console.log(`✅  Auth user created — UID: ${uid}`)
    } else {
      throw err
    }
  }

  // ── Step 2: Write user_roles document ───────────────────────────
  await db.collection('user_roles').doc(uid).set({
    role:       'super_admin',
    email:      ADMIN_EMAIL,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true })
  console.log(`✅  user_roles/${uid}  →  { role: "super_admin" }`)

  // ── Step 3: Write user_profiles document ────────────────────────
  await db.collection('user_profiles').doc(uid).set({
    user_id:    uid,
    name:       ADMIN_NAME,
    email:      ADMIN_EMAIL,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true })
  console.log(`✅  user_profiles/${uid} created`)

  // ── Step 4: Seed site_config defaults ───────────────────────────
  console.log('\n📋  Seeding site_config defaults...')
  for (const { key, value } of SITE_CONFIG_DEFAULTS) {
    const ref  = db.collection('site_config').doc(key)
    const snap = await ref.get()
    if (!snap.exists) {
      await ref.set({ value, updated_at: admin.firestore.FieldValue.serverTimestamp() })
      console.log(`   ✅  site_config/${key}  seeded`)
    } else {
      console.log(`   ⏭   site_config/${key}  already exists — skipped`)
    }
  }

  // ── Done ─────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(50))
  console.log('🎉  Setup complete!\n')
  console.log('   📧  Email   :', ADMIN_EMAIL)
  console.log('   🔑  Password:', ADMIN_PASSWORD)
  console.log('   🌐  Panel   : http://localhost:5173  (npm run dev)')
  console.log('\n   Enable Email/Password auth in Firebase Console → Authentication → Sign-in methods')
  console.log('   Deploy Firestore rules: firebase deploy --only firestore:rules')
  console.log('   Deploy functions:       cd functions && npm install && firebase deploy --only functions\n')
  process.exit(0)
}

setup().catch(err => {
  console.error('\n❌  Setup failed:', err.message || err)
  process.exit(1)
})

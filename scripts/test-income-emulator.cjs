const assert = require('node:assert/strict')
const { initializeApp, deleteApp } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { getFirestore, Timestamp, FieldValue } = require('firebase-admin/firestore')

const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST
const functionsHost = '127.0.0.1:5001'

if (projectId !== 'demo-income-test') throw new Error('Tests may run only with the demo-income-test project.')
if (authHost !== '127.0.0.1:9099' || firestoreHost !== '127.0.0.1:8080') {
  throw new Error('Auth and Firestore must both use their local emulator endpoints.')
}

const app = initializeApp({ projectId })
const auth = getAuth(app)
const db = getFirestore(app, 'festecart')
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

async function signIn(email, password) {
  const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(`Auth emulator sign-in failed: ${JSON.stringify(payload)}`)
  return payload.idToken
}

async function callFunction(name, token, data) {
  const response = await fetch(`http://${functionsHost}/${projectId}/us-central1/${name}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data }),
  })
  const payload = await response.json()
  if (payload.error) {
    const error = new Error(payload.error.message || payload.error.status)
    error.status = payload.error.status
    throw error
  }
  if (!response.ok) throw new Error(`Callable ${name} failed: ${JSON.stringify(payload)}`)
  return payload.result
}

async function assertIncomeCallableCors() {
  const origin = 'https://admin.festecart.org'
  const response = await fetch(`http://${functionsHost}/${projectId}/us-central1/createUnpostedFinancialIncome`, {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization,content-type',
    },
  })
  assert.equal(response.headers.get('access-control-allow-origin'), origin)
}

async function queryUnpostedIncome(token) {
  const response = await fetch(`http://${firestoreHost}/v1/projects/${projectId}/databases/festecart/documents:runQuery`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'financial_transactions' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'posting_status' },
            op: 'EQUAL',
            value: { stringValue: 'unposted' },
          },
        },
      },
    }),
  })
  const payload = await response.json()
  if (!response.ok) {
    const error = new Error(payload.error && payload.error.message || 'Firestore query failed.')
    error.code = payload.error && payload.error.status || 'UNKNOWN'
    throw error
  }
  return payload.filter(item => item.document).map(item => item.document)
}

async function expectCallableFailure(name, token, data, messagePart) {
  let failure
  try {
    await callFunction(name, token, data)
  } catch (error) {
    failure = error
  }
  assert.ok(failure, `${name} should reject invalid input.`)
  assert.ok(failure.message.includes(messagePart), `Expected "${messagePart}" in "${failure.message}".`)
}

async function countIncomeTransactions() {
  const snapshot = await db.collection('financial_transactions').where('type', '==', 'income').get()
  return snapshot.docs.filter(item =>
    item.id.includes(runId) && item.data().posting_status !== 'unposted').length
}

async function countAllIncomeRecords() {
  const snapshot = await db.collection('financial_transactions').where('type', '==', 'income').get()
  return snapshot.docs.filter(item => item.id.includes(runId)).length
}

function incomeInput(overrides = {}) {
  return {
    amount_paise: 2500,
    transaction_date: '2026-03-01',
    festival_tag: null,
    festival_tag_id: null,
    category_name: 'Tea',
    description: 'Emulator income test',
    payment_method: 'Cash',
    vendor_name: 'Test vendor',
    reference_no: `INCOME-${runId}`,
    source_of_income: 'Test source',
    ...overrides,
  }
}

async function run() {
  await assertIncomeCallableCors()
  console.log('PASS the Accounts Income callable allows the configured admin.festecart.org origin.')

  const user = await auth.createUser({
    email: `income-test-${runId}@example.test`,
    password: `Test-${runId}-Password!`,
  })
  await db.collection('user_roles').doc(user.uid).set({ roles: ['admin'] })

  const accountRef = db.collection('financial_accounts').doc(`income-test-${runId}`)
  const openingBalance = 14_300
  await accountRef.set({
    name: `Emulator income account ${runId}`,
    type: 'cash',
    opening_balance_paise: openingBalance,
    balance_paise: openingBalance,
    active: true,
    created_by: user.uid,
    created_at: Timestamp.now(),
    updated_by: user.uid,
    updated_at: Timestamp.now(),
  })
  await db.collection('site_config').doc('financial_expense_payment_methods').set({
    custom_methods: ['kavana'],
  })

  const existingOrderPaymentRef = db.collection('financial_transactions').doc(`existing-order-payment-${runId}`)
  await existingOrderPaymentRef.set({
    transaction_id: `FTX-ORDER-${runId}`,
    type: 'income',
    transaction_date: Timestamp.fromDate(new Date('2026-03-01T00:00:00.000Z')),
    reference_no: `ORDER-REFERENCE-${runId}`,
    description: 'Existing customer payment',
    category_name: 'Sales Receipt',
    amount_paise: 2000,
    account_id: accountRef.id,
    linked_order_id: `order-${runId}`,
    linked_expense_id: null,
    payment_method: 'Cash',
    created_by: user.uid,
    created_by_name: 'Emulator test admin',
    created_at: Timestamp.now(),
  })
  await accountRef.update({ balance_paise: openingBalance + 2000 })
  const startingBalance = openingBalance + 2000

  const token = await signIn(user.email, `Test-${runId}-Password!`)
  const openingAmount = 10_000
  const openingAccountRef = db.collection('financial_accounts').doc(`opening-delete-test-${runId}`)
  const openingTransactionRef = db.collection('financial_transactions').doc(`opening-delete-test-${runId}`)
  await openingAccountRef.set({
    opening_balance_paise: openingAmount,
    balance_paise: openingAmount + 3_000,
  })
  await openingTransactionRef.set({
    transaction_id: `FTX-OPEN-${runId}`,
    type: 'opening_balance',
    amount_paise: openingAmount,
    account_id: openingAccountRef.id,
    linked_order_id: null,
    linked_expense_id: null,
    transaction_date: Timestamp.now(),
  })
  await callFunction('deleteFinancialTransaction', token, {
    transaction_id: openingTransactionRef.id,
  })
  const adjustedOpeningAccount = await openingAccountRef.get()
  assert.equal(adjustedOpeningAccount.data().opening_balance_paise, 0)
  assert.equal(adjustedOpeningAccount.data().balance_paise, 3_000)
  assert.equal((await openingTransactionRef.get()).exists, false)

  const negativeOpeningAccountRef = db.collection('financial_accounts').doc(`opening-delete-negative-test-${runId}`)
  const negativeOpeningTransactionRef = db.collection('financial_transactions').doc(`opening-delete-negative-test-${runId}`)
  await negativeOpeningAccountRef.set({
    opening_balance_paise: openingAmount,
    balance_paise: openingAmount - 1,
  })
  await negativeOpeningTransactionRef.set({
    transaction_id: `FTX-OPEN-NEG-${runId}`,
    type: 'opening_balance',
    amount_paise: openingAmount,
    account_id: negativeOpeningAccountRef.id,
    linked_order_id: null,
    linked_expense_id: null,
    transaction_date: Timestamp.now(),
  })
  await expectCallableFailure('deleteFinancialTransaction', token, {
    transaction_id: negativeOpeningTransactionRef.id,
  }, 'would become negative')
  assert.equal((await negativeOpeningAccountRef.get()).data().balance_paise, openingAmount - 1)
  assert.equal((await negativeOpeningAccountRef.get()).data().opening_balance_paise, openingAmount)
  assert.equal((await negativeOpeningTransactionRef.get()).exists, true)
  console.log('PASS opening balance deletion adjusts the account atomically and rejects negative balances.')

  const customMethod = 'kavana'
  const methodCases = [
    { method: 'Cash', date: '2026-11-13' },
    { method: 'UPI', date: '2026-11-24' },
    { method: 'Bank Transfer', date: '2026-11-20' },
    { method: customMethod, date: '2026-11-18' },
    { method: '', date: '2026-11-16' },
  ]
  const savedIncomes = []
  for (const [index, { method, date }] of methodCases.entries()) {
    const input = incomeInput({
      amount_paise: method === customMethod ? 1_000_000 : 1000 + index * 100,
      source_of_income: method === customMethod ? 'kavana' : 'Test source',
      payment_method: method,
      transaction_date: date,
      reference_no: `METHOD-${index}-${runId}`,
    })
    const idempotencyKey = `income-unposted-${index}-${runId}`
    const result = await callFunction('createUnpostedFinancialIncome', token, {
      input,
      idempotency_key: idempotencyKey,
    })
    const incomeRef = db.collection('financial_transactions').doc(`income_${idempotencyKey}`)
    assert.equal(result.transaction_id, incomeRef.id)
    const savedIncome = await incomeRef.get()
    assert.equal(savedIncome.data().posting_status, 'unposted')
    assert.equal(savedIncome.data().account_id, null)
    assert.equal(savedIncome.data().amount_paise, input.amount_paise)
    assert.equal(savedIncome.data().transaction_date.toDate().toISOString().slice(0, 10), date)
    assert.equal(savedIncome.data().payment_method, method)
    assert.equal(savedIncome.data().category_name, input.category_name)
    assert.equal(savedIncome.data().description, input.description)
    assert.equal(savedIncome.data().party_name, input.vendor_name)
    assert.equal(savedIncome.data().reference_no, input.reference_no)
    assert.equal(savedIncome.data().source_of_income, input.source_of_income)
    savedIncomes.push({ idempotencyKey, input, incomeRef })
  }
  await callFunction('createUnpostedFinancialIncome', token, {
    input: savedIncomes[0].input,
    idempotency_key: savedIncomes[0].idempotencyKey,
  })
  const unpostedResult = await callFunction('fetchUnpostedFinancialIncomes', token, {})
  const runUnpostedItems = unpostedResult.items.filter(item => item.id.includes(runId))
  assert.equal(runUnpostedItems.length, 5)
  assert.ok(runUnpostedItems.every(item => item.posting_status === 'unposted'))
  const queryResults = await queryUnpostedIncome(token)
  const runQueryResults = queryResults.filter(item => item.name.includes(runId))
  assert.equal(runQueryResults.length, 5, 'An admin must be able to query reference income with Firestore rules.')
  assert.ok(runQueryResults.every(item => item.fields.posting_status.stringValue === 'unposted'))
  const nonAdmin = await auth.createUser({
    email: `income-non-admin-${runId}@example.test`,
    password: `Test-${runId}-Password!`,
  })
  const nonAdminToken = await signIn(nonAdmin.email, `Test-${runId}-Password!`)
  await assert.rejects(
    () => queryUnpostedIncome(nonAdminToken),
    error => error.code === 'PERMISSION_DENIED',
    'Firestore rules must deny the unposted income query to non-admin users.',
  )
  assert.equal(await countAllIncomeRecords(), 6)
  assert.equal((await accountRef.get()).data().balance_paise, startingBalance)
  assert.equal(await countIncomeTransactions(), 1, 'Reference income must not be included in posted transaction totals.')
  console.log('PASS admins can query reference income; non-admins are denied by Firestore rules.')
  console.log('PASS Cash, UPI, Bank Transfer, kavana and no payment method save without changing account balances.')

  const editableIncome = savedIncomes[0]
  const updatedInput = incomeInput({
    amount_paise: 3400,
    transaction_date: '2026-03-02',
    category_name: '',
    description: 'Updated emulator income test',
    payment_method: '',
    vendor_name: '',
    reference_no: `UPDATED-${runId}`,
    source_of_income: 'Updated reference source',
  })
  await callFunction('editUnpostedFinancialIncome', token, {
    transaction_id: editableIncome.incomeRef.id,
    input: updatedInput,
  })
  const updatedIncome = await editableIncome.incomeRef.get()
  assert.equal(updatedIncome.data().amount_paise, updatedInput.amount_paise)
  assert.equal(updatedIncome.data().transaction_date.toDate().toISOString().slice(0, 10), updatedInput.transaction_date)
  assert.equal(updatedIncome.data().payment_method, '')
  assert.equal(updatedIncome.data().description, updatedInput.description)
  assert.equal(updatedIncome.data().source_of_income, updatedInput.source_of_income)
  assert.equal(updatedIncome.data().posting_status, 'unposted')
  assert.equal(await countAllIncomeRecords(), 6, 'Editing must update the original record rather than create another.')
  assert.equal((await accountRef.get()).data().balance_paise, startingBalance)
  assert.equal(await countIncomeTransactions(), 1)
  await expectCallableFailure('editUnpostedFinancialIncome', token, {
    transaction_id: editableIncome.incomeRef.id,
    input: { ...updatedInput, reference_no: `ORDER-REFERENCE-${runId}` },
  }, 'another financial transaction')
  assert.equal((await editableIncome.incomeRef.get()).data().reference_no, updatedInput.reference_no)
  console.log('PASS admin edits update the same reference record without changing balances or posted totals.')

  await expectCallableFailure('editUnpostedFinancialIncome', token, {
    transaction_id: existingOrderPaymentRef.id,
    input: updatedInput,
  }, 'cannot be changed')
  await expectCallableFailure('deleteUnpostedFinancialIncome', token, {
    transaction_id: existingOrderPaymentRef.id,
  }, 'cannot be changed')
  await expectCallableFailure('postUnpostedFinancialIncome', token, {
    transaction_id: editableIncome.incomeRef.id,
    account_id: accountRef.id,
  }, 'cannot be posted')
  assert.equal((await accountRef.get()).data().balance_paise, startingBalance)
  assert.equal((await editableIncome.incomeRef.get()).data().posting_status, 'unposted')
  console.log('PASS posted income is protected and reference income cannot be posted to an account.')

  const deletableIncome = savedIncomes[1]
  await callFunction('deleteUnpostedFinancialIncome', token, {
    transaction_id: deletableIncome.incomeRef.id,
  })
  await callFunction('deleteUnpostedFinancialIncome', token, {
    transaction_id: deletableIncome.incomeRef.id,
  })
  assert.equal((await deletableIncome.incomeRef.get()).data().is_deleted, true)
  assert.equal((await accountRef.get()).data().balance_paise, startingBalance)
  assert.equal(await countIncomeTransactions(), 1)
  console.log('PASS reference income deletion is idempotent and does not change account balances.')

  await assert.rejects(
    () => callFunction('editUnpostedFinancialIncome', nonAdminToken, {
      transaction_id: editableIncome.incomeRef.id,
      input: updatedInput,
    }),
    error => error.status === 'PERMISSION_DENIED',
    'Only an Accounts admin may edit reference income.',
  )
  await assert.rejects(
    () => callFunction('deleteUnpostedFinancialIncome', nonAdminToken, {
      transaction_id: savedIncomes[2].incomeRef.id,
    }),
    error => error.status === 'PERMISSION_DENIED',
    'Only an Accounts admin may delete reference income.',
  )
  assert.equal((await accountRef.get()).data().balance_paise, startingBalance)

  const incompleteCases = [
    { label: 'missing amount', input: incomeInput({ amount_paise: null }), message: 'Enter an amount' },
    { label: 'missing date', input: incomeInput({ transaction_date: '' }), message: 'Choose an income date' },
    { label: 'invalid date', input: incomeInput({ transaction_date: '2026-02-31' }), message: 'Income date is invalid' },
  ]
  for (const [index, testCase] of incompleteCases.entries()) {
    await expectCallableFailure('createUnpostedFinancialIncome', token, {
      input: { ...testCase.input, reference_no: `INCOMPLETE-${index}-${runId}` },
      idempotency_key: `incomplete-${index}-${runId}`,
    }, testCase.message)
  }
  assert.equal((await accountRef.get()).data().balance_paise, startingBalance)
  assert.equal(await countAllIncomeRecords(), 6)
  assert.equal(await countIncomeTransactions(), 1, 'Incomplete income must not create a transaction.')
  console.log('PASS missing fields and invalid calendar dates are rejected without posting.')

  await expectCallableFailure('createUnpostedFinancialIncome', token, {
    input: incomeInput({ reference_no: `ORDER-REFERENCE-${runId}` }),
    idempotency_key: `duplicate-order-payment-${runId}`,
  }, 'already used')
  assert.equal((await accountRef.get()).data().balance_paise, startingBalance)
  assert.equal(await countIncomeTransactions(), 1)
  assert.equal(await countAllIncomeRecords(), 6)
  console.log('PASS an existing customer-payment reference cannot be saved as duplicate income.')

  await expectCallableFailure('createUnpostedFinancialIncome', token, {
    input: incomeInput({ payment_method: 'Unapproved test method', reference_no: `UNAPPROVED-${runId}` }),
    idempotency_key: `unapproved-${runId}`,
  }, 'saved custom payment method')
  console.log('PASS backend rejects payment methods that are not default or saved in Accounts configuration.')

  const customExpenseInput = {
    expense_id: '',
    description: 'Expense custom payment validation',
    category_name: 'Tea',
    vendor_id: null,
    vendor_name: '',
    payment_reference: '',
    reference_no: `CUSTOM-EXPENSE-${runId}`,
    transaction_date: '2026-03-01',
    amount_paise: 100,
    payment_method: customMethod,
    festival_tag: null,
    festival_tag_id: null,
  }
  await expectCallableFailure('createFinancialExpense', token, {
    input: { ...customExpenseInput, description: '' },
  }, 'Description must contain')
  await expectCallableFailure('createFinancialExpense', token, {
    input: { ...customExpenseInput, payment_method: '' },
  }, 'Payment method must contain')
  await callFunction('createFinancialExpense', token, { input: customExpenseInput })
  const customExpense = await db.collection('financial_expenses').where('reference_no', '==', `CUSTOM-EXPENSE-${runId}`).get()
  assert.equal(customExpense.size, 1)
  assert.equal(customExpense.docs[0].data().payment_method, customMethod)
  assert.equal(customExpense.docs[0].data().amount_paise, 100)
  console.log('PASS approved custom expense payment methods preserve the saved amount.')

  const customExpenseDocument = customExpense.docs[0]
  await customExpenseDocument.ref.update({
    description: FieldValue.delete(),
    category_name: FieldValue.delete(),
  })
  await callFunction('editFinancialExpense', token, {
    expense_id: customExpenseDocument.id,
    input: {
      description: 'Edited expense custom payment validation',
      category_name: 'Tea',
      vendor_id: null,
      vendor_name: '',
      payment_reference: '',
      reference_no: `CUSTOM-EXPENSE-${runId}`,
      transaction_date: '2026-03-02',
      amount_paise: 250,
      payment_method: customMethod,
      festival_tag: null,
      festival_tag_id: null,
    },
  })
  const editedExpense = await customExpenseDocument.ref.get()
  assert.equal(editedExpense.data().description, 'Edited expense custom payment validation')
  assert.equal(editedExpense.data().amount_paise, 250)
  const linkedExpenseTransactions = await db.collection('financial_transactions')
    .where('linked_expense_id', '==', customExpenseDocument.id)
    .get()
  assert.equal(linkedExpenseTransactions.size, 1)
  assert.equal(linkedExpenseTransactions.docs[0].data().amount_paise, 250)
  console.log('PASS editing a full-amount expense updates its linked spending transaction.')

  await deleteApp(app)
}

run().catch(async error => {
  console.error('FAIL income emulator tests:', error)
  try {
    await deleteApp(app)
  } catch {
    // Keep the original test failure as the process result.
  }
  process.exitCode = 1
})
